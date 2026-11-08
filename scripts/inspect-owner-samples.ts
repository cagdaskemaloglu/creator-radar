// Explicit diagnostic command: at most three previously collected failed post URLs.
// Uses the dedicated headless profile; no search expansion or CAPTCHA retries.
import {mkdirSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {db,store} from '../lib/db';
import {all,first} from '../lib/storage/driver';
import {readInstagramDocument} from '../lib/instagram-browser';
import {diagnoseSnapshotPostAuthor} from '../lib/instagram-post-owner';
import {closeBrowser} from '../lib/browser';
import {InstagramStop} from '../lib/instagram-extract';
import {readResearchState,writeResearchState,pauseInstagram} from '../lib/instagram-state';
import {instagramWaitMs,researchLimits} from '../lib/instagram-policy';
async function main(){
 if(process.argv[2]!=='--live')throw Error('Pass --live for explicitly requested diagnostic page reads');
 if(await first(db,"SELECT id FROM ingestion_jobs WHERE status IN ('queued','running')"))throw Error('Research must be idle');
 const state=readResearchState();if(state.paused)throw Error('Source paused; manual attention required');
 const rows=await all(db,"SELECT DISTINCT r.source_url FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE r.kind='post' AND r.status='rejected' AND r.profile_url IS NULL AND q.job_id=(SELECT MAX(job_id) FROM discovery_queries) LIMIT 3");
 mkdirSync('data/browser-diagnostics',{recursive:true,mode:0o700});
 for(let i=0;i<rows.length;i++){
  const limits=researchLimits(),s=readResearchState();if(s.paused||(limits.dailyPages!==null&&s.visits>=limits.dailyPages))break;
  await delay(instagramWaitMs(limits));const next=readResearchState();if(next.paused)break;writeResearchState({...next,visits:next.visits+1,lastVisitAt:Date.now()});
  const url=String(rows[i].source_url);
  try{const loaded=await readInstagramDocument(url,new AbortController().signal,undefined,'post-author'),result=diagnoseSnapshotPostAuthor(loaded.snapshot,url),snapshot=loaded.snapshot;
   // Structural proof only: no credentials, page body, comments, emails or screenshots.
   const minimal=snapshot?{url:snapshot.url,canonicalUrl:snapshot.canonicalUrl,title:'Instagram',ogTitle:null,description:null,bodyText:'',mainText:snapshot.mainText.trim()?'visible content':'',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],postAuthorLinks:snapshot.postAuthorLinks,discoveryLinks:snapshot.discoveryLinks}:null;
   writeFileSync(`data/browser-diagnostics/owner-sample-${i+1}.json`,JSON.stringify({collected_at:new Date().toISOString(),requested:url,result,snapshot:minimal}),{mode:0o600});
   console.log(JSON.stringify({sample:i+1,reason:result.reason,method:result.method,ownerCount:result.candidates.length,links:snapshot?.discoveryLinks?.length??0}));
  }catch(e){if(e instanceof InstagramStop){pauseInstagram(e.message,e.restriction);console.log('Diagnostic stopped by source gate: '+e.reason);break;}throw e;}
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{await closeBrowser();await db.close();});

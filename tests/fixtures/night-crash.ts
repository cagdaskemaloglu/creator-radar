import { db,store } from '../../lib/db';
import { enqueue } from '../../lib/job-input';
import { researchNight, type NightRequest } from '../../lib/night-research';
import { first } from '../../lib/storage/driver';
import type { InstagramSnapshot } from '../../lib/instagram-extract';
const a='https://www.instagram.com/synthetic_crash_a/',b='https://www.instagram.com/synthetic_crash_b/';
async function main(){
 const release=await db.acquireWorkerLock();
 try{
  const request:NightRequest={content:a+'\n'+b,limit:20,permission:'Own synthetic crash recovery fixture',nightMaxPages:10,nightMaxPosts:0,nightMaxDepth:0,nightHours:8};
  if(process.argv[2]==='crash')await enqueue({kind:'instagram_night',source:'synthetic-crash',...request});
  await store.recoverInterruptedJobs();const job=await store.claimJob();if(!job)throw new Error('No recoverable job');
  let clock=Date.now(),calls=0;
  await researchNight(Number(job.id),request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},profile:async url=>{
   calls++;if(process.argv[2]==='crash'&&url===b)process.kill(process.pid,'SIGKILL');
   const username=new URL(url).pathname.split('/')[1];
   const snapshot:InstagramSnapshot={url,canonicalUrl:url,title:'',ogTitle:`Synthetic Creator (@${username})`,description:null,bodyText:'Synthetic',mainText:'Synthetic',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home Decor'};
   return{status:'loaded',snapshot};
  }});
  const state=await store.snapshot();const metrics=await first(db,'SELECT count(*) AS n FROM creator_metrics');
  console.log(`RECOVERED:${state.creators.length}:${metrics?.n}:${calls}`);
 }finally{await release();await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildDiscoveryPlan,normalizeDiscoveryLink,uniqueDiscoveryLinks,type DiscoverySettings } from '../lib/discovery-plan';
import { researchNight,type NightRequest } from '../lib/night-research';
import { NightStore } from '../lib/night-store';
import { DiscoveryStore } from '../lib/discovery-store';
import { DiscoveryStop,resolveSnapshotPostAuthor } from '../lib/discovery-browser';
import {InstagramStop,type InstagramSnapshot} from '../lib/instagram-extract';
import { WorkerInterrupted } from '../lib/job-control';
import { readGoogleState,writeGoogleState,resumeGoogle } from '../lib/google-state';
import { writeResearchState,readResearchState } from '../lib/instagram-state';
import { first } from '../lib/storage/driver';
import { TransientHttpError,isTransientTransportError } from '../lib/transient-error';
const dir=mkdtempSync(join(tmpdir(),'radar-discovery-'));
process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(dir,'singleton.sqlite');process.env.GOOGLE_DISCOVERY_STATE_FILE=join(dir,'google.json');process.env.INSTAGRAM_STATE_FILE=join(dir,'ig.json');
const profile='https://www.instagram.com/synthetic_discovered/',post='https://www.instagram.com/p/SyntheticDiscovery/';
const settings:DiscoverySettings={enabled:true,topics:['Interior Design','Cozy Room'],keywords:[],providers:['google'],maxQueries:4,resultsPerQuery:10};
test('DIV post layout resolves only the exact post owner, rejecting commenters and conflicting owners',()=>{
 const snapshot:InstagramSnapshot={url:post,canonicalUrl:post,title:'Instagram',ogTitle:null,description:null,bodyText:'',mainText:'',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],postAuthorLinks:[],discoveryLinks:[profile,'https://www.instagram.com/commenter/','https://www.instagram.com/commenter/p/OtherPost/',`https://www.instagram.com/synthetic_discovered/p/SyntheticDiscovery/`]};
 assert.equal(resolveSnapshotPostAuthor(snapshot,post),profile);
 assert.equal(resolveSnapshotPostAuthor({...snapshot,discoveryLinks:snapshot.discoveryLinks!.slice(0,3)},post),null);
 assert.equal(resolveSnapshotPostAuthor({...snapshot,postAuthorLinks:['https://www.instagram.com/different_owner/']},post),null);
 assert.equal(resolveSnapshotPostAuthor({...snapshot,url:'https://www.instagram.com/p/OtherPost/'},post),null);
});
async function setup(name:string,extra:Partial<NightRequest>={}){
 const {SQLiteDatabase}=await import('../lib/storage/sqlite');const {CreatorStore}=await import('../lib/db');const {enqueue}=await import('../lib/job-input');
 const db=new SQLiteDatabase(join(dir,name+'.sqlite')),store=new CreatorStore(db);
 const request:NightRequest={content:'',limit:20,permission:'Own synthetic keyword discovery fixtures',nightMaxPages:20,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,discoveryEnabled:true,discoveryTopics:[],discoveryKeywords:['desk setup'],discoveryProviders:['google'],discoveryMaxQueries:1,discoveryResultsPerQuery:10,...extra};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-keyword-discovery',...request},store);await store.claimJob();
 let clock=Date.now();const state={day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null};writeGoogleState(state);writeResearchState(state);
 return{db,store,id,request,clock:{now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}},read:async(url:string)=>({status:'loaded' as const,snapshot:{url,canonicalUrl:url,title:'',ogTitle:`Synthetic Creator (@${new URL(url).pathname.split('/')[1]})`,description:null,bodyText:'Synthetic public fixture',mainText:'Synthetic public fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home Decor'}})};
}
test('automatic topics produce balanced bounded Google queries and explicit tag routes',()=>{
 const plan=buildDiscoveryPlan(settings);assert.equal(plan.length,4);assert.deepEqual(plan.map(q=>q.keyword),['home decor','cozy room','interior design','cozyroominspo']);assert.match(new URL(plan[0].url).searchParams.get('q')!,/site:instagram\.com/);
 assert.equal(buildDiscoveryPlan({...settings,topics:['Cozy Room'],providers:['instagram_tags'],maxQueries:1})[0].url,'https://www.instagram.com/explore/tags/cozyroom/');
 const tags=buildDiscoveryPlan({...settings,providers:['instagram_tags'],maxQueries:1});assert.equal(tags[0].url,'https://www.instagram.com/explore/tags/homedecor/');
 assert.throws(()=>buildDiscoveryPlan({...settings,topics:[],keywords:[]}));
});
test('one connection closure skips only that post without retry and still saves the next creator',async()=>{
 const s=await setup('transport-skip',{limit:1});let calls=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:s.read,discovery:{...s.clock,search:async q=>({sourceUrl:q.url,links:[{url:post,kind:'post',title:''},{url:'https://www.instagram.com/p/TransportNext/',kind:'post',title:''}]}),author:async url=>{calls++;if(url===post)throw new Error('page.goto: net::ERR_CONNECTION_CLOSED');return profile;}}});
  assert.equal(calls,2);assert.equal((await s.store.snapshot()).creators.length,1);
  const rows=(await new DiscoveryStore(s.store).report(s.id)).results;assert.equal(rows.find(r=>r.source_url===post)?.status,'skipped');
 }finally{await s.db.close();}
});
test('three consecutive transport errors defer discovery and preserve unvisited links',async()=>{
 const s=await setup('transport-stop');let calls=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:s.read,discovery:{...s.clock,search:async q=>({sourceUrl:q.url,links:[1,2,3,4].map(n=>({url:`https://www.instagram.com/p/Transport${n}/`,kind:'post' as const,title:''}))}),author:async()=>{calls++;throw new Error('page.goto: net::ERR_CONNECTION_RESET');}}});
  assert.equal(calls,3);const report=(await new NightStore(s.store).reports())[0];assert.equal(report.stop_reason,'discovery_deferred');assert.equal(report.unresolved_posts,1);
 }finally{await s.db.close();}
});
test('Instagram 403 and 429 still pause immediately instead of skipping to another post',async()=>{
 for(const reason of ['access-denied','rate-limit'] as const){
  const s=await setup('gate-'+reason);let calls=0;
  try{
   await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:s.read,discovery:{...s.clock,search:async q=>({sourceUrl:q.url,links:[1,2].map(n=>({url:`https://www.instagram.com/p/Gate${n}/`,kind:'post' as const,title:''}))}),author:async()=>{calls++;throw new InstagramStop(reason,reason==='access-denied'?'HTTP 403':'HTTP 429');}}});
   assert.equal(calls,1);assert.equal(readResearchState().paused,true);assert.equal((await s.store.snapshot()).jobs[0].status,'paused');
  }finally{await s.db.close();}
 }
});
test('larger pools skip recently completed post research without another author or profile visit',async()=>{
 const s=await setup('recent-pool',{limit:1,nightMaxPages:3});let authors=0,reads=0;
 const deps={...s.clock,discovery:{...s.clock,search:async(q:{url:string})=>({sourceUrl:q.url,links:[{url:post,kind:'post' as const,title:''}]}),author:async()=>{authors++;return profile;}},profile:async(url:string)=>{reads++;return s.read(url);}};
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,deps);
  const {enqueue}=await import('../lib/job-input');const id=await enqueue({kind:'instagram_night',source:'synthetic-recent-pool',...s.request},s.store);await s.store.claimJob();
  await researchNight(id,s.request,s.store,new AbortController().signal,deps);
  assert.equal(authors,1);assert.equal(reads,1);
  const repo=new DiscoveryStore(s.store),result=(await repo.report(id)).results[0];assert.equal(result.status,'skipped');assert.equal(result.reason,'recently_researched');
  assert.equal(await repo.recentlyResolved(id,post,Date.now()+5*3600000),undefined);
 }finally{await s.db.close();}
});
test('discovery captions classify without a second post visit; unfinished pool carries provenance into the next run',async()=>{
 const s=await setup('caption-pool',{limit:1,nightMaxPages:3,nightMaxPosts:1,discoveryProviders:['instagram_tags']});
 const second='https://www.instagram.com/second_creator/',secondPost='https://www.instagram.com/p/SecondPoolPost/';
 const collectedAt=new Date().toISOString();let searches=0,authors=0;
 const {enqueue}=await import('../lib/job-input');
 const dependencies={...s.clock,profile:async(url:string)=>{const loaded=await s.read(url);loaded.snapshot.visibleBiography='Independent publisher';return loaded;},post:async()=>{throw new Error('Cached discovery caption must not be fetched again');},discovery:{...s.clock,search:async(q:{url:string})=>{searches++;return{sourceUrl:q.url,links:[{url:post,kind:'post' as const,title:''},{url:secondPost,kind:'post' as const,title:''}]};},author:async(url:string)=>{authors++;return{profile:url===post?profile:second,evidence:{url,caption:'Shop now #cozyroom',hashtags:['#cozyroom'],collected_at:collectedAt}};}}};
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,dependencies);
  const state=await s.store.snapshot();assert.equal(state.creators[0].primary_niche,'Cozy Room');assert.equal(state.creators[0].account_type,'store');assert.equal(authors,1);
  const report=(await new NightStore(s.store).reports())[0];assert.equal(report.unresolved_posts,1);assert.equal(report.page_requests,3);assert.equal((report.metrics as {match_rate:number}).match_rate,100);
  const nextRequest={...s.request,poolSourceJob:s.id};const id=await enqueue({kind:'instagram_night',source:'synthetic-pool-continuation',...nextRequest},s.store);await s.store.claimJob();
  await researchNight(id,nextRequest,s.store,new AbortController().signal,dependencies);
  const after=await s.store.snapshot();assert.equal(after.creators.length,2);assert.equal(searches,1);assert.equal(authors,2);
  assert.equal((await new NightStore(s.store).reports()).find(r=>r.job_id===s.id)?.unresolved_posts,0);
  assert.equal((await new DiscoveryStore(s.store).report(s.id)).results.filter(r=>r.status==='carried').length,1);
  const record=after.creators.find(c=>c.username==='second_creator')!;
  assert.equal(record.primary_niche,'Cozy Room');assert.equal((record.discovery_evidence as {keyword:string}[])[0].keyword,'desk setup');
  assert.equal((record.content_evidence as {collected_at:string}[])[0].collected_at,collectedAt);
  // Re-entering initialization cannot copy the source pool a second time.
  const night=new NightStore(s.store),run=await night.run(id);await night.initialize(id,run.settings);
  assert.equal((await new DiscoveryStore(s.store).report(id)).results.length,1);
  const revisit={...s.request,content:second,discoveryEnabled:false,nightMaxPages:2};
  const revisitId=await enqueue({kind:'instagram_night',source:'synthetic-known-origin',...revisit},s.store);await s.store.claimJob();
  let readPost:string|undefined;
  await researchNight(revisitId,revisit,s.store,new AbortController().signal,{...s.clock,profile:dependencies.profile,post:async url=>{readPost=url;return{url,caption:'My #cozyroom',hashtags:['#cozyroom'],collected_at:collectedAt};}});
  assert.equal(readPost,secondPost);assert.equal((await s.store.snapshot()).creators.length,2);
 }finally{await s.db.close();}
});
test('only normalized profile/post links enter the pool; tracking, routes and duplicate wrappers handled',()=>{
 assert.equal(normalizeDiscoveryLink('https://www.google.com/url?q='+encodeURIComponent(profile))?.url,profile);
 assert.equal(normalizeDiscoveryLink(profile+'?hl=tr&utm_source=google')?.url,profile);
 for(const url of ['https://evil.org/profile','https://www.instagram.com/accounts/','https://www.instagram.com/explore/tags/cozy/','https://www.instagram.com/share/','https://www.instagram.com/a/?access_token=secret'])assert.equal(normalizeDiscoveryLink(url),null);
 assert.equal(normalizeDiscoveryLink(post)?.kind,'post');
 assert.equal(uniqueDiscoveryLinks([{url:profile,title:'a'},{url:profile,title:'duplicate'},{url:'https://evil.org',title:'bad'}],10).length,1);
});
test('seedless discovery creates real candidate workflow; search text does not classify the creator',async()=>{
 const s=await setup('seedless');let profiles=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,discovery:{...s.clock,search:async q=>({sourceUrl:q.url,links:[{url:profile,kind:'profile',title:'Desk setup creator'},{url:profile,kind:'profile',title:'Duplicate'}]})},profile:async url=>{profiles++;return s.read(url);}});
  const state=await s.store.snapshot();assert.equal(state.creators.length,1);assert.equal(profiles,1);assert.equal(state.creators[0].primary_niche,'Interior Design');assert.equal(state.creators[0].synthetic,false);
  const evidence=state.creators[0].discovery_evidence as {keyword:string;search_url:string}[];assert.equal(evidence[0].keyword,'desk setup');assert.ok(evidence[0].search_url.startsWith('https://www.google.com/search?'));
  assert.ok(!(state.creators[0].categories as string[]).includes('Desk Setup'));
  const report=(await new NightStore(s.store).reports())[0];const discovery=report.discovery as {queries:{result_count:number}[];results:unknown[]};assert.equal(discovery.results.length,1);assert.equal(discovery.queries[0].result_count,1);assert.equal(report.page_requests,2);assert.equal(report.matched,1);
 }finally{await s.db.close();}
});
test('post leads resolve once across queries and keep original search provenance',async()=>{
 const s=await setup('authors',{discoveryKeywords:['desk setup','cozy'],discoveryMaxQueries:2});let authors=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,discovery:{...s.clock,search:async q=>({sourceUrl:q.url,links:[{url:post,kind:'post',title:'Public post'}]}),author:async()=>{authors++;return profile;}},profile:s.read});
  assert.equal(authors,1);const state=await s.store.snapshot();assert.equal(state.creators.length,1);assert.equal((state.creators[0].discovery_evidence as unknown[]).length,2);assert.equal((await new NightStore(s.store).reports())[0].page_requests,4);
 }finally{await s.db.close();}
});
test('Google CAPTCHA persists pause, requires explicit resume and does not rotate providers',async()=>{
 const s=await setup('captcha');let profiles=0,searches=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,discovery:{...s.clock,search:async()=>{searches++;throw new DiscoveryStop('challenge','Synthetic CAPTCHA');}},profile:async url=>{profiles++;return s.read(url);}});
  assert.equal(searches,1);assert.equal(profiles,0);assert.equal(readGoogleState().paused,true);assert.equal((await s.store.snapshot()).jobs[0].status,'paused');
  assert.equal((await new DiscoveryStore(s.store).queries(s.id))[0].status,'blocked');
  resumeGoogle();await new NightStore(s.store).resume(s.id);await s.store.claimJob();
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,discovery:{...s.clock,search:async q=>{searches++;return{sourceUrl:q.url,links:[{url:profile,kind:'profile',title:'hint'}]};}},profile:s.read});
  assert.equal(searches,2);assert.equal((await s.store.snapshot()).jobs[0].status,'completed');assert.equal((await new NightStore(s.store).reports())[0].page_requests,3);
 }finally{await s.db.close();}
});
test('completed searches survive interruption and are not repeated on restart',async()=>{
 const s=await setup('restart',{discoveryKeywords:['desk setup','cozy'],discoveryMaxQueries:2});const c=new AbortController();const calls:string[]=[];
 try{
  await researchNight(s.id,s.request,s.store,c.signal,{...s.clock,discovery:{...s.clock,search:async q=>{calls.push(q.keyword);if(q.keyword==='cozy'){c.abort(new WorkerInterrupted());throw c.signal.reason;}return{sourceUrl:q.url,links:[{url:profile,kind:'profile',title:''}]};}},profile:s.read});
  assert.equal((await s.store.snapshot()).jobs[0].status,'queued');await s.store.claimJob();
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,discovery:{...s.clock,search:async q=>{calls.push(q.keyword);return{sourceUrl:q.url,links:[]};}},profile:s.read});
  assert.equal(calls.filter(t=>t==='desk setup').length,1);assert.equal(calls.filter(t=>t==='cozy').length,2);assert.equal((await s.store.snapshot()).creators.length,1);
 }finally{await s.db.close();}
});
test('discovery respects the total page budget and preserves unvisited candidates',async()=>{
 const s=await setup('budget',{nightMaxPages:1});let calls=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,discovery:{...s.clock,search:async q=>({sourceUrl:q.url,links:[{url:profile,kind:'profile',title:''}]})},profile:async url=>{calls++;return s.read(url);}});
  assert.equal(calls,0);const r=(await new NightStore(s.store).reports())[0];assert.equal(r.pending,1);assert.equal(r.page_requests,1);assert.equal(r.stop_reason,'page_limit');
 }finally{await s.db.close();}
});
test('seedless input must supply a real topic or keyword, and cannot contain search operators',async()=>{
 const s=await setup('validation');
 try{const {enqueue}=await import('../lib/job-input');await assert.rejects(enqueue({kind:'instagram_night',source:'test',permission:'synthetic validation',content:'',discoveryEnabled:false},s.store));await assert.rejects(enqueue({kind:'instagram_night',source:'test',permission:'synthetic validation',content:'',discoveryEnabled:true,discoveryKeywords:['site:evil.org']},s.store));}
 finally{await s.db.close();}
});
test('HTTP 5xx is a transient failure, never a source restriction',async()=>{
 assert.equal(isTransientTransportError(new TransientHttpError(500)),true);
 assert.equal(isTransientTransportError(new Error('page.goto: net::ERR_CONNECTION_CLOSED at https://www.instagram.com/p/X/')),true);
 assert.equal(isTransientTransportError(new Error('HTTP 429')),false);
 assert.equal(isTransientTransportError(new InstagramStop('rate-limit','HTTP 429')),false);
 assert.equal(isTransientTransportError(new Error('Record suppressed')),false);
 const s=await setup('transient-5xx');let calls=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:s.read,discovery:{...s.clock,search:async q=>({sourceUrl:q.url,links:[1,2,3,4].map(n=>({url:`https://www.instagram.com/p/Transient${n}/`,kind:'post' as const,title:''}))}),author:async()=>{calls++;throw new TransientHttpError(500);}}});
  assert.equal(calls,3);assert.notEqual(readResearchState().paused,true);
  const report=(await new NightStore(s.store).reports())[0];assert.equal(report.stop_reason,'discovery_deferred');
  assert.notEqual((await s.store.snapshot()).jobs[0].status,'paused');
 }finally{await s.db.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {DiscoveryStore} from '../lib/discovery-store';
import {writeResearchState} from '../lib/instagram-state';
import {profileSchema} from '../lib/model';
import {safeId} from '../lib/storage/driver';
const root=mkdtempSync(join(tmpdir(),'radar-efficient-'));
process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.RADAR_STORAGE='sqlite';process.env.INSTAGRAM_STATE_FILE=join(root,'instagram.json');process.env.INSTAGRAM_DAILY_PAGES='500';
const profile=(n:number)=>`https://www.instagram.com/efficient_${n}/`,post=(n:number)=>`https://www.instagram.com/p/Efficient_${n}/`;
function snapshot(url:string){return{url,canonicalUrl:url,title:'',ogTitle:`Synthetic Creator (@${new URL(url).pathname.split('/')[1]})`,description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor #homedecor'};}
async function setup(name:string,patch:Partial<NightRequest>={}){
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{enqueue}=await import('../lib/job-input');
 const db=new SQLiteDatabase(join(root,name+'.sqlite')),store=new CreatorStore(db);
 const request:NightRequest={efficientResearch:true,content:'',limit:90,permission:'Own synthetic efficiency fixtures',nightMaxPages:90,nightMaxPosts:1,nightMaxDepth:0,nightHours:8,discoveryEnabled:true,discoveryKeywords:['batchone','batchtwo'],discoveryProviders:['instagram_tags'],discoveryMaxQueries:2,discoveryResultsPerQuery:20,...patch};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-efficient',...request},store);await store.claimJob();
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 return{db,store,id,request,time:{now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}}};
}
test('small discovery batches save before the next tag and continue beyond 16 and 30 profiles',async()=>{
 const s=await setup('batches');const events:string[]=[];
 try{
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>{events.push('search:'+q.keyword);const offset=q.keyword==='batchone'?0:16;return{sourceUrl:q.url,links:Array.from({length:16},(_,i)=>({kind:'post',url:post(i+offset),title:''}))};},author:async url=>{events.push('author:'+url);const n=Number(new URL(url).pathname.match(/_(\d+)/)![1]);return{profile:profile(n),evidence:{url,caption:'#homedecor',hashtags:['#homedecor'],collected_at:new Date().toISOString()}};}},profile:async url=>{events.push('profile:'+url);return{status:'loaded',snapshot:snapshot(url)};}});
 const state=await s.store.snapshot(),report=(await new NightStore(s.store).reports())[0];assert.equal(state.creators.length,32);assert.equal(report.page_requests,66);assert.equal(report.status,'completed');assert.equal(report.stop_reason,'no_new_links');
 const firstProfile=events.findIndex(e=>e.startsWith('profile:')),sixthAuthor=events.map((e,i)=>e.startsWith('author:')?i:-1).filter(i=>i>=0)[5];assert.ok(firstProfile<sixthAuthor);assert.ok(events.indexOf('profile:'+profile(15))<events.indexOf('search:batchtwo'));
 assert.equal(report.settings&& (report.settings as {efficientResearch:boolean}).efficientResearch,true);
 }finally{await s.db.close();}
});
test('a small total budget reserves profile visits and leaves the remaining pool persisted',async()=>{
 const s=await setup('budget',{nightMaxPages:7});
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>({sourceUrl:q.url,links:Array.from({length:20},(_,i)=>({kind:'post',url:post(i),title:''}))}),author:async url=>profile(Number(new URL(url).pathname.match(/_(\d+)/)![1]))},profile:async url=>({status:'loaded',snapshot:snapshot(url)})});
 const r=(await new NightStore(s.store).reports())[0];assert.equal(r.page_requests,7);assert.equal(r.inserted,3);assert.ok(Number(r.unresolved_posts)>0);assert.equal(r.status,'completed');
 }finally{await s.db.close();}
});
test('recent profiles are skipped before browser visits, while new records still save',async()=>{
 const s=await setup('recent',{nightMaxPages:10});const visited:string[]=[];
 try{
 await s.store.saveProfile(profileSchema.parse({username:'efficient_0',biography:'Home decor'}),{provider:'fixture',identifier:'local',permission:'Own synthetic fixture'});
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>({sourceUrl:q.url,links:[{kind:'profile',url:profile(0),title:''},{kind:'profile',url:profile(1),title:''}]})},profile:async url=>{visited.push(url);return{status:'loaded',snapshot:snapshot(url)};}});
 assert.deepEqual(visited,[profile(1)]);const state=await s.store.snapshot();assert.equal(state.creators.length,2);assert.equal(state.creators.find(c=>c.username==='efficient_0')?.sources.length,1);const r=(await new NightStore(s.store).reports())[0];assert.equal(r.inserted,1);assert.equal((r.metrics as {recent_profiles_skipped:number}).recent_profiles_skipped,1);
 }finally{await s.db.close();}
});
test('known post owners and attributed captions carry across completed jobs without another owner visit',async()=>{
 const s=await setup('owner-cache',{nightMaxPages:5,discoveryMaxQueries:1});
 try{
 const old=await s.store.enqueue('instagram_night','{}');await new NightStore(s.store).initialize(old,{maxProfiles:5,maxPages:5,maxPosts:1,maxDepth:0,hours:2,permission:'Synthetic fixtures',seeds:[]});const pool=new DiscoveryStore(s.store);
 await pool.initialize(old,[{provider:'instagram_tags',keyword:'old',url:'https://www.instagram.com/explore/tags/old/'}]);const q=(await pool.queries(old))[0];await pool.complete(old,safeId(q.id),[{kind:'post',url:post(9),title:''}]);const result=(await pool.pendingPosts(old))[0];await pool.acceptAuthor(old,safeId(result.id),profile(9),{url:post(9),caption:'#homedecor',hashtags:['#homedecor'],collected_at:new Date().toISOString()});await s.store.finish(old,'completed');
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>({sourceUrl:q.url,links:[{kind:'post',url:post(9),title:''}]}),author:async()=>{throw new Error('Cached owner must not be reopened');}},profile:async url=>({status:'loaded',snapshot:{...snapshot(url),visibleBiography:null}}),post:async()=>{throw new Error('Cached caption must not be reopened');}});
 const r=(await new NightStore(s.store).reports()).find(r=>r.job_id===s.id)!;assert.equal(r.page_requests,2);assert.equal(r.inserted,1);assert.equal(r.matched,1);
 }finally{await s.db.close();}
});
test('an unproductive tag yields to another tag after five unsuccessful owner lookups',async()=>{
 const s=await setup('poor-tag',{nightMaxPages:30,limit:1});const events:string[]=[];
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>{events.push('search:'+q.keyword);return{sourceUrl:q.url,links:q.keyword==='batchone'?Array.from({length:20},(_,i)=>({kind:'post',url:post(i),title:''})):[{kind:'profile',url:profile(99),title:''}]};},author:async url=>{events.push('author');return null;}},profile:async url=>{events.push('profile');return{status:'loaded',snapshot:snapshot(url)};}});
 assert.equal(events.filter(e=>e==='author').length,5);assert.ok(events.indexOf('search:batchtwo')<events.indexOf('profile'));assert.equal((await s.store.snapshot()).creators.length,1);assert.equal((await new NightStore(s.store).reports())[0].unresolved_posts,15);
 }finally{await s.db.close();}
});
test('tag ranking counts unique new profiles and gives unexplored tags priority over low-yield tags',async()=>{
 const s=await setup('ranking');
 try{
 const old=await s.store.enqueue('instagram_night','{}'),night=new NightStore(s.store),pool=new DiscoveryStore(s.store);
 await night.initialize(old,{maxProfiles:5,maxPages:10,maxPosts:0,maxDepth:0,hours:2,permission:'Own synthetic fixture',seeds:[]});
 await pool.initialize(old,['goodyield','pooryield'].map(keyword=>({provider:'instagram_tags',keyword,url:`https://www.instagram.com/explore/tags/${keyword}/`})));
 const [good,poor]=await pool.queries(old);
 await pool.reserve(old,safeId(good.id));await pool.complete(old,safeId(good.id),[{kind:'profile',url:profile(42),title:''},{kind:'post',url:post(42),title:''}]);const r=(await pool.pendingPosts(old))[0];await pool.reserve(old,safeId(good.id),safeId(r.id));await pool.acceptAuthor(old,safeId(r.id),profile(42));
 const candidate=(await s.db.query('SELECT id FROM research_candidates WHERE job_id=$1',[old])).rows[0];await night.reserve(old,safeId(candidate.id));await s.store.saveProfile(profileSchema.parse({username:'efficient_42',biography:'Home decor'}),{provider:'fixture',identifier:'local',permission:'Own synthetic fixture'},{candidate:safeId(candidate.id),job:old});
 await pool.reserve(old,safeId(poor.id));await pool.complete(old,safeId(poor.id),[]);await s.store.finish(old,'completed');
 const metrics=await pool.keywordPerformance();assert.equal(metrics.find(p=>p.keyword==='goodyield')?.newProfiles,1);assert.equal(metrics.find(p=>p.keyword==='goodyield')?.pages,3);
 await new NightStore(s.store).initialize(s.id,{maxProfiles:5,maxPages:10,maxPosts:0,maxDepth:0,hours:2,permission:'Own synthetic fixture',seeds:[]});
 await pool.initialize(s.id,['pooryield','untried','goodyield'].map(keyword=>({provider:'instagram_tags',keyword,url:`https://www.instagram.com/explore/tags/${keyword}/`})));
 assert.deepEqual((await pool.prioritizedQueries(s.id)).map(q=>q.keyword),['goodyield','untried','pooryield']);
 }finally{await s.db.close();}
});
test('cancellation during a batch preserves saved records and never starts the next tag',async()=>{
 const s=await setup('cancel-batch');let reads=0,searches=0;
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async q=>{searches++;return{sourceUrl:q.url,links:Array.from({length:10},(_,i)=>({kind:'profile',url:profile(i),title:''}))};}},profile:async url=>{if(++reads===2)await s.store.cancel(s.id);return{status:'loaded',snapshot:snapshot(url)};}});
 const state=await s.store.snapshot();assert.equal(state.creators.length,1);assert.equal(state.jobs[0].status,'cancelled');assert.equal(searches,1);assert.equal((await new NightStore(s.store).reports())[0].pending,9);
 }finally{await s.db.close();}
});
test('a blocked source pauses the efficient loop immediately and cannot move to the next tag',async()=>{
 const s=await setup('blocked');let searches=0;
 try{const {InstagramStop}=await import('../lib/instagram-extract');const {readResearchState}=await import('../lib/instagram-state');
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async()=>{searches++;throw new InstagramStop('rate-limit','Synthetic 429');}},profile:async()=>{throw new Error('Blocked source must not visit profiles');}});
 assert.equal(searches,1);assert.equal((await s.store.snapshot()).jobs[0].status,'paused');assert.equal(readResearchState().paused,true);
 }finally{await s.db.close();}
});
test('worker restart resumes the current batch without repeating completed searches or resetting the budget',async()=>{
 const s=await setup('restart',{limit:10,nightMaxPages:20,discoveryMaxQueries:1});const control=new AbortController();let reads=0,searches=0;
 try{
 const {WorkerInterrupted}=await import('../lib/job-control');
 const discovery={search:async(q:{url:string})=>{searches++;return{sourceUrl:q.url,links:Array.from({length:6},(_,i)=>({kind:'profile' as const,url:profile(i),title:''}))};}};
 await researchNight(s.id,s.request,s.store,control.signal,{...s.time,discovery,profile:async url=>{if(++reads===3)control.abort(new WorkerInterrupted());return{status:'loaded',snapshot:snapshot(url)};}});
 let report=(await new NightStore(s.store).reports())[0];assert.equal(report.status,'queued');assert.equal(report.inserted,2);assert.equal(report.page_requests,4);
 await s.store.claimJob();await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery,profile:async url=>{reads++;return{status:'loaded',snapshot:snapshot(url)};}});
 report=(await new NightStore(s.store).reports())[0];assert.equal(report.status,'completed');assert.equal(report.inserted,6);assert.equal(report.page_requests,8);assert.equal(searches,1);assert.equal(reads,7);assert.ok((await s.store.snapshot()).creators.every(c=>c.sources.length===1));
 }finally{await s.db.close();}
});
test('hashtag spelling aliases share one performance row and never produce duplicate new searches',async()=>{
 const {buildDiscoveryPlan}=await import('../lib/discovery-plan');
 const plan=buildDiscoveryPlan({enabled:true,topics:[],keywords:['home decor','homedecor','home-decor'],providers:['instagram_tags'],maxQueries:12,resultsPerQuery:20});assert.equal(plan.length,1);
 const s=await setup('alias-metrics');
 try{
 const old=await s.store.enqueue('instagram_night','{}'),night=new NightStore(s.store),pool=new DiscoveryStore(s.store);
 await night.initialize(old,{maxProfiles:5,maxPages:10,maxPosts:0,maxDepth:0,hours:2,permission:'Own synthetic fixture',seeds:[]});
 await pool.initialize(old,['home decor','homedecor'].map(keyword=>({provider:'instagram_tags',keyword,url:'https://www.instagram.com/explore/tags/homedecor/'})));
 for(const q of await pool.queries(old)){await pool.reserve(old,safeId(q.id));await pool.complete(old,safeId(q.id),[{kind:'profile',url:profile(50),title:''}]);}
 const candidate=(await s.db.query('SELECT id FROM research_candidates WHERE job_id=$1',[old])).rows[0];await night.reserve(old,safeId(candidate.id));await s.store.saveProfile(profileSchema.parse({username:'efficient_50',biography:'Home decor'}),{provider:'fixture',identifier:'local',permission:'Own synthetic fixture'},{candidate:safeId(candidate.id),job:old});await s.store.finish(old,'completed');
 const rows=await pool.keywordPerformance();assert.equal(rows.length,1);assert.equal(rows[0].keyword,'homedecor');assert.equal(rows[0].newProfiles,1);assert.equal(rows[0].pages,3);
 }finally{await s.db.close();}
});
test('disabled daily quota permits discovery and saving without resetting the visit counter or run budget',async()=>{
 const s=await setup('unlimited-daily',{nightMaxPages:5,discoveryMaxQueries:1});const previous=process.env.INSTAGRAM_DAILY_PAGES;
 try{
 process.env.INSTAGRAM_DAILY_PAGES='0';const {readResearchState}=await import('../lib/instagram-state');const {researchLimits}=await import('../lib/instagram-policy');assert.equal(researchLimits().dailyPages,null);
 writeResearchState({...readResearchState(s.time.now()),visits:9999});
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async q=>({sourceUrl:q.url,links:[{kind:'profile',url:profile(88),title:''}]})},profile:async url=>({status:'loaded',snapshot:snapshot(url)})});
 const r=(await new NightStore(s.store).reports())[0];assert.equal(r.inserted,1);assert.equal(r.page_requests,2);assert.equal(readResearchState(s.time.now()).visits,10001);assert.equal(r.status,'completed');
 }finally{if(previous===undefined)delete process.env.INSTAGRAM_DAILY_PAGES;else process.env.INSTAGRAM_DAILY_PAGES=previous;await s.db.close();}
});

test('each resolved owner is saved before a later discovery restriction and survives resume',async()=>{
 const {InstagramStop}=await import('../lib/instagram-extract');
 const {resumeInstagram}=await import('../lib/instagram-state');
 const s=await setup('save-before-owner-restriction',{discoveryKeywords:['batchone'],discoveryMaxQueries:1,nightMaxPosts:0});
 let owners=0,reads=0;
 const deps={...s.time,discovery:{...s.time,search:async(q:{url:string})=>({sourceUrl:q.url,links:[0,1,2].map(n=>({kind:'post' as const,url:post(n),title:''}))}),author:async(url:string)=>{
  owners++;
  if(owners===2){assert.equal((await s.store.snapshot()).creators.length,1);throw new InstagramStop('rate-limit','Synthetic 429 after first saved creator');}
  return profile(Number(new URL(url).pathname.match(/_(\d+)/)![1]));
 }},profile:async(url:string)=>{reads++;return{status:'loaded' as const,snapshot:snapshot(url)};}};
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,deps);
  const paused=await s.store.snapshot();assert.equal(paused.jobs[0].status,'paused');assert.equal(paused.creators.length,1);assert.equal(reads,1);assert.equal(owners,2);
  const before=await new NightStore(s.store).run(s.id);
  resumeInstagram();await new NightStore(s.store).resume(s.id);await s.store.claimJob();
  await researchNight(s.id,s.request,s.store,new AbortController().signal,deps);
  const after=await s.store.snapshot();assert.equal(after.jobs[0].status,'completed');assert.equal(after.creators.filter(c=>c.username==='efficient_0').length,1);
  assert.equal((await new NightStore(s.store).run(s.id)).started_at,before.started_at);
 }finally{await s.db.close();}
});

test('discovery skips old known profiles too and spends profile visits on new creators',async()=>{
 const s=await setup('old-known',{nightMaxPages:10,discoveryMaxQueries:1});const visited:string[]=[];
 try{
 await s.store.saveProfile(profileSchema.parse({username:'efficient_0',biography:'Home decor'}),{provider:'fixture',identifier:'local',permission:'Own synthetic fixture'});
 await s.db.query('UPDATE creators SET updated_at=$1',[new Date(s.time.now()-24*3600000).toISOString()]);
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>({sourceUrl:q.url,links:[0,1].map(n=>({kind:'profile' as const,url:profile(n),title:''}))})},profile:async url=>{visited.push(url);return{status:'loaded',snapshot:snapshot(url)};}});
 assert.deepEqual(visited,[profile(1)]);const state=await s.store.snapshot();assert.equal(state.jobs[0].updated,0);assert.equal(state.jobs[0].inserted,1);
 }finally{await s.db.close();}
});

test('fair discovery drains viable pending posts before opening another tag',async()=>{
 const s=await setup('drain-before-search',{nightMaxPages:30,limit:3,discoveryFairBudget:true,nightMaxPosts:0});const events:string[]=[];
 try{
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>{events.push('search:'+q.keyword);return{sourceUrl:q.url,links:[0,1,2].map(n=>({kind:'post' as const,url:post(n),title:''}))};},author:async url=>{events.push('owner');return profile(Number(new URL(url).pathname.match(/_(\d+)/)![1]));}},profile:async url=>{events.push('profile');return{status:'loaded',snapshot:snapshot(url)};}});
 assert.equal(events.filter(e=>e.startsWith('search:')).length,1);assert.equal(events.filter(e=>e==='owner').length,3);assert.equal((await s.store.snapshot()).jobs[0].inserted,3);
 }finally{await s.db.close();}
});

test('known post aliases skip owner visits even when the stored creator is older than the refresh cooldown',async()=>{
 const s=await setup('old-known-owner',{discoveryMaxQueries:1,nightMaxPages:10,nightMaxPosts:0});let owners=0;
 try{
 await s.store.saveProfile(profileSchema.parse({username:'efficient_0',biography:'Home decor'}),{provider:'fixture',identifier:'local',permission:'Own synthetic fixtures'});
 await s.db.query('UPDATE creators SET updated_at=$1',[new Date(s.time.now()-24*3600000).toISOString()]);
 const old=await s.store.enqueue('instagram_night','{}'),repo=new DiscoveryStore(s.store);
 await new NightStore(s.store).initialize(old,{maxProfiles:5,maxPages:10,maxPosts:0,maxDepth:0,hours:2,permission:'Own synthetic fixtures',seeds:[]});
 await repo.initialize(old,[{provider:'instagram_tags',keyword:'old',url:'https://www.instagram.com/explore/tags/old/'}]);const q=(await repo.queries(old))[0];await repo.complete(old,safeId(q.id),[{kind:'post',url:post(0),title:''}]);await repo.acceptAuthor(old,safeId((await repo.pendingPosts(old))[0].id),profile(0));await s.store.finish(old,'completed');
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{...s.time,search:async q=>({sourceUrl:q.url,links:[{kind:'post' as const,url:post(0).replace('/p/','/reel/'),title:''},{kind:'post' as const,url:post(1),title:''}]}),author:async()=>{owners++;return profile(1);}},profile:async url=>({status:'loaded',snapshot:snapshot(url)})});
 assert.equal(owners,1);assert.equal((await s.store.snapshot()).jobs.find(j=>j.id===s.id)?.inserted,1);
 }finally{await s.db.close();}
});

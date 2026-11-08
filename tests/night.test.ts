import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { extractCreatorCaption, instagramPostUrl } from '../lib/instagram-post';
import { researchNight, type NightRequest } from '../lib/night-research';
import { NightStore } from '../lib/night-store';
import { WorkerInterrupted } from '../lib/job-control';
import { InstagramStop, type InstagramSnapshot } from '../lib/instagram-extract';
import { readResearchState, writeResearchState, resumeInstagram } from '../lib/instagram-state';
import { first, all, safeId } from '../lib/storage/driver';
const root=mkdtempSync(join(tmpdir(),'radar-night-tests-'));
process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(root,'singleton.sqlite');
process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');
const a='https://www.instagram.com/synthetic_a/', b='https://www.instagram.com/synthetic_b/', p='https://www.instagram.com/p/Synthetic01/';
function snapshot(url:string,bio:string|null=null):InstagramSnapshot {
 const username=new URL(url).pathname.split('/')[1];
 return {url,canonicalUrl:url,title:'',ogTitle:`Synthetic Creator (@${username}) • Instagram`,description:null,bodyText:'Public synthetic fixture',mainText:'Public synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:bio,postLinks:[p]};
}
async function setup(name:string,patch:Partial<NightRequest>={}) {
 const {SQLiteDatabase}=await import('../lib/storage/sqlite');const {CreatorStore}=await import('../lib/db');
 const {enqueue}=await import('../lib/job-input');
 const database=new SQLiteDatabase(join(root,name+'.sqlite'));const store=new CreatorStore(database);
 const request:NightRequest={content:a,limit:20,permission:'Own synthetic night fixtures',nightMaxPages:30,nightMaxPosts:3,nightMaxDepth:1,nightHours:8,...patch};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-night',...request},store);await store.claimJob();
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 return {database,store,request,id,clock:{now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}}};
}
test('post policy and ownership prevent audience comments becoming creator evidence',()=>{
 assert.equal(instagramPostUrl('https://www.instagram.com/synthetic_a/reel/Synthetic01/'),'https://www.instagram.com/reel/Synthetic01/');
 for(const url of ['https://evil.org/p/x/','https://www.instagram.com/accounts/','https://www.instagram.com/p/x/?token=y'])assert.throws(()=>instagramPostUrl(url));
 assert.equal(extractCreatorCaption({url:p,authorLinks:[b],caption:'#tech'},a),null);
 assert.equal(extractCreatorCaption({url:p,authorLinks:[b,a],caption:'#tech'},a),null);
 assert.equal(extractCreatorCaption({url:p,authorLinks:[a,b],caption:'#tech'},a),null);
 const result=extractCreatorCaption({url:p,authorLinks:[a],caption:'My room #homedecor #homedecor'},a);
 assert.deepEqual(result?.hashtags,['#homedecor']);
});
test('persistent discovery, targeted captions, atomic finalization and summary',async()=>{
 const s=await setup('complete');let profileCalls=0,postCalls=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:async(url)=>{profileCalls++;return{status:'loaded',snapshot:{...snapshot(url,url===b?'Tech gadgets':null),profileLinks:url===a?[b,b,a]:[]}};},post:async()=>{postCalls++;return{url:p,caption:'Home decor ideas #homedecor',hashtags:['#homedecor'],collected_at:new Date().toISOString()};}});
  assert.equal(profileCalls,2);assert.equal(postCalls,1);
  const state=await s.store.snapshot();assert.equal(state.creators.length,2);assert.equal(state.jobs[0].status,'completed');
  const reports=await new NightStore(s.store).reports();assert.equal(reports[0].matched,2);assert.equal(reports[0].page_requests,3);assert.equal(reports[0].stop_reason,'candidate_pool_exhausted');
  const candidates=await all(s.database,'SELECT * FROM research_candidates WHERE job_id=$1',[s.id]);
  const row=candidates.find(c=>c.url===a)!;
  const before=await first(s.database,'SELECT count(*) AS n FROM creator_metrics');
  const creator=state.creators.find(c=>c.username==='synthetic_a')!;
  await s.store.saveProfile(creator as never,{provider:'test',identifier:a,permission:'test'},{job:s.id,candidate:safeId(row.id)});
  assert.deepEqual(await first(s.database,'SELECT count(*) AS n FROM creator_metrics'),before);
  assert.equal((creator.classification_coverage as {post_captions:boolean}).post_captions,true);
 }finally{await s.database.close();}
});
test('a closed caption connection preserves the base profile and continues without retry',async()=>{
 const s=await setup('caption-network',{content:a+'\n'+b,nightMaxDepth:0});let posts=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:async url=>({status:'loaded',snapshot:snapshot(url,url===b?'Home decor':null)}),post:async()=>{posts++;throw new Error('page.goto: net::ERR_CONNECTION_CLOSED');}});
  assert.equal(posts,1);const state=await s.store.snapshot();assert.equal(state.creators.length,2);assert.equal(state.jobs[0].status,'completed');
  assert.equal((await new NightStore(s.store).reports())[0].matched,1);
 }finally{await s.database.close();}
});
test('shutdown during post resumes from saved profile, without duplicate metrics',async()=>{
 const s=await setup('post-recovery');const controller=new AbortController();let profiles=0;
 try{
  await researchNight(s.id,s.request,s.store,controller.signal,{...s.clock,profile:async()=>{profiles++;return{status:'loaded',snapshot:snapshot(a)};},post:async()=>{controller.abort(new WorkerInterrupted());throw controller.signal.reason;}});
  assert.equal((await s.store.snapshot()).jobs[0].status,'queued');
  assert.equal((await new NightStore(s.store).reports())[0].pending,1);
  await s.store.claimJob();
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:async()=>{profiles++;throw new Error('Profile must not be reread');},post:async()=>({url:p,caption:'Desk setup',hashtags:[],collected_at:new Date().toISOString()})});
  assert.equal(profiles,1);assert.equal((await s.store.snapshot()).jobs[0].status,'completed');
  assert.equal((await first(s.database,'SELECT count(*) AS n FROM creator_metrics'))?.n,1);
  assert.equal((await new NightStore(s.store).reports())[0].page_requests,3);
 }finally{await s.database.close();}
});
test('post login restriction saves base profile, pauses source and never retries automatically',async()=>{
 const s=await setup('blocked',{content:a+'\n'+b});let calls=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:async()=>({status:'loaded',snapshot:snapshot(a)}),post:async()=>{calls++;throw new InstagramStop('login','Synthetic login wall');}});
  assert.equal(calls,1);assert.equal(readResearchState().paused,true);
  assert.equal((await s.store.snapshot()).jobs[0].status,'paused');assert.equal((await s.store.snapshot()).creators.length,1);
  const report=(await new NightStore(s.store).reports())[0];assert.equal(report.uncertain,1);assert.equal(report.pending,1);
  assert.equal((report.posts as {status:string}[])[0].status,'blocked');
  resumeInstagram();await new NightStore(s.store).resume(s.id);await s.store.claimJob();
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:async(url)=>({status:'loaded',snapshot:snapshot(url,'Tech')}),post:async()=>{calls++;throw new Error('Blocked post must not be retried');}});
  assert.equal(calls,1);assert.equal((await s.store.snapshot()).creators.length,2);
 }finally{await s.database.close();}
});
test('total page budget is not reset on restart; cancellation preserves checkpoints',async()=>{
 const s=await setup('budget',{nightMaxPages:1});let posts=0;
 try{
  await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.clock,profile:async()=>({status:'loaded',snapshot:snapshot(a)}),post:async()=>{posts++;return null;}});
  assert.equal(posts,0);const report=(await new NightStore(s.store).reports())[0];assert.equal(report.page_requests,1);assert.equal(report.stop_reason,'page_limit');assert.equal(report.uncertain,1);
  await assert.rejects(new NightStore(s.store).resume(s.id),/Only paused/);
  const {enqueue}=await import('../lib/job-input');const id=await enqueue({kind:'instagram_night',source:'synthetic-cancel',...s.request},s.store);await s.store.cancel(id);
  await researchNight(id,s.request,s.store,new AbortController().signal,{...s.clock,profile:async()=>{throw new Error('Cancelled job must not navigate');}});
  assert.equal((await s.store.snapshot()).jobs[0].status,'cancelled');
 }finally{await s.database.close();}
});
test('hard-killed worker recovers a persisted candidate queue in another process',{timeout:30000},async()=>{
 const dir=mkdtempSync(join(root,'crash-'));
 const env={...process.env,RADAR_DB:join(dir,'crash.sqlite'),INSTAGRAM_STATE_FILE:join(dir,'state.json')};
 const child=async(mode:string)=>{
  const p=spawn(process.execPath,['--import','tsx','tests/fixtures/night-crash.ts',mode],{env,stdio:['ignore','pipe','pipe']});
  let output='';p.stdout.on('data',v=>output+=v);p.stderr.on('data',v=>output+=v);
  const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{p.once('error',reject);p.once('exit',(code,signal)=>resolve({code,signal}));});
  return{...result,output};
 };
 const killed=await child('crash');assert.equal(killed.signal,'SIGKILL',killed.output);
 const resumed=await child('resume');assert.equal(resumed.code,0,resumed.output);assert.match(resumed.output,/RECOVERED:2:2:1/);
});

test('a cancellation arriving at finalization is not overwritten by completion',async()=>{
 const s=await setup('cancel-finalize');
 try{
  const night=new NightStore(s.store);
  await night.initialize(s.id,{maxProfiles:20,maxPages:30,maxPosts:3,maxDepth:1,hours:8,permission:s.request.permission,seeds:[a]});
  await s.store.cancel(s.id);
  await night.stop(s.id,'completed','candidate_pool_exhausted');
  assert.equal((await s.store.snapshot()).jobs[0].status,'cancelled');
  assert.equal((await night.reports())[0].stop_reason,'cancelled_by_user');
  await s.store.finish(s.id,'completed');
  assert.equal((await s.store.snapshot()).jobs[0].status,'cancelled');
 }finally{await s.database.close();}
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const root=mkdtempSync(join(tmpdir(),'radar-recovery-'));process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.RADAR_STORAGE='sqlite';process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');
async function setup(name:string){const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db');const db=new SQLiteDatabase(join(root,name+'.sqlite')),store=new CreatorStore(db),job=await store.enqueue('fixture','{}');const state=await import('../lib/instagram-state');let clock=Date.now();state.writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});const {RequestRecovery,RequestSkipped}=await import('../lib/request-recovery'),{InstagramStop}=await import('../lib/instagram-extract');const controller=new AbortController(),waits:number[]=[],policy=new RequestRecovery(store,job,controller.signal,()=>clock,async ms=>{waits.push(ms);clock+=ms;});return{db,store,job,state,RequestSkipped,InstagramStop,controller,waits,policy,now:()=>clock};}
function detail(now:number,wait=0){return{status:429 as const,url:'https://www.instagram.com/p/SyntheticRetry/',page_url:'https://www.instagram.com/p/SyntheticRetry/',method:'GET',resource_type:'document',main_document:true,observed_at:new Date(now).toISOString(),retry_after_at:wait?new Date(now+wait).toISOString():null,retry_after_seconds:wait?wait/1000:null};}
test('first request gets three total attempts; next two same-error requests skip then open the circuit',async()=>{
 const s=await setup('streak');let calls=0,reserved=0;const fail=async()=>{calls++;throw new s.InstagramStop('rate-limit','HTTP 429',detail(s.now()));};try{
 await assert.rejects(s.policy.run('one',fail,async()=>{reserved++;},async()=>{}),s.RequestSkipped);assert.equal(calls,3);assert.equal(reserved,2);assert.equal(s.state.readResearchState(s.now()).requestFailures?.failed,1);
 await s.policy.beforeNext(async()=>{});await assert.rejects(s.policy.run('two',fail,async()=>{reserved++;},async()=>{}),s.RequestSkipped);assert.equal(calls,4);
 await s.policy.beforeNext(async()=>{});await assert.rejects(s.policy.run('three',fail,async()=>{reserved++;},async()=>{}),/three consecutive requests/);assert.equal(calls,5);assert.equal(s.state.readResearchState(s.now()).requestFailures?.failed,3);assert.ok(s.waits.every(ms=>ms>=120000));
 }finally{await s.db.close();}
});
test('server wait dominates two minutes and successful response resets the streak',async()=>{
 const s=await setup('success');let calls=0;try{const result=await s.policy.run('one',async()=>{if(++calls===1)throw new s.InstagramStop('rate-limit','HTTP 429',detail(s.now(),300000));return'loaded';},async()=>{},async()=>{});assert.equal(result,'loaded');assert.deepEqual(s.waits,[300000]);assert.equal(s.state.readResearchState(s.now()).requestFailures,undefined);}finally{await s.db.close();}
});
test('CAPTCHA/login and unmeasured gates are immediate; retry reservations and cancellation can stop further requests',async()=>{
 const s=await setup('limits');let calls=0;try{
 await assert.rejects(s.policy.run('one',async()=>{throw new s.InstagramStop('challenge','CAPTCHA');},async()=>{},async()=>{}),/CAPTCHA/);assert.equal(s.waits.length,0);
 await assert.rejects(s.policy.run('one',async()=>{calls++;throw new s.InstagramStop('rate-limit','HTTP 429',detail(s.now()));},async()=>{throw Error('page_limit');},async()=>{}),/page_limit/);assert.equal(calls,1);
 s.controller.abort();await assert.rejects(s.policy.run('two',async()=>{throw new s.InstagramStop('rate-limit','HTTP 429',detail(s.now()));},async()=>{},async()=>{s.controller.signal.throwIfAborted();}),/abort/i);
 }finally{await s.db.close();}
});
test('full discovery pauses only after three same-error requests and accounts for every retry visit',async()=>{
 const s=await setup('pipeline');const {enqueue}=await import('../lib/job-input'),{researchNight}=await import('../lib/night-research'),{NightStore}=await import('../lib/night-store');try{
 await s.store.finish(s.job,'completed');const request={content:'',limit:20,permission:'Own synthetic retry fixtures',efficientResearch:true,discoveryEnabled:true,discoveryKeywords:['retryfirst','retrysecond','retrythird'],discoveryProviders:['instagram_tags' as const],discoveryMaxQueries:3,discoveryResultsPerQuery:10,nightMaxPages:30,nightMaxPosts:0,nightMaxDepth:0,nightHours:8};const job=await enqueue({kind:'instagram_night',source:'synthetic-retry',...request},s.store);await s.store.claimJob();let clock=s.now(),calls=0;
 await researchNight(job,request,s.store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async()=>{calls++;throw new s.InstagramStop('rate-limit','HTTP 429',detail(clock));}}});const report=(await new NightStore(s.store).reports()).find(r=>r.job_id===job)!;assert.equal(calls,5);assert.equal(report.page_requests,5);assert.equal(report.status,'paused');assert.match(String(report.stop_reason),/three consecutive requests/);
 }finally{await s.db.close();}
});
test('retry attempt count survives a checkpoint interruption',async()=>{
 const s=await setup('checkpoint');let calls=0;const fail=async()=>{calls++;throw new s.InstagramStop('rate-limit','HTTP 429',detail(s.now()));};try{
 await assert.rejects(s.policy.run('same-url',fail,async()=>{throw Error('worker_interrupted');},async()=>{}),/worker_interrupted/);assert.equal(calls,1);
 await assert.rejects(s.policy.run('same-url',fail,async()=>{},async()=>{}),s.RequestSkipped);assert.equal(calls,3);
 assert.equal(s.state.readResearchState(s.now()).requestFailures?.attempts,3);
 }finally{await s.db.close();}
});
test('alternating HTTP errors cannot extend a request beyond three attempts',async()=>{
 const s=await setup('alternating');let calls=0;try{await assert.rejects(s.policy.run('same-url',async()=>{const d={...detail(s.now()),status:++calls%2?429 as const:403 as const};throw new s.InstagramStop(d.status===429?'rate-limit':'access-denied','HTTP '+d.status,d);},async()=>{},async()=>{}),s.RequestSkipped);assert.equal(calls,3);}finally{await s.db.close();}
});
test('panel distinguishes server wait from a latched circuit and immediate gates clear pending automatic retries',async()=>{
 const s=await setup('access');const {RequestRecovery}=await import('../lib/request-recovery'),{accessSummary}=await import('../lib/research-operations');let clock=s.now(),calls=0;
 try{const p=new RequestRecovery(s.store,s.job,s.controller.signal,()=>clock,async ms=>{const a=await accessSummary(s.store,s.state.readResearchState(clock),null,clock);assert.equal(a.research_status,'waiting');assert.equal(a.automatic_retry,true);clock+=ms;});await p.run('source',async()=>{if(++calls===1)throw new s.InstagramStop('rate-limit','HTTP 429',detail(clock,300000));return'loaded';},async()=>{},async()=>{});
 s.state.writeResearchState({...s.state.readResearchState(clock),requestFailures:{code:'HTTP 429',failed:0},requestRetryAt:new Date(clock+120000).toISOString()});s.state.pauseInstagram('INSTAGRAM_STOP:challenge: Manual attention required');assert.equal(s.state.readResearchState(clock).requestFailures,undefined);
 }finally{await s.db.close();}
});

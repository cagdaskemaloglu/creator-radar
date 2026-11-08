import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const root=mkdtempSync(join(tmpdir(),'radar-continuous-'));process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');
async function setup(name:string){const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db');const db=new SQLiteDatabase(join(root,name+'.sqlite'));const store=new CreatorStore(db);const {writeResearchState}=await import('../lib/instagram-state');writeResearchState({day:new Date().toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});return{db,store};}
test('continuous cycles preserve explicit scope, survive reads, avoid overlap and stop owned work',async()=>{
 const s=await setup('cycles');const scan=await import('../lib/continuous-scan');let calls=0;const now=Date.now();
 try{await scan.startScan({topics:['Gaming'],country:'TR',pages:25},s.store);
 const fake=async(input:unknown)=>{calls++;assert.deepEqual((input as {topics:string[]}).topics,['Gaming']);assert.equal((input as {country:string}).country,'TR');return{id:await s.store.enqueue('instagram_night','{}'),reused:false,continued:false};};
 await Promise.all([scan.tickScan(s.store,now,fake),scan.tickScan(s.store,now,fake)]);assert.equal(calls,1);let state=await scan.scanStatus(s.store);assert.equal(state.enabled,true);assert.equal(state.cycle,1);const first=state.job_id!;
 await scan.tickScan(s.store,now+61000,fake);assert.equal(calls,1);await s.store.finish(first,'completed');await scan.tickScan(s.store,now+72000,fake);assert.equal(calls,2);state=await scan.scanStatus(s.store);assert.equal(state.cycle,2);
 await scan.stopScan(s.store);assert.equal(await s.store.isCancelled(state.job_id!),true);await scan.tickScan(s.store,now+500000,fake);assert.equal(calls,2);assert.equal((await scan.scanStatus(s.store)).enabled,false);
 }finally{await s.db.close();}
});
test('automatic selections rotate without changing manually selected dimensions',async()=>{
 const {scanSelection}=await import('../lib/continuous-scan');const c={topics:[],country:'',city:'',pages:50};assert.notDeepEqual(scanSelection(c,0).topics,scanSelection(c,1).topics);assert.notEqual(scanSelection({...c,topics:['Gaming']},0).country,scanSelection({...c,topics:['Gaming']},1).country);assert.equal(scanSelection({...c,country:'TR'},9).country,'TR');
});
test('source restrictions and paused jobs block further requests; stop wins during enqueue',async()=>{
 const s=await setup('blocked');const scan=await import('../lib/continuous-scan'),{pauseInstagram,resumeInstagram}=await import('../lib/instagram-state');const now=Date.now();let calls=0;
 try{await scan.startScan({topics:['Gaming'],country:'TR'},s.store);pauseInstagram('Synthetic restriction');await scan.tickScan(s.store,now,async()=>{calls++;throw Error('Must not request');});assert.equal(calls,0);assert.equal((await scan.scanStatus(s.store)).status,'blocked');resumeInstagram();
 let created=0;await scan.tickScan(s.store,now+31000,async()=>{created=await s.store.enqueue('instagram_night','{}');await scan.stopScan(s.store);return{id:created,reused:false,continued:false};});assert.equal(await s.store.isCancelled(created),true);assert.equal((await scan.scanStatus(s.store)).enabled,false);
 }finally{await s.db.close();}
});
test('configuration persists across connection restart and paused owned jobs never auto-resume',async()=>{
 const s=await setup('restart');const scan=await import('../lib/continuous-scan');await scan.startScan({topics:['Gaming'],country:'TR'},s.store);await s.db.close();
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db');const db=new SQLiteDatabase(join(root,'restart.sqlite')),store=new CreatorStore(db);try{assert.equal((await scan.scanStatus(store)).enabled,true);const now=Date.now();await scan.tickScan(store,now,async()=>({id:await store.enqueue('instagram_night','{}'),reused:false,continued:false}));const id=(await scan.scanStatus(store)).job_id!;await db.query("UPDATE ingestion_jobs SET status='paused',error='Synthetic gate' WHERE id=$1",[id]);let calls=0;await scan.tickScan(store,now+61000,async()=>{calls++;throw Error('No automatic resume');});assert.equal(calls,0);assert.equal((await scan.scanStatus(store)).status,'blocked');await scan.stopScan(store);}finally{await db.close();}
});
test('restart or stop recovers ownership if a process dies just after creating a round',async()=>{
 const s=await setup('enqueue-gap');const scan=await import('../lib/continuous-scan');try{
 await scan.startScan({topics:['Gaming']},s.store);let generation=Number((await s.db.query('SELECT generation FROM continuous_scan')).rows[0].generation);const orphan=await s.store.enqueue('instagram_night',JSON.stringify({continuousGeneration:generation}));
 let calls=0;await scan.tickScan(s.store,Date.now(),async()=>{calls++;throw Error('Must recover existing round');});assert.equal(calls,0);assert.equal((await scan.scanStatus(s.store)).job_id,orphan);await scan.stopScan(s.store);assert.equal(await s.store.isCancelled(orphan),true);
 await scan.startScan({topics:['Gaming']},s.store);generation=Number((await s.db.query('SELECT generation FROM continuous_scan')).rows[0].generation);const second=await s.store.enqueue('instagram_night',JSON.stringify({continuousGeneration:generation}));await scan.stopScan(s.store);assert.equal(await s.store.isCancelled(second),true);
 }finally{await s.db.close();}
});

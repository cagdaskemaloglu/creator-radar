import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root=mkdtempSync(join(tmpdir(),'radar-autonomous-'));
process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.RADAR_STORAGE='sqlite';process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');process.env.INSTAGRAM_BROWSER_ENABLED='true';process.env.INSTAGRAM_DAILY_PAGES='180';
async function setup(name:string){
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{writeResearchState}=await import('../lib/instagram-state');
 writeResearchState({day:new Date().toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 const db=new SQLiteDatabase(join(root,name+'.sqlite'));return{db,store:new CreatorStore(db)};
}
test('one click generates its own hashtag plan and concurrent clicks create one job',async()=>{
 const s=await setup('unique');const {startAutonomousResearch,autonomousPlan}=await import('../lib/autonomous-research');
 try{
  assert.ok(autonomousPlan({}).keywords.includes('cozyroom'));assert.throws(()=>autonomousPlan({topics:['invalid']}));
  const allAreas=autonomousPlan({topics:['Cozy Room','Interior Design','Desk Setup','Tech / Gadgets','Productivity']});assert.ok(allAreas.keywords.includes('productivity setup'));assert.ok(allAreas.keywords.includes('tech gadgets'));
  const result=await Promise.all([startAutonomousResearch({},s.store),startAutonomousResearch({},s.store)]);
  assert.equal(result[0].id,result[1].id);const rows=(await s.db.query('SELECT * FROM ingestion_jobs')).rows;assert.equal(rows.length,1);
  const payload=JSON.parse(String(rows[0].payload));assert.equal(payload.efficientResearch,true);assert.equal(payload.limit,56);assert.equal(payload.content,'');assert.equal(payload.discoveryEnabled,true);assert.deepEqual(payload.discoveryProviders,['instagram_tags']);assert.equal(payload.discoveryKeywords.length,6);
 }finally{await s.db.close();}
});
test('one click inherits a matching unfinished pool without asking for profile URLs',async()=>{
 const s=await setup('pool');const {startAutonomousResearch}=await import('../lib/autonomous-research'),{NightStore}=await import('../lib/night-store'),{DiscoveryStore}=await import('../lib/discovery-store');
 try{
  const first=await startAutonomousResearch({},s.store);const payload=JSON.parse(String((await s.db.query('SELECT payload FROM ingestion_jobs WHERE id=$1',[first.id])).rows[0].payload));
  const night=new NightStore(s.store);await night.initialize(first.id,{maxProfiles:16,maxPages:56,maxPosts:1,maxDepth:0,hours:2,permission:payload.permission,seeds:[],discovery:{enabled:true,topics:[],keywords:payload.discoveryKeywords,providers:['instagram_tags'],maxQueries:6,resultsPerQuery:20}});
  const pool=new DiscoveryStore(s.store);await pool.initialize(first.id,[{provider:'instagram_tags',keyword:'cozyroom',url:'https://www.instagram.com/explore/tags/cozyroom/'}]);const query=(await pool.queries(first.id))[0];await pool.complete(first.id,Number(query.id),[{kind:'post',url:'https://www.instagram.com/p/SyntheticPool/',title:''}]);await s.store.finish(first.id,'completed');
  const next=await startAutonomousResearch({},s.store);assert.equal(next.continued,true);
  const body=JSON.parse(String((await s.db.query('SELECT payload FROM ingestion_jobs WHERE id=$1',[next.id])).rows[0].payload));assert.equal(body.poolSourceJob,first.id);assert.equal(body.content,'');
 }finally{await s.db.close();}
});
test('one-click controls respect daily limits and source pauses without clearing them',async()=>{
 const s=await setup('limits');const {startAutonomousResearch}=await import('../lib/autonomous-research'),{writeResearchState,readResearchState}=await import('../lib/instagram-state');
 try{
  const state=readResearchState();writeResearchState({...state,paused:true,reason:'INSTAGRAM_STOP:rate-limit'});await assert.rejects(startAutonomousResearch({},s.store),/duraklatılmış/);assert.equal(readResearchState().paused,true);
  writeResearchState({...state,visits:179});await assert.rejects(startAutonomousResearch({},s.store),/bütçesi/);
  writeResearchState({...state,visits:170});const job=await startAutonomousResearch({},s.store);const payload=JSON.parse(String((await s.db.query('SELECT payload FROM ingestion_jobs WHERE id=$1',[job.id])).rows[0].payload));assert.equal(payload.nightMaxPages,10);
 }finally{await s.db.close();}
});
test('one-click research starts after the old daily quota when daily limit is disabled',async()=>{
 const s=await setup('unlimited');const previous=process.env.INSTAGRAM_DAILY_PAGES;
 try{process.env.INSTAGRAM_DAILY_PAGES='0';const {writeResearchState,readResearchState}=await import('../lib/instagram-state'),{startAutonomousResearch}=await import('../lib/autonomous-research');writeResearchState({...readResearchState(),visits:9999});
 const result=await startAutonomousResearch({pages:50},s.store);const row=(await s.db.query('SELECT payload FROM ingestion_jobs WHERE id=$1',[result.id])).rows[0];assert.equal(JSON.parse(String(row.payload)).nightMaxPages,50);assert.equal(readResearchState().visits,9999);
 }finally{process.env.INSTAGRAM_DAILY_PAGES=previous;await s.db.close();}
});

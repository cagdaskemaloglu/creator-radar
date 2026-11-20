import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const root=mkdtempSync(join(tmpdir(),'radar-cooldown-'));process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.RADAR_STORAGE='sqlite';
import {readResearchState} from '../lib/instagram-state-read';
import {writeResearchState,pauseInstagram,restrictionCooldown,assertAccessWindow,resumeInstagram,overrideCooldown} from '../lib/instagram-state';
const H=3600000;
const detail=(status:429|403=429)=>({status,url:'https://www.instagram.com/p/CooldownFixture/',page_url:'https://www.instagram.com/p/CooldownFixture/',method:'GET',resource_type:'document',main_document:true,observed_at:new Date().toISOString(),retry_after_at:null,retry_after_seconds:null});
const base=()=>({day:new Date().toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null as string|null,pausedAt:null as string|null});
test('429 cooldown escalates 24h, 48h, 72h inside a 72 hour window and counts a duplicate report once',()=>{
 const t0=Date.UTC(2026,10,19,12,0,0);let state:any=base();
 const apply=(now:number,reason='INSTAGRAM_STOP:rate-limit: HTTP 429; no retry attempted',d:ReturnType<typeof detail>|undefined=detail())=>{state={...state,...restrictionCooldown(state,reason,d,now)};return state;};
 apply(t0);assert.equal(Date.parse(state.cooldownUntil),t0+24*H);assert.equal(state.restrictionEvents.length,1);
 apply(t0+30000);assert.equal(state.restrictionEvents.length,1);assert.equal(Date.parse(state.cooldownUntil),t0+24*H);
 apply(t0+25*H);assert.equal(state.restrictionEvents.length,2);assert.equal(Date.parse(state.cooldownUntil),t0+25*H+48*H);
 apply(t0+50*H);assert.equal(state.restrictionEvents.length,3);assert.equal(Date.parse(state.cooldownUntil),t0+50*H+72*H);
 apply(t0+130*H);assert.equal(state.restrictionEvents.length,1);assert.equal(Date.parse(state.cooldownUntil),t0+154*H);
 assert.deepEqual(restrictionCooldown(base() as any,'INSTAGRAM_STOP:access-denied: HTTP 403',detail(403),t0),{});
 assert.ok(restrictionCooldown(base() as any,'INSTAGRAM_STOP:rate-limit: HTTP 429; three consecutive requests failed',undefined,t0).cooldownUntil);
});
test('cooldown blocks resume and session checks; override clears only our cooldown and never a server wait',()=>{
 writeResearchState(base());pauseInstagram('INSTAGRAM_STOP:rate-limit: HTTP 429; no retry attempted',detail());
 let st=readResearchState();assert.equal(st.paused,true);assert.ok(Date.parse(st.cooldownUntil!)-Date.now()>23.9*H);
 assert.throws(()=>assertAccessWindow(),/zorunlu soğuma/);assert.throws(()=>resumeInstagram(),/zorunlu soğuma/);
 overrideCooldown();st=readResearchState();assert.equal(st.cooldownUntil,null);assert.equal(st.cooldownOverrides?.length,1);assert.equal(st.restrictionEvents?.length,1);assert.equal(st.paused,true);
 assert.doesNotThrow(()=>assertAccessWindow());resumeInstagram();assert.equal(readResearchState().paused,false);
 assert.throws(()=>overrideCooldown(),/Etkin bir zorunlu soğuma yok/);
 writeResearchState({...base(),paused:true,reason:'INSTAGRAM_STOP:rate-limit: HTTP 429',pausedAt:new Date().toISOString(),cooldownUntil:new Date(Date.now()+5*H).toISOString(),retryNotBefore:new Date(Date.now()+H).toISOString()});
 assert.throws(()=>overrideCooldown(),/Sunucunun bildirdiği/);assert.throws(()=>assertAccessWindow(),/Sunucunun bildirdiği/);assert.ok(readResearchState().cooldownUntil);
 writeResearchState({...base(),cooldownUntil:new Date(Date.now()-1000).toISOString()});assert.equal(readResearchState().paused,false);assert.doesNotThrow(()=>assertAccessWindow());
});
test('access summary reports the cooldown, blocks resume requests and exposes the remaining time',async()=>{
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{accessSummary}=await import('../lib/research-operations');
 const db=new SQLiteDatabase(join(root,'access.sqlite')),store=new CreatorStore(db);
 try{
  writeResearchState({...base(),paused:true,reason:'INSTAGRAM_STOP:rate-limit: HTTP 429',pausedAt:new Date().toISOString(),cooldownUntil:new Date(Date.now()+5*H).toISOString(),restrictionEvents:[new Date().toISOString()]});
  const a=await accessSummary(store,readResearchState(),null);
  assert.equal(a.research_status,'cooling_down');assert.equal(a.required_action,'cooldown');assert.equal(a.can_request_resume,false);assert.ok(a.cooldown_seconds_remaining>17000&&a.cooldown_seconds_remaining<=18000);assert.equal(a.restriction_events_72h,1);assert.equal(a.cooldown_overrides,0);
 }finally{await db.close();}
});

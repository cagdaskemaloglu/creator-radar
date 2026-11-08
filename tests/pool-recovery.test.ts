import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {DiscoveryStore} from '../lib/discovery-store';
import {expandDiscoveryPool,relatedDiscoveryKeywords} from '../lib/discovery-expansion';
import {readResearchState,writeResearchState,pauseInstagram} from '../lib/instagram-state';
import {isolatedProfileLayoutReason} from '../lib/profile-read-policy';
import {isolateLegacyProfileFailure} from '../lib/profile-recovery';
import {safeId} from '../lib/storage/driver';
const root=mkdtempSync(join(tmpdir(),'radar-pool-recovery-'));process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.RADAR_STORAGE='sqlite';process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');process.env.INSTAGRAM_DAILY_PAGES='0';
const url=(n:number)=>`https://www.instagram.com/recovery_${n}/`;
function snapshot(u:string,bad=false){return{url:u,canonicalUrl:u,title:'',ogTitle:bad?'Instagram':`Synthetic Creator (@${new URL(u).pathname.split('/')[1]})`,description:null,bodyText:'Synthetic public fixture',mainText:'Synthetic public fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor'};}
async function setup(name:string,patch:Partial<NightRequest>={}){
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{enqueue}=await import('../lib/job-input');const db=new SQLiteDatabase(join(root,name+'.sqlite')),store=new CreatorStore(db);
 const request:NightRequest={efficientResearch:true,content:'',limit:10,nightMaxPages:50,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic pool recovery fixture',discoveryEnabled:true,discoveryKeywords:['cozyroom'],discoveryProviders:['instagram_tags'],discoveryMaxQueries:1,discoveryResultsPerQuery:20,...patch};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-pool-recovery',...request},store);await store.claimJob();let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:7,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 return{db,store,id,request,time:{now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}}};
}
test('one unreadable profile is skipped and the next valid profile is saved without pausing the source',async()=>{
 const s=await setup('one-bad',{content:url(0)+'\n'+url(1),discoveryEnabled:false});
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,profile:async u=>({status:'loaded',snapshot:snapshot(u,u===url(0))})});const r=(await new NightStore(s.store).reports())[0];assert.equal(r.status,'completed');assert.equal(r.inserted,1);assert.equal(r.skipped,1);assert.equal(r.page_requests,2);assert.equal(readResearchState().paused,false);
 }finally{await s.db.close();}
});
test('three consecutive unreadable profiles pause the job and preserve the remaining queue',async()=>{
 const s=await setup('three-bad',{content:[0,1,2,3].map(url).join('\n'),discoveryEnabled:false});let reads=0;
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,profile:async u=>{reads++;return{status:'loaded',snapshot:snapshot(u,true)};}});const r=(await new NightStore(s.store).reports())[0];assert.equal(r.status,'paused');assert.equal(r.stop_reason,'consecutive_profile_layout_errors');assert.equal(r.skipped,3);assert.equal(r.pending,1);assert.equal(reads,3);assert.equal(readResearchState().paused,false);
 }finally{await s.db.close();}
});
test('identity mismatches and CAPTCHA remain source-wide stops rather than skippable profile errors',async()=>{
 for(const mode of ['identity','captcha']){const s=await setup('gate-'+mode,{content:url(0)+'\n'+url(1),discoveryEnabled:false});let reads=0;
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,profile:async u=>{reads++;return{status:'loaded',snapshot:{...snapshot(u),...(mode==='identity'?{canonicalUrl:url(9)}:{hasCaptcha:true})}};}});assert.equal(reads,1);assert.equal((await s.store.snapshot()).jobs[0].status,'paused');assert.equal(readResearchState().paused,true);assert.equal(await isolateLegacyProfileFailure(s.id,s.store),false);assert.equal(readResearchState().paused,true);
 }finally{await s.db.close();}}
});
test('exhausted base pool expands to related tags and saves new accounts without resetting page counts',async()=>{
 const s=await setup('expand',{limit:1});const searched:string[]=[];
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async q=>{searched.push(q.keyword);return{sourceUrl:q.url,links:q.keyword==='cozyroom'?[{kind:'post',url:'https://www.instagram.com/p/Unattributed/',title:''}]:[{kind:'profile',url:url(5),title:''}]};},author:async()=>null},profile:async u=>({status:'loaded',snapshot:snapshot(u)})});const r=(await new NightStore(s.store).reports())[0];assert.equal(r.inserted,1);assert.equal(r.page_requests,4);assert.deepEqual(searched,['cozyroom','cozyhome']);assert.equal((await new DiscoveryStore(s.store).queries(s.id)).length,3);assert.equal(readResearchState(s.time.now()).visits,11);
 }finally{await s.db.close();}
});
test('expansion is persisted, never repeats tags, and continues past six extra tags until related terms are exhausted',async()=>{
 const s=await setup('expansion-cap');const searched:string[]=[];
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async q=>{searched.push(q.keyword);return{sourceUrl:q.url,links:[]};}},profile:async()=>{throw new Error('No profiles expected');}});const r=(await new NightStore(s.store).reports())[0];assert.equal(r.status,'completed');assert.equal(r.stop_reason,'no_new_links');assert.equal(r.page_requests,9);assert.equal(searched.length,9);assert.equal(new Set(searched).size,9);
 const before=r.started_at;await new NightStore(s.store).restore(s.id);const expansion=await expandDiscoveryPool(s.id,(r.settings as {discovery:import('../lib/discovery-plan').DiscoverySettings}).discovery,s.store,40);assert.equal(expansion.added,0);assert.equal(expansion.reason,'terms');assert.equal((await new NightStore(s.store).run(s.id)).started_at,before);
 }finally{await s.db.close();}
});
test('expansion does not spend the final two pages or invent country/gaming keywords',async()=>{
 const s=await setup('small-budget',{nightMaxPages:2});let searches=0;
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async q=>{searches++;return{sourceUrl:q.url,links:[]};}}});const r=(await new NightStore(s.store).reports())[0];assert.equal(searches,1);assert.equal(r.stop_reason,'insufficient_page_budget');assert.equal(r.page_requests,1);assert.ok(!relatedDiscoveryKeywords(['cozyroom']).some(k=>/gaming|türkiye/.test(k)));
 }finally{await s.db.close();}
});
async function oldPause(s:Awaited<ReturnType<typeof setup>>){
 const night=new NightStore(s.store);await night.initialize(s.id,{efficientResearch:true,maxProfiles:10,maxPages:50,maxPosts:0,maxDepth:0,hours:8,permission:s.request.permission,seeds:[url(0)]});const c=await night.next(s.id);await night.reserve(s.id,safeId(c?.id));await s.store.log(s.id,'Night profile: '+url(0));await night.stop(s.id,'paused',isolatedProfileLayoutReason);pauseInstagram(isolatedProfileLayoutReason);return night;
}
test('explicit legacy resume isolates the failed candidate and preserves elapsed time and counters',async()=>{
 const s=await setup('legacy');
 try{const night=await oldPause(s),before=await night.run(s.id),visits=readResearchState().visits;assert.equal(await isolateLegacyProfileFailure(s.id,s.store),true);assert.equal(readResearchState().paused,false);assert.equal(readResearchState().visits,visits);await night.resume(s.id);const after=await night.run(s.id);assert.equal(after.page_requests,before.page_requests);assert.equal(after.started_at,before.started_at);assert.equal((await night.reports())[0].skipped,1);
 }finally{await s.db.close();}
});
test('legacy recovery cannot clear a newer HTTP restriction',async()=>{
 const s=await setup('legacy-blocked');
 try{await oldPause(s);pauseInstagram('INSTAGRAM_STOP:access-denied: HTTP 403');assert.equal(await isolateLegacyProfileFailure(s.id,s.store),false);assert.equal(readResearchState().paused,true);assert.match(readResearchState().reason??'',/403/);assert.equal((await new NightStore(s.store).reports())[0].pending,1);
 }finally{await s.db.close();}
});

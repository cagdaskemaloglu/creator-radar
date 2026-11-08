import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {DiscoveryStore} from '../lib/discovery-store';
import {readResearchState,writeResearchState} from '../lib/instagram-state';
const root=mkdtempSync(join(tmpdir(),'radar-scroll-budget-'));process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');process.env.INSTAGRAM_DAILY_PAGES='0';
const post=(n:number)=>`https://www.instagram.com/p/ScrollFixture_${n}/`,url=(n:number)=>`https://www.instagram.com/scroll_fixture_${n}/`;
function snapshot(u:string){return{url:u,canonicalUrl:u,title:'',ogTitle:`Synthetic Creator (@${new URL(u).pathname.split('/')[1]})`,description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor'};}
async function setup(name:string,pages=20){const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{enqueue}=await import('../lib/job-input');const db=new SQLiteDatabase(join(root,name+'.sqlite')),store=new CreatorStore(db);const request:NightRequest={efficientResearch:true,content:'',limit:20,permission:'Own synthetic scroll fixture',nightMaxPages:pages,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,discoveryEnabled:true,discoveryKeywords:['scrollfixture'],discoveryProviders:['instagram_tags'],discoveryMaxQueries:1,discoveryResultsPerQuery:20};const id=await enqueue({kind:'instagram_night',source:'synthetic-scroll',...request},store);await store.claimJob();let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});return{db,store,request,id,time:{now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}}};}
test('each extra tag load is budgeted and metered without consuming query retry attempts',async()=>{
 const s=await setup('meter');
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async(q,n,signal,collection)=>{assert.ok(collection);await collection.onBatch?.([post(0),post(1),post(2)]);assert.equal(await collection.beforeScroll(),true);await collection.onBatch?.([post(2),post(3)]);return{sourceUrl:q.url,links:[0,1,2,3].map(i=>({kind:'post',url:post(i),title:''})),collection:{reason:'no_new_links',scrolls:1,newLinks:4}};},author:async p=>url(Number(p.match(/_(\d+)/)![1]))},profile:async u=>({status:'loaded',snapshot:snapshot(u)})});
 const r=(await new NightStore(s.store).reports())[0];assert.equal(r.page_requests,10);assert.equal(r.inserted,4);assert.equal(readResearchState(s.time.now()).visits,10);const pool=new DiscoveryStore(s.store),q=(await pool.queries(s.id))[0];assert.equal(q.attempts,1);assert.equal(q.result_count,4);assert.equal((await pool.keywordPerformance())[0].searches,2);assert.equal((await pool.keywordPerformance())[0].pages,10);
 }finally{await s.db.close();}
});
test('scrolling stops before consuming the pages reserved for resolving and saving a profile',async()=>{
 const s=await setup('reserve',4);let allowed=0;
 try{await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async(q,n,signal,c)=>{assert.ok(c);await c.onBatch?.([post(0)]);assert.equal(await c.beforeScroll(),true);allowed++;assert.equal(await c.beforeScroll(),false);return{sourceUrl:q.url,links:[{kind:'post',url:post(0),title:''}]};},author:async()=>url(0)},profile:async u=>({status:'loaded',snapshot:snapshot(u)})});const r=(await new NightStore(s.store).reports())[0];assert.equal(allowed,1);assert.equal(r.page_requests,4);assert.equal(r.inserted,1);
 }finally{await s.db.close();}
});
test('partial tag links survive a failed load and explicit resume without duplicate records',async()=>{
 const s=await setup('checkpoint');let searches=0;
 try{const deps={...s.time,discovery:{search:async(q:{url:string},n:number,signal:AbortSignal,c?:import('../lib/tag-collection').TagCollectionOptions)=>{searches++;assert.ok(c);if(searches===1){await c.onBatch?.([post(0)]);throw new Error('net::ERR_CONNECTION_CLOSED');}return{sourceUrl:q.url,links:[]};},author:async()=>url(0)},profile:async(u:string)=>({status:'loaded' as const,snapshot:snapshot(u)})};
 await researchNight(s.id,s.request,s.store,new AbortController().signal,deps);const night=new NightStore(s.store),before=await night.run(s.id);assert.equal((await night.reports())[0].status,'paused');assert.equal((await new DiscoveryStore(s.store).pendingPosts(s.id)).length,1);
 await night.resume(s.id);await s.store.claimJob();await researchNight(s.id,s.request,s.store,new AbortController().signal,deps);const r=(await night.reports())[0];assert.equal(r.inserted,1);assert.equal(r.page_requests,4);assert.equal(r.started_at,before.started_at);assert.equal((await s.store.snapshot()).creators[0].sources.length,1);
 }finally{await s.db.close();}
});

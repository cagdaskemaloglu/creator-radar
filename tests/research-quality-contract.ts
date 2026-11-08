import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {classify,profileSchema} from '../lib/model';
import {NightStore} from '../lib/night-store';
import {DiscoveryStore} from '../lib/discovery-store';
import {DiscoveryFrontier,discoveryScope} from '../lib/discovery-frontier';
import {runDiscovery} from '../lib/discovery-run';
import {writeResearchState} from '../lib/instagram-state';
export async function qualityContract(store:CreatorStore){
 const bios=['Based in Istanbul, Turkey. Valorant Twitch gamer','Canlı oyun yayınları ve Valorant videoları kanalıma abone olun','Valorant Twitch gamer content creator','Based in Istanbul, Turkey. Makeup skincare beauty'];
 const settings={maxProfiles:4,maxPages:20,maxPosts:0,maxDepth:0,hours:8,permission:'Own synthetic quality fixtures',seeds:[],target:{country:'TR'},discovery:{enabled:true,topics:['Gaming'],keywords:['gaming'],providers:['instagram_tags' as const],maxQueries:1,resultsPerQuery:20}};
 const job=await store.enqueue('instagram_night','{}'),night=new NightStore(store);await night.initialize(job,settings);
 for(let i=0;i<bios.length;i++){const url=`https://www.instagram.com/quality_record_${i}/`;await night.discover(job,[url],0);const c=await night.next(job);assert.ok(c);await night.reserve(job,Number(c.id));await store.saveProfile(profileSchema.parse({username:`quality_record_${i}`,biography:bios[i],research_topics:['Gaming'],research_target:{country:'TR'}}),{provider:'fixture',identifier:'local-quality-contract',permission:settings.permission},{job,candidate:Number(c.id)});}
 await night.stop(job,'completed','profile_limit');const r=(await night.reports()).find(r=>r.job_id===job)!;
 assert.equal(r.matched,1);assert.equal(r.estimated,1);assert.equal(r.target_unknown,1);assert.equal(r.target_different,1);assert.equal(r.categorized,4);assert.equal(r.uncertain,0);assert.equal((r.metrics as {qualified_new:number}).qualified_new,1);assert.equal((r.metrics as {estimated_new:number}).estimated_new,1);assert.equal((r.metrics as {match_rate:number}).match_rate,25);
 // A later profile update must not rewrite a previous run's saved evidence.
 await store.saveProfile(profileSchema.parse({username:'quality_record_0',biography:'Based in Berlin. Makeup beauty'}),{provider:'fixture',identifier:'local-updated-fixture',permission:settings.permission});assert.equal((await night.reports()).find(r=>r.job_id===job)?.matched,1);
 const first=(await store.snapshot()).creators[0];await store.review(Number(first.id),'reviewed');const before=await store.snapshot();await store.refreshClassifications();const after=await store.snapshot();for(const c of before.creators){const n=after.creators.find(n=>n.id===c.id)!;assert.equal(n.updated_at,c.updated_at);assert.equal(n.validation_status,c.validation_status);assert.deepEqual(n.sources,c.sources);}
 const scope=discoveryScope(['Gaming'],{country:'TR'}),frontier=new DiscoveryFrontier(store);await frontier.seed(scope,[...Array.from({length:20},(_,i)=>({keyword:`curated${i}`,priority:2,origin:'curated' as const,evidence:[]})),{keyword:'observedfixture',priority:1,origin:'observed',evidence:[]}]);
 const selected=await frontier.pick(scope,10);assert.equal(selected[4].keyword,'observedfixture');assert.ok(selected.filter(q=>q.origin==='observed').length<=2);assert.ok(!(await frontier.pick(scope,2)).some(q=>q.origin==='observed'));
 // A carried pending query cannot stay ahead of the current run's exploration slot.
 const scheduled=await store.enqueue('instagram_night','{}');await night.initialize(scheduled,{...settings,seeds:[]});const pool=new DiscoveryStore(store);await pool.initialize(scheduled,[{provider:'instagram_tags',keyword:'oldpending',url:'https://www.instagram.com/explore/tags/oldpending/'}]);let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});const searched:string[]=[];
 await runDiscovery(scheduled,{...settings.discovery,keywords:['observedfixture'],scopeKey:scope},store,new AbortController().signal,{maxPages:20,maxProfiles:4,deadline:clock+3600000,batchSize:1},{now:()=>clock,sleep:async ms=>{clock+=ms;},search:async q=>{searched.push(q.keyword);return{sourceUrl:q.url,links:[]};}});assert.deepEqual(searched,['observedfixture']);assert.equal((await pool.queries(scheduled)).find(q=>q.keyword==='oldpending')?.status,'pending');await store.finish(scheduled,'cancelled');await frontier.learn(scope,['Gaming'],{country:'TR'});assert.ok((await frontier.summary(scope)).withheld_learned>=1);assert.ok(!(await frontier.pick(scope,10)).some(q=>q.keyword==='observedfixture'));
}

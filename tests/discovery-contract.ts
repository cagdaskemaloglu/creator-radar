import assert from 'node:assert/strict';
import type { CreatorStore } from '../lib/db';
import { enqueue } from '../lib/job-input';
import { researchNight,type NightRequest } from '../lib/night-research';
import { NightStore } from '../lib/night-store';
import { writeResearchState } from '../lib/instagram-state';
import { writeGoogleState } from '../lib/google-state';
import { DiscoveryStore } from '../lib/discovery-store';
import { safeId } from '../lib/storage/driver';
export async function discoveryContract(store:CreatorStore){
 let clock=Date.now();const state={day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null};writeGoogleState(state);writeResearchState(state);
 const url='https://www.instagram.com/synthetic_search_contract/';
 const request:NightRequest={content:'',limit:2,nightMaxPages:3,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic search contract',discoveryEnabled:true,discoveryKeywords:['desk setup'],discoveryProviders:['google'],discoveryMaxQueries:1};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-search-contract',...request},store);await store.claimJob();
 const time={now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}};
 await researchNight(id,request,store,new AbortController().signal,{...time,discovery:{...time,search:async q=>({sourceUrl:q.url,links:[{url,kind:'profile',title:'Desk setup search hint'}]})},profile:async()=>({status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:'Synthetic Creator (@synthetic_search_contract)',description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home Decor'}})});
 const report=(await new NightStore(store).reports()).find(r=>r.job_id===id)!;assert.equal(report.status,'completed');assert.equal(report.page_requests,2);
 const c=(await store.snapshot()).creators.find(c=>c.username==='synthetic_search_contract')!;assert.equal(c.primary_niche,'Interior Design');assert.equal((c.discovery_evidence as {keyword:string}[])[0].keyword,'desk setup');
 const d=report.discovery as {queries:unknown[];results:unknown[]};assert.equal(d.queries.length,1);assert.equal(d.results.length,1);
 const pool=new DiscoveryStore(store),query=(await pool.queries(id))[0],post='https://www.instagram.com/p/PoolContract/',nextUrl='https://www.instagram.com/synthetic_pool_contract/';
 await pool.complete(id,safeId(query.id),[{url:post,kind:'post',title:''}]);
 const nextRequest={...request,poolSourceJob:id,limit:1,nightMaxPosts:1};
 const next=await enqueue({kind:'instagram_night',source:'synthetic-continuation-contract',...nextRequest},store);await store.claimJob();
 await researchNight(next,nextRequest,store,new AbortController().signal,{...time,discovery:{...time,search:async()=>{throw new Error('Finished searches must not repeat');},author:async()=>({profile:nextUrl,evidence:{url:post,caption:'Shop now #cozyroom',hashtags:['#cozyroom'],collected_at:new Date().toISOString()}})},profile:async()=>({status:'loaded',snapshot:{url:nextUrl,canonicalUrl:nextUrl,title:'',ogTitle:'Synthetic Creator (@synthetic_pool_contract)',description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Independent publisher'}}),post:async()=>{throw new Error('Cached caption must not repeat');}});
 const nextReport=(await new NightStore(store).reports()).find(r=>r.job_id===next)!;assert.equal(nextReport.page_requests,2);assert.equal(nextReport.matched,1);
 const nextCreator=(await store.snapshot()).creators.find(c=>c.username==='synthetic_pool_contract')!;assert.equal(nextCreator.account_type,'store');assert.equal(nextCreator.primary_niche,'Cozy Room');
}

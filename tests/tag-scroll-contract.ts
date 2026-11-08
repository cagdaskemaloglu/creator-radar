import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {enqueue} from '../lib/job-input';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {DiscoveryStore} from '../lib/discovery-store';
import {readResearchState,writeResearchState} from '../lib/instagram-state';
export async function tagScrollContract(store:CreatorStore){
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 const request:NightRequest={efficientResearch:true,content:'',limit:10,nightMaxPages:15,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic scroll contract',discoveryEnabled:true,discoveryKeywords:['scrollcontract'],discoveryProviders:['instagram_tags'],discoveryMaxQueries:1,discoveryResultsPerQuery:20};
 const post=(i:number)=>`https://www.instagram.com/p/ScrollContract_${i}/`,profile=(i:number)=>`https://www.instagram.com/scroll_contract_${i}/`;
 const id=await enqueue({kind:'instagram_night',source:'synthetic-scroll-contract',...request},store);await store.claimJob();
 await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async(q,n,signal,c)=>{assert.ok(c);await c.onBatch?.([post(0),post(1),post(2)]);assert.equal(await c.beforeScroll(),true);await c.onBatch?.([post(3)]);return{sourceUrl:q.url,links:[0,1,2,3].map(i=>({kind:'post',url:post(i),title:''})),collection:{reason:'target_reached',scrolls:1,newLinks:4}};},author:async url=>profile(Number(url.match(/_(\d+)/)![1]))},profile:async url=>({status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:`Synthetic Creator (@${new URL(url).pathname.split('/')[1]})`,description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor'}})});
 const r=(await new NightStore(store).reports()).find(r=>r.job_id===id)!;assert.equal(r.page_requests,10);assert.equal(r.inserted,4);assert.equal(readResearchState(clock).visits,10);const repo=new DiscoveryStore(store),q=(await repo.queries(id))[0];assert.equal((await repo.queryPageCosts(id)).get(Number(q.id)),10);assert.equal(q.attempts,1);assert.equal(q.result_count,4);assert.equal((await repo.keywordPerformance()).find(p=>p.keyword==='scrollcontract')?.pages,10);
}

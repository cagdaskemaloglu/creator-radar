import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {enqueue} from '../lib/job-input';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {writeResearchState,readResearchState,pauseInstagram} from '../lib/instagram-state';
import {isolateLegacyProfileFailure} from '../lib/profile-recovery';
import {isolatedProfileLayoutReason} from '../lib/profile-read-policy';
import {safeId} from '../lib/storage/driver';
export async function poolContract(store:CreatorStore){
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 const bad='https://www.instagram.com/pool_contract_bad/',good='https://www.instagram.com/pool_contract_good/';
 const request:NightRequest={efficientResearch:true,content:'',limit:10,nightMaxPages:20,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic pool contract',discoveryEnabled:true,discoveryKeywords:['cozyroom'],discoveryProviders:['instagram_tags'],discoveryMaxQueries:1,discoveryResultsPerQuery:20};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-pool-contract',...request},store);await store.claimJob();const searches:string[]=[];
 await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async q=>{searches.push(q.keyword);return{sourceUrl:q.url,links:[{kind:'profile',url:q.keyword==='cozyroom'?bad:good,title:''}]};}},profile:async url=>({status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:url===bad?'Instagram':'Synthetic Creator (@pool_contract_good)',description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor'}})});
 const night=new NightStore(store),r=(await night.reports()).find(r=>r.job_id===id)!;assert.equal(r.status,'completed');assert.equal(r.inserted,1);assert.equal(r.skipped,1);assert.equal(r.page_requests,11);assert.equal(searches.length,9);assert.equal(new Set(searches).size,9);assert.equal(readResearchState().paused,false);
 const old=await enqueue({kind:'instagram_night',source:'synthetic-old-layout',...request,content:bad,discoveryEnabled:false},store);await store.claimJob();await night.initialize(old,{efficientResearch:true,maxProfiles:10,maxPages:20,maxPosts:0,maxDepth:0,hours:8,permission:request.permission,seeds:[bad]});const c=await night.next(old);await night.reserve(old,safeId(c?.id));await store.log(old,'Night profile: '+bad);await night.stop(old,'paused',isolatedProfileLayoutReason);pauseInstagram(isolatedProfileLayoutReason);
 const before=await night.run(old),visits=readResearchState().visits;assert.equal(await isolateLegacyProfileFailure(old,store),true);await night.resume(old);const after=await night.run(old);assert.equal(after.started_at,before.started_at);assert.equal(after.page_requests,before.page_requests);assert.equal(readResearchState().visits,visits);assert.equal(readResearchState().paused,false);await store.finish(old,'completed');
}

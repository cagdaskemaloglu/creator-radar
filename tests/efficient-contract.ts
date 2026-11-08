import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {enqueue} from '../lib/job-input';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {DiscoveryStore} from '../lib/discovery-store';
import {writeResearchState} from '../lib/instagram-state';
export async function efficientContract(store:CreatorStore){
 const previous=process.env.INSTAGRAM_DAILY_PAGES;process.env.INSTAGRAM_DAILY_PAGES='500';
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 try{
 const request:NightRequest={efficientResearch:true,content:'',limit:40,nightMaxPages:45,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic efficient contract',discoveryEnabled:true,discoveryKeywords:['contractone','contracttwo'],discoveryProviders:['instagram_tags'],discoveryMaxQueries:2,discoveryResultsPerQuery:20};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-efficient-contract',...request},store);await store.claimJob();const events:string[]=[];
 await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async q=>{events.push(q.keyword);const offset=q.keyword==='contractone'?0:20,count=q.keyword==='contractone'?20:11;return{sourceUrl:q.url,links:Array.from({length:count},(_,i)=>({kind:'profile',url:`https://www.instagram.com/efficient_contract_${i+offset}/`,title:''}))};}},profile:async url=>{events.push('profile');return{status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:`Synthetic Creator (@${new URL(url).pathname.split('/')[1]})`,description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor'}};}});
 const r=(await new NightStore(store).reports()).find(r=>r.job_id===id)!;assert.equal(r.inserted,31);assert.equal(r.page_requests,33);assert.equal(r.stop_reason,'no_new_links');assert.ok(events.indexOf('profile')<events.indexOf('contracttwo'));
 const performance=await new DiscoveryStore(store).keywordPerformance();assert.equal(performance.find(p=>p.keyword==='contractone')?.newProfiles,20);assert.equal(performance.find(p=>p.keyword==='contractone')?.pages,21);assert.equal(performance.find(p=>p.keyword==='contracttwo')?.newProfiles,11);
 }finally{if(previous===undefined)delete process.env.INSTAGRAM_DAILY_PAGES;else process.env.INSTAGRAM_DAILY_PAGES=previous;}
}

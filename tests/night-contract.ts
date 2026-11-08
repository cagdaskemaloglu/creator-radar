import assert from 'node:assert/strict';
import type { CreatorStore } from '../lib/db';
import { enqueue } from '../lib/job-input';
import { researchNight, type NightRequest } from '../lib/night-research';
import { NightStore } from '../lib/night-store';
import { writeResearchState } from '../lib/instagram-state';
export async function nightContract(store:CreatorStore) {
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 const url='https://www.instagram.com/synthetic_night_contract/',post='https://www.instagram.com/p/SyntheticNight/';
 const request:NightRequest={content:url,limit:2,nightMaxPages:3,nightMaxPosts:1,nightMaxDepth:0,nightHours:8,permission:'Own synthetic PostgreSQL night contract'};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-night-contract',...request},store);await store.claimJob();
 await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},profile:async()=>({status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:'Synthetic Creator (@synthetic_night_contract)',description:null,bodyText:'Synthetic public fixture',mainText:'Synthetic public fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],postLinks:[post]}}),post:async()=>({url:post,caption:'Home decor ideas #homedecor',hashtags:['#homedecor'],collected_at:new Date().toISOString()})});
 const reports=await new NightStore(store).reports();const report=reports.find(r=>r.job_id===id)!;
 assert.equal(report.status,'completed');assert.equal(report.matched,1);assert.equal(report.page_requests,2);
 const creator=(await store.snapshot()).creators.find(c=>c.username==='synthetic_night_contract');assert.equal(creator?.primary_niche,'Interior Design');
 assert.ok((creator?.classification_evidence as {source_url?:string}[]).some(e=>e.source_url===post));
}

import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {enqueue} from '../lib/job-input';
import {researchNight} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {InstagramPostRouteError} from '../lib/instagram-post-policy';
import {writeResearchState,readResearchState} from '../lib/instagram-state';
import {DiscoveryFrontier,discoveryScope} from '../lib/discovery-frontier';
export async function deskReliabilityContract(store:CreatorStore,budget=20){
 const url=`https://www.instagram.com/desk_reliability_${budget}/`,request={content:url,limit:1,permission:'Own synthetic desk reliability fixtures',selectiveReview:true,target:{country:'TR'},discoveryTopics:['Desk Setup'],nightMaxPages:budget,nightMaxPosts:1,nightMaxDepth:0,nightHours:8};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-desk-reliability',...request},store);await store.claimJob();let clock=Date.now(),reads=0;
 writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},profile:async()=>({status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:`Fixture (@desk_reliability_${budget})`,description:null,bodyText:'Fixture',mainText:'Fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Creator',postLinks:[1,2,3].map(n=>`https://www.instagram.com/p/DeskReliability${budget}_${n}/`)}}),post:async url=>{if(++reads===1)throw new InstagramPostRouteError();return{url,caption:'Desk setup çalışma masası. Ben bu bilgisayar ve monitör için bir düzen kurdum.',hashtags:[],collected_at:new Date().toISOString()};}});
 const r=(await new NightStore(store).reports()).find(r=>r.job_id===id)!;assert.equal(r.status,'completed');assert.equal(r.inserted,1);assert.equal(readResearchState(clock).paused,false);assert.equal(reads,budget===5?1:2);assert.equal(r.page_requests,1+reads);
 const posts=r.posts as {status:string;reason:string|null}[];assert.equal(posts[0].status,'skipped');assert.equal(posts[0].reason,'unsupported_post_route');
 const d=r.diagnostics as {uncertainty:Record<string,number>;coverage:Record<string,number>;review:{with_telemetry:number;attempted:number;visits:number;resolved:number;became_qualified:number;unsupported_routes:number;budget_deferred:number}};
 assert.equal(d.review.with_telemetry,1);assert.equal(d.review.attempted,1);assert.equal(d.review.visits,reads);assert.equal(d.review.unsupported_routes,1);
 if(budget===5){assert.equal(d.review.budget_deferred,1);assert.equal(d.uncertainty.category_uncertain,1);assert.equal(d.uncertainty.country_unknown,1);assert.equal(d.coverage.caption_missing,1);}else{assert.equal(d.review.resolved,1);assert.equal(d.review.became_qualified,1);assert.equal(r.estimated,1);}
 const record=(await store.snapshot()).creators.find(c=>c.profile_url===url)!;const review=record.review_assessment as {attempts:number;new_evidence:number;status:string};assert.equal(review.attempts,reads);assert.equal(review.new_evidence,budget===5?0:1);
 const frontier=new DiscoveryFrontier(store),scope=discoveryScope(['Desk Setup'],{country:'TR'});await frontier.seed(scope,['masadekorasyonu','çalışmamasası'].map(keyword=>({keyword,priority:2,origin:'curated',evidence:[]})));await frontier.reconcileCurated(scope,['çalışmamasası']);assert.deepEqual((await frontier.pick(scope,10)).map(q=>q.keyword),['çalışmamasası']);assert.equal((await frontier.ranked(scope)).length,2);await frontier.reconcileCurated(scope,['masadekorasyonu','çalışmamasası']);assert.equal((await frontier.pick(scope,10)).length,2);
}

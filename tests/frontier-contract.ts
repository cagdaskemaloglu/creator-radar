import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {DiscoveryFrontier,discoveryScope} from '../lib/discovery-frontier';
import {DiscoveryStore} from '../lib/discovery-store';
import {NightStore} from '../lib/night-store';
import {researchNight,type NightRequest} from '../lib/night-research';
import {enqueue} from '../lib/job-input';
import {profileSchema} from '../lib/model';
import {writeResearchState} from '../lib/instagram-state';
export async function frontierContract(store:CreatorStore){
 const target={country:'TR'},scope=discoveryScope(['Gaming'],target),frontier=new DiscoveryFrontier(store);
 assert.equal(scope,discoveryScope(['Gaming'],{country:'TR'}));assert.notEqual(scope,discoveryScope(['Gaming'],{country:'DE'}));
 await frontier.seed(scope,[...['oyun','oyuncu','yayıncı','oyuninceleme','oyunyayını','oyunrehberi'].map(keyword=>({keyword,priority:2,origin:'curated' as const,evidence:[]})),{keyword:'gaming',priority:0,origin:'curated',evidence:[]}]);
 await frontier.seed(scope,[{keyword:'oyun',priority:2,origin:'curated',evidence:[]}]);assert.equal((await frontier.summary(scope)).total,7);
 const caption='Canlı oyun yayınları videoları kanalıma abone olun';
 for(let i=0;i<2;i++)await store.saveProfile(profileSchema.parse({username:`frontier_learn_${i}`,biography:caption,synthetic:false,content_evidence:[{url:`https://www.instagram.com/p/LearnEvidence${i}/`,caption:caption+' #yenioyunserisi #makyaj #fyp #singlecreator',hashtags:['#yenioyunserisi','#makyaj','#fyp',...(i===0?['#singlecreator']:[])],collected_at:new Date().toISOString()}]}),{provider:'fixture',identifier:'local-frontier-test',permission:'Own synthetic learning evidence'});
 assert.equal(await frontier.learn(scope,['Gaming'],target),1);assert.equal((await frontier.summary(scope)).learned,1);
 assert.equal((await new DiscoveryFrontier(store).summary(scope)).total,8);
 const picks=await frontier.pick(scope,5);assert.ok(picks.every(p=>p.priority>0));assert.ok(picks.filter(p=>p.origin==='observed').length<=1);
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 const request:NightRequest={efficientResearch:true,discoveryScopeKey:scope,content:'',limit:5,nightMaxPages:5,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic frontier fixture',target,discoveryEnabled:true,discoveryKeywords:['oyun'],discoveryPriorityKeywords:['oyun'],discoveryFairBudget:true,discoveryProviders:['instagram_tags'],discoveryMaxQueries:1,discoveryResultsPerQuery:1};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-frontier',...request},store);await store.claimJob();
 await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async q=>({sourceUrl:q.url,links:[{kind:'post',url:'https://www.instagram.com/p/FrontierMissing/',title:''}]}),author:async()=>({profile:null,evidence:null,reason:'owner_link_missing'})}});
 const results=(await new DiscoveryStore(store).report(id)).results;assert.equal(results[0].reason,'owner_link_missing');
 assert.ok((await new NightStore(store).reports()).find(r=>r.job_id===id)?.frontier);
 await frontier.syncJob(id);await frontier.syncJob(id);
 const obs=await store.database.query('SELECT * FROM discovery_observations WHERE query_id=$1',[Number(results[0].query_id)]);assert.equal(obs.rows.length,1);assert.equal(Number(obs.rows[0].pages),2);
 assert.ok(!(await frontier.pick(scope,20,[],clock)).some(r=>r.keyword==='oyun'));assert.ok((await frontier.pick(scope,20,[],clock+7*3600000)).some(r=>r.keyword==='oyun'));
 assert.ok((await frontier.summary(scope)).untried>0);
 await frontier.seed(scope,[{keyword:'oyunbaşarıtesti',origin:'curated',priority:2,evidence:[]}]);
 const successful:NightRequest={...request,limit:1,nightMaxPages:3,discoveryTopics:['Gaming'],discoveryKeywords:['oyunbaşarıtesti'],discoveryPriorityKeywords:['oyunbaşarıtesti']};
 const successId=await enqueue({kind:'instagram_night',source:'synthetic-frontier-success',...successful},store);await store.claimJob();const owner='https://www.instagram.com/frontier_success/';
 await researchNight(successId,successful,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async q=>({sourceUrl:q.url,links:[{kind:'post',url:'https://www.instagram.com/p/FrontierSuccess/',title:''}]}),author:async()=>owner},profile:async()=>({status:'loaded',snapshot:{url:owner,canonicalUrl:owner,title:'',ogTitle:'Creator (@frontier_success)',description:null,bodyText:'Fixture',mainText:'Fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:caption}})});
 const sq=(await new DiscoveryStore(store).queries(successId))[0];const measured=(await store.database.query('SELECT * FROM discovery_observations WHERE query_id=$1',[Number(sq.id)])).rows[0];assert.equal(Number(measured.pages),3);assert.equal(Number(measured.new_profiles),1);assert.equal(Number(measured.matched_profiles),1);

}

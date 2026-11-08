import {logRestriction} from './instagram-restriction';
import {queryBudgetShares} from './query-budget';
import {InstagramPostRouteError} from './instagram-post-policy';
import {DiscoveryFrontier} from './discovery-frontier';
import {InstagramTagReadError} from './tag-read-policy';
import {relatedDiscoveryKeywords} from './discovery-expansion';
import type {TagCollectionOptions} from './tag-collection';
import { setTimeout as delay } from 'node:timers/promises';
import type { CreatorStore } from './db';
import type { PostEvidence } from './instagram-post';
import { DiscoveryStore } from './discovery-store';
import { DiscoveryStop,searchGoogle,searchInstagramTag,resolvePostWithEvidence,type DiscoveryResponse } from './discovery-browser';
import { buildDiscoveryPlan,discoveryQueryKey,normalizeDiscoveryLink,uniqueDiscoveryLinks,type DiscoverySettings,type DiscoveryQuery,type DiscoveryProvider } from './discovery-plan';
import { readGoogleState,writeGoogleState,pauseGoogle,googleLimits } from './google-state';
import { readResearchState,writeResearchState,pauseInstagram } from './instagram-state';
import { researchLimits,instagramWaitMs } from './instagram-policy';
import { InstagramStop } from './instagram-extract';
import { first,safeId } from './storage/driver';
export type DiscoveryDependencies={search?:(query:DiscoveryQuery,limit:number,signal:AbortSignal,collection?:TagCollectionOptions)=>Promise<DiscoveryResponse>;author?:(url:string,signal:AbortSignal)=>Promise<string|{profile:string|null;evidence:PostEvidence|null;reason?:import('./instagram-post-owner').OwnerFailure|null}|null>;now?:()=>number;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>};
export class DiscoveryLimit extends Error{constructor(readonly code:string,readonly terminal:boolean){super(code);}}
export async function runDiscovery(job:number,settings:DiscoverySettings,store:CreatorStore,signal:AbortSignal,limits:{maxPages:number;maxProfiles:number;deadline:number;maxPosts?:number;batchSize?:number},deps:DiscoveryDependencies={}){
 if(!settings.enabled)return;
 const repo=new DiscoveryStore(store),now=deps.now??Date.now,sleep=deps.sleep??(async(ms,s)=>{await delay(ms,undefined,{signal:s});});
 const search=deps.search??(async(q,n,s,options)=>q.provider==='google'?searchGoogle(q,n,s):searchInstagramTag(q,n,s,undefined,options));
 const author=deps.author??((url,signal)=>resolvePostWithEvidence(url,signal,Boolean(limits.maxPosts)));
 await repo.initialize(job,buildDiscoveryPlan(settings));await repo.restore(job);
 const active=async()=>{signal.throwIfAborted();if(await store.isCancelled(job))throw new Error('Cancelled');if(now()>=limits.deadline)throw new DiscoveryLimit('time_limit',true);};
 const reserve=async(provider:DiscoveryProvider,query:number,result?:number,scroll=false)=>{
  await active();const run=await first(store.database,'SELECT page_requests FROM research_runs WHERE job_id=$1',[job]);if(Number(run?.page_requests)>=limits.maxPages)throw new DiscoveryLimit('page_limit',true);
  const google=provider==='google'&&!result;
  const policy=google?googleLimits():{intervalMs:researchLimits().intervalMs,daily:researchLimits().dailyPages};
  let state=google?readGoogleState(now()):readResearchState(now());
  if(state.paused)throw new DiscoveryLimit((google?'google_source_paused: ':'instagram_source_paused: ')+state.reason,false);
  if(policy.daily!==null&&state.visits>=policy.daily)throw new DiscoveryLimit(google?'google_daily_budget':'daily_budget',false);
  const wait=google?Math.max(0,state.lastVisitAt+policy.intervalMs-now()):instagramWaitMs(researchLimits());if(now()+wait>=limits.deadline)throw new DiscoveryLimit('time_limit',true);
  if(wait){await store.log(job,`Discovery waiting ${Math.ceil(wait/1000)}s (${google?'google':'instagram'})`);await sleep(wait,signal);}
  await active();state=google?readGoogleState(now()):readResearchState(now());
  if(state.paused)throw new DiscoveryLimit(google?'google_source_paused':'instagram_source_paused',false);
  if(policy.daily!==null&&state.visits>=policy.daily)throw new DiscoveryLimit(google?'google_daily_budget':'daily_budget',false);
  if(scroll)await repo.reserveScroll(job,query);else await repo.reserve(job,query,result);const next={...state,visits:state.visits+1,lastVisitAt:now()};if(google)writeGoogleState(next);else writeResearchState(next);
 };
 const batched=Boolean(limits.batchSize),fair=batched&&Boolean(settings.fairBudget);
 const preferred=new Set([...(settings.priorityKeywords??[]),...relatedDiscoveryKeywords(settings.priorityKeywords??[])].map(k=>discoveryQueryKey('instagram_tags',k)));
 const isPreferred=(provider:unknown,keyword:unknown)=>preferred.has(discoveryQueryKey(String(provider),String(keyword)));
 const frontierRows=settings.scopeKey?await new DiscoveryFrontier(store).ranked(settings.scopeKey):[],localQuality=fair?await repo.targetYield(job):new Map<number,{saved:number;qualified:number}>();
 const enrichmentUsed=Number((await first(store.database,"SELECT count(*) AS n FROM logs WHERE job_id=$1 AND message LIKE 'Enrichment visit reserved: candidate=%'",[job]))?.n);
 const quotaQueries=await repo.queries(job),shares=queryBudgetShares(Math.max(0,limits.maxPages-enrichmentUsed),quotaQueries.map(q=>{const previous=frontierRows.find(f=>discoveryQueryKey(f.provider,f.keyword)===discoveryQueryKey(String(q.provider),String(q.keyword))),quality=localQuality.get(safeId(q.id));return{id:safeId(q.id),fresh:previous?.fresh??true,score:previous?.score??1/3,poor:Boolean(quality&&quality.saved>=3&&quality.qualified===0)};}));
 const tagShare=async(id:number)=>shares.get(id)??3;
 const backlog=async()=>Number((await first(store.database,"SELECT count(*) AS n FROM research_candidates WHERE job_id=$1 AND status='pending'",[job]))?.n);
 const initialPending=batched?await repo.pendingPosts(job):[];
 const yields=batched?await repo.postYield(job):[];
 const tryNextTag=initialPending.length>0&&initialPending.every(p=>{const y=yields.find(y=>y.query_id===p.query_id);return Number(y?.visits)>=5&&Number(y?.owners)===0;});
 const costs= fair?await repo.queryPageCosts(job,true):new Map<number,number>();
 // Drain useful existing work first, but retain the escape to a fresh query
 // when every pending post belongs to a poor or exhausted query share.
 let drainPending=false;
 for(const post of initialPending)if(!fair||(costs.get(safeId(post.query_id))??0)+2<=await tagShare(safeId(post.query_id))){drainPending=true;break;}
 const withheld=new Map(settings.scopeKey?(await new DiscoveryFrontier(store).ranked(settings.scopeKey)).filter(q=>!q.eligible).map(q=>[discoveryQueryKey(q.provider,q.keyword),q.origin] as const):[]);
 let searched=0,authorVisits=0;
 const queries=batched&&!settings.scopeKey?await repo.prioritizedQueries(job):await repo.queries(job);
 if(settings.scopeKey){const order=new Map(settings.keywords.map((k,i)=>[discoveryQueryKey('instagram_tags',k),i]));queries.sort((a,b)=>Number(isPreferred(b.provider,b.keyword))-Number(isPreferred(a.provider,a.keyword))||((frontierRows.find(f=>discoveryQueryKey(f.provider,f.keyword)===discoveryQueryKey(String(b.provider),String(b.keyword)))?.score??1/3)-(frontierRows.find(f=>discoveryQueryKey(f.provider,f.keyword)===discoveryQueryKey(String(a.provider),String(a.keyword)))?.score??1/3))||(order.get(discoveryQueryKey(String(a.provider),String(a.keyword)))??10000)-(order.get(discoveryQueryKey(String(b.provider),String(b.keyword)))??10000));}
 else if(preferred.size)queries.sort((a,b)=>Number(isPreferred(b.provider,b.keyword))-Number(isPreferred(a.provider,a.keyword)));
 for(const row of queries){
  if(batched&&((drainPending&&!tryNextTag)||searched>=1||await backlog()>0))break;

  await active();if(row.status!=='pending')continue;
  const n=await first(store.database,'SELECT count(*) AS n FROM research_candidates WHERE job_id=$1',[job]);if(batched?await backlog()>=Number(limits.batchSize):Number(n?.n)>=limits.maxProfiles)break;
  const id=safeId(row.id),query:DiscoveryQuery={provider:row.provider as DiscoveryProvider,keyword:String(row.keyword),url:String(row.query_url)};
  if(withheld.has(discoveryQueryKey(query.provider,query.keyword))){const reason=withheld.get(discoveryQueryKey(query.provider,query.keyword))==='observed'?'learned_term_evidence_insufficient':'curated_term_removed';await repo.skipQuery(id,reason);await store.log(job,`Query withheld: ${query.keyword}; ${reason}`);continue;}
  try{
   if(batched&&Number(row.result_count)>=settings.resultsPerQuery){await repo.complete(job,id,[]);continue;}
   await reserve(query.provider,id);searched++;
   if(batched)await store.log(job,`Tag priority: ${query.keyword}; new=${Number(row.yield_new??0)}; pages=${Number(row.yield_pages??0)}`);
   if(fair)await store.log(job,`Query budget share: ${query.keyword}; pages=${await tagShare(id)}; priority=${isPreferred(query.provider,query.keyword)?'local':'general'}`);
   await store.log(job,`Discovery ${query.provider}: ${query.keyword}`);
   let collection:TagCollectionOptions|undefined;
   if(batched&&query.provider==='instagram_tags'){
    const used=Number((await first(store.database,'SELECT page_requests FROM research_runs WHERE job_id=$1',[job]))?.page_requests);
    const pending=(await repo.queries(job)).filter(q=>q.status==='pending').length+1;
    const share=Math.max(0,Math.floor((limits.maxPages-used-2)/pending));let scrolls=0;
    collection={limit:settings.resultsPerQuery,knownUrls:await repo.knownCollectionUrls(job,now()),beforeScroll:async()=>{
      await active();const usedNow=Number((await first(store.database,'SELECT page_requests FROM research_runs WHERE job_id=$1',[job]))?.page_requests);
      const keep=Math.max(2,Math.min(await backlog(),5));
      if(scrolls>=share||limits.maxPages-usedNow<=keep)return false;
      if(fair&&((await repo.queryPageCosts(job,true)).get(id)??0)+3>await tagShare(id))return false;
      await reserve('instagram_tags',id,undefined,true);scrolls++;return true;
    },onBatch:async urls=>{await repo.appendResults(job,id,uniqueDiscoveryLinks(urls.map(url=>({url,title:''})),settings.resultsPerQuery));}};
   }
   const target=batched?Math.max(1,settings.resultsPerQuery-Number(row.result_count)):settings.resultsPerQuery;
   const response=await search(query,target,signal,collection);await active();
   if(response.collection)await store.log(job,`Tag collection finished: ${query.keyword}; reason=${response.collection.reason}; scrolls=${response.collection.scrolls}; new=${response.collection.newLinks}`);
   // Revalidate even adapter/test results; snippets and matching search terms are discovery hints only.
   const links=uniqueDiscoveryLinks(response.links,settings.resultsPerQuery);
   await repo.complete(job,id,links,response.outcome==='empty'?'empty_results':response.outcome==='unavailable'?'tag_unavailable':null);if(response.outcome)await store.log(job,`Tag query outcome: ${query.keyword}; ${response.outcome}`);await store.log(job,`Discovery found ${links.length} normalized links for ${query.keyword}`);
  }catch(e){
   if(!signal.aborted&&query.provider==='instagram_tags'&&e instanceof InstagramTagReadError){
    await repo.skipQuery(id,e.reason);await store.log(job,`Tag query skipped: ${query.keyword}; ${e.reason}; pending links retained`);
    if(await repo.consecutiveTagErrors(job))throw new DiscoveryLimit('consecutive_tag_read_errors',false);
    continue;
   }
   if(e instanceof DiscoveryStop)pauseGoogle(e.message);if(e instanceof InstagramStop){pauseInstagram(e.message,e.restriction);if(e.restriction)await logRestriction(store,job,e.restriction);}
   if(!(e instanceof DiscoveryLimit)&&!signal.aborted)await repo.failed(id,e instanceof Error?e.message.split('\n')[0]:'Search failed',e instanceof DiscoveryStop||e instanceof InstagramStop);
   throw e;
  }
 }
 if(batched&&await backlog()>0)return{deferred:false};
 let consecutiveTransportErrors=0;
 const posts=batched?await repo.prioritizedPosts(job):await repo.pendingPosts(job);
 const queryMap=new Map((await repo.queries(job)).map(q=>[safeId(q.id),q]));
 if(preferred.size)posts.sort((a,b)=>{const qa=queryMap.get(safeId(a.query_id)),qb=queryMap.get(safeId(b.query_id));return Number(isPreferred(qb?.provider,qb?.keyword))-Number(isPreferred(qa?.provider,qa?.keyword));});
 const spreading=fair&&[...queryMap.values()].some(q=>q.status==='pending');
 for(const row of posts){
  await active();const n=await first(store.database,'SELECT count(*) AS n FROM research_candidates WHERE job_id=$1',[job]);if(batched?await backlog()>=Number(limits.batchSize):Number(n?.n)>=limits.maxProfiles)break;
  const id=safeId(row.id),query=safeId(row.query_id),url=String(row.source_url);
  if(spreading&&((await repo.queryPageCosts(job,true)).get(query)??0)+2>await tagShare(query))continue;
  const known=batched?await repo.knownPostOwner(url):null;
  if(known){await repo.skipRecent(id,known,'known_profile_discovery_only');await store.log(job,'Known post owner skipped without visit: '+url);continue;}
  const recent=await repo.recentlyResolved(job,url,now());
  if(recent){await repo.skipRecent(id,recent.profile_url?String(recent.profile_url):null,recent.status==='accepted'?'recently_researched':'recent_author_unavailable');await store.log(job,`Discovery skipped recent post: ${url}; ${recent.status==='accepted'?'profile already researched':'author recently unavailable'}`);continue;}
  if(batched&&(authorVisits>=10||(authorVisits>=5&&await backlog()===0)))break;
  const cached=await repo.cachedAuthor(job,url,batched,now());if(cached){await repo.acceptAuthor(job,id,cached.profile_url?String(cached.profile_url):null,limits.maxPosts?cached.evidence:null);await store.log(job,`Cached post owner reused without visit: ${url}`);continue;}
  try{
   // Keep room to inspect the profiles we have found instead of spending the
   // entire page budget resolving post authors before a single record is saved.
   const run=await first(store.database,'SELECT page_requests FROM research_runs WHERE job_id=$1',[job]);
   if(Number(run?.page_requests)+Math.max(1,Math.min(batched?await backlog():Number(n?.n),limits.maxProfiles))>=limits.maxPages)break;
   await reserve('instagram_tags',query,id);authorVisits++;const resolved=await author(url,signal);await active();consecutiveTransportErrors=0;
   const profile=typeof resolved==='string'?resolved:resolved?.profile;
   const evidence=typeof resolved==='object'?resolved?.evidence:null;
   const normalized=profile?normalizeDiscoveryLink(profile):null;
   const failure=typeof resolved==='object'&&resolved?resolved.reason??'owner_link_missing':'owner_link_missing';
   await repo.acceptAuthor(job,id,normalized?.kind==='profile'?normalized.url:null,limits.maxPosts?evidence:null,normalized?.kind==='profile'?undefined:failure);
   if(normalized?.kind!=='profile')await store.log(job,`Post owner failed: ${failure}; ${url}`);
   await store.log(job,`Discovery author: ${normalized?.kind==='profile'?normalized.url:'unavailable'}; caption ${evidence?'collected':'unavailable'}`);
  }catch(e){
   const message=e instanceof Error?e.message.split('\n')[0]:'';
   if(!signal.aborted&&e instanceof InstagramPostRouteError){await repo.skipRecent(id,null,'unsupported_post_route');await store.log(job,`Post owner failed: unsupported_post_route; ${url}`);continue;}
   if(!signal.aborted&&!(e instanceof InstagramStop)&&/net::ERR_(CONNECTION_CLOSED|CONNECTION_RESET|CONNECTION_TIMED_OUT|NETWORK_CHANGED)\b|(?:page\.goto|navigation).*Timeout|Timeout.*(?:page\.goto|navigation)/i.test(message)){
    await repo.skipRecent(id,null,'page_not_loaded');await store.log(job,`Post owner failed: page_not_loaded; ${url}`);
    await store.log(job,`Discovery transport error; post skipped without retry: ${url}`);
    if(++consecutiveTransportErrors>=3){await store.log(job,'Three consecutive transport errors; discovery deferred, verified candidates retained for processing');return{deferred:true};}
    continue;
   }
   if(e instanceof InstagramStop){pauseInstagram(e.message,e.restriction);if(e.restriction)await logRestriction(store,job,e.restriction);}
   if(!(e instanceof DiscoveryLimit)&&!signal.aborted)await repo.failed(query,message||'Author lookup failed',e instanceof InstagramStop,id);
   throw e;
  }
 }
 return{deferred:false};
}

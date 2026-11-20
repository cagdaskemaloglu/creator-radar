import {TechnicalQuarantine} from './technical-recovery';
import {ResearchActivity} from './research-activity';
import {RequestRecovery,RequestSkipped} from './request-recovery';
import {logRestriction} from './instagram-restriction';
import {InstagramPostRouteError} from './instagram-post-policy';
import {isTransientTransportError} from './transient-error';
import {needsSelectiveReview} from './selective-review';
import {DiscoveryFrontier} from './discovery-frontier';
import {expandDiscoveryPool} from './discovery-expansion';
import {profileContext,targetMatch} from './profile-context';
import { runDiscovery,DiscoveryLimit,type DiscoveryDependencies } from './discovery-run';
import { DiscoveryStore } from './discovery-store';
import type { DiscoveryProvider } from './discovery-plan';
import { setTimeout as delay } from 'node:timers/promises';
import type { CreatorStore } from './db';
import { classify, profileSchema, type Profile } from './model';
import { NightStore, type NightSettings } from './night-store';
import { instagramSeeds, researchLimits, instagramWaitMs } from './instagram-policy';
import { readInstagramProfile } from './instagram-browser';
import { extractInstagramProfile, InstagramStop, InstagramProfileReadError } from './instagram-extract';
import { instagramPostUrl, readInstagramPost, type PostEvidence } from './instagram-post';
import { readResearchState, writeResearchState, pauseInstagram } from './instagram-state';
import { jsonObject, safeId, first } from './storage/driver';
import { WorkerInterrupted } from './job-control';
import type { Reader } from './instagram-research';
export type NightRequest = {enrichmentUrls?:string[];enrichmentMaxPages?:number;selectiveReview?:boolean;discoveryScopeKey?:string;discoveryPriorityKeywords?:string[];discoveryFairBudget?:boolean; efficientResearch?:boolean; target?:import("./taxonomy").ResearchTarget; poolSourceJob?:number; content: string; limit: number; permission: string; nightMaxPages: number; nightMaxPosts: number; nightMaxDepth: number; nightHours: number; discoveryEnabled?:boolean;discoveryTopics?:string[];discoveryKeywords?:string[];discoveryProviders?:DiscoveryProvider[];discoveryMaxQueries?:number;discoveryResultsPerQuery?:number };
export type NightDependencies = { discovery?:DiscoveryDependencies; profile?: Reader; post?: (url: string, owner: string, signal: AbortSignal) => Promise<PostEvidence | null>; now?: () => number; sleep?: (ms: number, signal: AbortSignal) => Promise<void> };
class NightLimit extends Error { constructor(readonly code: string, readonly terminal: boolean) { super(code); } }
export async function researchNight(job: number, request: NightRequest, store: CreatorStore, signal: AbortSignal, dependencies: NightDependencies = {}) {
  const night = new NightStore(store);
  const now = dependencies.now ?? Date.now;
  let activity:ResearchActivity|undefined;
  const baseSleep = dependencies.sleep ?? (async (ms, s) => { await delay(ms, undefined, { signal: s }); });
  const sleep=(ms:number,s:AbortSignal)=>activity?activity.wait(()=>baseSleep(ms,s)):baseSleep(ms,s);
  const readProfile = dependencies.profile ?? readInstagramProfile, readPost = dependencies.post ?? readInstagramPost;
  const controls = researchLimits(),quarantine=new TechnicalQuarantine(store);
  const settings: NightSettings = {enrichmentUrls:request.enrichmentUrls,enrichmentMaxPages:request.enrichmentMaxPages, selectiveReview:request.selectiveReview,efficientResearch:request.efficientResearch,target:request.target,maxProfiles: Math.min(request.limit,request.efficientResearch?200:30), maxPages: request.nightMaxPages, maxPosts: request.nightMaxPosts, maxDepth: request.nightMaxDepth, hours: request.nightHours, permission: request.permission, poolSourceJob:request.poolSourceJob,seeds: request.content.trim()?instagramSeeds(request.content):[],discovery:{scopeKey:request.discoveryScopeKey,priorityKeywords:request.discoveryPriorityKeywords,fairBudget:request.discoveryFairBudget,enabled:request.discoveryEnabled??false,topics:request.discoveryTopics??[],keywords:request.discoveryKeywords??[],providers:request.discoveryProviders??['google'],maxQueries:request.discoveryMaxQueries??4,resultsPerQuery:request.discoveryResultsPerQuery??10} };
  await night.initialize(job,settings);
  await night.restore(job);
  const run = await night.run(job), config = run.settings;
  const captionLimit=config.selectiveReview&&config.maxPosts>0?Math.max(config.maxPosts,3):config.maxPosts;
  const deadline = new Date(String(run.started_at)).getTime() + config.hours * 3600000;
  activity=await ResearchActivity.start(store,job,now);
  const active = async () => {
    activity?.check();
    signal.throwIfAborted();
    if (await store.isCancelled(job)) throw new Error('Cancelled');
    if (now() >= deadline) throw new NightLimit('time_limit',true);
  };
  const recovery=dependencies.discovery?.recovery===false?null:new RequestRecovery(store,job,signal,now,(ms,s)=>sleep(Math.min(ms,Math.max(0,deadline-now())),s));
  class EnrichmentLimit extends Error{}
  const isEnrichment=async(id:number)=>(await first(store.database,'SELECT work_kind FROM candidate_work WHERE candidate_id=$1',[id]))?.work_kind==='enrichment';
  const visit = async (candidate: number, post?: number) => {
    await recovery?.beforeNext(active);await active();
    const run = await night.run(job);
    if(await isEnrichment(candidate)){const used=await first(store.database,"SELECT count(*) AS n FROM logs WHERE job_id=$1 AND message LIKE 'Enrichment visit reserved: candidate=%'",[job]);if(Number(used?.n)>=(config.enrichmentMaxPages??0))throw new EnrichmentLimit();}
    if (Number(run.page_requests) >= config.maxPages) throw new NightLimit('page_limit',true);
    let state = readResearchState(now());
    if (state.paused) throw new NightLimit('source_paused: '+state.reason,false);
    if (controls.dailyPages!==null && state.visits >= controls.dailyPages) throw new NightLimit('daily_budget',false);
    const wait = instagramWaitMs(controls);
    if (now()+wait>=deadline) throw new NightLimit('time_limit',true);
    if (wait) { await store.log(job,`Night run waiting ${Math.ceil(wait/1000)}s`); await sleep(wait,signal); }
    await active();
    state=readResearchState(now());
    if (state.paused) throw new NightLimit('source_paused: '+state.reason,false);
    if (controls.dailyPages!==null && state.visits>=controls.dailyPages) throw new NightLimit('daily_budget',false);
    // Both reservations are conservative: interrupted attempts still consume budgets.
    await night.reserve(job,candidate,post);
    writeResearchState({...state,visits:state.visits+1,lastVisitAt:now()});
  };
  let reviewDeferred=false;
  const finalize = async (id: number, url: string, profile: Profile, reason?: string) => {
    const posts=await night.posts(id);
    const evidence=posts.filter(p=>p.status==='done'&&p.evidence).slice(0,captionLimit).map(p=>jsonObject(p.evidence) as unknown as PostEvidence);
    const attempted=posts.some(p=>Number(p.attempts)>0);
    const discoveryStore=new DiscoveryStore(store),currentEvidence=await discoveryStore.evidence(job,url);
    const discoveryEvidence=currentEvidence.length?currentEvidence:await discoveryStore.knownEvidence(url);
    const combined=profileSchema.parse({...profile,research_topics:config.discovery?.topics??[],content_evidence:evidence,...(discoveryEvidence.length?{discovery_evidence:discoveryEvidence}:{}),
      ...(profile.extraction?{extraction:{...profile.extraction,coverage:{biography:profile.biography?'collected':'not_available',post_captions:evidence.length?'collected':attempted?'not_available':'not_collected',hashtags:evidence.length?'collected':attempted?'not_available':'not_collected',comments:'not_collected'}}}:{})});
    if(config.selectiveReview){
      const reserved=await store.database.query("SELECT message FROM logs WHERE job_id=$1 AND message LIKE 'Caption visit reserved: post=%'",[job]);const ids=new Set(posts.map(p=>Number(p.id))),visits=reserved.rows.map(r=>Number(String(r.message).split('post=')[1])).filter(id=>ids.has(id)),visited=new Set(visits);
      const baseline=posts.filter(p=>p.status==='done'&&p.evidence&&!visited.has(Number(p.id))).map(p=>jsonObject(p.evidence) as PostEvidence);
      const before=classify({...profile,content_evidence:baseline,research_topics:config.discovery?.topics??[],research_target:config.target}),after=classify({...combined,research_target:config.target});const needed=needsSelectiveReview(before),extra=posts.filter(p=>p.status==='done'&&p.evidence&&visited.has(Number(p.id))).length;
      combined.review_assessment={status:config.maxPosts===0?'disabled':reason&&/page_limit|time_limit|daily_budget|enrichment_budget_deferred/.test(reason)?'budget_deferred':reason?.includes('post_access_blocked')?'source_blocked':!needed?'not_needed':reviewDeferred?'budget_deferred':!posts.length?'no_posts':visits.length&&!extra?'evidence_unavailable':visits.length?'completed':'no_posts',before:before.research_match,after:after.research_match,attempts:visits.length,new_evidence:extra,resolved:before.research_match==='unknown'&&['matched','estimated','different'].includes(after.research_match),became_qualified:!['matched','estimated'].includes(before.research_match)&&['matched','estimated'].includes(after.research_match)};
    }
    const context=profileContext(combined);
    const match=targetMatch(context,config.target??{});
    const quality=classify({...combined,research_target:config.target});await store.log(job,`Research validation: @${combined.username}; category=${quality.category_match}; overall=${quality.research_match}`);
    await store.log(job,`Target validation: @${combined.username}; ${match}`);
    await store.saveProfile({...combined,research_target:config.target,target_match:match},{provider:'instagram-night',identifier:url,permission:config.permission},{candidate:id,job,reason});
  };
  let consecutiveProfileTransportErrors=0,consecutiveProfileLayoutErrors=0,discoveryDeferred=false;
  try {
    if (process.env.INSTAGRAM_BROWSER_ENABLED==='false') throw new NightLimit('disabled',false);
    if(config.discovery?.enabled&&!config.efficientResearch)await runDiscovery(job,config.discovery,store,signal,{maxPages:config.maxPages,maxProfiles:config.maxProfiles,deadline,maxPosts:config.maxPosts},{...dependencies.discovery,recovery:recovery??false,now:dependencies.discovery?.now??now,sleep:dependencies.discovery?.sleep??sleep});
    while(true) {
      await active();
      const count=await first(store.database,config.efficientResearch?"SELECT count(*) AS n FROM research_candidates WHERE job_id=$1 AND status='done'":"SELECT count(*) AS n FROM research_candidates WHERE job_id=$1 AND status IN ('done','skipped')",[job]);
      if(Number(count?.n)>=config.maxProfiles) throw new NightLimit('profile_limit',true);
      let candidate=await night.next(job);
      if(!candidate&&config.efficientResearch&&config.discovery?.enabled&&!discoveryDeferred){
        const before=await night.run(job),beforePending=await new DiscoveryStore(store).pendingWorkCount(job);
        // Commit each verified creator before resolving another post owner. A
        // restriction on the next discovery request must not strand this work.
        const result=await runDiscovery(job,config.discovery,store,signal,{maxPages:config.maxPages,maxProfiles:config.maxProfiles,deadline,maxPosts:config.maxPosts,batchSize:1},{...dependencies.discovery,recovery:recovery??false,now:dependencies.discovery?.now??now,sleep:dependencies.discovery?.sleep??sleep});
        discoveryDeferred=Boolean(result?.deferred);
        candidate=await night.next(job);
        if(!candidate&&!discoveryDeferred){
          const after=await night.run(job),pool=new DiscoveryStore(store);
          if((Number(after.page_requests)>Number(before.page_requests)||await pool.pendingWorkCount(job)!==beforePending)&&await pool.hasPending(job))continue;
        }
      }
      if(!candidate&&config.efficientResearch&&config.discovery?.enabled&&!discoveryDeferred){
        const pool=new DiscoveryStore(store);
        if(!await pool.hasPending(job)){
          const latest=await night.run(job),state=readResearchState(now());
          if(state.paused)throw new NightLimit('source_paused: '+state.reason,false);
          const remaining=Math.min(config.maxPages-Number(latest.page_requests),controls.dailyPages===null?Infinity:controls.dailyPages-state.visits);
          const expansion=await expandDiscoveryPool(job,config.discovery,store,remaining);
          if(expansion.added)continue;
          if(expansion.reason==='budget')throw new NightLimit('insufficient_page_budget',true);
          if(expansion.reason==='terms')throw new NightLimit('no_new_links',true);
        }
      }
      if(!candidate) { const pool=new DiscoveryStore(store),pendingPosts=await pool.pendingPosts(job);await night.stop(job,'completed',pendingPosts.length||await pool.hasPending(job)?'discovery_deferred':'candidate_pool_exhausted'); return; }
      reviewDeferred=false;
      const id=safeId(candidate.id), url=String(candidate.url);
      let profile: Profile | undefined = candidate.profile_data ? profileSchema.parse(jsonObject(candidate.profile_data)) : undefined;
      let activePost: number | undefined;
      try {
        if(!profile) {
          if(await quarantine.get('profile',url,now())){await night.skip(id,'technical_quarantine');await store.log(job,'Profil geçici olarak atlandı: '+url);continue;}
          if(config.efficientResearch&&!await isEnrichment(id)&&await new DiscoveryStore(store).knownProfile(url)){
            const recent=await new DiscoveryStore(store).recentProfile(url,now());
            await night.skip(id,recent?'recent_profile_no_visit':'known_profile_discovery_only');await store.log(job,'Known profile skipped before visit; refresh requires enrichment allocation: '+url);continue;
          }
          if(Number(candidate.attempts)>=2) { await night.skip(id,'Interrupted profile retry limit'); continue; }
          await visit(id);
          await store.log(job,'Night profile: '+url);
          const loaded=recovery?await recovery.run(url,()=>readProfile(url,signal),()=>visit(id),active,'profile'):await readProfile(url,signal);consecutiveProfileTransportErrors=0;
          await active();
          if(!loaded.snapshot) { consecutiveProfileLayoutErrors=0;await night.skip(id,'unavailable'); continue; }
          const extracted=extractInstagramProfile(loaded.snapshot,url);consecutiveProfileLayoutErrors=0;
          if(!extracted.profile) { await night.skip(id,extracted.status); continue; }
          profile=extracted.profile;
          const discoveryStore=new DiscoveryStore(store),currentOrigins=await discoveryStore.evidence(job,url);
          const originPosts=currentOrigins.length?currentOrigins:await discoveryStore.knownEvidence(url);
          const urls=[...new Set([...originPosts.map(p=>String(p.result_url)),...(loaded.snapshot.postLinks??[])].flatMap(p=>{try{return [instagramPostUrl(p)];}catch{return [];}}))].slice(0,captionLimit);
          const existingCaptions=(await night.posts(id)).filter(p=>p.status==='done'&&p.evidence).map(p=>jsonObject(p.evidence) as unknown as PostEvidence);
          const classification=classify({...profile,content_evidence:existingCaptions,research_topics:config.discovery?.topics??[],research_target:config.target});
          const needsMore=config.selectiveReview?needsSelectiveReview(classification):!classification.primary_niche||classification.fit_score<48;
          await night.checkpoint(id,JSON.stringify(profile),needsMore?urls:[]);
          if(Number(candidate.depth)<config.maxDepth) await night.discover(job,extracted.links,Number(candidate.depth)+1);
        }
        const posts=await night.posts(id);
        for(const post of posts) {
          if(post.status!=='pending') continue;
          const collected=(await night.posts(id)).filter(p=>p.status==='done'&&p.evidence).map(p=>jsonObject(p.evidence) as unknown as PostEvidence);
          const classification=classify({...profile,content_evidence:collected,research_topics:config.discovery?.topics??[],research_target:config.target});
          if(config.selectiveReview?!needsSelectiveReview(classification):classification.primary_niche&&classification.fit_score>=48) break;
          if(config.selectiveReview){const current=await night.run(job),review=await first(store.database,"SELECT count(*) AS n FROM logs WHERE job_id=$1 AND message LIKE 'Caption visit reserved: post=%'",[job]);if(Number(review?.n)>=Math.floor(config.maxPages*0.2)||Number(current.page_requests)+1>=config.maxPages){reviewDeferred=true;await store.log(job,'Selective review deferred: caption budget reserved for discovery and profile visits');break;}}
          if(await quarantine.get('post',String(post.url),now())){await night.postResult(safeId(post.id),'skipped',null,'technical_quarantine');continue;}
          activePost=safeId(post.id);
          if(Number(post.attempts)>=2) { await night.postResult(activePost,'skipped',null,'Interrupted post retry limit'); continue; }
          await visit(id,activePost);
          await store.log(job,'Night creator caption: '+String(post.url));
          let evidence:PostEvidence|null;try{evidence=recovery?await recovery.run(String(post.url),()=>readPost(String(post.url),url,signal),()=>visit(id,activePost),active,'post'):await readPost(String(post.url),url,signal);}catch(error){if(error instanceof InstagramPostRouteError&&!signal.aborted){await night.postResult(activePost,'skipped',null,'unsupported_post_route');await store.log(job,`Post route skipped: post=${activePost}; unsupported_post_route`);activePost=undefined;continue;}throw error;}consecutiveProfileTransportErrors=0;
          await active();
          await night.postResult(activePost,evidence?'done':'skipped',evidence?JSON.stringify(evidence):null,evidence?null:'Creator caption unavailable or attribution unconfirmed');
          activePost=undefined;
        }
        await finalize(id,url,profile);
        await store.log(job,'Night candidate checkpoint committed: '+url);
      } catch(error) {
        if(error instanceof RequestSkipped){if(activePost)await night.postResult(activePost,'skipped',null,error.message);if(profile)await finalize(id,url,profile,error.message+'; available profile saved');else await night.skip(id,error.message);continue;}
        if(error instanceof EnrichmentLimit){await store.log(job,'Enrichment budget exhausted: remaining improvements deferred; discovery continues');reviewDeferred=true;if(profile)await finalize(id,url,profile,'enrichment_budget_deferred');else await night.skip(id,'enrichment_budget_deferred');continue;}
        if(error instanceof InstagramProfileReadError&&!signal.aborted){
          await quarantine.add('profile',url,'layout_unreadable',now());await night.skip(id,'profile_layout_unreadable');
          await store.log(job,'Profile layout skipped without retry: '+url);
          if(++consecutiveProfileLayoutErrors>=3)throw new NightLimit('consecutive_profile_layout_errors',false);
          continue;
        }
        if(error instanceof InstagramStop) {
          pauseInstagram(error.message,error.restriction);if(error.restriction)await logRestriction(store,job,error.restriction);
          if(activePost) await night.postResult(activePost,'blocked',null,error.reason);
          if(profile) await finalize(id,url,profile,'post_access_blocked; base profile saved');
        } else if(!signal.aborted&&isTransientTransportError(error)){
          if(activePost){const failed=(await night.posts(id)).find(p=>Number(p.id)===activePost);if(failed)await quarantine.add('post',String(failed.url),'network_error',now());await night.postResult(activePost,'skipped',null,'network_error_no_retry');}else if(!profile)await quarantine.add('profile',url,'network_error',now());
          if(profile)await finalize(id,url,profile,'caption_network_error; available evidence saved');
          else await night.skip(id,'profile_network_error_no_retry');
          await store.log(job,`Transport error isolated without retry: ${url}; ${profile?'available profile saved':'profile skipped'}`);
          if(++consecutiveProfileTransportErrors>=3)throw new NightLimit('consecutive_transport_errors',false);
          continue;
        } else if(error instanceof NightLimit&&profile) {
          await finalize(id,url,profile,error.code+'; base profile saved');
        } else if(error instanceof Error&&error.message==='Record suppressed') {
          await night.skip(id,'suppressed'); continue;
        }
        throw error;
      }
    }
  } catch(error) {
    if(await store.isCancelled(job)) { await night.stop(job,'cancelled','cancelled_by_user'); return; }
    if(signal.aborted&&signal.reason instanceof WorkerInterrupted) { await night.stop(job,'queued','worker_interrupted'); return; }
    if(error instanceof NightLimit||error instanceof DiscoveryLimit) { await night.stop(job,error.terminal?'completed':'paused',error.code); return; }
    const reason=error instanceof InstagramStop?error.message:error instanceof Error?error.message.split('\n')[0]:'Unknown research error';
    await night.stop(job,'paused',reason);
    if(error instanceof InstagramStop&&error.restriction)await logRestriction(store,job,error.restriction);
    await store.log(job,'Night run paused: '+reason);
  }finally{await activity?.stop();if(config.discovery?.scopeKey)await new DiscoveryFrontier(store).syncJob(job);}
}

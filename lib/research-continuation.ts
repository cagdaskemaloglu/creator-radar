import type {CreatorStore} from './db';
import {NightStore} from './night-store';
import {enqueue} from './job-input';
import {readResearchState} from './instagram-state-read';
import {first,all} from './storage/driver';
export async function carryResearchPool(job:number,store:CreatorStore,pages?:number){
 if(readResearchState().paused)throw Error('Kaynak erişimi duraklatılmış; havuz taşıma bu kilidi kaldırmaz.');
 if(await first(store.database,"SELECT id FROM ingestion_jobs WHERE kind='instagram_night' AND status IN ('queued','running') LIMIT 1"))throw Error('Önce çalışan araştırmayı bitir veya durdur.');
 const night=new NightStore(store),run=await night.run(job),settings=run.settings;
 const state=await first(store.database,'SELECT status FROM ingestion_jobs WHERE id=$1',[job]);if(!['paused','completed','cancelled'].includes(String(state?.status)))throw Error('Bu turun havuzu henüz taşınamaz.');
 const pending=await first(store.database,"SELECT (SELECT count(*) FROM research_candidates WHERE job_id=$1 AND status IN ('pending','visiting'))+(SELECT count(*) FROM discovery_results d JOIN discovery_queries q ON q.id=d.query_id WHERE q.job_id=$1 AND d.status IN ('pending','visiting'))+(SELECT count(*) FROM discovery_queries WHERE job_id=$1 AND status='pending') AS n",[job]);if(!Number(pending?.n))throw Error('Taşınacak bekleyen iş bulunamadı.');
 // Validate before changing the old run. All copied permission/target settings stay intact.
 const {jobSchema}=await import('./job-input');const newPages=pages??settings.maxPages;
 const pendingUrls=new Set((await all(store.database,"SELECT url FROM research_candidates WHERE job_id=$1 AND status IN ('pending','visiting')",[job])).map(r=>String(r.url)));
 const input=jobSchema.parse({kind:'instagram_night',source:'dashboard-autonomous',poolSourceJob:job,content:'',permission:settings.permission,target:settings.target,efficientResearch:settings.efficientResearch,selectiveReview:settings.selectiveReview,enrichmentUrls:settings.enrichmentUrls?.filter(u=>pendingUrls.has(u)),enrichmentMaxPages:Math.min(newPages,settings.enrichmentMaxPages??0),discoveryEnabled:settings.discovery?.enabled??false,discoveryTopics:settings.discovery?.topics??[],discoveryKeywords:settings.discovery?.keywords??[],discoveryPriorityKeywords:settings.discovery?.priorityKeywords??[],discoveryFairBudget:settings.discovery?.fairBudget??false,discoveryScopeKey:settings.discovery?.scopeKey,discoveryProviders:settings.discovery?.providers??['google'],discoveryMaxQueries:settings.discovery?.maxQueries??4,discoveryResultsPerQuery:settings.discovery?.resultsPerQuery??10,limit:settings.maxProfiles,nightMaxPages:newPages,nightMaxPosts:settings.maxPosts,nightMaxDepth:settings.maxDepth,nightHours:settings.hours});
 return store.enqueuePoolContinuation(job,JSON.stringify(input),Date.now()>=Date.parse(String(run.started_at))+settings.hours*3600000?'time_limit':'pool_transferred');
}

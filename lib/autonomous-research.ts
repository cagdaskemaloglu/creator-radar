import {improvementQueue} from './research-operations';
import {DiscoveryFrontier,discoveryScope} from './discovery-frontier';
import {relatedDiscoveryKeywords} from './discovery-expansion';
import {localizedDiscoveryKeywords} from './localized-discovery';
import {countries,pageOptions} from './taxonomy';
import { z } from 'zod';
import { discoveryTopics } from './discovery-plan';
import { researchLimits } from './instagram-policy';
import { readResearchState } from './instagram-state-read';
import { enqueue } from './job-input';
import type { CreatorStore } from './db';
import { all,first,jsonObject,safeId } from './storage/driver';

export const researchAreas=Object.keys(discoveryTopics);
const inputSchema=z.object({enrichmentShare:z.number().refine(n=>[0,25,50,100].includes(n)).default(0),topics:z.array(z.string().refine(s=>researchAreas.includes(s),'Araştırma alanı geçersiz')).min(1,'En az bir araştırma alanı seç.').max(5).default(['Cozy Room']),pages:z.number().int().refine(n=>[...pageOptions,56].includes(n),'Sayfa bütçesi geçersiz').default(56),country:z.string().refine(c=>!c||Boolean(countries[c])).optional(),city:z.string().trim().max(80).optional(),gender:z.enum(['female','male']).optional()});
export function autonomousPlan(input:unknown){
 const {topics,pages,country,city,gender,enrichmentShare}=inputSchema.parse(input);
 const groups=topics.map(topic=>topic==='Cozy Room'?['cozyroom','cozysetup','roomdecor','homedecor','bedroomdecor','roominspiration']:topic==='Desk Setup'?['desksetup','battlestation','workspacesetup','monitorsetup','keyboardsetup']:discoveryTopics[topic]);
 const balanced:string[]=[];for(let i=0;i<6;i++)for(const group of groups)if(group[i])balanced.push(group[i]);
 const base=[...new Set(balanced)];
 // Country is a validation target, never an automatically suffixed hashtag.
 const local=localizedDiscoveryKeywords(topics,country);
 const keywords=[...new Set([...local,...base])].slice(0,Math.min(12,Math.max(1,Math.floor(pages/4))));
 const priorityKeywords=keywords.filter(k=>local.includes(k));
 return{enrichmentShare,topics,keywords,priorityKeywords,allKeywords:[...new Set([...local,...base,...relatedDiscoveryKeywords([...local,...base])])],queries:keywords.length,results:20,profiles:Math.min(z.coerce.number().int().min(1).max(500).parse(process.env.MAX_RECORDS??100),200,pages),pages,posts:1,hours:Math.min(12,Math.max(2,pages/60+1)),target:{country:country||undefined,city:city||undefined,gender}};
}
export async function startAutonomousResearch(input:unknown,store:CreatorStore,continuousGeneration?:number){
 const plan=autonomousPlan(input);
 const existing=await first(store.database,"SELECT id FROM ingestion_jobs WHERE kind='instagram_night' AND status IN ('queued','running') ORDER BY id DESC LIMIT 1");
 if(existing)return{id:safeId(existing.id),reused:true,continued:false};
 if(process.env.INSTAGRAM_BROWSER_ENABLED==='false')throw new Error('Instagram araştırması yapılandırmada kapalı.');
 const state=readResearchState();if(state.paused)throw new Error('Instagram araştırması duraklatılmış. Oturum bölümünden erişim durumunu kontrol et.');
 const daily=researchLimits().dailyPages,remaining=daily===null?plan.pages:daily-state.visits;
 if(remaining<3)throw new Error('Günlük ziyaret bütçesi yeni bir araştırma için yeterli değil. Bütçe 03:00’te yenilenir.');
 const improvements=plan.enrichmentShare?await improvementQueue(store,plan.topics,plan.target):[];
 const enrichmentMaxPages=Math.floor(Math.min(plan.pages,remaining)*plan.enrichmentShare/100),enrichmentUrls=improvements.slice(0,Math.min(200,enrichmentMaxPages)).map(c=>c.url);
 if(plan.enrichmentShare===100&&!enrichmentUrls.length)throw Error('Seçilen hedefte iyileştirilecek veya yeniden denenmeye hazır hesap bulunamadı.');
 const frontier=new DiscoveryFrontier(store),scope=discoveryScope(plan.topics,plan.target);
 const locale=new Set(localizedDiscoveryKeywords(plan.topics,plan.target.country));
 const localeRelated=new Set(relatedDiscoveryKeywords([...locale]));
 await frontier.seed(scope,plan.allKeywords.map(keyword=>({keyword:keyword.replace(/[ .-]+/g,''),origin:'curated',priority:locale.has(keyword)||localeRelated.has(keyword)?2:0,evidence:[]})));
 await frontier.reconcileCurated(scope,plan.allKeywords);
 await frontier.learn(scope,plan.topics,plan.target);
 const next=await frontier.pick(scope,plan.queries);
 if(next.length){plan.keywords=next.map(q=>String(q.keyword));plan.priorityKeywords=next.filter(q=>Number(q.priority)>0).map(q=>String(q.keyword));plan.queries=next.length;}

 let poolSourceJob:number|undefined;
 // Consume the existing queue automatically, but only when its research area matches.
 const sources=await all(store.database,"SELECT r.job_id,r.settings FROM research_runs r JOIN ingestion_jobs j ON j.id=r.job_id WHERE j.status IN ('completed','cancelled') ORDER BY r.job_id DESC LIMIT 20");
 for(const row of sources){
  const settings=jsonObject(row.settings) as {discovery?:{providers?:string[];keywords?:string[];priorityKeywords?:string[];scopeKey?:string};target?:unknown};
  const discovery=settings.discovery;
  if(discovery?.scopeKey?discovery.scopeKey!==scope:(!discovery?.keywords?.every(k=>plan.allKeywords.includes(k))||(plan.priorityKeywords.length&&JSON.stringify(discovery?.priorityKeywords??[])!==JSON.stringify(plan.priorityKeywords))))continue;
  if(JSON.stringify(settings.target??{})!==JSON.stringify(plan.target))continue;
  if(!discovery?.providers?.includes('instagram_tags')||!discovery.keywords?.length)continue;
  const pending=await first(store.database,"SELECT (SELECT count(*) FROM research_candidates WHERE job_id=$1 AND status IN ('pending','visiting'))+(SELECT count(*) FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 AND r.status IN ('pending','visiting')) AS n",[safeId(row.job_id)]);
  if(Number(pending?.n)>0){poolSourceJob=safeId(row.job_id);break;}
 }
 if(!next.length&&!poolSourceJob&&!enrichmentUrls.length)throw new Error('Bu alanın sorguları dinleniyor. Bekleme süresi dolduğunda tekrar başlatabilirsin.');
 const id=await enqueue({continuousGeneration,kind:'instagram_night',source:'dashboard-autonomous',permission:'Operator requested automatic public creator discovery and classification from selected topics',content:'',efficientResearch:true,selectiveReview:true,enrichmentUrls,enrichmentMaxPages,target:plan.target,poolSourceJob:plan.enrichmentShare===100?undefined:poolSourceJob,discoveryScopeKey:scope,discoveryEnabled:plan.enrichmentShare!==100,discoveryTopics:plan.topics,discoveryKeywords:plan.keywords,discoveryPriorityKeywords:plan.priorityKeywords,discoveryFairBudget:true,discoveryProviders:['instagram_tags'],discoveryMaxQueries:plan.queries,discoveryResultsPerQuery:plan.results,limit:plan.profiles,nightMaxPages:Math.min(plan.pages,remaining),nightMaxPosts:plan.posts,nightMaxDepth:0,nightHours:plan.hours},store);
 await store.log(id,`Research allocation: enrichment=${enrichmentMaxPages}; discovery=${Math.min(plan.pages,remaining)-enrichmentMaxPages}; queued=${enrichmentUrls.length}`);
 const summary=await frontier.summary(scope);await store.log(id,`Discovery frontier: total=${summary.total}; untried=${summary.untried}; learned=${summary.learned}; cooling=${summary.cooling}`);
 await store.log(id,`Research target: ${JSON.stringify(plan.target)}; requested pages: ${plan.pages}; effective pages: ${Math.min(plan.pages,remaining)}`);
 await store.log(id,poolSourceJob?`Automatic research: existing pool continued from #${poolSourceJob}; no profile list requested`:`Automatic research: topic-based pool creation; no profile list requested`);
 return{id,reused:false,continued:Boolean(poolSourceJob)};
}

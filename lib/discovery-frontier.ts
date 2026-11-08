import {createHash} from 'node:crypto';
import type {CreatorStore} from './db';
import {all,first,jsonObject,safeId} from './storage/driver';
import {buildDiscoveryPlan,discoveryQueryKey,type DiscoverySettings} from './discovery-plan';
import {DiscoveryStore} from './discovery-store';
import {profileContext,targetMatch} from './profile-context';
import {classify,profileSchema} from './model';
import {taxonomy,type ResearchTarget} from './taxonomy';
export function discoveryScope(topics:string[],target:ResearchTarget){return createHash('sha256').update(JSON.stringify({topics:[...new Set(topics)].sort(),country:target.country??'',city:(target.city??'').trim().toLocaleLowerCase('tr-TR'),gender:target.gender??''})).digest('hex');}
const blocked=/^(?:fyp|foryou|foryoupage|viral|explore|keşfet|kesfet|reels|reelsinstagram|instagram|instagood|follow|followme|like|likeforlike|love|trending|ad|advertisement|reklam|işbirliği|isbirligi|sponsor|çekiliş|cekilis)$/iu;
export type FrontierTerm={keyword:string;origin:'curated'|'observed';priority:number;evidence:{profile:string;post:string}[]};
type RankedTerm={id:number;provider:string;keyword:string;query_url:string;origin:string;priority:number;eligible:boolean;fresh:boolean;available:boolean;score:number};
export class DiscoveryFrontier{
 constructor(readonly store:CreatorStore){}
 async seed(scope:string,terms:FrontierTerm[]){
  await this.store.database.transaction(async tx=>{
   for(const term of terms){
    const keyword=term.keyword.replace(/^#/,'').toLocaleLowerCase('tr-TR');if(!/^[\p{L}\p{N}_]{2,50}$/u.test(keyword)||blocked.test(keyword))continue;
    const plan=buildDiscoveryPlan({enabled:true,topics:[],keywords:[keyword],providers:['instagram_tags'],maxQueries:1,resultsPerQuery:20});if(!plan.length)continue;
    const q=plan[0],key=discoveryQueryKey(q.provider,q.keyword).slice('instagram_tags:'.length),now=new Date().toISOString();
    await tx.query("INSERT INTO discovery_frontier(scope_key,provider,keyword,query_url,origin,priority,evidence,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(scope_key,provider,keyword) DO UPDATE SET evidence=excluded.evidence,priority=excluded.priority,updated_at=excluded.updated_at WHERE discovery_frontier.origin='observed' AND excluded.origin='observed'",[scope,q.provider,key,q.url,term.origin,term.priority,JSON.stringify({eligible:true,sources:term.evidence.slice(0,5)}),now,now]);
   }
  });
 }
 async reconcileCurated(scope:string,keywords:string[]){
  const allowed=new Set(keywords.map(k=>discoveryQueryKey('instagram_tags',k).split(':')[1]));
  for(const row of await all(this.store.database,"SELECT id,keyword,evidence FROM discovery_frontier WHERE scope_key=$1 AND origin='curated'",[scope])){const evidence=jsonObject(row.evidence),eligible=allowed.has(String(row.keyword));if((evidence.eligible!==false)!==eligible)await this.store.database.query('UPDATE discovery_frontier SET evidence=$1,updated_at=$2 WHERE id=$3',[JSON.stringify({...evidence,eligible,reason:eligible?undefined:'curated_term_removed'}),new Date().toISOString(),safeId(row.id)]);}
 }
 async learn(scope:string,topics:string[],target:ResearchTarget){
  const categories=new Set(topics.flatMap(t=>taxonomy.find(g=>g.name===t)?.children.map(c=>c.id)??[t]));
  const candidates=new Map<string,Map<string,{profile:string;post:string}>>();
  // Only already collected, author-attributed captions from relevant profiles.
  // Two independent creators must support a term; comments and search snippets never qualify.
  for(const row of await all(this.store.database,'SELECT payload FROM creators')){
   const profile=profileSchema.parse(jsonObject(row.payload)),c=classify({...profile,research_topics:topics,research_target:target}),context=profileContext(profile);
   if(profile.synthetic||c.category_match!=='matched'||!c.categories.some(category=>categories.has(category))||(target.country&&context.country!==target.country)||(target.city&&context.city?.toLocaleLowerCase('tr-TR')!==target.city.toLocaleLowerCase('tr-TR'))||(target.gender&&context.gender!==target.gender))continue;
   for(const post of profile.content_evidence??[])for(const raw of post.hashtags){
    const keyword=raw.replace(/^#/,'').toLocaleLowerCase('tr-TR');if(!/^[\p{L}\p{N}_]{2,50}$/u.test(keyword)||blocked.test(keyword))continue;
    const probe=classify(profileSchema.parse({username:'keyword_probe',biography:keyword}));if(probe.primary_niche&&!probe.categories.some(category=>categories.has(category)))continue;
    const key=discoveryQueryKey('instagram_tags',keyword).slice('instagram_tags:'.length);
    const sources=candidates.get(key)??new Map();sources.set(profile.username,{profile:`https://www.instagram.com/${profile.username}/`,post:post.url});candidates.set(key,sources);
   }
  }
  const terms=[...candidates].filter(([,sources])=>sources.size>=2).sort((a,b)=>b[1].size-a[1].size||a[0].localeCompare(b[0])).slice(0,100).map(([keyword,sources])=>({keyword,origin:'observed' as const,priority:target.country==='TR'?1:0,evidence:[...sources.values()]}));
  const supported=new Set(terms.map(t=>t.keyword));for(const row of await all(this.store.database,"SELECT id,keyword,evidence FROM discovery_frontier WHERE scope_key=$1 AND origin='observed'",[scope])){if(!supported.has(String(row.keyword))){const evidence=jsonObject(row.evidence);await this.store.database.query('UPDATE discovery_frontier SET evidence=$1,updated_at=$2 WHERE id=$3',[JSON.stringify({...evidence,eligible:false,reason:'current_category_or_target_evidence_insufficient'}),new Date().toISOString(),safeId(row.id)]);}}
  await this.seed(scope,terms);return terms.length;
 }
 async syncJob(job:number){
  const r=await first(this.store.database,'SELECT settings,started_at FROM research_runs WHERE job_id=$1',[job]);if(!r)return;
  const config=jsonObject(r.settings) as {discovery?:DiscoverySettings;target?:ResearchTarget};const scope=config.discovery?.scopeKey;if(!scope)return;
  const repo=new DiscoveryStore(this.store),costs=await repo.queryPageCosts(job);
  for(const q of await repo.queries(job)){
   if(!['done','skipped'].includes(String(q.status))||Number(q.attempts)===0)continue;
   // A carried query retains its source timestamps and attempts. Do not count
   // those old visits a second time in the new run's frontier measurements.
   if(!q.requested_at||Date.parse(String(q.requested_at))<Date.parse(String(r.started_at)))continue;
   const term=await first(this.store.database,'SELECT id FROM discovery_frontier WHERE scope_key=$1 AND provider=$2 AND keyword=$3',[scope,String(q.provider),discoveryQueryKey(String(q.provider),String(q.keyword)).split(':')[1]]);if(!term)continue;
   const rows=await all(this.store.database,"SELECT DISTINCT c.id,c.outcome,c.payload,c.profile_data FROM (SELECT r.profile_url FROM discovery_results r WHERE r.query_id=$1 AND r.profile_url IS NOT NULL) r JOIN (SELECT rc.id,rc.url,rc.outcome,rc.profile_data,cr.payload FROM research_candidates rc JOIN creators cr ON cr.profile_url=rc.url WHERE rc.job_id=$2 AND rc.status='done') c ON c.url=r.profile_url",[safeId(q.id),job]);
   const inserted=rows.filter(r=>r.outcome==='inserted');let matched=0;
   for(const row of inserted){const profile=profileSchema.parse(jsonObject(row.profile_data??row.payload));const captions=await all(this.store.database,"SELECT evidence FROM research_posts WHERE candidate_id=$1 AND status='done' AND evidence IS NOT NULL",[safeId(row.id)]);const posts=[...(profile.content_evidence??[]),...captions.map(p=>jsonObject(p.evidence) as import('./instagram-post').PostEvidence)].filter((p,i,all)=>all.findIndex(e=>e.url===p.url)===i).slice(0,6);const c=classify({...profile,content_evidence:posts,research_topics:config.discovery?.topics??[],research_target:config.target});if(c.primary_niche&&['matched','estimated','not_requested'].includes(c.research_match))matched++;}
   await this.store.database.query('INSERT INTO discovery_observations(query_id,frontier_id,pages,new_profiles,matched_profiles,observed_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(query_id) DO UPDATE SET pages=excluded.pages,new_profiles=excluded.new_profiles,matched_profiles=excluded.matched_profiles',[safeId(q.id),safeId(term.id),costs.get(safeId(q.id))??0,inserted.length,matched,String(q.completed_at)]);
  }
 }
 async ranked(scope:string,now=Date.now()){
  const rows=await all(this.store.database,`SELECT f.*,COALESCE(SUM(o.pages),0) AS pages,COALESCE(SUM(o.new_profiles),0) AS new_profiles,COALESCE(SUM(o.matched_profiles),0) AS matched_profiles,MAX(o.observed_at) AS last_scan FROM discovery_frontier f LEFT JOIN discovery_observations o ON o.frontier_id=f.id WHERE f.scope_key=$1 GROUP BY f.id ORDER BY f.id`,[scope]);
  return rows.map((r):RankedTerm=>{const eligible=jsonObject(r.evidence).eligible!==false,pages=Number(r.pages),fresh=!r.last_scan,last=r.last_scan?Date.parse(String(r.last_scan)):0,cooldown=Number(r.new_profiles)===0?6*3600000:3600000;return{id:safeId(r.id),provider:String(r.provider),keyword:String(r.keyword),query_url:String(r.query_url),origin:String(r.origin),priority:Number(r.priority),eligible,fresh,available:eligible&&(fresh||now-last>=cooldown),score:(Number(r.matched_profiles)*3+Math.min(Number(r.new_profiles),Number(r.matched_profiles)+1)+1)/(pages+3)};}).sort((a,b)=>Number(b.priority)-Number(a.priority)||b.score-a.score||safeId(a.id)-safeId(b.id));
 }
 async pick(scope:string,count:number,excluded:string[]=[],now=Date.now(),observedAllowance=Math.floor(count/5)){
  const skip=new Set(excluded.map(k=>discoveryQueryKey('instagram_tags',k))),rows=(await this.ranked(scope,now)).filter(r=>r.available&&!skip.has(discoveryQueryKey(String(r.provider),String(r.keyword))));
  const result:typeof rows=[];let observed=0;
  while(rows.length&&result.length<count){
   const allowed=rows.filter(r=>r.origin!=='observed'||observed<observedAllowance);if(!allowed.length)break;
   // Reserve a global exploration slot, across locality tiers. Otherwise a long
   // Turkish curated list can permanently starve every learned term.
   const explore=(result.length+1)%5===0||(count<5&&result.length===count-1);
   const selected=explore?(allowed.find(r=>r.fresh&&r.origin==='observed')??allowed.find(r=>r.fresh)??allowed[0]):allowed[0];
   result.push(selected);if(selected.origin==='observed')observed++;rows.splice(rows.indexOf(selected),1);
  }return result;
 }
 async summary(scope:string){const rows=await this.ranked(scope);return{total:rows.length,untried:rows.filter(r=>r.eligible&&r.fresh).length,cooling:rows.filter(r=>r.eligible&&!r.available).length,learned:rows.filter(r=>r.origin==='observed').length,withheld_learned:rows.filter(r=>r.origin==='observed'&&!r.eligible).length,untried_learned:rows.filter(r=>r.origin==='observed'&&r.eligible&&r.fresh).length,tried_learned:rows.filter(r=>r.origin==='observed'&&!r.fresh).length};}
}

import {instagramPostAliases} from './instagram-post-policy';
import {profileSchema} from './model';
import {cachedClassification as classify} from './classification-cache';
import type { CreatorStore } from './db';
import type { PostEvidence } from './instagram-post';
import { all,first,safeId,jsonObject,type Row,type Executor } from './storage/driver';
import {discoveryQueryKey,type DiscoveryLink,type DiscoveryQuery } from './discovery-plan';
export type KeywordPerformance={provider:string;keyword:string;searches:number;postVisits:number;profileVisits:number;newProfiles:number;matchedProfiles:number;pages:number;newPerPage:number;score:number};
export class DiscoveryStore{
 constructor(readonly store:CreatorStore){}
 async initialize(job:number,queries:DiscoveryQuery[]){await this.store.database.transaction(async tx=>{for(const q of queries)await tx.query('INSERT INTO discovery_queries(job_id,provider,keyword,query_url) VALUES($1,$2,$3,$4) ON CONFLICT(job_id,provider,keyword) DO NOTHING',[job,q.provider,q.keyword,q.url]);});}
 queries(job:number){return all(this.store.database,'SELECT * FROM discovery_queries WHERE job_id=$1 ORDER BY id',[job]);}
 async reserve(job:number,query:number,result?:number){await this.store.database.transaction(async tx=>{await tx.query('UPDATE research_runs SET page_requests=page_requests+1 WHERE job_id=$1',[job]);if(result)await tx.query("UPDATE discovery_results SET status='visiting',attempts=attempts+1 WHERE id=$1",[result]);else await tx.query("UPDATE discovery_queries SET status='visiting',attempts=attempts+1,requested_at=$1,error=NULL WHERE id=$2",[new Date().toISOString(),query]);});}
 private async candidate(tx:Executor,job:number,url:string){
  const username=new URL(url).pathname.split('/')[1];
  if(await first(tx,'SELECT 1 FROM suppressions WHERE username=$1',[username]))return 'suppressed';
  if(!await first(tx,'SELECT 1 FROM research_candidates WHERE job_id=$1 AND url=$2',[job,url])){
   const n=await first(tx,'SELECT count(*) AS n FROM research_candidates WHERE job_id=$1',[job]);if(Number(n?.n)>=200)return 'candidate_pool_limit';
  }
  const now=new Date().toISOString();await tx.query('INSERT INTO research_candidates(job_id,url,depth,created_at,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,url) DO NOTHING',[job,url,0,now,now]);return null;
 }
 private async insertResults(tx:Executor,job:number,query:number,links:DiscoveryLink[]){
  for(const link of links){const reason=link.kind==='profile'?await this.candidate(tx,job,link.url):null;
   await tx.query('INSERT INTO discovery_results(query_id,source_url,kind,title,status,profile_url,reason,discovered_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(query_id,source_url) DO NOTHING',[query,link.url,link.kind,link.title,link.kind==='profile'?(reason?'rejected':'accepted'):'pending',link.kind==='profile'?link.url:null,reason,new Date().toISOString()]);
  }
  await tx.query('UPDATE discovery_queries SET result_count=(SELECT count(*) FROM discovery_results WHERE query_id=$1) WHERE id=$1',[query]);
 }
 async appendResults(job:number,query:number,links:DiscoveryLink[]){await this.store.database.transaction(tx=>this.insertResults(tx,job,query,links));}
 async complete(job:number,query:number,links:DiscoveryLink[],outcome:string|null=null){await this.store.database.transaction(async tx=>{await this.insertResults(tx,job,query,links);await tx.query("UPDATE discovery_queries SET status='done',completed_at=$1,error=$3 WHERE id=$2",[new Date().toISOString(),query,outcome]);});}
 async reserveScroll(job:number,query:number){await this.store.database.transaction(async tx=>{await tx.query('UPDATE research_runs SET page_requests=page_requests+1 WHERE job_id=$1',[job]);await tx.query('INSERT INTO logs(job_id,message,created_at) VALUES($1,$2,$3)',[job,`Tag scroll reserved: query=${query}`,new Date().toISOString()]);});}
 async knownCollectionUrls(job:number,now:number){
  const rows=await all(this.store.database,`SELECT DISTINCT r.source_url FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id JOIN ingestion_jobs j ON j.id=q.job_id LEFT JOIN creators c ON c.profile_url=r.profile_url WHERE q.job_id=$1 OR (j.status IN ('completed','cancelled') AND r.discovered_at>=$2 AND ((r.status='rejected' AND r.reason IN ('owner_link_missing','multiple_owner_candidates','post_identity_mismatch')) OR (r.status='accepted' AND c.updated_at>=$2) OR (r.status='skipped' AND r.reason IN ('recently_researched','recent_author_unavailable'))))`,[job,new Date(now-4*3600000).toISOString()]);
  return [...new Set(rows.flatMap(r=>{try{return instagramPostAliases(String(r.source_url));}catch{return[String(r.source_url)];}}))];
 }
 async pendingPosts(job:number){return all(this.store.database,"SELECT r.*,q.job_id FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 AND r.kind='post' AND r.status='pending' ORDER BY r.id",[job]);}
 async recentProfile(url:string,now:number){
  const row=await first(this.store.database,'SELECT updated_at FROM creators WHERE profile_url=$1',[url]);
  return Boolean(row&&Date.parse(String(row.updated_at))>=now-4*3600000&&Date.parse(String(row.updated_at))<=now+60000);
 }
 async knownProfile(url:string){return Boolean(await first(this.store.database,'SELECT 1 FROM creators WHERE profile_url=$1',[url]));}
 async pendingWorkCount(job:number){
  const row=await first(this.store.database,"SELECT (SELECT count(*) FROM discovery_queries WHERE job_id=$1 AND status='pending')+(SELECT count(*) FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 AND r.status='pending') AS n",[job]);
  return Number(row?.n);
 }
 async hasPending(job:number){return await this.pendingWorkCount(job)>0;}
 async postYield(job:number){return all(this.store.database,"SELECT r.query_id,SUM(r.attempts) AS visits,SUM(CASE WHEN r.status='accepted' AND r.profile_url IS NOT NULL THEN 1 ELSE 0 END) AS owners FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 GROUP BY r.query_id",[job]);}
 async prioritizedPosts(job:number){
  const yields=await this.postYield(job),rows=await this.pendingPosts(job);
  const score=(id:unknown)=>{const row=yields.find(y=>y.query_id===id);return(Number(row?.owners??0)+1)/(Number(row?.visits??0)+2);};
  return rows.sort((a,b)=>score(b.query_id)-score(a.query_id)||safeId(a.id)-safeId(b.id));
 }
 async cachedAuthor(job:number,url:string,history=false,now=Date.now()){
  const [a,b]=instagramPostAliases(url);
  const row=await first(this.store.database,history?"SELECT r.profile_url,r.status FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id JOIN ingestion_jobs j ON j.id=q.job_id WHERE r.source_url IN ($2,$3) AND ((q.job_id=$1 AND r.status IN ('accepted','rejected')) OR (j.status IN ('completed','cancelled') AND r.status='accepted' AND r.discovered_at>=$4)) ORDER BY CASE WHEN r.status='accepted' THEN 0 ELSE 1 END,r.id DESC LIMIT 1":"SELECT r.profile_url,r.status FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 AND r.source_url IN ($2,$3) AND r.status IN ('accepted','rejected') ORDER BY CASE WHEN r.status='accepted' THEN 0 ELSE 1 END,r.id LIMIT 1",history?[job,a,b,new Date(now-4*3600000).toISOString()]:[job,a,b]);
  if(!row)return;
  const post=row.profile_url?await first(this.store.database,"SELECT p.evidence FROM research_posts p JOIN research_candidates c ON c.id=p.candidate_id WHERE p.url IN ($1,$2) AND c.url=$3 AND p.status='done' ORDER BY p.id DESC LIMIT 1",[a,b,String(row.profile_url)]):undefined;
  return{...row,profile_url:row.profile_url?String(row.profile_url):null,evidence:post?.evidence?jsonObject(post.evidence) as unknown as PostEvidence:null};
 }
 async knownPostOwner(url:string){
  const [a,b]=instagramPostAliases(url);
  const row=await first(this.store.database,"SELECT r.profile_url FROM discovery_results r JOIN creators c ON c.profile_url=r.profile_url WHERE r.source_url IN ($1,$2) AND r.status IN ('accepted','skipped') AND r.profile_url IS NOT NULL ORDER BY r.id DESC LIMIT 1",[a,b]);
  return row?String(row.profile_url):null;
 }
 async targetYield(job:number){
  const run=await first(this.store.database,'SELECT settings FROM research_runs WHERE job_id=$1',[job]);const config=run?jsonObject(run.settings) as {target?:import('./taxonomy').ResearchTarget;discovery?:{topics?:string[]}}:{};
  const rows=await all(this.store.database,"SELECT DISTINCT r.query_id,c.id,c.profile_data,cr.payload FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id JOIN research_candidates c ON c.job_id=q.job_id AND c.url=r.profile_url JOIN creators cr ON cr.profile_url=c.url WHERE q.job_id=$1 AND c.status='done' AND c.outcome='inserted'",[job]),result=new Map<number,{saved:number;qualified:number}>();
  for(const row of rows){const id=safeId(row.query_id),value=result.get(id)??{saved:0,qualified:0},p=profileSchema.parse(jsonObject(row.payload??row.profile_data)),c=classify({...p,research_topics:config.discovery?.topics??[],research_target:config.target});value.saved++;if(c.primary_niche&&['matched','estimated','not_requested'].includes(c.research_match))value.qualified++;result.set(id,value);}return result;
 }
 async queryPageCosts(job:number,reservePendingProfiles=false){
  const queries=await this.queries(job),costs=new Map(queries.map(q=>[safeId(q.id),Number(q.attempts)]));
  for(const r of await all(this.store.database,'SELECT r.query_id,SUM(r.attempts) AS n FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 GROUP BY r.query_id',[job]))costs.set(safeId(r.query_id),(costs.get(safeId(r.query_id))??0)+Number(r.n));
  for(const r of await all(this.store.database,'SELECT DISTINCT r.query_id,c.id,c.attempts,c.status FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id JOIN research_candidates c ON c.job_id=q.job_id AND c.url=r.profile_url WHERE q.job_id=$1',[job]))costs.set(safeId(r.query_id),(costs.get(safeId(r.query_id))??0)+(reservePendingProfiles&&r.status==='pending'?Math.max(1,Number(r.attempts)):Number(r.attempts)));
  for(const r of await all(this.store.database,"SELECT message,count(*) AS n FROM logs WHERE job_id=$1 AND message LIKE 'Tag scroll reserved: query=%' GROUP BY message",[job])){const id=Number(String(r.message).split('query=')[1]);costs.set(id,(costs.get(id)??0)+Number(r.n));}
  return costs;
 }
 async keywordPerformance():Promise<KeywordPerformance[]>{
  const rows=await all(this.store.database,`SELECT q.id,q.provider,q.keyword,q.attempts AS search_attempts,r.attempts AS post_attempts,r.kind,c.id AS candidate_id,c.attempts AS profile_attempts,c.status AS candidate_status,c.outcome,c.category
   FROM discovery_queries q LEFT JOIN discovery_results r ON r.query_id=q.id LEFT JOIN research_candidates c ON c.job_id=q.job_id AND c.url=r.profile_url
   WHERE q.id IN (SELECT q2.id FROM discovery_queries q2 JOIN ingestion_jobs j ON j.id=q2.job_id WHERE j.status IN ('completed','cancelled') AND q2.attempts>0 ORDER BY q2.id DESC LIMIT 200) ORDER BY q.id,r.id`);
  const scrollRows=await all(this.store.database,"SELECT message,count(*) AS n FROM logs WHERE message LIKE 'Tag scroll reserved: query=%' GROUP BY message");
  const scrolls=new Map(scrollRows.map(r=>[Number(String(r.message).split('query=')[1]),Number(r.n)]));
  const groups=new Map<string,{value:KeywordPerformance;queries:Set<number>;candidates:Set<number>}>();
  for(const r of rows){
    const key=discoveryQueryKey(String(r.provider),String(r.keyword));let group=groups.get(key);
    if(!group){group={value:{provider:String(r.provider),keyword:r.provider==='instagram_tags'?key.slice('instagram_tags:'.length):String(r.keyword),searches:0,postVisits:0,profileVisits:0,newProfiles:0,matchedProfiles:0,pages:0,newPerPage:0,score:0},queries:new Set(),candidates:new Set()};groups.set(key,group);}
    const v=group.value;
    if(!group.queries.has(safeId(r.id))){group.queries.add(safeId(r.id));v.searches+=Number(r.search_attempts)+(scrolls.get(safeId(r.id))??0);}
    if(r.kind==='post')v.postVisits+=Number(r.post_attempts??0);
    if(r.candidate_id&&!group.candidates.has(safeId(r.candidate_id))){group.candidates.add(safeId(r.candidate_id));v.profileVisits+=Number(r.profile_attempts??0);if(r.candidate_status==='done'&&r.outcome==='inserted'){v.newProfiles++;if(r.category)v.matchedProfiles++;}}
  }
  return [...groups.values()].map(({value:v})=>({...v,pages:v.searches+v.postVisits+v.profileVisits,newPerPage:v.newProfiles/Math.max(1,v.searches+v.postVisits+v.profileVisits),score:(v.newProfiles+1)/(v.searches+v.postVisits+v.profileVisits+4)}));
 }
 async prioritizedQueries(job:number){
  const performance=await this.keywordPerformance(),rows=await this.queries(job);
  return rows.map((r,i):Row & {order:number;yield_new:number;yield_pages:number;priority:number}=>{const p=performance.find(p=>discoveryQueryKey(p.provider,p.keyword)===discoveryQueryKey(String(r.provider),String(r.keyword)));return{...r,order:i,yield_new:p?.newProfiles??0,yield_pages:p?.pages??0,priority:p?.score??0.25};}).sort((a,b)=>b.priority-a.priority||a.order-b.order);
 }
 async recentlyResolved(job:number,url:string,now:number){
  const [a,b]=instagramPostAliases(url);
  const rows=await all(this.store.database,"SELECT r.profile_url,r.status,r.reason,r.discovered_at,c.updated_at FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id JOIN ingestion_jobs j ON j.id=q.job_id LEFT JOIN creators c ON c.profile_url=r.profile_url WHERE q.job_id<>$1 AND r.source_url IN ($2,$3) AND j.status IN ('completed','cancelled') AND (r.status='accepted' OR (r.status='rejected' AND r.reason IN ('owner_link_missing','multiple_owner_candidates','post_identity_mismatch'))) ORDER BY r.id DESC LIMIT 10",[job,a,b]);
  const cutoff=now-4*3600000;
  return rows.find(r=>new Date(String(r.discovered_at)).getTime()>=cutoff&&(r.status==='rejected'||(r.updated_at&&new Date(String(r.updated_at)).getTime()>=cutoff)));
 }
 async skipRecent(result:number,profile:string|null,reason:string){await this.store.database.query("UPDATE discovery_results SET status='skipped',profile_url=$1,reason=$2 WHERE id=$3",[profile,reason,result]);}
 async acceptAuthor(job:number,result:number,profile:string|null,evidence?:PostEvidence|null,failure='owner_link_missing'){await this.store.database.transaction(async tx=>{const reason=profile?await this.candidate(tx,job,profile):failure;await tx.query('UPDATE discovery_results SET status=$1,profile_url=$2,reason=$3 WHERE id=$4',[reason?'rejected':'accepted',profile,reason,result]);
  if(!reason&&profile&&evidence){
   const candidate=await first(tx,'SELECT id FROM research_candidates WHERE job_id=$1 AND url=$2',[job,profile]);
   if(candidate)await tx.query("INSERT INTO research_posts(candidate_id,url,status,attempts,evidence) VALUES($1,$2,'done',1,$3) ON CONFLICT(candidate_id,url) DO NOTHING",[safeId(candidate.id),evidence.url,JSON.stringify(evidence)]);
  }
 });}
 async skipQuery(query:number,reason:string){await this.store.database.query("UPDATE discovery_queries SET status='skipped',error=$1,completed_at=$2 WHERE id=$3",[reason,new Date().toISOString(),query]);}
 async consecutiveTagErrors(job:number){const rows=await all(this.store.database,"SELECT status,error FROM discovery_queries WHERE job_id=$1 AND provider='instagram_tags' AND attempts>0 ORDER BY requested_at DESC,id DESC LIMIT 3",[job]);return rows.length===3&&rows.every(r=>r.status==='skipped'&&['tag_layout_unreadable','tag_load_failed'].includes(String(r.error)));}
 async failed(query:number,message:string,blocked:boolean,result?:number){await this.store.database.query(result?'UPDATE discovery_results SET status=$1,reason=$2 WHERE id=$3':'UPDATE discovery_queries SET status=$1,error=$2 WHERE id=$3',[blocked?'blocked':'failed',message,result??query]);}
 async restore(job:number){await this.store.database.transaction(async tx=>{
  await tx.query("UPDATE discovery_queries SET status=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END,error='Interrupted search; bounded recovery' WHERE job_id=$1 AND status='visiting'",[job]);
  await tx.query("UPDATE discovery_results SET status=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END,reason='Interrupted author lookup; bounded recovery' WHERE status='visiting' AND query_id IN (SELECT id FROM discovery_queries WHERE job_id=$1)",[job]);
 });}
 async resume(job:number){await this.store.database.transaction(async tx=>{
  await tx.query("UPDATE discovery_queries SET status='pending' WHERE job_id=$1 AND status IN ('blocked','failed') AND attempts<2",[job]);
  await tx.query("UPDATE discovery_results SET status='pending' WHERE status IN ('blocked','failed') AND attempts<2 AND query_id IN (SELECT id FROM discovery_queries WHERE job_id=$1)",[job]);
 });}
 async evidence(job:number,profile:string){return all(this.store.database,"SELECT q.provider,q.keyword,q.query_url AS search_url,r.source_url AS result_url,r.discovered_at FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 AND r.profile_url=$2 AND r.status='accepted' ORDER BY r.id LIMIT 20",[job,profile]);}
 async knownEvidence(profile:string){return all(this.store.database,"SELECT q.provider,q.keyword,q.query_url AS search_url,r.source_url AS result_url,r.discovered_at FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE r.profile_url=$1 AND r.status='accepted' ORDER BY r.id DESC LIMIT 20",[profile]);}
 async report(job:number){return{queries:await this.queries(job),results:await all(this.store.database,'SELECT r.* FROM discovery_results r JOIN discovery_queries q ON q.id=r.query_id WHERE q.job_id=$1 ORDER BY r.id',[job])};}
}

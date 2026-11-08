import {continuationState} from './research-operations';
import {readResearchState} from './instagram-state-read';
import type {PostEvidence} from './instagram-post';
import {profileSchema} from './model';
import {cachedClassification as classify} from './classification-cache';
import {DiscoveryFrontier} from './discovery-frontier';
import type {ResearchTarget} from './taxonomy';
import type { DiscoverySettings } from './discovery-plan';
import { DiscoveryStore } from './discovery-store';
import type { CreatorStore } from './db';
import { all, first, jsonObject, safeId, type Row } from './storage/driver';
export type NightSettings = {enrichmentUrls?:string[];enrichmentMaxPages?:number;selectiveReview?:boolean; efficientResearch?:boolean;target?:ResearchTarget; maxProfiles: number; maxPages: number; maxPosts: number; maxDepth: number; hours: number; permission: string; seeds: string[]; discovery?:DiscoverySettings;poolSourceJob?:number };
export class NightStore {
  constructor(readonly store: CreatorStore) {}
  async initialize(job: number, settings: NightSettings) {
    const now = new Date().toISOString();
    await this.store.database.transaction(async tx => {
      if(await first(tx,'SELECT job_id FROM research_runs WHERE job_id=$1',[job]))return;
      await tx.query('INSERT INTO research_runs(job_id,settings,started_at) VALUES($1,$2,$3) ON CONFLICT(job_id) DO NOTHING', [job, JSON.stringify(settings), now]);
      for (const url of settings.seeds) await tx.query('INSERT INTO research_candidates(job_id,url,depth,created_at,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,url) DO NOTHING', [job,url,0,now,now]);
      for(const url of settings.enrichmentUrls??[]){await tx.query('INSERT INTO research_candidates(job_id,url,depth,created_at,updated_at) VALUES($1,$2,0,$3,$3) ON CONFLICT(job_id,url) DO NOTHING',[job,url,now]);const c=await first(tx,'SELECT id FROM research_candidates WHERE job_id=$1 AND url=$2',[job,url]);await tx.query("INSERT INTO candidate_work(candidate_id,work_kind) VALUES($1,'enrichment') ON CONFLICT(candidate_id) DO NOTHING",[safeId(c?.id)]);}
      if(settings.poolSourceJob){
        const source=await first(tx,"SELECT id FROM ingestion_jobs WHERE id=$1 AND kind='instagram_night' AND status IN ('completed','cancelled')"+(this.store.database.dialect==='postgres'?' FOR UPDATE':''),[settings.poolSourceJob]);
        if(!source)throw new Error('Pool continuation requires a finished or cancelled source run');
        const pending=await all(tx,"SELECT id,url,depth FROM research_candidates WHERE job_id=$1 AND status IN ('pending','visiting')",[settings.poolSourceJob]);
        for(const candidate of pending){
          const username=new URL(String(candidate.url)).pathname.split('/')[1];
          if(await first(tx,'SELECT 1 FROM suppressions WHERE username=$1',[username])){await tx.query("UPDATE research_candidates SET status='skipped',reason='suppressed' WHERE id=$1",[safeId(candidate.id)]);continue;}
          await tx.query('INSERT INTO research_candidates(job_id,url,depth,created_at,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,url) DO NOTHING',[job,String(candidate.url),Number(candidate.depth),now,now]);
          await tx.query("UPDATE research_candidates SET status='carried',reason=$1,updated_at=$2 WHERE id=$3",[`continued_in_job:${job}`,now,safeId(candidate.id)]);
        }
        for(const query of await all(tx,'SELECT * FROM discovery_queries WHERE job_id=$1 ORDER BY id',[settings.poolSourceJob])){
          const created=await first(tx,'INSERT INTO discovery_queries(job_id,provider,keyword,query_url,status,attempts,error,requested_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[job,String(query.provider),String(query.keyword),String(query.query_url),String(query.status)==='visiting'?'pending':String(query.status),Number(query.attempts),query.error as string|null,query.requested_at as string|null,query.completed_at as string|null]);
          const queryId=safeId(created?.id);
          const results=await all(tx,"SELECT r.* FROM discovery_results r WHERE r.query_id=$1 AND (r.status IN ('pending','visiting') OR (r.status='accepted' AND r.profile_url IN (SELECT url FROM research_candidates WHERE job_id=$2)))",[safeId(query.id),job]);
          for(const result of results){
            await tx.query('INSERT INTO discovery_results(query_id,source_url,kind,title,status,attempts,profile_url,reason,discovered_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[queryId,String(result.source_url),String(result.kind),String(result.title),String(result.status)==='visiting'?'pending':String(result.status),Number(result.attempts),result.profile_url as string|null,result.reason as string|null,String(result.discovered_at)]);
            await tx.query("UPDATE discovery_results SET status='carried',reason=$1 WHERE id=$2",[`continued_in_job:${job}`,safeId(result.id)]);
          }
          await tx.query('UPDATE discovery_queries SET result_count=$1 WHERE id=$2',[results.length,queryId]);
        }
        for(const candidate of await all(tx,'SELECT id,url FROM research_candidates WHERE job_id=$1',[job])){
          const oldPosts=await all(tx,"SELECT p.* FROM research_posts p JOIN research_candidates c ON c.id=p.candidate_id WHERE c.job_id=$1 AND c.url=$2 AND p.status='done'",[settings.poolSourceJob,String(candidate.url)]);
          for(const post of oldPosts)await tx.query("INSERT INTO research_posts(candidate_id,url,status,attempts,evidence) VALUES($1,$2,'done',$3,$4) ON CONFLICT(candidate_id,url) DO NOTHING",[safeId(candidate.id),String(post.url),Number(post.attempts),typeof post.evidence==='string'?post.evidence:JSON.stringify(post.evidence)]);
        }
      }
    });
  }
  async run(job: number): Promise<Row & { settings: NightSettings }> {
    const row = await first(this.store.database, 'SELECT * FROM research_runs WHERE job_id=$1', [job]);
    if (!row) throw new Error('Night run not found');
    return { ...row, settings: jsonObject(row.settings) as unknown as NightSettings };
  }
  async next(job: number) {
    return this.store.database.transaction(async tx => {
      const row = await first(tx, "SELECT * FROM research_candidates WHERE job_id=$1 AND status='pending' ORDER BY depth,id LIMIT 1" + (this.store.database.dialect === 'postgres' ? ' FOR UPDATE SKIP LOCKED' : ''), [job]);
      if (row) await tx.query("UPDATE research_candidates SET status='visiting',updated_at=$1 WHERE id=$2", [new Date().toISOString(),safeId(row.id)]);
      return row;
    });
  }
  async reserve(job: number, candidate: number, post?: number) {
    await this.store.database.transaction(async tx => {
      await tx.query('UPDATE research_runs SET page_requests=page_requests+1 WHERE job_id=$1', [job]);
      const work=await first(tx,'SELECT work_kind FROM candidate_work WHERE candidate_id=$1',[candidate]);if(work?.work_kind==='enrichment')await tx.query('INSERT INTO logs(job_id,message,created_at) VALUES($1,$2,$3)',[job,`Enrichment visit reserved: candidate=${candidate}`,new Date().toISOString()]);
      if (post){await tx.query("UPDATE research_posts SET status='visiting',attempts=attempts+1 WHERE id=$1", [post]);await tx.query('INSERT INTO logs(job_id,message,created_at) VALUES($1,$2,$3)',[job,`Caption visit reserved: post=${post}`,new Date().toISOString()]);}
      else await tx.query('UPDATE research_candidates SET attempts=attempts+1 WHERE id=$1', [candidate]);
    });
  }
  async checkpoint(candidate: number, profile: string, postUrls: string[]) {
    await this.store.database.transaction(async tx => {
      await tx.query('UPDATE research_candidates SET profile_data=$1,updated_at=$2 WHERE id=$3', [profile,new Date().toISOString(),candidate]);
      for (const url of postUrls) await tx.query('INSERT INTO research_posts(candidate_id,url) VALUES($1,$2) ON CONFLICT(candidate_id,url) DO NOTHING', [candidate,url]);
    });
  }
  async discover(job: number, urls: string[], depth: number) {
    await this.store.database.transaction(async tx => {
      for (const url of urls) {
        const count = await first(tx, 'SELECT count(*) AS n FROM research_candidates WHERE job_id=$1', [job]);
        if (Number(count?.n) >= 200) break;
        const now = new Date().toISOString();
        await tx.query('INSERT INTO research_candidates(job_id,url,depth,created_at,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,url) DO NOTHING', [job,url,depth,now,now]);
      }
    });
  }
  posts(candidate: number) { return all(this.store.database,'SELECT * FROM research_posts WHERE candidate_id=$1 ORDER BY id',[candidate]); }
  async postResult(post: number, status: 'done'|'skipped'|'blocked', evidence: string | null, reason: string | null) {
    await this.store.database.query('UPDATE research_posts SET status=$1,evidence=$2,reason=$3 WHERE id=$4',[status,evidence,reason,post]);
  }
  async skip(candidate: number, reason: string) {
    await this.store.database.query("UPDATE research_candidates SET status='skipped',reason=$1,updated_at=$2 WHERE id=$3",[reason,new Date().toISOString(),candidate]);
  }
  async restore(job: number) {
    await new DiscoveryStore(this.store).restore(job);
    await this.store.database.transaction(async tx => {
      await tx.query("UPDATE research_candidates SET status='pending' WHERE job_id=$1 AND status='visiting'",[job]);
      await tx.query("UPDATE research_posts SET status=CASE WHEN attempts>=2 THEN 'skipped' ELSE 'pending' END,reason='Interrupted request; bounded recovery' WHERE status='visiting' AND candidate_id IN (SELECT id FROM research_candidates WHERE job_id=$1)",[job]);
    });
  }
  async stop(job: number, status: 'completed'|'paused'|'queued'|'cancelled', reason: string) {
    await this.restore(job);
    await this.store.database.transaction(async tx => {
      const row=await first(tx,'SELECT cancel_requested FROM ingestion_jobs WHERE id=$1'+(this.store.database.dialect==='postgres'?' FOR UPDATE':''),[job]);
      const actualStatus=row?.cancel_requested?'cancelled':status;
      const actualReason=actualStatus==='cancelled'?'cancelled_by_user':reason;
      const now=['completed','cancelled'].includes(actualStatus)?new Date().toISOString():null;
      await tx.query('UPDATE research_runs SET stop_reason=$1,finished_at=$2 WHERE job_id=$3',[actualReason,now,job]);
      await tx.query('UPDATE ingestion_jobs SET status=$1,error=$2,completed_at=$3 WHERE id=$4',[actualStatus,['paused','queued'].includes(actualStatus)?actualReason:null,now,job]);
    });
  }

  async resume(job: number) {
    const row = await first(this.store.database,"SELECT id FROM ingestion_jobs WHERE id=$1 AND kind='instagram_night' AND status='paused'",[job]);
    if (!row) throw new Error('Only paused night runs can be resumed');
    await this.restore(job);
    await new DiscoveryStore(this.store).resume(job);
    await this.store.database.transaction(async tx=>{
      await tx.query('UPDATE research_runs SET stop_reason=NULL,finished_at=NULL WHERE job_id=$1',[job]);
      await tx.query("UPDATE ingestion_jobs SET status='queued',error=NULL,completed_at=NULL WHERE id=$1",[job]);
    });
  }
  async reports() {
    const runs = await all(this.store.database,'SELECT r.*,j.status,j.inserted,j.updated,j.created_at FROM research_runs r JOIN ingestion_jobs j ON j.id=r.job_id ORDER BY r.job_id DESC LIMIT 20');
    const result: Row[] = [];
    for (const run of runs) {
      const candidates = await all(this.store.database,'SELECT c.id,c.url,c.depth,c.status,c.attempts,c.outcome,c.category,c.fit_score,c.reason,c.profile_data,cw.work_kind,cr.payload AS saved_payload FROM research_candidates c LEFT JOIN candidate_work cw ON cw.candidate_id=c.id LEFT JOIN creators cr ON cr.profile_url=c.url WHERE c.job_id=$1 ORDER BY c.id',[safeId(run.job_id)]);
      const posts = await all(this.store.database,'SELECT p.id,p.candidate_id,p.url,p.status,p.reason,p.evidence FROM research_posts p JOIN research_candidates c ON c.id=p.candidate_id WHERE c.job_id=$1 ORDER BY p.id',[safeId(run.job_id)]);
      const discovery=await new DiscoveryStore(this.store).report(safeId(run.job_id));
      const settings=jsonObject(run.settings) as unknown as NightSettings;
      const assessed=candidates.map((c):Row & {category_match:string;research_match:string}=>{const raw=c.profile_data??c.saved_payload;const {profile_data,saved_payload,...visible}=c;if(c.status!=='done'||!raw)return{...visible,category_match:'unknown',research_match:'unknown'};const profile=profileSchema.parse(jsonObject(raw)),evidence=posts.filter(p=>p.candidate_id===c.id&&p.status==='done'&&p.evidence).map(p=>jsonObject(p.evidence) as PostEvidence);const merged=[...(profile.content_evidence??[]),...evidence].filter((p,i,all)=>all.findIndex(e=>e.url===p.url)===i).slice(0,6);const result=classify({...profile,content_evidence:merged,research_topics:settings.discovery?.topics??[],research_target:settings.target});return{...visible,category:result.primary_niche,fit_score:result.fit_score,category_match:result.category_match,research_match:result.research_match,uncertainty_reasons:result.uncertainty_reasons,coverage_gaps:result.coverage_gaps,review_assessment:profile.review_assessment??null};});
      const qualified=(c:typeof assessed[number])=>c.status==='done'&&c.category&&(c.research_match==='matched'||c.research_match==='not_requested');
      const estimated=assessed.filter(c=>c.status==='done'&&c.research_match==='estimated').length;
      const qualifiedNew=assessed.filter(c=>qualified(c)&&c.outcome==='inserted').length,estimatedNew=assessed.filter(c=>c.status==='done'&&c.research_match==='estimated'&&c.outcome==='inserted').length;
      const saved=candidates.filter(c=>c.status==='done').length,categorized=assessed.filter(c=>c.status==='done'&&c.category).length,matched=assessed.filter(qualified).length;
      const countReasons=(field:string)=>{const result:Record<string,number>={};for(const c of assessed.filter(c=>c.status==='done'))for(const reason of (c[field]??[]) as string[])result[reason]=(result[reason]??0)+1;return result;};
      const reviews=assessed.filter(c=>c.status==='done'&&c.review_assessment).map(c=>c.review_assessment as import('./research-diagnostics').ReviewAssessment);
      const diagnostics={uncertainty:countReasons('uncertainty_reasons'),coverage:countReasons('coverage_gaps'),review:{with_telemetry:reviews.length,attempted:reviews.filter(r=>r.attempts>0).length,visits:reviews.reduce((n,r)=>n+r.attempts,0),resolved:reviews.filter(r=>r.resolved).length,became_qualified:reviews.filter(r=>r.became_qualified).length,budget_deferred:reviews.filter(r=>r.status==='budget_deferred').length,no_posts:reviews.filter(r=>r.status==='no_posts').length,evidence_unavailable:reviews.filter(r=>r.status==='evidence_unavailable').length,unsupported_routes:posts.filter(p=>p.reason==='unsupported_post_route').length}};
      const elapsed=Math.max(1,(new Date(String(run.finished_at??new Date().toISOString())).getTime()-new Date(String(run.started_at)).getTime())/1000);
      const frontier=settings.discovery?.scopeKey?await new DiscoveryFrontier(this.store).summary(settings.discovery.scopeKey):null;
      const lifecycle=continuationState({status:String(run.status),started_at:String(run.started_at),settings,page_requests:Number(run.page_requests),pending:candidates.filter(c=>['pending','visiting'].includes(String(c.status))).length,unresolved_posts:discovery.results.filter(r=>['pending','visiting'].includes(String(r.status))).length,pending_queries:discovery.queries.filter(q=>q.status==='pending').length},readResearchState().paused);
      const enrichmentVisits=Number((await first(this.store.database,"SELECT count(*) AS n FROM logs WHERE job_id=$1 AND message LIKE 'Enrichment visit reserved: candidate=%'",[safeId(run.job_id)]))?.n);
      result.push({ ...run, continuation:lifecycle,allocation:{enrichment_limit:settings.enrichmentMaxPages??0,enrichment_visits:enrichmentVisits,enrichment_qualified:assessed.filter(c=>c.status==='done'&&c.work_kind==='enrichment'&&['matched','estimated'].includes(c.research_match)).length,discovery_visits:Number(run.page_requests)-enrichmentVisits}, diagnostics, frontier, discovery, settings, candidates:assessed, posts:posts.map(({evidence,...p})=>p), matched, estimated, categorized, target_unknown:assessed.filter(c=>c.status==='done'&&c.research_match==='unknown').length,target_different:assessed.filter(c=>c.status==='done'&&c.research_match==='different').length, uncertain: saved-categorized, skipped: candidates.filter(c=>c.status==='skipped').length, pending: candidates.filter(c=>['pending','visiting'].includes(String(c.status))).length, unresolved_posts:discovery.results.filter(r=>['pending','visiting'].includes(String(r.status))).length, metrics:{saved,qualified_new:qualifiedNew,estimated_new:estimatedNew,qualified_new_per_hour:Math.round(qualifiedNew*3600/elapsed),estimated_new_per_hour:Math.round(estimatedNew*3600/elapsed),elapsed_seconds:Math.round(elapsed),profiles_per_hour:Math.round(saved*3600/elapsed),new_profiles_per_hour:Math.round(Number(run.inserted)*3600/elapsed),recent_profiles_skipped:candidates.filter(c=>c.reason==='recent_profile_no_visit').length,match_rate:saved?Math.round(matched/saved*100):0,pages_per_record:saved?Math.round(Number(run.page_requests)/saved*10)/10:null} });
    }
    return result;
  }
}

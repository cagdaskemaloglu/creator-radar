import {updateContactEmails,type ContactEmail} from './contact-emails';
import {profileContext,targetMatch,countryMatch} from './profile-context';
import { classify, profileSchema, type Profile } from './model';
import { createDatabase } from './storage';
import { all, first, jsonObject, LOCKS, safeId, type Database, type Executor, type Row } from './storage/driver';

export type Source = { provider: string; identifier: string; permission: string };
export type Outcome = 'inserted' | 'updated';
export class CreatorStore {
  constructor(readonly database: Database) {}
  private async lockWrites(tx: Executor) {
    if (this.database.dialect === 'postgres') await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCKS.writes]);
  }
  async log(id: number, message: string) {
    await this.database.query('INSERT INTO logs(job_id,message,created_at) VALUES($1,$2,$3)', [id, message, new Date().toISOString()]);
  }
  async saveProfile(input: Profile, source: Source, checkpoint?: { candidate: number; job: number; reason?: string }): Promise<Outcome> {
    const p = profileSchema.parse(input), now = new Date().toISOString();
    return this.database.transaction(async tx => {
      // Serialize identity resolution and suppression checks across processes.
      await this.lockWrites(tx);
      if (checkpoint) {
        const candidate = await first(tx, 'SELECT status,outcome FROM research_candidates WHERE id=$1 AND job_id=$2', [checkpoint.candidate,checkpoint.job]);
        if (!candidate) throw new Error('Candidate checkpoint not found');
        if (candidate.status === 'done') return candidate.outcome as Outcome;
      }
      if (await first(tx, 'SELECT 1 FROM suppressions WHERE username=$1 OR (instagram_user_id IS NOT NULL AND instagram_user_id=$2)', [p.username, p.instagram_user_id])) throw new Error('Record suppressed');
      const byId = p.instagram_user_id ? await first(tx, 'SELECT * FROM creators WHERE instagram_user_id=$1', [p.instagram_user_id]) : undefined;
      const byName = await first(tx, 'SELECT * FROM creators WHERE username=$1', [p.username]);
      if (byId && byName && byId.id !== byName.id) throw new Error('Identity collision requires manual review');
      const old = byId ?? byName;
      if (old?.instagram_user_id && p.instagram_user_id && old.instagram_user_id !== p.instagram_user_id) throw new Error('Conflicting platform ID');
      const previous = old ? jsonObject(old.payload) : {};
      const merged = { ...p, ...previous, ...Object.fromEntries(Object.entries(p).filter(([, value]) => value !== null)) } as Profile;
      if(checkpoint&&!p.review_assessment)delete merged.review_assessment;
      const contact_emails=updateContactEmails((previous.contact_emails??[]) as ContactEmail[],p.biography,{url:`https://www.instagram.com/${p.username}/`,provider:source.provider,collected_at:now});
      const payload = JSON.stringify({ ...merged, ...classify(merged),contact_emails });
      const url = `https://www.instagram.com/${p.username}/`;
      let id: number;
      if (old) {
        id = safeId(old.id);
        await tx.query('UPDATE creators SET username=$1,instagram_user_id=$2,profile_url=$3,payload=$4,validation_status=$5,updated_at=$6 WHERE id=$7', [p.username, p.instagram_user_id ?? (old.instagram_user_id as string | null) ?? null, url, payload, 'needs_review', now, id]);
      } else {
        const row = await first(tx, 'INSERT INTO creators(username,instagram_user_id,profile_url,payload,validation_status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [p.username, p.instagram_user_id, url, payload, 'needs_review', now, now]);
        id = safeId(row?.id);
      }
      await tx.query('INSERT INTO creator_sources(creator_id,provider,source_identifier,permission_reference,collected_at) VALUES($1,$2,$3,$4,$5)', [id, source.provider, source.identifier, source.permission, now]);
      await tx.query('INSERT INTO creator_metrics(creator_id,followers_count,measured_at,data_source) VALUES($1,$2,$3,$4)', [id, p.followers_count, now, source.provider]);
      if (checkpoint) {
        const classification = classify(merged);
        const outcome = old ? 'updated' : 'inserted';
        await tx.query("UPDATE research_candidates SET status='done',outcome=$1,category=$2,fit_score=$3,reason=$4,updated_at=$5,profile_data=$7 WHERE id=$6",[outcome,classification.primary_niche,classification.fit_score,checkpoint.reason??null,now,checkpoint.candidate,JSON.stringify(profileSchema.parse(merged))]);
        await tx.query(`UPDATE ingestion_jobs SET processed=processed+1,${outcome}=${outcome}+1 WHERE id=$1`,[checkpoint.job]);
      }
      return old ? 'updated' : 'inserted';
    });
  }
  async refreshContactEmails(){
    return this.database.transaction(async tx=>{
      await this.lockWrites(tx);let updated=0,emails=0;
      for(const row of await all(tx,'SELECT id,payload,profile_url,updated_at FROM creators')){
        const payload=jsonObject(row.payload),profile=profileSchema.parse(payload);
        const source=await first(tx,'SELECT provider,collected_at FROM creator_sources WHERE creator_id=$1 ORDER BY id DESC LIMIT 1',[safeId(row.id)]);
        const previous=(payload.contact_emails??[]) as ContactEmail[];
        const contacts=previous.length?previous:updateContactEmails([],profile.biography,{url:String(row.profile_url),provider:String(source?.provider??'stored-biography'),collected_at:String(source?.collected_at??row.updated_at)});
        emails+=contacts.filter(c=>c.is_current).length;
        if(JSON.stringify(payload.contact_emails)!==JSON.stringify(contacts)){await tx.query('UPDATE creators SET payload=$1 WHERE id=$2',[JSON.stringify({...payload,contact_emails:contacts}),safeId(row.id)]);updated++;}
      }
      return{updated,emails};
    });
  }
  async refreshClassifications(){
    return this.database.transaction(async tx=>{await this.lockWrites(tx);let updated=0;const rows=await all(tx,'SELECT id,profile_url,payload FROM creators');
      for(const row of rows){const payload=jsonObject(row.payload),profile=profileSchema.parse(payload);
        if(!profile.research_topics){const origin=await first(tx,"SELECT rr.settings FROM research_candidates c JOIN research_runs rr ON rr.job_id=c.job_id WHERE c.url=$1 AND c.status='done' ORDER BY c.job_id DESC LIMIT 1",[String(row.profile_url)]);if(origin){const config=jsonObject(origin.settings) as {discovery?:{topics?:string[]}};profile.research_topics=config.discovery?.topics??[];}}
        const next={...payload,...profile,...classify(profile)};if(JSON.stringify(next)!==JSON.stringify(payload)){await tx.query('UPDATE creators SET payload=$1 WHERE id=$2',[JSON.stringify(next),safeId(row.id)]);updated++;}
      }return updated;
    });
  }
  async refreshLocationEstimates(){
    return this.database.transaction(async tx=>{
      await this.lockWrites(tx);
      const rows=await all(tx,'SELECT id,payload FROM creators');let updated=0;
      for(const row of rows){const payload=jsonObject(row.payload),profile=profileSchema.parse(payload),context=profileContext(profile);
        const next={...payload,...context,target_match:targetMatch(context,profile.research_target??{}),country_match:countryMatch(context,profile.research_target?.country)};
        if(JSON.stringify(next)!==JSON.stringify(payload)){await tx.query('UPDATE creators SET payload=$1 WHERE id=$2',[JSON.stringify(next),safeId(row.id)]);updated++;}
      }
      return updated;
    });
  }
  async snapshot() {
    return this.database.transaction(async tx => {
      if (this.database.dialect === 'postgres') await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const creators = await all(tx, 'SELECT * FROM creators ORDER BY updated_at DESC,id DESC');
      const sources = await all(tx, 'SELECT * FROM creator_sources ORDER BY id DESC');
      const metrics = await all(tx, 'SELECT * FROM creator_metrics ORDER BY id DESC');
      const jobs = await all(tx, 'SELECT id,kind,status,processed,inserted,updated,cancel_requested,created_at,completed_at,error FROM ingestion_jobs ORDER BY id DESC LIMIT 50');
      const logs = await all(tx, 'SELECT * FROM logs ORDER BY id DESC LIMIT 100');
      return {creators:creators.map((row):Row & {sources:Row[];metrics:Row[]}=>{
        const payload=jsonObject(row.payload),profile=profileSchema.parse(payload),context=profileContext(profile);
        return{...row,...profile,...payload,...context,target_match:targetMatch(context,profile.research_target??{}),country_match:countryMatch(context,profile.research_target?.country),sources:sources.filter(s=>s.creator_id===row.id),metrics:metrics.filter(m=>m.creator_id===row.id)};
      }),jobs,logs};
    });
  }
  async enqueue(kind: string, payload: string) {
    return safeId((await first(this.database, 'INSERT INTO ingestion_jobs(kind,payload,created_at) VALUES($1,$2,$3) RETURNING id', [kind, payload, new Date().toISOString()]))?.id);
  }
  async enqueueUniqueResearch(payload:string){
    return this.database.transaction(async tx=>{
      await this.lockWrites(tx);
      const existing=await first(tx,"SELECT id FROM ingestion_jobs WHERE kind='instagram_night' AND status IN ('queued','running') ORDER BY id DESC LIMIT 1");
      if(existing)return safeId(existing.id);
      return safeId((await first(tx,"INSERT INTO ingestion_jobs(kind,payload,created_at) VALUES('instagram_night',$1,$2) RETURNING id",[payload,new Date().toISOString()]))?.id);
    });
  }
  async enqueuePoolContinuation(source:number,payload:string,closeReason:string){
    return this.database.transaction(async tx=>{await this.lockWrites(tx);
      if(await first(tx,"SELECT id FROM ingestion_jobs WHERE kind='instagram_night' AND status IN ('queued','running') LIMIT 1"))throw Error('Önce çalışan araştırmayı bitir veya durdur.');
      const old=await first(tx,'SELECT status FROM ingestion_jobs WHERE id=$1'+(this.database.dialect==='postgres'?' FOR UPDATE':''),[source]);if(!old||!['paused','completed','cancelled'].includes(String(old.status)))throw Error('Kaynak tur taşınmaya uygun değil.');const now=new Date().toISOString();
      if(old.status==='paused'){await tx.query('UPDATE research_runs SET stop_reason=$1,finished_at=$2 WHERE job_id=$3',[closeReason,now,source]);await tx.query("UPDATE ingestion_jobs SET status='completed',error=NULL,completed_at=$1 WHERE id=$2",[now,source]);}
      const id=safeId((await first(tx,"INSERT INTO ingestion_jobs(kind,payload,created_at) VALUES('instagram_night',$1,$2) RETURNING id",[payload,now]))?.id);
      await tx.query('INSERT INTO logs(job_id,message,created_at) VALUES($1,$2,$3)',[id,`Pool continuation: source=${source}; new budget=${JSON.parse(payload).nightMaxPages}; old budget preserved`,now]);return id;
    });
  }
  async claimJob() {
    return this.database.transaction(async tx => {
      const row = await first(tx, "SELECT * FROM ingestion_jobs WHERE status='queued' ORDER BY id LIMIT 1" + (this.database.dialect === 'postgres' ? ' FOR UPDATE SKIP LOCKED' : ''));
      if (row) await tx.query("UPDATE ingestion_jobs SET status='running' WHERE id=$1", [safeId(row.id)]);
      return row;
    });
  }
  async isCancelled(id: number) {
    return Boolean((await first(this.database, 'SELECT cancel_requested FROM ingestion_jobs WHERE id=$1', [id]))?.cancel_requested);
  }
  async increment(id: number, outcome: Outcome) {
    if (!['inserted', 'updated'].includes(outcome)) throw new Error('Invalid outcome');
    await this.database.query(`UPDATE ingestion_jobs SET processed=processed+1,${outcome}=${outcome}+1 WHERE id=$1`, [id]);
  }
  async finish(id: number, status: 'completed' | 'cancelled' | 'failed', error: string | null = null) {
    await this.database.query("UPDATE ingestion_jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' ELSE $1 END,error=$2,completed_at=$3 WHERE id=$4", [status, error, new Date().toISOString(), id]);
  }
  async cancel(id: number) {
    await this.database.query("UPDATE ingestion_jobs SET cancel_requested=$1,status=CASE WHEN status IN ('queued','paused') THEN 'cancelled' ELSE status END,completed_at=CASE WHEN status IN ('queued','paused') THEN $2 ELSE completed_at END WHERE id=$3 AND status IN ('queued','running','paused')", [true, new Date().toISOString(), id]);
  }
  async review(id: number, status: string) {
    if (!['reviewed', 'needs_review', 'rejected'].includes(status)) throw new Error('Invalid validation status');
    const result = await this.database.query('UPDATE creators SET validation_status=$1 WHERE id=$2', [status, id]);
    if (!result.rowCount) throw new Error('Creator not found');
  }
  async suppress(id: number) {
    await this.database.transaction(async tx => {
      await this.lockWrites(tx);
      const row = await first(tx, 'SELECT * FROM creators WHERE id=$1', [id]);
      if (!row) throw new Error('Creator not found');
      await tx.query('INSERT INTO suppressions(username,instagram_user_id) VALUES($1,$2) ON CONFLICT(username) DO UPDATE SET instagram_user_id=excluded.instagram_user_id', [String(row.username), row.instagram_user_id as string | null]);
      await tx.query('DELETE FROM creator_sources WHERE creator_id=$1', [id]);
      await tx.query('DELETE FROM creator_metrics WHERE creator_id=$1', [id]);
      await tx.query('DELETE FROM creators WHERE id=$1', [id]);
    });
  }
  async recoverInterruptedJobs() {
    await this.database.transaction(async tx => {
      await tx.query("UPDATE research_candidates SET status='pending' WHERE status='visiting' AND job_id IN (SELECT id FROM ingestion_jobs WHERE kind='instagram_night' AND status='running')");
      await tx.query("UPDATE research_posts SET status=CASE WHEN attempts>=2 THEN 'skipped' ELSE 'pending' END WHERE status='visiting' AND candidate_id IN (SELECT c.id FROM research_candidates c JOIN ingestion_jobs j ON j.id=c.job_id WHERE j.kind='instagram_night' AND j.status='running')");
      await tx.query("UPDATE ingestion_jobs SET status='queued',error='Worker interrupted; persistent checkpoint restored' WHERE kind='instagram_night' AND status='running'");
    });
    await this.database.query("UPDATE ingestion_jobs SET status='failed',error='Worker interrupted; review partial results before resubmitting',completed_at=$1 WHERE status='running'", [new Date().toISOString()]);
  }
}
// Keep one pool per server process, including Next.js hot reloads.
const globalDb = globalThis as typeof globalThis & { radarDatabase?: Database };
export const db = globalDb.radarDatabase ??= createDatabase();
export const store = new CreatorStore(db);
export const log = store.log.bind(store);
export const saveProfile = store.saveProfile.bind(store);
export const snapshot = store.snapshot.bind(store);

import type {CreatorStore} from './db';
import {first,LOCKS} from './storage/driver';
import {readResearchState} from './instagram-state-read';
import {recoverableReasons} from './technical-recovery';
export function isRecoverableReason(reason:string){return recoverableReasons.has(reason)||/^page\.goto: (?:Timeout \d+ms exceeded\.?|net::ERR_(?:CONNECTION_CLOSED|CONNECTION_RESET|CONNECTION_TIMED_OUT|TIMED_OUT|NETWORK_CHANGED)\b)/.test(reason);}
export async function recoverContinuousJob(store:CreatorStore,job:number,generation:number,status:string,now:number){
 return store.database.transaction(async tx=>{
  if(store.database.dialect==='postgres')await tx.query('SELECT pg_advisory_xact_lock($1)',[LOCKS.writes]);
  const control=await first(tx,"UPDATE continuous_scan SET updated_at=$1 WHERE id=1 AND enabled=1 AND generation=$2 AND job_id=$3 RETURNING status,next_at",[new Date(now).toISOString(),generation,job]);if(!control||readResearchState(now).paused)return'unchanged';
  const row=await first(tx,'SELECT j.status,j.error,j.cancel_requested,r.started_at,r.settings,r.page_requests FROM ingestion_jobs j JOIN research_runs r ON r.job_id=j.id WHERE j.id=$1',[job]);
  if(!row||row.cancel_requested||!['paused','failed'].includes(String(row.status))||!isRecoverableReason(String(row.error)))return'unchanged';
  let config;try{config=typeof row.settings==='string'?JSON.parse(row.settings):row.settings;}catch{return'unchanged';}
  if(!config||!Number.isFinite(Number(config.hours))||Number(config.hours)<=0||!Number.isFinite(Number(config.maxPages))||Number(config.maxPages)<=0||!Number.isFinite(Date.parse(String(row.started_at))))return'unchanged';
  const expired=now>=Date.parse(String(row.started_at))+Number(config.hours)*3600000,budget=Number(row.page_requests)>=Number(config.maxPages);
  if(expired||budget){const reason=expired?'time_limit':'page_limit';await tx.query("UPDATE ingestion_jobs SET status='completed',error=NULL,completed_at=$1 WHERE id=$2",[new Date(now).toISOString(),job]);await tx.query('UPDATE research_runs SET stop_reason=$1,finished_at=$2 WHERE job_id=$3',[reason,new Date(now).toISOString(),job]);await tx.query("UPDATE continuous_scan SET status='transitioning',message=$1,next_at=$2 WHERE id=1",['Turun süre veya sayfa bütçesi tamamlandı; bekleyen havuz korunarak yeni tura geçiliyor.',new Date(now+1000).toISOString()]);return'next_round';}
  const count=await first(tx,"SELECT count(*) AS n FROM logs WHERE job_id=$1 AND message LIKE 'Continuous technical recovery queued:%'",[job]),attempt=Number(count?.n??0)+1;
  if(attempt>2){await tx.query("UPDATE continuous_scan SET status='blocked',message=$1,next_at=$2 WHERE id=1",['İki otomatik toparlanma da sonuç vermedi; manuel teknik kontrol gerekiyor.',new Date(now+30000).toISOString()]);return'exhausted';}
  if(status!=='recovering'||control.status!=='recovering'){
   await tx.query("UPDATE continuous_scan SET status='recovering',message=$1,next_at=$2 WHERE id=1",[`Geçici teknik sorun: ${attempt}/2 toparlanma öncesi ${attempt===1?'2':'5'} dakika bekleniyor.`,new Date(now+(attempt===1?120000:300000)).toISOString()]);
   await tx.query('INSERT INTO logs(job_id,message,created_at) VALUES($1,$2,$3)',[job,`Continuous technical recovery scheduled: attempt=${attempt}; reason=${row.error}`,new Date(now).toISOString()]);return'waiting';
  }
  if(control.next_at&&Date.parse(String(control.next_at))>now)return'waiting';
  if(await first(tx,"SELECT id FROM ingestion_jobs WHERE kind='instagram_night' AND status IN ('queued','running') LIMIT 1")){await tx.query('UPDATE continuous_scan SET message=$1,next_at=$2 WHERE id=1',['Diğer araştırma bitince kayıtlı kuyruktan devam edilecek.',new Date(now+10000).toISOString()]);return'waiting';}
  await tx.query("UPDATE ingestion_jobs SET status='queued',error=NULL,completed_at=NULL WHERE id=$1",[job]);await tx.query('UPDATE research_runs SET stop_reason=NULL,finished_at=NULL WHERE job_id=$1',[job]);
  await tx.query("UPDATE continuous_scan SET status='running',message=$1,next_at=$2 WHERE id=1",['Teknik sorun sonrası kayıtlı kuyruktan devam ediliyor; eski bütçe korundu.',new Date(now+10000).toISOString()]);await tx.query('INSERT INTO logs(job_id,message,created_at) VALUES($1,$2,$3)',[job,`Continuous technical recovery queued: attempt=${attempt}; budgets preserved`,new Date(now).toISOString()]);return'resumed';
 });
}

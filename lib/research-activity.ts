import type {CreatorStore} from './db';
import {all,first,safeId} from './storage/driver';
export class ResearchActivity{
 private last:number;private waiting=0;private pending:Promise<unknown>=Promise.resolve();private failure:unknown;private timer:ReturnType<typeof setInterval>|undefined;
 private constructor(readonly store:CreatorStore,readonly id:number,readonly now:()=>number){this.last=now();}
 static async start(store:CreatorStore,job:number,now=Date.now){
  const at=new Date(now()).toISOString();
  const id=await store.database.transaction(async tx=>{await tx.query('UPDATE research_activity SET ended_at=last_seen_at WHERE job_id=$1 AND ended_at IS NULL',[job]);const j=await first(tx,'SELECT processed,inserted FROM ingestion_jobs WHERE id=$1',[job]);const row=await first(tx,'INSERT INTO research_activity(job_id,started_at,last_seen_at,start_inserted,end_inserted,start_saved,end_saved) VALUES($1,$2,$2,$3,$3,$4,$4) RETURNING id',[job,at,Number(j?.inserted??0),Number(j?.processed??0)]);return safeId(row?.id);});
  const result=new ResearchActivity(store,id,now);result.timer=setInterval(()=>{void result.flush().catch(e=>{result.failure=e;});},2000);result.timer.unref();return result;
 }
 check(){if(this.failure)throw Error('Research activity persistence failed');}
 async flush(end=false){const time=this.now(),delta=Math.max(0,time-this.last),measured=Math.min(5000,delta),wait=this.waiting>0?measured:0;this.last=time;
  const operation=this.pending.then(()=>this.store.database.query('UPDATE research_activity SET active_ms=active_ms+$1,wait_ms=wait_ms+$2,unobserved_ms=unobserved_ms+$3,last_seen_at=$4,ended_at=$5,end_inserted=(SELECT inserted FROM ingestion_jobs WHERE id=research_activity.job_id),end_saved=(SELECT processed FROM ingestion_jobs WHERE id=research_activity.job_id) WHERE id=$6',[measured-wait,wait,delta-measured,new Date(time).toISOString(),end?new Date(time).toISOString():null,this.id]));this.pending=operation.catch(()=>{});await operation;
 }
 async wait<T>(operation:()=>Promise<T>){await this.flush();this.waiting++;try{return await operation();}finally{await this.flush();this.waiting--;}}
 async stop(){clearInterval(this.timer);await this.flush(true);this.check();}
}
export async function activityMetrics(store:CreatorStore,job:number,startedAt:string){
 const rows=await all(store.database,'SELECT * FROM research_activity WHERE job_id=$1 ORDER BY id',[job]);if(!rows.length)return{measured:false,partial:false,active_seconds:null,wait_seconds:null,working_seconds:null,unobserved_seconds:null,measured_new:null,measured_saved:null};
 const sum=(key:string)=>rows.reduce((n,r)=>n+Number(r[key]),0),active=sum('active_ms'),wait=sum('wait_ms');
 return{measured:true,partial:Date.parse(String(rows[0].started_at))-Date.parse(startedAt)>5000||Number(rows[0].start_saved)>0||sum('unobserved_ms')>0||rows.slice(1).some((r,i)=>Number(r.start_saved)>Number(rows[i].end_saved)),active_seconds:(active+wait)/1000,wait_seconds:wait/1000,working_seconds:active/1000,unobserved_seconds:sum('unobserved_ms')/1000,measured_new:rows.reduce((n,r)=>n+Math.max(0,Number(r.end_inserted)-Number(r.start_inserted)),0),measured_saved:rows.reduce((n,r)=>n+Math.max(0,Number(r.end_saved)-Number(r.start_saved)),0)};
}
export function completionLabel(status:string,saved:number,pages:number,maxPages:number,reason:unknown){
 if(status==='completed')return saved===0?(pages>=maxPages?'Bütçe doldu · kayıt üretilemedi':reason==='time_limit'?'Süre doldu · kayıt üretilemedi':'Kayıt üretilemedi · tur sona erdi'):`Tamamlandı · ${saved} hesap kaydedildi`;
 return status==='failed'?'Hata ile durdu':status==='paused'?'Manuel kontrol bekliyor':status==='cancelled'?'Kullanıcı durdurdu':status==='running'?'Araştırılıyor':'Sırada';
}

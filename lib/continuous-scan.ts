import {recoverContinuousJob,isRecoverableReason} from './continuous-recovery';
import {z} from 'zod';
import type {CreatorStore} from './db';
import {all,first,jsonObject,safeId} from './storage/driver';
import {startAutonomousResearch,autonomousPlan,researchAreas} from './autonomous-research';
import {countries,taxonomy} from './taxonomy';
import {readResearchState} from './instagram-state-read';
const configSchema=z.object({topics:z.array(z.string().refine(t=>researchAreas.includes(t))).max(5).default([]),country:z.string().refine(c=>!c||Boolean(countries[c])).default(''),city:z.string().trim().max(80).default(''),gender:z.enum(['female','male']).optional(),pages:z.number().default(50)}).refine(c=>!c.city||Boolean(c.country),'Şehir seçildiğinde ülke de seçilmeli.');
const stamp=(now:number)=>new Date(now).toISOString();
async function initialize(store:CreatorStore){await store.database.query("INSERT INTO continuous_scan(id,updated_at) VALUES(1,$1) ON CONFLICT(id) DO NOTHING",[stamp(Date.now())]);}
export async function scanStatus(store:CreatorStore){await initialize(store);const r=(await first(store.database,'SELECT * FROM continuous_scan WHERE id=1'))!;return{enabled:Number(r.enabled)===1,status:String(r.status),message:r.message?String(r.message):null,cycle:Number(r.cycle),job_id:r.job_id?Number(r.job_id):null,next_at:r.next_at?String(r.next_at):null,config:jsonObject(r.config)};}
export async function startScan(input:unknown,store:CreatorStore){const config=configSchema.parse(input);autonomousPlan({...config,topics:config.topics.length?config.topics:['Cozy Room']});await initialize(store);await store.database.query("UPDATE continuous_scan SET enabled=1,generation=generation+1,config=$1,cycle=0,job_id=NULL,next_at=NULL,status='ready',message=NULL,updated_at=$2 WHERE id=1 AND enabled=0",[JSON.stringify(config),stamp(Date.now())]);return scanStatus(store);}
export async function stopScan(store:CreatorStore){await initialize(store);await store.database.transaction(async tx=>{const r=await first(tx,'UPDATE continuous_scan SET enabled=0,generation=generation+1,status=$1,message=$2,updated_at=$3 WHERE id=1 RETURNING job_id,generation',['stopped','Kullanıcı tarafından durduruldu',stamp(Date.now())]);if(r?.job_id)await tx.query("UPDATE ingestion_jobs SET cancel_requested=$2 WHERE id=$1 AND status IN ('queued','running')",[safeId(r.job_id),store.database.dialect==='postgres'?true:1]);for(const job of await all(tx,"SELECT id,payload FROM ingestion_jobs WHERE kind='instagram_night' AND status IN ('queued','running')")){if(Number(jsonObject(job.payload).continuousGeneration)===Number(r?.generation)-1)await tx.query('UPDATE ingestion_jobs SET cancel_requested=$2 WHERE id=$1',[safeId(job.id),store.database.dialect==='postgres'?true:1]);}});return scanStatus(store);}
export function scanSelection(config:z.infer<typeof configSchema>,cycle:number){const topics=config.topics.length?config.topics:[taxonomy[cycle%taxonomy.length].name];const country=config.country||Object.keys(countries)[Math.floor(cycle/(config.topics.length?1:taxonomy.length))%Object.keys(countries).length];return{...config,topics,country,enrichmentShare:0};}
export async function tickScan(store:CreatorStore,now=Date.now(),start=startAutonomousResearch){
 await initialize(store);const r=await first(store.database,'SELECT * FROM continuous_scan WHERE id=1');if(!r||!Number(r.enabled)||r.next_at&&Date.parse(String(r.next_at))>now)return;
 const generation=Number(r.generation);
 const recovered=(await all(store.database,"SELECT id,payload FROM ingestion_jobs WHERE kind='instagram_night' AND id>$1 ORDER BY id DESC",[r.job_id?Number(r.job_id):0])).find(job=>Number(jsonObject(job.payload).continuousGeneration)===generation);
 if(recovered){r.job_id=safeId(recovered.id);await store.database.query('UPDATE continuous_scan SET job_id=$1 WHERE id=1 AND generation=$2 AND enabled=1',[safeId(recovered.id),generation]);}
 const update=async(status:string,message:string,seconds=10)=>{await store.database.query('UPDATE continuous_scan SET status=$1,message=$2,next_at=$3,updated_at=$4 WHERE id=1 AND generation=$5 AND enabled=1',[status,message,stamp(now+seconds*1000),stamp(now),generation]);};
 if(process.env.INSTAGRAM_BROWSER_ENABLED==='false'||readResearchState(now).paused){await update('blocked','Instagram erişimi için manuel kontrol gerekiyor. Otomatik yeniden deneme yapılmıyor.',30);return;}
 if(r.job_id){const job=await first(store.database,'SELECT status,error FROM ingestion_jobs WHERE id=$1',[safeId(r.job_id)]);if(job&&['paused','failed'].includes(String(job.status))){if(isRecoverableReason(String(job.error))){const outcome=await recoverContinuousJob(store,safeId(r.job_id),generation,String(r.status),now);if(outcome==='unchanged')await update('blocked','Teknik toparlanma koşulları sağlanamadı; manuel kontrol gerekiyor.',30);return;}await update('blocked','Araştırma durdu: '+String(job.error??job.status)+'. Manuel kontrol gerekiyor.',30);return;}}
 if(await first(store.database,"SELECT id FROM ingestion_jobs WHERE kind='instagram_night' AND status IN ('queued','running') LIMIT 1")){await update('running','Aktif araştırmanın tamamlanması bekleniyor.');return;}
 const lease=await first(store.database,'UPDATE continuous_scan SET next_at=$1 WHERE id=1 AND enabled=1 AND generation=$2 AND (next_at IS NULL OR next_at<=$3) RETURNING id',[stamp(now+120000),generation,stamp(now)]);if(!lease)return;
 try{
  await update('transitioning',r.job_id?'Önceki tur tamamlandı; yeni tur hazırlanıyor.':'İlk araştırma turu hazırlanıyor.',120);
  const config=configSchema.parse(jsonObject(r.config)),selection=scanSelection(config,Number(r.cycle));
  const result=await start(selection,store,generation);
  if(result.reused){await update('waiting','Başka araştırmanın tamamlanması bekleniyor.');return;}
  const accepted=await first(store.database,"UPDATE continuous_scan SET job_id=$1,cycle=cycle+1,status='running',message=$2,next_at=$3,updated_at=$4 WHERE id=1 AND enabled=1 AND generation=$5 RETURNING id",[result.id,`Yeni tur #${result.id} · ${selection.topics.join(', ')} · ${countries[selection.country]}`,stamp(now+60000),stamp(now),generation]);
  if(!accepted&&!result.reused)await store.cancel(result.id);
  if(accepted&&!result.reused)await store.log(result.id,'Continuous scan cycle: '+(Number(r.cycle)+1)+'; automatic selection='+JSON.stringify({topics:selection.topics,country:selection.country}));
 }catch(error){await update('waiting',error&&typeof error==='object'&&'code' in error?'Veritabanı işlemi başarısız; bağlantıyı kontrol et.':error instanceof Error?error.message:'Tarama planlanamadı',300);}
}

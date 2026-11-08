import {cachedClassification as classify} from './classification-cache';
import {z} from 'zod';
import type {CreatorStore} from './db';
import {all,first,jsonObject,safeId} from './storage/driver';
import {classificationVersion,profileSchema} from './model';
import {categoryTerms} from './taxonomy';
import type {ResearchTarget} from './taxonomy';
export async function improvementQueue(store:CreatorStore,topics:string[],target:ResearchTarget,now=Date.now()){
 const cooldown=z.coerce.number().min(0).max(168).parse(process.env.ENRICHMENT_COOLDOWN_HOURS??4);
 const recent=new Set((await all(store.database,"SELECT DISTINCT c.url FROM candidate_work w JOIN research_candidates c ON c.id=w.candidate_id WHERE w.work_kind='enrichment' AND c.attempts>0 AND c.updated_at>=$1",[new Date(now-cooldown*3600000).toISOString()])).map(r=>String(r.url)));
 const suppressed=new Set((await all(store.database,'SELECT username FROM suppressions')).map(r=>String(r.username))),rows=await all(store.database,'SELECT id,profile_url,payload FROM creators ORDER BY updated_at,id');
 return rows.flatMap(row=>{const p=profileSchema.parse(jsonObject(row.payload)),c=classify({...p,research_topics:topics.length?topics:p.research_topics??[],research_target:topics.length?target:p.research_target??{}});if(p.synthetic||suppressed.has(p.username)||recent.has(String(row.profile_url))||!(c.research_match==='unknown'||!topics.length&&!c.primary_niche))return[];return[{id:safeId(row.id),url:String(row.profile_url),reasons:c.uncertainty_reasons,category:c.primary_niche}];});
}
export async function evaluateCreator(store:CreatorStore,id:number,input:unknown){
 const p=z.object({verdict:z.enum(['correct','wrong','insufficient']),predicted_category:z.string().nullable().optional(),expected_category:z.string().refine(v=>Object.hasOwn(categoryTerms,v)).nullable().optional()}).parse(input);
 await store.database.transaction(async tx=>{const row=await first(tx,'SELECT payload FROM creators WHERE id=$1',[id]);if(!row)throw Error('Hesap bulunamadı.');const c=classify(profileSchema.parse(jsonObject(row.payload)));if(p.predicted_category!==undefined&&p.predicted_category!==c.primary_niche)throw Error('Hesap güncellendi; detayı yeniden açıp değerlendir.');if(p.verdict==='wrong'&&p.expected_category===c.primary_niche)throw Error('Yanlış değerlendirmesi için farklı doğru kategoriyi seç.');if(p.verdict==='correct'&&!c.primary_niche)throw Error('Kategori belirsiz; yetersiz kanıt seçeneğini kullan.');if(p.verdict==='wrong'&&!p.expected_category)throw Error('Yanlış eşleşme için doğru kategoriyi seç.');await tx.query('INSERT INTO creator_evaluations(creator_id,verdict,predicted_category,expected_category,model_version,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,p.verdict,c.primary_niche,p.verdict==='correct'?c.primary_niche:p.expected_category??null,classificationVersion,new Date().toISOString()]);});
}
export async function evaluationSummary(store:CreatorStore){
 const rows=await all(store.database,'SELECT e.* FROM creator_evaluations e WHERE e.id=(SELECT MAX(e2.id) FROM creator_evaluations e2 WHERE e2.creator_id=e.creator_id AND e2.model_version=e.model_version) ORDER BY e.id DESC'),current=rows.filter(r=>r.model_version===classificationVersion),correct=current.filter(r=>r.verdict==='correct').length,wrong=current.filter(r=>r.verdict==='wrong').length;
 return{model:classificationVersion,sample:current.length,correct,wrong,insufficient:current.filter(r=>r.verdict==='insufficient').length,accuracy:correct+wrong?Math.round(correct/(correct+wrong)*100):null,historical:rows.length-current.length};
}
export function continuationState(run:{status:string;started_at:string;settings:{hours:number;maxPages:number};page_requests:number;pending:number;unresolved_posts:number;pending_queries?:number},sourcePaused:boolean,now=Date.now()){
 const expires_at=new Date(Date.parse(run.started_at)+run.settings.hours*3600000).toISOString(),remaining_pages=Math.max(0,run.settings.maxPages-run.page_requests),expired=now>=Date.parse(expires_at),pending=run.pending+run.unresolved_posts+(run.pending_queries??0);
 const reason=sourcePaused?'source_blocked':expired?'expired':!remaining_pages?'page_limit':run.status!=='paused'?'not_paused':!pending?'no_pending_work':'ready';
 return{expires_at,expired,remaining_pages,can_resume:reason==='ready',can_carry:!sourcePaused&&pending>0&&['paused','completed','cancelled'].includes(run.status),pending,reason};
}
export async function accessSummary(store:CreatorStore,state:import('./instagram-state-read').InstagramState,checkedAt:string|null,now=Date.now()){
 const logs=await all(store.database,"SELECT message,created_at FROM logs WHERE message LIKE 'Night run paused: INSTAGRAM_STOP:%' ORDER BY id DESC LIMIT 50"),last=logs.find(r=>/INSTAGRAM_STOP:(rate-limit|challenge|login|access-denied):/.test(String(r.message)));
 const lastAt=state.lastRestrictionAt??(last?String(last.created_at):null),waiting=Boolean(state.retryNotBefore&&Date.parse(state.retryNotBefore)>now),researchStatus=waiting?'waiting':state.paused?'restricted':lastAt&&(!state.lastResearchSuccessAt||Date.parse(state.lastResearchSuccessAt)<=Date.parse(lastAt))?'not_rechecked':state.lastResearchSuccessAt?'last_page_ok':'unverified';
 return{paused:state.paused,current_reason:state.reason,last_restriction_reason:state.lastRestrictionReason??(last?String(last.message).replace('Night run paused: ',''):null),last_restriction_at:lastAt,last_checked_at:checkedAt,session_check_scope:'session_only',research_status:researchStatus,last_research_success_at:state.lastResearchSuccessAt??null,http_restriction:state.lastHttpRestriction??null,retry_not_before:state.retryNotBefore??null,retry_seconds_remaining:waiting?Math.ceil((Date.parse(state.retryNotBefore!)-now)/1000):0,can_request_resume:!waiting,automatic_retry:false,required_action:waiting?'server_wait':state.paused?'manual_access_check':'none'};
}

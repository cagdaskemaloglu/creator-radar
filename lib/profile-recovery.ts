import type {CreatorStore} from './db';
import {first,safeId} from './storage/driver';
import {readResearchState,writeResearchState} from './instagram-state';
import {isIsolatedProfileLayoutReason} from './profile-read-policy';
import {instagramProfileUrl} from './instagram-policy';
// Invoked only by the explicit resume action. Never clears login, CAPTCHA or HTTP restrictions.
export async function isolateLegacyProfileFailure(job:number,store:CreatorStore){
 const run=await first(store.database,"SELECT r.stop_reason,j.status FROM research_runs r JOIN ingestion_jobs j ON j.id=r.job_id WHERE r.job_id=$1",[job]);
 if(run?.status!=='paused'||!isIsolatedProfileLayoutReason(String(run.stop_reason)))return false;
 const state=readResearchState();if(state.paused&&!isIsolatedProfileLayoutReason(state.reason))return false;
 const last=await first(store.database,"SELECT message FROM logs WHERE job_id=$1 AND message LIKE 'Night profile: %' ORDER BY id DESC LIMIT 1",[job]);
 if(!last)return false;
 const url=instagramProfileUrl(String(last.message).slice('Night profile: '.length));
 const candidate=await first(store.database,"SELECT id FROM research_candidates WHERE job_id=$1 AND url=$2 AND status IN ('pending','visiting') AND profile_data IS NULL AND attempts>0",[job,url]);
 if(!candidate)return false;
 await store.database.query("UPDATE research_candidates SET status='skipped',reason='profile_layout_unreadable_legacy',updated_at=$1 WHERE id=$2",[new Date().toISOString(),safeId(candidate.id)]);
 const current=readResearchState();
 if(current.paused){if(!isIsolatedProfileLayoutReason(current.reason))return false;writeResearchState({...current,paused:false,reason:null,pausedAt:null});}
 await store.log(job,'Legacy profile layout isolated without retry: '+url);
 return true;
}

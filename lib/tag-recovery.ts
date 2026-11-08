import type {CreatorStore} from './db';
import {first,safeId} from './storage/driver';
import {readResearchState,writeResearchState} from './instagram-state';
import {isLegacyTagLayoutReason} from './tag-read-policy';
// Only the explicit resume action may release this exact legacy layout pause.
export async function isolateLegacyTagFailure(job:number,store:CreatorStore){
 const run=await first(store.database,'SELECT r.stop_reason,j.status FROM research_runs r JOIN ingestion_jobs j ON j.id=r.job_id WHERE r.job_id=$1',[job]);
 if(run?.status!=='paused'||!isLegacyTagLayoutReason(String(run.stop_reason)))return false;
 const state=readResearchState();if(state.paused&&state.reason!==run.stop_reason)return false;
 const latest=await first(store.database,"SELECT job_id FROM research_runs r JOIN ingestion_jobs j ON j.id=r.job_id WHERE j.status='paused' ORDER BY job_id DESC LIMIT 1");if(Number(latest?.job_id)!==job)return false;
 const last=await first(store.database,"SELECT created_at FROM logs WHERE job_id=$1 AND message=$2 ORDER BY id DESC LIMIT 1",[job,'Night run paused: '+String(run.stop_reason)]);
 if(!last||state.paused&&(!state.pausedAt||Date.parse(state.pausedAt)>Date.parse(String(last.created_at))+1000))return false;
 const query=await first(store.database,"SELECT id FROM discovery_queries WHERE job_id=$1 AND provider='instagram_tags' AND status='blocked' AND error=$2 ORDER BY requested_at DESC,id DESC LIMIT 1",[job,String(run.stop_reason)]);if(!query)return false;
 await store.database.query("UPDATE discovery_queries SET status='skipped',error='tag_layout_unreadable_legacy',completed_at=$1 WHERE id=$2",[new Date().toISOString(),safeId(query.id)]);
 const current=readResearchState();if(current.paused){if(current.reason!==state.reason||current.pausedAt!==state.pausedAt)return false;writeResearchState({...current,paused:false,reason:null,pausedAt:null});}
 await store.log(job,'Legacy tag layout isolated without retry; pending links retained');return true;
}

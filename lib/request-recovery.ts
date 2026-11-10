import {InstagramStop} from './instagram-extract';
import {readResearchState,writeResearchState} from './instagram-state';
import {logRestriction} from './instagram-restriction';
import type {CreatorStore} from './db';
export type RequestPhase='tag'|'post'|'profile'|'legacy';
export class RequestSkipped extends Error{constructor(readonly code:string){super('request_skipped:'+code);}}
// Applies to measured HTTP failures only. Login/CAPTCHA/DOM gates remain immediate.
export class RequestRecovery{
 constructor(readonly store:CreatorStore,readonly job:number,readonly signal:AbortSignal,readonly now:()=>number,readonly sleep:(ms:number,signal:AbortSignal)=>Promise<void>){}
 async run<T>(url:string,read:()=>Promise<T>,reserve:()=>Promise<void>,active:()=>Promise<void>,phase:RequestPhase='legacy'):Promise<T>{
  const scoped=(s:ReturnType<typeof readResearchState>)=>phase==='legacy'?s.requestFailures:s.requestScopes?.[phase];
  const scopedUpdate=(s:ReturnType<typeof readResearchState>,failure:ReturnType<typeof scoped>)=>({...s,requestScopes:phase==='legacy'?s.requestScopes:{...s.requestScopes,[phase]:failure},...(failure?{requestFailures:failure}:phase==='legacy'||s.requestFailures?.phase===phase?{requestFailures:undefined,requestRetryAt:undefined}:{})});
  const saved=scoped(readResearchState(this.now()));let attempts=saved?.url===url.slice(0,500)?saved.attempts??0:0;
  while(true){
   await active();
   try{const value=await read();const state=readResearchState(this.now());writeResearchState(scopedUpdate(state,undefined));return value;}
   catch(error){
    this.signal.throwIfAborted();
    if(!(error instanceof InstagramStop)||!error.restriction||/\/(?:challenge|checkpoint|accounts)\//i.test(error.restriction.url))throw error;
    const detail=error.restriction,key='HTTP '+detail.status,state=readResearchState(this.now()),previous=scoped(state);
    const failed=previous?.code===key?previous.failed:0;
    attempts++;
    await logRestriction(this.store,this.job,detail);
    const deadline=detail.retry_after_at,old=state.retryNotBefore;
    const waitUntil=Math.max(this.now()+120000,deadline?Date.parse(deadline):0,old?Date.parse(old):0);
    writeResearchState(scopedUpdate({...state,lastHttpRestriction:detail,lastRestrictionReason:error.message,lastRestrictionAt:detail.observed_at,retryNotBefore:deadline&&old?(Date.parse(deadline)>Date.parse(old)?deadline:old):deadline||old||null,requestRetryAt:new Date(waitUntil).toISOString()},{phase,code:key,failed,url:url.slice(0,500),attempts:Math.min(3,attempts)}));
    if(failed>0||attempts>=3){
     const count=Math.min(3,failed+1);writeResearchState(scopedUpdate({...readResearchState(this.now()),paused:state.paused,reason:state.reason,pausedAt:state.pausedAt},{phase,code:key,failed:count,url:url.slice(0,500),attempts:Math.min(3,attempts)}));
     await this.store.log(this.job,`İstek başarısız: ${key} [${phase}]; aynı hata alınan ardışık istek ${count}/3; ${url}`);
     if(count>=3)throw new InstagramStop(error.reason,`HTTP ${detail.status}; three consecutive requests failed; retries exhausted`,detail);
     await this.store.log(this.job,'Sorunlu istek atlandı; sonraki istek için en az iki dakika bekleniyor');
     throw new RequestSkipped(key);
    }
    await this.store.log(this.job,`İstek yeniden denenecek: ${key} [${phase}]; deneme ${attempts+1}/3; en erken ${new Date(waitUntil).toISOString()}; ${url}`);
    await this.sleep(Math.max(0,waitUntil-this.now()),this.signal);await active();await reserve();
   }
  }
 }
 async beforeNext(active:()=>Promise<void>){const state=readResearchState(this.now());if(state.requestFailures&&state.requestFailures.failed<3&&state.requestRetryAt){const wait=Date.parse(state.requestRetryAt)-this.now();if(wait>0){await this.sleep(wait,this.signal);await active();}}}
}

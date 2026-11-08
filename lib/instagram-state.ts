import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { researchStatePath, readResearchState, researchStateSchema, type InstagramState } from './instagram-state-read';
export { readResearchState } from './instagram-state-read';
export function writeResearchState(state: InstagramState) {
  const path = researchStatePath(); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + '.tmp'; writeFileSync(temp, JSON.stringify(researchStateSchema.parse(state)), { mode: 0o600 }); renameSync(temp, path);
}
export function pauseInstagram(reason: string,detail?:import('./instagram-restriction').HttpRestriction) {
  const at=new Date().toISOString(),state=readResearchState();const existing=state.retryNotBefore&&Date.parse(state.retryNotBefore)>Date.now()?state.retryNotBefore:null,newDeadline=detail?.retry_after_at??null;const retryNotBefore=existing&&(!newDeadline||Date.parse(existing)>Date.parse(newDeadline))?existing:newDeadline;writeResearchState({ ...state,...(detail?{lastHttpRestriction:detail,retryNotBefore}:{}), paused: true, reason, pausedAt:at,...(/INSTAGRAM_STOP:(rate-limit|challenge|login|access-denied):/.test(reason)?{lastRestrictionReason:reason,lastRestrictionAt:at}:{}) });
}
export function assertServerWaitElapsed(now=Date.now()){const state=readResearchState(now);if(state.retryNotBefore&&Date.parse(state.retryNotBefore)>now)throw Error('Sunucunun bildirdiği bekleme süresi '+new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'medium'}).format(new Date(state.retryNotBefore))+' tarihine kadar devam ediyor. Oturum testi bu süreyi kaldırmaz.');}
export function recordResearchSuccess(){const state=readResearchState();if(!state.paused)writeResearchState({...state,lastResearchSuccessAt:new Date().toISOString()});}
export function resumeInstagram() {assertServerWaitElapsed(); writeResearchState({ ...readResearchState(), paused: false, reason: null, pausedAt: null }); }

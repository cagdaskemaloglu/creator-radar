import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { researchStatePath, readResearchState, researchStateSchema, cooldownHours, COOLDOWN_WINDOW_MS, type InstagramState } from './instagram-state-read';
export { readResearchState } from './instagram-state-read';
export function writeResearchState(state: InstagramState) {
  const path = researchStatePath(); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + '.tmp'; writeFileSync(temp, JSON.stringify(researchStateSchema.parse(state)), { mode: 0o600 }); renameSync(temp, path);
}
export function restrictionCooldown(state:InstagramState,reason:string,detail:import('./instagram-restriction').HttpRestriction|undefined,nowMs=Date.now()){
  // Only HTTP 429 (client-wide rate limit) starts the escalating cooldown. The same event reported twice within a minute counts once.
  if(!(detail?.status===429||/INSTAGRAM_STOP:rate-limit:.*HTTP 429/.test(reason)))return {};
  const recent=(state.restrictionEvents??[]).filter(e=>nowMs-Date.parse(e)<COOLDOWN_WINDOW_MS),last=recent[recent.length-1];
  const duplicate=Boolean(last&&nowMs-Date.parse(last)<60000),events=duplicate?recent:[...recent,new Date(nowMs).toISOString()].slice(-10);
  const existing=state.cooldownUntil?Date.parse(state.cooldownUntil):0,until=duplicate&&existing>nowMs?existing:Math.max(nowMs+cooldownHours(events.length)*3600000,Number.isFinite(existing)?existing:0);
  return {restrictionEvents:events,cooldownUntil:new Date(until).toISOString()};
}
export function pauseInstagram(reason: string,detail?:import('./instagram-restriction').HttpRestriction) {
  const at=new Date().toISOString(),state=readResearchState();const existing=state.retryNotBefore&&Date.parse(state.retryNotBefore)>Date.now()?state.retryNotBefore:null,newDeadline=detail?.retry_after_at??null;const retryNotBefore=existing&&(!newDeadline||Date.parse(existing)>Date.parse(newDeadline))?existing:newDeadline;writeResearchState({ ...state,...(state.requestFailures?.failed===3?{}:{requestFailures:undefined,requestRetryAt:undefined}),...(detail?{lastHttpRestriction:detail,retryNotBefore}:{}),...restrictionCooldown(state,reason,detail), paused: true, reason, pausedAt:at,...(/INSTAGRAM_STOP:(rate-limit|challenge|login|access-denied):/.test(reason)?{lastRestrictionReason:reason,lastRestrictionAt:at}:{}) });
}
export function assertServerWaitElapsed(now=Date.now()){const state=readResearchState(now);if(state.retryNotBefore&&Date.parse(state.retryNotBefore)>now)throw Error('Sunucunun bildirdiği bekleme süresi '+new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'medium'}).format(new Date(state.retryNotBefore))+' tarihine kadar devam ediyor. Oturum testi bu süreyi kaldırmaz.');}
export function assertCooldownElapsed(now=Date.now()){const state=readResearchState(now);if(state.cooldownUntil&&Date.parse(state.cooldownUntil)>now)throw Error('HTTP 429 sonrası zorunlu soğuma '+new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'medium'}).format(new Date(state.cooldownUntil))+' tarihine kadar sürüyor. Oturum panelindeki açık onayla geçersiz kılınabilir; sunucunun bildirdiği bekleme süresi geçersiz kılınamaz.');}
// Instagram'a istek gönderen her işlem önce sunucu beklemesini, sonra zorunlu soğumayı denetler.
export function assertAccessWindow(now=Date.now()){assertServerWaitElapsed(now);assertCooldownElapsed(now);}
// Bilinçli geçersiz kılma yalnız kendi soğumamızı kaldırır; sunucunun bildirdiği bekleme asla. Durdurma kilidi ayrıca elle kaldırılmalıdır.
export function overrideCooldown(now=Date.now()){assertServerWaitElapsed(now);const state=readResearchState(now);if(!state.cooldownUntil||Date.parse(state.cooldownUntil)<=now)throw Error('Etkin bir zorunlu soğuma yok.');writeResearchState({...state,cooldownUntil:null,cooldownOverrides:[...(state.cooldownOverrides??[]),new Date(now).toISOString()].slice(-20)});}
export function recordResearchSuccess(){const state=readResearchState();if(!state.paused)writeResearchState({...state,lastResearchSuccessAt:new Date().toISOString()});}
export function resumeInstagram() {assertAccessWindow(); writeResearchState({ ...readResearchState(), requestScopes:undefined, requestFailures:undefined, requestRetryAt:undefined, paused: false, reason: null, pausedAt: null }); }

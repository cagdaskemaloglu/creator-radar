import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
export const httpRestrictionSchema=z.object({status:z.union([z.literal(403),z.literal(429)]),url:z.string().max(500),page_url:z.string().max(500),method:z.string().max(16),resource_type:z.string().max(32),main_document:z.boolean(),observed_at:z.string().datetime(),retry_after_at:z.string().datetime().nullable(),retry_after_seconds:z.number().nonnegative().nullable()});
export const requestFailureSchema=z.object({phase:z.enum(['tag','post','profile','legacy']).optional(),code:z.string(),url:z.string().max(500).optional(),attempts:z.number().int().min(0).max(3).optional(),failed:z.number().int().min(0).max(3)});
export const researchStateSchema = z.object({requestRetryAt:z.string().datetime().optional(),requestScopes:z.object({tag:requestFailureSchema.optional(),post:requestFailureSchema.optional(),profile:requestFailureSchema.optional()}).optional(),requestFailures:requestFailureSchema.optional(),lastHttpRestriction:httpRestrictionSchema.optional(),retryNotBefore:z.string().datetime().nullable().optional(),lastResearchSuccessAt:z.string().datetime().optional(),lastRestrictionReason:z.string().nullable().optional(),lastRestrictionAt:z.string().nullable().optional(),cooldownUntil:z.string().datetime().nullable().optional(),restrictionEvents:z.array(z.string().datetime()).max(20).optional(),cooldownOverrides:z.array(z.string().datetime()).max(20).optional(), day: z.string(), visits: z.number().int().nonnegative(), lastVisitAt: z.number().nonnegative(), paused: z.boolean(), reason: z.string().nullable(), pausedAt: z.string().nullable() });
export type InstagramState = z.infer<typeof researchStateSchema>;
export function researchStatePath() { return resolve(process.env.INSTAGRAM_STATE_FILE ?? 'data/instagram-research-state.json'); }
export function readResearchState(now = Date.now()): InstagramState {
  const path = researchStatePath();
  const day = new Date(now).toISOString().slice(0, 10);
  if (!existsSync(path)) return { day, visits: 0, lastVisitAt: 0, paused: false, reason: null, pausedAt: null };
  const state = researchStateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const current=state.day===day?state:{...state,day,visits:0};
  const waiting=Boolean(current.retryNotBefore&&Date.parse(current.retryNotBefore)>now),cooling=Boolean(current.cooldownUntil&&Date.parse(current.cooldownUntil)>now);
  return waiting||cooling?{...current,paused:true,reason:current.reason??current.lastRestrictionReason??(waiting?'INSTAGRAM_STOP:rate-limit: Server wait has not expired':'INSTAGRAM_STOP:rate-limit: Cooldown has not expired'),pausedAt:current.pausedAt??current.lastRestrictionAt??null}:current;
}
// HTTP 429 sonrası zorunlu soğuma basamakları (saat): 72 saat içindeki 1., 2. ve 3.+ olay.
// Not: 18 Kasım 2026 olayında ~10 saat sonra yeniden başlatma ilk istekte yine 429 aldı; bu yüzden ilk basamak 24 saattir.
export const COOLDOWN_LADDER_HOURS=[24,48,72] as const;
export const COOLDOWN_WINDOW_MS=72*3600000;
export function cooldownHours(eventsInWindow:number){return COOLDOWN_LADDER_HOURS[Math.min(Math.max(eventsInWindow,1),COOLDOWN_LADDER_HOURS.length)-1];}

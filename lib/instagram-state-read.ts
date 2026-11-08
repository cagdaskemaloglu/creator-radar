import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
export const httpRestrictionSchema=z.object({status:z.union([z.literal(403),z.literal(429)]),url:z.string().max(500),page_url:z.string().max(500),method:z.string().max(16),resource_type:z.string().max(32),main_document:z.boolean(),observed_at:z.string().datetime(),retry_after_at:z.string().datetime().nullable(),retry_after_seconds:z.number().nonnegative().nullable()});
export const researchStateSchema = z.object({lastHttpRestriction:httpRestrictionSchema.optional(),retryNotBefore:z.string().datetime().nullable().optional(),lastResearchSuccessAt:z.string().datetime().optional(),lastRestrictionReason:z.string().nullable().optional(),lastRestrictionAt:z.string().nullable().optional(), day: z.string(), visits: z.number().int().nonnegative(), lastVisitAt: z.number().nonnegative(), paused: z.boolean(), reason: z.string().nullable(), pausedAt: z.string().nullable() });
export type InstagramState = z.infer<typeof researchStateSchema>;
export function researchStatePath() { return resolve(process.env.INSTAGRAM_STATE_FILE ?? 'data/instagram-research-state.json'); }
export function readResearchState(now = Date.now()): InstagramState {
  const path = researchStatePath();
  const day = new Date(now).toISOString().slice(0, 10);
  if (!existsSync(path)) return { day, visits: 0, lastVisitAt: 0, paused: false, reason: null, pausedAt: null };
  const state = researchStateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const current=state.day===day?state:{...state,day,visits:0};
  return current.retryNotBefore&&Date.parse(current.retryNotBefore)>now?{...current,paused:true,reason:current.reason??current.lastRestrictionReason??'INSTAGRAM_STOP:rate-limit: Server wait has not expired',pausedAt:current.pausedAt??current.lastRestrictionAt??null}:current;
}

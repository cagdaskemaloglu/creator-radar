import {logRestriction} from './instagram-restriction';
import { setTimeout as delay } from 'node:timers/promises';
import type { CreatorStore } from './db';
import { instagramSeeds, researchLimits, instagramWaitMs } from './instagram-policy';
import { extractInstagramProfile, InstagramStop, type InstagramSnapshot } from './instagram-extract';
import { readInstagramProfile } from './instagram-browser';
import { pauseInstagram, readResearchState, writeResearchState } from './instagram-state';
export type ResearchRequest = { content: string; limit: number; permission: string; discoverMentions: boolean };
export type Reader = (url: string, signal: AbortSignal) => Promise<{ status: 'unavailable'; snapshot: null } | { status: 'loaded'; snapshot: InstagramSnapshot }>;
export async function researchInstagram(jobId: number, request: ResearchRequest, store: CreatorStore, signal: AbortSignal, dependencies: { read?: Reader; sleep?: (ms: number, signal: AbortSignal) => Promise<void>; now?: () => number } = {}) {
  if (process.env.INSTAGRAM_BROWSER_ENABLED === 'false') throw new Error('Instagram browser research is disabled');
  const limits = researchLimits(), now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? (async (ms, s) => { await delay(ms, undefined, { signal: s }); });
  const read = dependencies.read ?? readInstagramProfile;
  const queue = instagramSeeds(request.content).map(url => ({ url, depth: 0 }));
  const seen = new Set<string>();
  const pageCap = Math.min(request.limit, limits.maxPages);
  let visited = 0;
  while (queue.length && visited < pageCap) {
    signal.throwIfAborted();
    if (await store.isCancelled(jobId)) throw new Error('Cancelled');
    const state = readResearchState(now());
    if (state.paused) throw new Error('Instagram research is paused: ' + state.reason + '. Check the browser manually before resuming.');
    if (limits.dailyPages!==null && state.visits >= limits.dailyPages) throw new Error('Instagram daily page budget reached; no more requests today (UTC)');
    const wait = instagramWaitMs(limits);
    if (wait) { await store.log(jobId, `Waiting ${Math.ceil(wait / 1000)}s before next profile`); await sleep(wait, signal); }
    signal.throwIfAborted();
    if (await store.isCancelled(jobId)) throw new Error('Cancelled');
    const candidate = queue.shift()!;
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    const current = readResearchState(now());
    // Count attempted page visits, including missing/private/blocked profiles.
    writeResearchState({ ...current, visits: current.visits + 1, lastVisitAt: now() });
    visited++;
    try {
      await store.log(jobId, `Profile ${visited}/${pageCap}: ${candidate.url}`);
      const loaded = await read(candidate.url, signal);
      signal.throwIfAborted();
      if (!loaded.snapshot) { await store.log(jobId, 'Profile unavailable; skipped'); continue; }
      if (!loaded.snapshot.visibleBiography) await store.log(jobId, `Biography element unavailable or ambiguous (${loaded.snapshot.biographyCandidateCount ?? 'unknown'} candidates); metadata fallback only`);
      const result = extractInstagramProfile(loaded.snapshot, candidate.url);
      if (!result.profile) { await store.log(jobId, `Profile ${result.status}; skipped`); continue; }
      const outcome = await store.saveProfile(result.profile, { provider: 'instagram-browser', identifier: candidate.url, permission: request.permission });
      await store.increment(jobId, outcome);
      await store.log(jobId, `${outcome}: @${result.profile.username}; ${result.profile.extraction?.warnings.length ?? 0} missing/approximate fields; manual validation pending`);
      if (request.discoverMentions && candidate.depth === 0) {
        for (const link of result.links) {
          if (!seen.has(link) && !queue.some(item => item.url === link) && queue.length < 100) queue.push({ url: link, depth: 1 });
        }
      }
    } catch (error) {
      if (error instanceof InstagramStop){pauseInstagram(error.message,error.restriction);if(error.restriction)await logRestriction(store,jobId,error.restriction);}
      throw error;
    }
  }
  await store.log(jobId, `Research finished: ${visited} page visits; ${queue.length} candidates left outside the configured limit`);
}

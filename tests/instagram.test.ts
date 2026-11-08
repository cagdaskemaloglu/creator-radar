import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { profileSchema } from '../lib/model';
import { extractInstagramProfile, exactCount, InstagramStop, type InstagramSnapshot } from '../lib/instagram-extract';
import { instagramProfileUrl, instagramSeeds, researchLimits } from '../lib/instagram-policy';
import { readResearchState, resumeInstagram, writeResearchState } from '../lib/instagram-state';
import { researchInstagram } from '../lib/instagram-research';
const dir = mkdtempSync(join(tmpdir(), 'radar-instagram-'));
process.env.RADAR_DB = join(dir, 'default.sqlite');
process.env.INSTAGRAM_STATE_FILE = join(dir, 'state.json');
const url = 'https://www.instagram.com/synthetic_workspace/';
function snapshot(username = 'synthetic_workspace'): InstagramSnapshot {
  const u = `https://www.instagram.com/${username}/`;
  return { url: u, canonicalUrl: u, title: '', ogTitle: `Synthetic Workspace (@${username}) • Instagram photos and videos`, description: `12.3K Followers, 0 Following, 120 Posts - Synthetic Workspace (@${username}) on Instagram: "Synthetic desk setup and cozy gaming fixture."`, bodyText: 'Synthetic public profile', mainText: 'Synthetic public profile', hasPasswordForm: false, hasCaptcha: false, metrics: [], profileLinks: [] };
}
test('exact measurements are distinct from rounded labels', () => {
  assert.equal(exactCount('12,345'), 12345); assert.equal(exactCount('12.345'), 12345); assert.equal(exactCount('0'), 0);
  for (const label of ['12.3K','1,2 mn','12 bin','2M',null]) assert.equal(exactCount(label), null);
  const result = extractInstagramProfile(snapshot(), url);
  assert.equal(result.profile?.followers_count, null); assert.equal(result.profile?.following_count, 0);
  assert.equal(result.profile?.posts_count, 120); assert.equal(result.profile?.biography, 'Synthetic desk setup and cozy gaming fixture.');
  assert.equal(result.profile?.extraction?.metric_labels.followers_count, '12.3K');
  assert.equal(extractInstagramProfile({ ...snapshot(), metrics: [{ kind: 'followers_count', label: '12.3K', exact: '12,345' }] }, url).profile?.followers_count, 12345);
});
test('canonical URLs, duplicate seeds and unsupported routes', () => {
  assert.equal(instagramProfileUrl('https://instagram.com/Synthetic_Workspace'), url);
  assert.deepEqual(instagramSeeds(url + '\n' + url), [url]);
  for (const u of ['https://www.instagram.com/p/abc/', 'https://www.instagram.com/accounts/', 'https://www.instagram.com/a/?token=x', 'https://www.instagram.com.evil.org/a/']) assert.throws(() => instagramProfileUrl(u));
  assert.throws(() => researchLimits({ INSTAGRAM_INTERVAL_SECONDS: '1' }));
});
test('private accounts skipped, login/challenges/layout stop collection', () => {
  assert.equal(extractInstagramProfile({ ...snapshot(), mainText: 'This account is private' }, url).status, 'private');
  for (const patch of [{ hasCaptcha: true }, { hasPasswordForm: true }, { bodyText: 'Please wait a few minutes' }, { canonicalUrl: 'https://www.instagram.com/different/' }, { ogTitle: 'Unknown layout' }]) assert.throws(() => extractInstagramProfile({ ...snapshot(), ...patch }, url), InstagramStop);
});
test('automatic research saves, deduplicates, follows bounded links, respects cancellation and persistent stop', async () => {
  const { SQLiteDatabase } = await import('../lib/storage/sqlite');
  const { CreatorStore } = await import('../lib/db');
  const { enqueue } = await import('../lib/job-input');
  const db = new SQLiteDatabase(join(dir, 'research.sqlite'));
  const store = new CreatorStore(db);
  let clock = Date.now();
  const reset = () => writeResearchState({ day: new Date(clock).toISOString().slice(0,10), visits: 0, lastVisitAt: 0, paused: false, reason: null, pausedAt: null });
  const request = { content: url, limit: 2, permission: 'Own synthetic research fixtures', discoverMentions: true };
  const enqueueTest = () => enqueue({ ...request, kind: 'instagram_browser', source: 'synthetic-fixtures' }, store);
  const waits: number[] = [];
  const deps = { now: () => clock, sleep: async (ms: number) => { waits.push(ms); clock += ms; }, read: async (u: string) => ({ status: 'loaded' as const, snapshot: { ...snapshot(new URL(u).pathname.split('/')[1]), profileLinks: [url, 'https://www.instagram.com/synthetic_related/', 'https://www.instagram.com/synthetic_related/','https://www.instagram.com/p/no/'] } }) };
  try {
    reset(); const id = await enqueueTest(); await researchInstagram(id, request, store, new AbortController().signal, deps);
    assert.equal((await store.snapshot()).creators.length, 2); assert.equal(readResearchState(clock).visits, 2); assert.equal(waits.length,2); assert.ok(waits.every(ms=>ms>=10000&&ms<=30000));
    const firstSource = (await store.snapshot()).creators[0].sources[0]; assert.equal(firstSource.provider, 'instagram-browser'); assert.ok(firstSource.collected_at);
    await researchInstagram(id, { ...request, limit: 1 }, store, new AbortController().signal, deps);
    assert.equal((await store.snapshot()).creators.length, 2);
    const cancelled = await enqueueTest(); await store.cancel(cancelled);
    await assert.rejects(researchInstagram(cancelled, request, store, new AbortController().signal, deps), /Cancelled/);
    const blocked = await enqueueTest();
    await assert.rejects(researchInstagram(blocked, request, store, new AbortController().signal, { ...deps, read: async () => { throw new InstagramStop('rate-limit', 'Synthetic 429'); } }), /Synthetic 429/);
    assert.equal(readResearchState(clock).paused, true);
    let calls = 0;
    await assert.rejects(researchInstagram(blocked, request, store, new AbortController().signal, { ...deps, read: async () => { calls++; return deps.read(url); } }), /paused/);
    assert.equal(calls, 0); resumeInstagram(); assert.equal(readResearchState().paused, false);
    const state = readResearchState(clock); writeResearchState({ ...state, visits: 30 });
    await assert.rejects(researchInstagram(blocked, request, store, new AbortController().signal, deps), /budget/);
    assert.equal(readResearchState(clock + 86400000).visits, 0);
  } finally { await db.close(); }
});

test('localized profile uses visible bio and never confuses takipçi with takip', async () => {
  const { classify } = await import('../lib/model');
  const s = { ...snapshot(), ogTitle: "Synthetic Creator (@synthetic_workspace) • Instagram", description: "31K Takipçi, 3,789 Takip, 605 Gönderi - Synthetic Creator'in (@synthetic_workspace) Instagram fotoğraflarını ve videolarını gör", visibleBiography: '🏠 | Home Decor, Tech, Sports, Lifestyle\n🎨 | Art, UGC Creator, Global Brands' };
  const p = extractInstagramProfile(s, url).profile!;
  assert.equal(p.biography, s.visibleBiography);
  assert.equal(p.followers_count, null);
  assert.equal(p.following_count, 3789);
  assert.equal(p.extraction?.metric_labels.following_count, '3,789');
  assert.equal(p.extraction?.biography_source, 'visible-profile-bio');
  assert.equal(p.extraction?.coverage?.comments, 'not_collected');
  const classification = classify(p);
  assert.equal(classification.primary_niche, 'Interior Design');
  assert.ok(classification.categories.includes('Tech / Gadgets'));
  assert.ok(classification.classification_evidence.some(e => e.keyword === 'home decor' && e.field === 'biography'));
  assert.ok(classification.classification_evidence.some(e => e.keyword === 'tech' && e.field === 'biography'));
  const missing = extractInstagramProfile({ ...s, visibleBiography: null }, url).profile!;
  assert.equal(missing.biography, null);
  assert.ok(missing.extraction?.warnings.some(w => w.startsWith('biography:')));
  assert.equal(classify(missing).classification_status, 'insufficient_evidence');
  assert.equal(classify(missing).classification_coverage.comments, false);
  const visible = extractInstagramProfile({ ...s, visibleStatLabels: [{ text: '30,8 B takipçi', exact: null }, { text: '3.607 takip', exact: null }] }, url).profile!;
  assert.equal(visible.following_count, 3607);
  assert.equal(visible.extraction?.metric_labels.followers_count, '30,8 B');
});

test('whole words, hashtags and specific phrases provide attributable evidence', async () => {
  const { classify } = await import('../lib/model');
  const p = profileSchema.parse({ username: 'synthetic', display_name: 'Homework and studyhall' });
  assert.equal(classify(p).primary_niche, null);
  const tagged = classify({ ...p, biography: '#homedecor #interiorinspo' });
  assert.equal(tagged.primary_niche, 'Interior Design');
  assert.equal(tagged.classification_evidence.length, 2);
  const phrase = classify({ ...p, biography: 'Home Decor' });
  assert.deepEqual(phrase.classification_evidence.map(e => e.keyword), ['home decor']);
  assert.equal(phrase.classification_coverage.post_captions, false);
});

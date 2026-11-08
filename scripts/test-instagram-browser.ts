import { chromium } from 'playwright';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchBrowser, closeBrowser } from '../lib/browser';
import assert from 'node:assert/strict';
import {searchInstagramTag} from '../lib/discovery-browser';
import { readInstagramProfile } from '../lib/instagram-browser';
import { extractInstagramProfile, InstagramStop } from '../lib/instagram-extract';
import { checkBrowserSession } from '../lib/browser-session';
async function main() {
  const dir=mkdtempSync(join(tmpdir(),'radar-instagram-browser-'));
  process.env.INSTAGRAM_STATE_FILE=join(dir,'state.json');process.env.BROWSER_SESSION_FILE=join(dir,'session.json');process.env.BROWSER_PROFILE=join(dir,'profile');process.env.BROWSER_PREFERENCES_FILE=join(dir,'browser-preferences.json');process.env.INSTAGRAM_LAYOUT_DIAGNOSTICS='false';
  const browser = await chromium.launch({ headless: true });
  try {
    const sessionContext=await browser.newContext();let sessionMode='authenticated';
    await sessionContext.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:sessionMode==='authenticated'?'<a href="/direct/inbox/">Messages</a>':sessionMode==='login_required'?'<input type="password">':'<div data-sitekey="synthetic">CAPTCHA fixture</div>'}):route.abort());
    for(const expected of ['authenticated','login_required','blocked']){sessionMode=expected;assert.equal((await checkBrowserSession(new AbortController().signal,sessionContext)).status,expected);}
    await sessionContext.close();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    let mode: 'public' | 'private' | 'login' | 'challenge' | 'limited' | 'denied' | 'delayed' | 'emptytag' | 'emptychallenge' = 'public';
    // Every browser request is fulfilled or aborted locally. No live Instagram traffic.
    await context.route('**/*', route => {
      if (route.request().isNavigationRequest()) {
        const fixture = readFileSync('fixtures/instagram-public.html', 'utf8');
        let html = mode==='emptytag'?'<main>No posts yet</main>':mode==='emptychallenge'?'<main>No posts yet<div data-sitekey="synthetic">CAPTCHA</div></main>':mode === 'private' ? fixture.replace('Synthetic desk setup and cozy gaming fixture.</div>', 'This account is private</div>') : mode === 'login' ? '<main><input type="password">Log in to continue</main>' : mode === 'challenge' ? '<main><div data-sitekey="synthetic">Confirm you are human</div></main>' : fixture;
        if(mode==='delayed')html=fixture.replace(/<title>[^<]*<\/title>/,'<title>Instagram</title>').replace(/(<meta property="og:title" content=")[^"]*/, '$1Instagram').replace('</body>',`<script>setTimeout(()=>{document.title='Synthetic Workspace (@synthetic_workspace)';document.querySelector('meta[property="og:title"]').content=document.title;},1200)</script></body>`);
        return route.fulfill({ status: mode === 'limited' ? 429 : mode==='denied'?403:200, contentType: 'text/html; charset=utf-8', body: html });
      }
      return route.abort();
    });
    const url = 'https://www.instagram.com/synthetic_workspace/';
    const controller = new AbortController();
    const loaded = await readInstagramProfile(url, controller.signal, context);
    assert.ok(loaded.snapshot);
    const result = extractInstagramProfile(loaded.snapshot, url);
    assert.equal(result.profile?.extraction?.biography_source, 'visible-profile-bio'); assert.equal(result.profile?.username, 'synthetic_workspace'); assert.equal(result.profile?.followers_count, 12345); assert.equal(result.profile?.following_count, 0); assert.equal(result.links[0], 'https://www.instagram.com/synthetic_related/');
    mode='delayed';const delayed=await readInstagramProfile(url,controller.signal,context);assert.ok(delayed.snapshot);assert.equal(extractInstagramProfile(delayed.snapshot,url).profile?.username,'synthetic_workspace');
    mode='emptytag';assert.equal((await searchInstagramTag({provider:'instagram_tags',keyword:'emptyfixture',url:'https://www.instagram.com/explore/tags/emptyfixture/'},20,controller.signal,context)).links.length,0);
    mode='emptychallenge';await assert.rejects(searchInstagramTag({provider:'instagram_tags',keyword:'emptyfixture',url:'https://www.instagram.com/explore/tags/emptyfixture/'},20,controller.signal,context),InstagramStop);
    mode = 'private'; const hidden = await readInstagramProfile(url, controller.signal, context); assert.ok(hidden.snapshot); assert.equal(extractInstagramProfile(hidden.snapshot, url).status, 'private');
    for (const gate of ['login','challenge'] as const) { mode = gate; await assert.rejects(readInstagramProfile(url, controller.signal, context), InstagramStop); }
    mode = 'limited'; await assert.rejects(readInstagramProfile(url, controller.signal, context), /HTTP 429/);
    mode='denied';await assert.rejects(readInstagramProfile(url,controller.signal,context),/HTTP 403/);
    controller.abort(); await assert.rejects(readInstagramProfile(url, controller.signal, context));
    // Full production job dispatch with a fresh local persistent profile and intercepted fixtures.
    process.env.RADAR_STORAGE = 'sqlite'; process.env.RADAR_DB = join(dir, 'radar.sqlite');
    process.env.BROWSER_PROFILE = join(dir, 'profile'); process.env.BROWSER_PREFERENCES_FILE=join(dir,'browser-preferences.json'); process.env.BROWSER_HEADLESS = 'false';
    process.env.INSTAGRAM_STATE_FILE = join(dir, 'research-state.json'); process.env.INSTAGRAM_BROWSER_ENABLED = 'true';
    const persistent = await launchBrowser();
    const modeProbe=await persistent.newPage();
    assert.match(await modeProbe.evaluate(()=>navigator.userAgent),/HeadlessChrome/);
    await modeProbe.close();
    const { db, store } = await import('../lib/db');
    try {
      await persistent.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync('fixtures/instagram-public.html', 'utf8') }) : route.abort());
      const { enqueue, runNext } = await import('../lib/jobs');
      const id = await enqueue({ kind: 'instagram_browser', content: url, source: 'local-synthetic-fixture', permission: 'Own synthetic browser research test fixture', limit: 1 });
      await runNext();
      const state = await store.snapshot();
      assert.equal(state.jobs.find(j => j.id === id)?.status, 'completed');
      assert.equal(state.creators.length, 1); assert.equal(state.creators[0].followers_count, 12345);
      assert.equal(state.creators[0].primary_niche, 'Desk Setup');
      assert.equal(state.creators[0].sources[0].source_identifier, url);
      assert.equal(state.creators[0].validation_status, 'needs_review');
      const evidence = state.creators[0].classification_evidence as { field: string }[];
      assert.ok(evidence.some(e => e.field === 'biography'));
      assert.equal((state.creators[0].classification_coverage as { comments: boolean }).comments, false);
    } finally { await closeBrowser(); await db.close(); }
    console.log('PASS: full Instagram job → Chromium → extraction → classification → DB, public fields, private skip, login/CAPTCHA/429 stop and cancellation. All source pages were synthetic local fixtures.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

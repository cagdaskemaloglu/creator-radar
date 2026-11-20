import { store, type CreatorStore } from './db';
import { CSVImportProvider, HTMLImportProvider } from './providers';
import { collectFixture, collectPage, launchBrowser, closeBrowser, navigateManually,openManualBrowser } from './browser';
import { jsonObject, safeId } from './storage/driver';
import { jobSchema } from './job-input';
import { researchInstagram } from './instagram-research';
import { researchNight } from './night-research';
import { resumeGoogle } from './google-state';
import { checkBrowserSession } from './browser-session';
import {restrictionDiagnostic} from './instagram-restriction';
import { resumeInstagram,pauseInstagram,assertAccessWindow } from './instagram-state';
export { enqueue } from './job-input';
export async function runNext(repository: CreatorStore = store, shutdown?: AbortSignal,dependencies:{checkSession?:typeof checkBrowserSession}={}) {
  if (shutdown?.aborted) return false;
  const row = await repository.claimJob();
  if (!row) return false;
  const id = safeId(row.id);
  const controller = new AbortController();
  const onShutdown = () => controller.abort(shutdown?.reason);
  shutdown?.addEventListener('abort',onShutdown,{once:true});
  let checking: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const p = jobSchema.parse(jsonObject(row.payload));
    await repository.log(id, 'Job started: ' + p.kind);
    if (await repository.isCancelled(id)) throw new Error('Cancelled');
    // Never overlap database polls, and always await an outstanding poll before closing.
    timer = setInterval(() => {
      if (!checking) checking = repository.isCancelled(id).then(cancelled => {
        if (cancelled) controller.abort();
      }).catch(() => controller.abort()).finally(() => { checking = undefined; });
    }, 200);
    if (p.kind === 'instagram_night') { await researchNight(id,p,repository,controller.signal); return true; }
    if (p.kind === 'instagram_browser') await researchInstagram(id, p, repository, controller.signal);
    else if (p.kind === 'google_discovery_resume') {resumeGoogle();await repository.log(id,'Operator resumed Google discovery after manual browser check; budgets preserved');}
    else if (p.kind === 'instagram_resume') { resumeInstagram(); await repository.log(id, 'Operator requested resume after manual check; budgets preserved; research access remains unverified'); }
    else if(p.kind==='browser_manual_chrome'||p.kind==='browser_use_manual_chrome')throw new Error('CHROME_DISABLED: Use dedicated Chromium. Legacy Chrome jobs are not executed.');
    else if (p.kind === 'browser_open') {assertAccessWindow();const ctx=await openManualBrowser();const page=await ctx.newPage();await page.goto('https://www.instagram.com/',{waitUntil:'domcontentloaded',timeout:Number(process.env.PAGE_TIMEOUT_MS??15000)});await repository.log(id,'Operator requested visible manual Chromium; background collection cannot use this visible context');}
    else if(p.kind==='browser_check_session'){assertAccessWindow();await closeBrowser();const result=await (dependencies.checkSession??checkBrowserSession)(controller.signal);if(result.restriction){pauseInstagram('INSTAGRAM_STOP:'+(result.restriction.status===429?'rate-limit':'access-denied')+': HTTP '+result.restriction.status+' during session check',result.restriction);await repository.log(id,'Instagram restriction detail: '+restrictionDiagnostic(result.restriction));}else if(result.status==='blocked'||result.status==='login_required')pauseInstagram('INSTAGRAM_STOP:'+(result.status==='blocked'?'challenge':'login')+': Manual attention required by session check');await repository.log(id,'Headless Chromium session check: '+result.status+'; session only; research access not verified; collection settings unchanged');}
    else if (p.kind === 'browser_close') await closeBrowser();
    else if (p.kind === 'browser_navigate'){assertAccessWindow();await navigateManually(p.source);}
    else {
      const content = p.kind === 'page' ? await collectPage(p.source, controller.signal) : p.kind === 'browser_fixture' ? await collectFixture(p.content, controller.signal) : p.content;
      const provider = p.kind === 'csv' ? new CSVImportProvider(content) : new HTMLImportProvider(content);
      const records = await provider.searchCreators({ limit: 501 });
      for (const record of records.slice(0, p.limit)) {
        if (await repository.isCancelled(id)) throw new Error('Cancelled');
        controller.signal.throwIfAborted();
        const outcome = await repository.saveProfile(record, { provider: p.kind === 'fixture' ? 'html-fixture' : p.kind === 'browser_fixture' ? 'browser-fixture' : p.kind === 'csv' ? 'csv' : 'authorized-browser', identifier: p.source, permission: p.permission });
        await repository.increment(id, outcome);
        await repository.log(id, `Record ${outcome}: ${record.username}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (records.length > p.limit) await repository.log(id, 'Configured record limit reached; remaining rows not collected.');
    }
    await repository.finish(id, await repository.isCancelled(id) ? 'cancelled' : 'completed');
    await repository.log(id, 'Job finished');
  } catch (error) {
    const cancelled = await repository.isCancelled(id);
    const message = cancelled ? 'Cancelled by user' : error instanceof Error ? error.message : 'Unknown failure';
    await repository.finish(id, cancelled ? 'cancelled' : 'failed', message);
    await repository.log(id, message);
  } finally { clearInterval(timer); await checking; shutdown?.removeEventListener('abort',onShutdown); }
  return true;
}

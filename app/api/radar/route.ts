import {scanStatus,startScan,stopScan} from '../../../lib/continuous-scan';
import {assertServerWaitElapsed} from '../../../lib/instagram-state';
import {carryResearchPool} from '../../../lib/research-continuation';
import {evaluateCreator,evaluationSummary,improvementQueue,accessSummary} from '../../../lib/research-operations';
import {isolateLegacyTagFailure} from '../../../lib/tag-recovery';
import {isolateLegacyProfileFailure} from '../../../lib/profile-recovery';
import {DiscoveryStore} from '../../../lib/discovery-store';
import { NextRequest, NextResponse } from 'next/server';
import { readBrowserSession } from '../../../lib/browser-session';
import { browserPreferences } from '../../../lib/browser-preferences';
import { readGoogleState } from '../../../lib/google-state';
import { NightStore } from '../../../lib/night-store';
import { store } from '../../../lib/db';
import { safeId,all } from '../../../lib/storage/driver';
import { researchLimits } from '../../../lib/instagram-policy';
import { readWorkerStatus,ensureWorkerRunning } from '../../../lib/worker-service';
import { startAutonomousResearch,autonomousPlan } from '../../../lib/autonomous-research';
import { readResearchState } from '../../../lib/instagram-state-read';
import { enqueue } from '../../../lib/job-input';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function guard(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Local access only');
  if (req.method !== 'GET' && req.headers.get('origin') !== `http://${host}`) throw new Error('Invalid origin');
}
export async function GET(req: NextRequest) {
  try { guard(req); } catch { return NextResponse.json({ error: 'Access denied' }, { status: 403 }); }
  try {
    const snapshot=await store.snapshot(),runs=await new NightStore(store).reports();
    const selected=req.nextUrl.searchParams.get('log_job_id');const logId=selected?safeId(selected):runs[0]?.job_id;
    const researchLogs=logId?await all(store.database,'SELECT id,job_id,message,created_at FROM logs WHERE job_id=$1 ORDER BY id DESC LIMIT 200',[safeId(logId)]):[];
    return NextResponse.json({ ...snapshot,continuousScan:await scanStatus(store),researchLogs,evaluations:await evaluationSummary(store),improvements:{pending:(await improvementQueue(store,[],{})).length},access:await accessSummary(store,readResearchState(),readBrowserSession().checked_at),tagPerformance:await new DiscoveryStore(store).keywordPerformance(),worker:readWorkerStatus(),limits:researchLimits(),defaults:autonomousPlan({}), researchBrowser:{channel:browserPreferences().channel,headless:true,session:readBrowserSession()}, googleDiscovery: readGoogleState(), nightRuns:runs, storage: store.database.dialect, instagram: { ...readResearchState(), enabled: process.env.INSTAGRAM_BROWSER_ENABLED !== 'false' } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Veritabanına erişilemiyor. Bağlantı ve migration durumunu kontrol et.' }, { status: 503 });
  }
}
export async function POST(req: NextRequest) {
  try {
    guard(req);
    if (Number(req.headers.get('content-length') ?? 0) > 1100000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    const text = await req.text();
    if (Buffer.byteLength(text) > 1100000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    const body = JSON.parse(text);
    if(body.action==='start_scan'){const result=await startScan(body,store);await ensureWorkerRunning();return NextResponse.json(result);}
    else if(body.action==='stop_scan'){return NextResponse.json(await stopScan(store));}
    else if(body.action==='start_research'){
      const result=await startAutonomousResearch({topics:body.topics,pages:body.pages,country:body.country,city:body.city,gender:body.gender,enrichmentShare:body.enrichmentShare},store);await ensureWorkerRunning();return NextResponse.json(result);
    }
    else if(body.action==='continue_pool'){const id=await carryResearchPool(safeId(body.id),store,body.nightMaxPages);await ensureWorkerRunning();return NextResponse.json({id});}
    else if(body.action==='evaluate'){await evaluateCreator(store,safeId(body.id),body);}
    else if (body.action === 'resume_night') {
      const prior=await new NightStore(store).run(safeId(body.id));if(Date.now()>=Date.parse(String(prior.started_at))+prior.settings.hours*3600000||Number(prior.page_requests)>=prior.settings.maxPages)throw Error('Bu turun süresi veya sayfa bütçesi dolmuş. Kalan havuzla yeni tur başlat.');
      await isolateLegacyProfileFailure(safeId(body.id),store);
      await isolateLegacyTagFailure(safeId(body.id),store);
      if (readResearchState().paused) throw new Error('Önce araştırma tarayıcısını kontrol edip kaynak kilidini kaldır.');
      const night=new NightStore(store);const run=await night.run(safeId(body.id));
      if(run.settings.discovery?.enabled&&run.settings.discovery.providers.includes('google')&&readGoogleState().paused)throw new Error('Önce Google keşif tarayıcısını kontrol edip kaynak kilidini kaldır.');
      await night.resume(safeId(body.id));await ensureWorkerRunning();
    }
    else if (body.action === 'cancel') await store.cancel(safeId(body.id));
    else if (body.action === 'review') await store.review(safeId(body.id), body.status);
    else if (body.action === 'suppress') await store.suppress(safeId(body.id));
    else {if(['instagram_resume','browser_check_session','browser_open','browser_navigate'].includes(body.kind))assertServerWaitElapsed();const id=await enqueue(body);if(['browser_open','browser_close','browser_check_session','instagram_resume'].includes(body.kind))await ensureWorkerRunning();return NextResponse.json({ id });}
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Connection/SQL errors must never expose connection strings or server internals.
    const databaseError = error && typeof error === 'object' && ('code' in error || 'severity' in error);
    return NextResponse.json({ error: databaseError ? 'Veritabanı işlemi başarısız. Bağlantı ve migration durumunu kontrol et.' : error instanceof Error ? error.message : 'Request failed' }, { status: databaseError ? 503 : 400 });
  }
}

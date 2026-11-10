import {jsonObject} from '../lib/storage/driver';
import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { PostgresDatabase, postgresConfig } from '../lib/storage/postgres';
import { migrate } from '../lib/storage/migrate';
import assert from 'node:assert/strict';
async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}
async function stop(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited; clearTimeout(timer);
}
async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'radar-smoke-'));
  const postgres = process.argv.includes('--postgres');
  const env: NodeJS.ProcessEnv = { ...process.env, RADAR_STORAGE: postgres ? 'postgres' : 'sqlite', RADAR_DB: join(dir, 'radar.sqlite'), BROWSER_PROFILE: join(dir, 'browser-profile'), BROWSER_HEADLESS: 'true', INSTAGRAM_STATE_FILE: join(dir, 'instagram-state.json'), GOOGLE_DISCOVERY_STATE_FILE: join(dir,'google-state.json'), BROWSER_PREFERENCES_FILE:join(dir,'browser-preferences.json'), BROWSER_SESSION_FILE:join(dir,'session.json'), WORKER_HEARTBEAT_FILE:join(dir,'heartbeat.json'),WORKER_AUTO_START:'false',INSTAGRAM_BROWSER_ENABLED:'true',INSTAGRAM_DAILY_PAGES:'0' };
  let cluster: EmbeddedPostgres | undefined, server: ChildProcess | undefined, worker: ChildProcess | undefined, browser;
  let started = false, output = '';let localDatabase:import('../lib/storage/driver').Database|undefined;
  try {
    if (postgres) {
      const port = await availablePort();
      cluster = new EmbeddedPostgres({ databaseDir: join(dir, 'cluster'), port, user: 'radar_smoke', password: 'local-smoke-only', persistent: true, createPostgresUser: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', `unix_socket_directories=${dir}`], onLog: () => {}, onError: () => {} });
      await cluster.initialise(); await cluster.start(); started = true;
      await cluster.createDatabase('smoke');
      env.DATABASE_URL = `postgres://radar_smoke:local-smoke-only@127.0.0.1:${port}/smoke`;
      env.DATABASE_SSL = 'disable'; delete env.DATABASE_CA_FILE;
      const db = new PostgresDatabase(postgresConfig(env));
      try { await migrate(db); } finally { await db.close(); }
    }
    Object.assign(process.env,env);
    const {db,store}=await import('../lib/db');localDatabase=db;
    const {enqueue}=await import('../lib/job-input'),{runNext}=await import('../lib/jobs');
    await enqueue({kind:'browser_fixture',content:readFileSync('fixtures/creator.html','utf8'),source:'synthetic-smoke-fixture',permission:'Own synthetic local dashboard fixture',limit:2});await runNext();
    const {efficientContract}=await import('../tests/efficient-contract');await efficientContract(store);
    const {writeResearchState}=await import('../lib/instagram-state');writeResearchState({day:new Date().toISOString().slice(0,10),visits:9999,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
    for(const creator of (await store.snapshot()).creators)await store.saveProfile({...creator,synthetic:false,biography:(creator.biography??'')+(creator.username==='synthetic_desk_demo'?' | Contact: collab@example.com':'')} as never,{provider:'browser-fixture',identifier:'synthetic-smoke-fixture',permission:'Own synthetic local dashboard fixture'});
    const {profileSchema}=await import('../lib/model');
    for(const [username,biography] of [['tr_declared_fixture','Based in Istanbul, Turkey'],['tr_estimated_fixture','Canlı yayınlar ve oyun videoları kanalıma abone olmayı unutmayın'],['tr_unknown_fixture','Gaming Twitch Discord YouTube']])await store.saveProfile(profileSchema.parse({username,biography,synthetic:false,research_target:{country:'TR'}}),{provider:'fixture',identifier:'local-country-fixture',permission:'Own synthetic country fixture'});
    await store.saveProfile(profileSchema.parse({username:'synthetic_shopier',biography:'Home decor. Based in Turkey. Sipariş için mağazamız.',external_links:['https://shopier.com/synthetic'],synthetic:false}),{provider:'fixture',identifier:'commerce-fixture',permission:'Own synthetic fixture'});
    const {NightStore}=await import('../lib/night-store'),{pauseInstagram}=await import('../lib/instagram-state'),{isolatedProfileLayoutReason}=await import('../lib/profile-read-policy');
    const legacyId=await enqueue({kind:'instagram_night',source:'synthetic-legacy-layout',permission:'Own synthetic legacy profile fixture',content:'https://www.instagram.com/synthetic_unreadable/',limit:1});
    const legacy=new NightStore(store);await legacy.initialize(legacyId,{efficientResearch:true,maxProfiles:1,maxPages:20,maxPosts:0,maxDepth:0,hours:8,permission:'Own synthetic legacy profile fixture',seeds:['https://www.instagram.com/synthetic_unreadable/']});const legacyCandidate=await legacy.next(legacyId);await legacy.reserve(legacyId,Number(legacyCandidate?.id));await store.log(legacyId,'Night profile: https://www.instagram.com/synthetic_unreadable/');await legacy.stop(legacyId,'paused',isolatedProfileLayoutReason);pauseInstagram(isolatedProfileLayoutReason);const legacyStarted=(await legacy.run(legacyId)).started_at;
    const {DiscoveryFrontier,discoveryScope}=await import('../lib/discovery-frontier'),{DiscoveryStore}=await import('../lib/discovery-store');const smokeScope=discoveryScope(['Gaming'],{country:'TR'});await new DiscoveryFrontier(store).seed(smokeScope,[{keyword:'oyun',origin:'curated',priority:2,evidence:[]}]);
    const legacySettings=(await legacy.run(legacyId)).settings;await db.query('UPDATE research_runs SET settings=$1 WHERE job_id=$2',[JSON.stringify({...legacySettings,discovery:{enabled:false,topics:['Gaming'],keywords:['oyun'],providers:['instagram_tags'],maxQueries:1,resultsPerQuery:1,scopeKey:smokeScope}}),legacyId]);
    const smokePool=new DiscoveryStore(store);await smokePool.initialize(legacyId,[{keyword:'oyun',provider:'instagram_tags',url:'https://www.instagram.com/explore/tags/oyun/'}]);const smokeQuery=(await smokePool.queries(legacyId))[0];await smokePool.complete(legacyId,Number(smokeQuery.id),[{kind:'post',url:'https://www.instagram.com/p/SmokeOwnerFailure/',title:''}]);await smokePool.acceptAuthor(legacyId,Number((await smokePool.report(legacyId)).results[0].id),null,null,'post_identity_mismatch');
    const appPort=await availablePort(),base=`http://127.0.0.1:${appPort}`;
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{env,stdio:['ignore','pipe','pipe']});
    server.stdout?.on('data',value=>{output+=value;});server.stderr?.on('data',value=>{output+=value;});
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/radar')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, 'Application did not become ready');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(base);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.getByRole('heading',{name:'Araştırma merkezi',exact:true}).waitFor();
    await page.getByLabel('Ölçülen çalışma süresi',{exact:true}).waitFor();assert.match(await page.getByLabel('Ölçülen çalışma süresi',{exact:true}).textContent()??'',/Bu eski turda aktif süre ölçülmedi/);
    await page.getByLabel('Kalıcı keşif havuzu',{exact:true}).waitFor();await page.getByText('Gönderi sahibi doğrulama sorunları',{exact:true}).click();await page.getByText('Gönderi kimliği eşleşmedi:',{exact:false}).waitFor();
    await page.getByLabel('Araştırma hedefi sonuçları',{exact:true}).waitFor();await page.getByText('Belirsizlik ve ek inceleme',{exact:true}).click();await page.getByText('Bu turdaki eski kayıtlar için ek inceleme katkısı ölçümü bulunmuyor.',{exact:true}).waitFor();
    await page.getByText('Günlük toplam ziyaret sınırı yok.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Sorunlu profili atla ve devam et',exact:true}).click();await page.getByRole('button',{name:'Durdur',exact:true}).waitFor();
    const recovered=await(await fetch(base+'/api/radar')).json();assert.equal(recovered.instagram.paused,false);assert.equal(recovered.instagram.visits,9999);assert.equal((await legacy.run(legacyId)).started_at,legacyStarted);assert.equal((await legacy.run(legacyId)).page_requests,1);
    await page.getByRole('button',{name:'Durdur',exact:true}).click();await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).waitFor();
    const tagLegacy=await enqueue({kind:'instagram_night',source:'synthetic-legacy-tag-layout',permission:'Own synthetic legacy tag fixture',content:'',discoveryEnabled:true,discoveryKeywords:['legacytagfixture'],discoveryProviders:['instagram_tags'],limit:1});
    await legacy.initialize(tagLegacy,{efficientResearch:true,maxProfiles:1,maxPages:20,maxPosts:0,maxDepth:0,hours:8,permission:'Own synthetic legacy tag fixture',seeds:[],discovery:{enabled:true,topics:[],keywords:['legacytagfixture'],providers:['instagram_tags'],maxQueries:1,resultsPerQuery:20}});await smokePool.initialize(tagLegacy,[{keyword:'legacytagfixture',provider:'instagram_tags',url:'https://www.instagram.com/explore/tags/legacytagfixture/'}]);const tagQuery=(await smokePool.queries(tagLegacy))[0];await smokePool.reserve(tagLegacy,Number(tagQuery.id));await smokePool.appendResults(tagLegacy,Number(tagQuery.id),[{kind:'post',url:'https://www.instagram.com/p/LegacyTagCheckpoint/',title:''}]);
    const oldTagReason='INSTAGRAM_STOP:layout: Tag result links unavailable after bounded render wait; main text length=65; page kept open for manual inspection';await smokePool.failed(Number(tagQuery.id),oldTagReason,true);await legacy.stop(tagLegacy,'paused',oldTagReason);pauseInstagram(oldTagReason);await store.log(tagLegacy,'Night run paused: '+oldTagReason);const tagStarted=(await legacy.run(tagLegacy)).started_at;
    await page.getByRole('button',{name:'Sorunlu etiketi atla ve devam et',exact:true}).click();await page.getByRole('button',{name:'Durdur',exact:true}).waitFor();const tagRecovered=await(await fetch(base+'/api/radar')).json();assert.equal(tagRecovered.instagram.paused,false);assert.equal(tagRecovered.instagram.visits,9999);assert.equal((await legacy.run(tagLegacy)).started_at,tagStarted);assert.equal((await legacy.run(tagLegacy)).page_requests,1);assert.equal((await smokePool.queries(tagLegacy))[0].status,'skipped');assert.equal((await smokePool.pendingPosts(tagLegacy)).length,1);await page.getByRole('button',{name:'Durdur',exact:true}).click();await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).waitFor();
    await page.getByRole('button',{name:'Kalan havuzla yeni tur',exact:true}).click();await page.getByRole('button',{name:'Durdur',exact:true}).waitFor();const carried=await(await fetch(base+'/api/radar')).json();const carriedPayload=jsonObject((await db.query('SELECT payload FROM ingestion_jobs WHERE id=$1',[carried.jobs[0].id])).rows[0].payload);assert.equal(carriedPayload.poolSourceJob,tagLegacy);assert.equal((await legacy.run(tagLegacy)).page_requests,1);await page.getByRole('button',{name:'Durdur',exact:true}).click();await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).waitFor();
    await page.locator('summary').filter({hasText:'Etiket verimi'}).click();
    await page.getByRole('cell',{name:'#contractone',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Kaynak türü').count(),0);assert.equal(await page.locator('textarea').count(),0);
    await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).click();
    await page.getByRole('button',{name:'Durdur',exact:true}).waitFor();
    let state=await(await fetch(base+'/api/radar')).json();const researchId=state.jobs[0].id;
    assert.equal(state.jobs[0].kind,'instagram_night');assert.equal(state.jobs[0].status,'queued');
    const payload=jsonObject((await db.query('SELECT payload FROM ingestion_jobs WHERE id=$1',[researchId])).rows[0].payload);
    assert.equal(payload.efficientResearch,true);assert.equal(payload.selectiveReview,true);assert.equal(payload.limit,50);assert.equal(payload.content,'');assert.equal(payload.discoveryEnabled,true);assert.ok((payload.discoveryKeywords as string[]).includes('cozyroom'));
    await store.log(researchId,'Discovery found 20 normalized links for cozyroom');
    await page.getByRole('log').getByText('20 bağlantı havuza alındı · #cozyroom',{exact:true}).waitFor();
    await page.screenshot({path:join(dir,'dashboard.png'),fullPage:true});
    await page.getByRole('button',{name:'Durdur',exact:true}).click();
    await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).waitFor({state:'visible'});
    state=await(await fetch(base+'/api/radar')).json();assert.equal(state.jobs[0].status,'cancelled');
    await page.getByLabel('Ana kategori',{exact:true}).selectOption('Güzellik & bakım');
    await page.getByLabel('Alt kategori',{exact:true}).selectOption('Makyaj');
    await page.getByLabel('Yaşadığı ülke',{exact:true}).selectOption('TR');
    await page.getByLabel('Şehir',{exact:true}).fill('İstanbul');
    await page.getByLabel('Cinsiyet beyanı',{exact:true}).selectOption('female');
    await page.getByLabel('Sayfa bütçesi',{exact:true}).selectOption('200');
    await page.getByLabel('Sayfa bütçesi',{exact:true}).selectOption('25');await page.getByLabel('Çalışma biçimi',{exact:true}).selectOption('50');
    await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).click();
    await page.getByRole('button',{name:'Durdur',exact:true}).waitFor();
    state=await(await fetch(base+'/api/radar')).json();
    const filteredPayload=jsonObject((await db.query('SELECT payload FROM ingestion_jobs WHERE id=$1',[state.jobs[0].id])).rows[0].payload);
    assert.deepEqual(filteredPayload.target,{country:'TR',city:'İstanbul',gender:'female'});assert.equal(filteredPayload.nightMaxPages,25);assert.equal(filteredPayload.enrichmentMaxPages,12);assert.ok((filteredPayload.discoveryKeywords as string[]).includes('makeup'));
    await page.getByRole('button',{name:'Durdur',exact:true}).click();
    await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).waitFor();

    await page.getByRole('button',{name:/^Hesaplar \d/}).click();
    for(const [status,username] of [['matched','tr_declared_fixture'],['estimated','tr_estimated_fixture'],['unknown','tr_unknown_fixture']]){await page.getByLabel('Türkiye sonucu',{exact:true}).selectOption(status);await page.getByRole('button',{name:`@${username} hesabını incele`,exact:true}).waitFor();for(const other of ['tr_declared_fixture','tr_estimated_fixture','tr_unknown_fixture'].filter(n=>n!==username))assert.equal(await page.getByRole('button',{name:`@${other} hesabını incele`,exact:true}).count(),0);}
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:1440,height:1000});
    await page.getByLabel('Türkiye sonucu',{exact:true}).selectOption('');
    await page.getByLabel('Ülke filtresi',{exact:true}).selectOption('TR');await page.getByLabel('Kategori',{exact:true}).selectOption('Interior Design');await page.getByLabel('Satış durumu',{exact:true}).selectOption('sales_signals');await page.getByLabel('Satış kanalı',{exact:true}).selectOption('shopier');await page.getByRole('button',{name:'@synthetic_shopier hesabını incele',exact:true}).waitFor();assert.equal(await page.locator('.accounts-table tbody tr').count(),1);await page.getByRole('button',{name:'@synthetic_shopier hesabını incele',exact:true}).click();await page.getByRole('heading',{name:'Satış ve kanallar',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Kanalı aç',exact:true}).getAttribute('href'),'https://shopier.com/synthetic');await page.getByRole('button',{name:'Detayı kapat',exact:true}).click();await page.getByLabel('Ülke filtresi',{exact:true}).selectOption('');await page.getByLabel('Kategori',{exact:true}).selectOption('');await page.getByLabel('Satış durumu',{exact:true}).selectOption('');await page.getByLabel('Satış kanalı',{exact:true}).selectOption('');
    await page.getByLabel('E-postası olanlar',{exact:true}).check();
    await page.getByRole('cell',{name:'collab@example.com',exact:true}).waitFor();
    await page.getByLabel('E-postası olanlar',{exact:true}).uncheck();
    await page.getByRole('button',{name:'@synthetic_desk_demo hesabını incele',exact:true}).click();
    await page.getByRole('dialog').getByRole('heading',{name:'Kategori kanıtları',exact:true}).waitFor();await page.getByRole('dialog').getByRole('heading',{name:'Araştırma hedefi',exact:true}).waitFor();
    await page.getByRole('dialog').getByText('collab@example.com',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Kategori doğru',exact:true}).click();await page.getByRole('dialog').getByRole('status').filter({hasText:'Kategori değerlendirmesi kaydedildi.'}).waitFor();assert.equal((await(await fetch(base+'/api/radar')).json()).evaluations.correct,1);await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'İncelendi olarak işaretle',exact:true}).click();
    await page.getByRole('cell',{name:'İncelendi',exact:true}).waitFor();
    await page.getByLabel('Hesap ara').fill('synthetic_desk_demo');
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'CSV dışa aktar',exact:true}).click();
    const download=await downloaded;assert.equal(download.suggestedFilename(),'creator-radar.csv');
    const csv=readFileSync((await download.path())!,'utf8');assert.ok(csv.includes('collab@example.com'));assert.ok(csv.includes('email_sources'));assert.ok(csv.includes('sales_channels'));assert.ok(csv.includes('selling_status'));assert.ok(csv.includes('country_match'));assert.ok(csv.includes('research_match'));assert.ok(csv.includes('category_match'));assert.ok(csv.includes('uncertainty_reasons'));assert.ok(csv.includes('review_resolved'));assert.ok(csv.includes('turkey_status'));assert.ok(csv.includes('https://www.instagram.com/synthetic_desk_demo/'));
    await page.getByLabel('Hesap ara').fill('no-matching-account');await page.getByRole('heading',{name:'Filtrelere uygun hesap bulunamadı',exact:true}).waitFor();
    await page.getByLabel('Hesap ara').fill('');
    await page.getByRole('button',{name:'Chromium',exact:true}).click();await page.getByRole('dialog').getByRole('heading',{name:'Oturum ve bağlantı',exact:true}).waitFor();await page.getByLabel('Kaynak erişim geçmişi',{exact:true}).waitFor();
    const future=new Date(Date.now()+600000).toISOString(),httpDetail={status:429 as const,url:'https://www.instagram.com/graphql/query',page_url:'https://www.instagram.com/p/Smoke429/',method:'POST',resource_type:'fetch',main_document:false,observed_at:new Date().toISOString(),retry_after_at:future,retry_after_seconds:600};pauseInstagram('INSTAGRAM_STOP:rate-limit: HTTP 429; no retry attempted',httpDetail);const {browserPreferences}=await import('../lib/browser-preferences');writeFileSync(env.BROWSER_SESSION_FILE!,JSON.stringify({profile:browserPreferences().profile,status:'authenticated',checked_at:new Date().toISOString()}));
    await page.getByText('Oturum açık. Bu test yalnız giriş durumunu doğrular; araştırma erişimini doğrulamaz.',{exact:true}).waitFor();await page.getByLabel('Sunucu bekleme süresi',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Yerel durdurmayı kaldır',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Pencereyi kapat ve oturumu kontrol et',exact:true}).isDisabled(),true);
    assert.equal((await fetch(base+'/api/radar',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({kind:'instagram_resume',source:'synthetic-too-early',permission:'Own synthetic early resume fixture'})})).status,400);
    const {readResearchState}=await import('../lib/instagram-state');writeResearchState({...readResearchState(),lastResearchSuccessAt:new Date(Date.now()-602000).toISOString(),retryNotBefore:new Date(Date.now()-1000).toISOString(),lastHttpRestriction:{...httpDetail,observed_at:new Date(Date.now()-601000).toISOString(),retry_after_at:new Date(Date.now()-1000).toISOString()}});for(let i=0;i<30&&await page.getByRole('button',{name:'Yerel durdurmayı kaldır',exact:true}).isDisabled();i++)await page.waitForTimeout(100);assert.equal((await(await fetch(base+'/api/radar')).json()).instagram.paused,true);const resumeQueued=page.waitForResponse(r=>r.url()===base+'/api/radar'&&r.request().method()==='POST'&&r.request().postDataJSON()?.kind==='instagram_resume');await page.getByRole('button',{name:'Yerel durdurmayı kaldır',exact:true}).click();assert.equal((await resumeQueued).status(),200);await runNext();await page.getByRole('status').filter({hasText:'Son erişim hatasından sonra araştırma erişimi henüz doğrulanmadı'}).waitFor();assert.equal((await(await fetch(base+'/api/radar')).json()).access.research_status,'not_rechecked');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);await page.setViewportSize({width:1440,height:1000});await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Araştırma',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:join(dir,'mobile-dashboard.png'),fullPage:true});
    await page.getByLabel('Kategoriyi otomatik seç',{exact:true}).uncheck();await page.getByLabel('Yaşadığı ülke',{exact:true}).selectOption('TR');await page.getByLabel('Şehir',{exact:true}).fill('');
    await page.getByRole('button',{name:'Otomatik taramayı başlat',exact:true}).click();await page.getByRole('button',{name:'Otomatik taramayı durdur',exact:true}).waitFor();
    const scan=await import('../lib/continuous-scan');const initialScan=await scan.scanStatus(store);assert.equal(initialScan.enabled,true);assert.equal(initialScan.config.country,'TR');assert.deepEqual(initialScan.config.topics,['Makyaj']);
    const fakeScanStart=async()=>({id:await store.enqueue('instagram_night','{}'),reused:false,continued:false});await scan.tickScan(store,Date.now(),fakeScanStart);const scanJob=(await scan.scanStatus(store)).job_id!;await store.finish(scanJob,'completed');await scan.tickScan(store,Date.now()+61000,fakeScanStart);assert.equal((await scan.scanStatus(store)).cycle,2);
    const {TechnicalQuarantine}=await import('../lib/technical-recovery');await new TechnicalQuarantine(store).add('profile','https://www.instagram.com/smoke_quarantine/','network_error');
    await db.query("UPDATE continuous_scan SET status='recovering',message='Geçici teknik sorun: toparlanma bekleniyor.',next_at=$1 WHERE id=1",[new Date(Date.now()+120000).toISOString()]);
    await page.getByLabel('Otomatik devam zamanı',{exact:true}).waitFor();await page.getByText(/sorunlu adres geçici olarak ayrıldı/).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.getByRole('button',{name:'Otomatik taramayı durdur',exact:true}).click();await page.getByRole('button',{name:'Otomatik taramayı başlat',exact:true}).waitFor();const stoppedScan=await scan.scanStatus(store);assert.equal(stoppedScan.enabled,false);assert.equal(await store.isCancelled(stoppedScan.job_id!),true);await store.finish(stoppedScan.job_id!,'cancelled');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
    const portalJobsBefore=(await store.snapshot()).jobs.length;
    await page.getByRole('link',{name:'Müşteri portalı',exact:true}).click();await page.getByRole('heading',{name:/Markana uygun/}).waitFor();await page.getByRole('heading',{name:/hesap bulundu$/}).waitFor();assert.equal(await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Chromium',exact:true}).count(),0);
    await page.getByLabel('Portal kategorisi',{exact:true}).selectOption('Interior Design');await page.getByLabel('Portal ülkesi',{exact:true}).selectOption('TR');await page.getByText('Daha fazla filtre',{exact:true}).click();await page.getByLabel('Portal satış durumu',{exact:true}).selectOption('sales_signals');await page.getByLabel('Portal satış kanalı',{exact:true}).selectOption('shopier');await page.getByRole('button',{name:'Hesapları keşfet',exact:true}).click();await page.getByRole('heading',{name:'1 hesap bulundu',exact:true}).waitFor();await page.getByRole('button',{name:'@synthetic_shopier profilini incele',exact:true}).click();await page.getByRole('dialog').getByRole('heading',{name:'Satış kanalları',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').getByRole('button',{name:'İncelendi olarak işaretle',exact:true}).count(),0);await page.getByRole('button',{name:'Profili kapat',exact:true}).click();
    await page.getByLabel('Portal araması',{exact:true}).fill('no_such_creator_fixture');await page.getByRole('button',{name:'Hesapları keşfet',exact:true}).click();await page.getByRole('heading',{name:'Bu aramada eşleşme bulunamadı',exact:true}).waitFor();await page.getByRole('button',{name:'Temizle',exact:true}).click();await page.locator('.portal-card').first().waitFor();assert.equal(await page.locator('.portal-card').count(),12);await page.getByRole('button',{name:'Sonraki',exact:true}).click();await page.getByText(/Sayfa 2 \/ /).waitFor();await page.getByRole('button',{name:'Önceki',exact:true}).click();await page.getByText(/Sayfa 1 \/ /).waitFor();
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:join(dir,'portal-desktop.png')});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:join(dir,'portal-mobile.png')});await page.getByRole('heading',{name:/hesap bulundu$/}).scrollIntoViewIfNeeded();await page.screenshot({path:join(dir,'portal-mobile-results.png')});assert.equal((await store.snapshot()).jobs.length,portalJobsBefore);assert.deepEqual(errors,[]);
    const portalResponse=await(await fetch(base+'/api/portal?country=TR&category=Interior%20Design&channel=shopier')).json();assert.equal(portalResponse.total,1);assert.equal('jobs' in portalResponse,false);assert.equal('logs' in portalResponse,false);assert.equal('researchBrowser' in portalResponse,false);assert.equal((await fetch(base+'/api/portal',{method:'POST',headers:{Origin:base},body:'{}'})).status,405);assert.equal((await fetch(base+'/api/portal?country=INVALID')).status,400);const {request:httpRequest}=await import('node:http');const foreignHost=await new Promise<number>((resolve,reject)=>{const req=httpRequest(base+'/api/portal',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode!);});req.on('error',reject);req.end();});assert.equal(foreignHost,403);
    assert.equal((await fetch(base + '/api/radar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
    assert.equal((await fetch(base + '/api/radar', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ kind: 'page', source: 'https://www.instagram.com/demo/', permission: 'Explicit test permission', limit: 1 }) })).status, 400);
    console.log(`PASS (${env.RADAR_STORAGE}): headless fixture → DB → seedless one-click dashboard start/cancel/live logs → review/filter/export → mobile/guards. All data local synthetic fixtures. Screenshot: ${join(dir, 'dashboard.png')}`);
  } catch (error) { console.error(output); throw error; }
  finally {
    await browser?.close();
    await Promise.all([stop(server), stop(worker)]);
    await localDatabase?.close();
    if (started) await cluster?.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

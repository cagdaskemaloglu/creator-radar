import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { PostgresDatabase, postgresConfig } from '../lib/storage/postgres';
import { SQLiteDatabase } from '../lib/storage/sqlite';
import { migrate } from '../lib/storage/migrate';
import { transferSQLiteToPostgres, TRANSFER_TABLES } from '../lib/storage/transfer';
import { first, all, jsonObject } from '../lib/storage/driver';
// Prevent singleton modules from opening the user's database.
const dir = mkdtempSync(join(tmpdir(), 'radar-postgres-'));
process.env.RADAR_STORAGE = 'sqlite';
process.env.RADAR_DB = join(dir, 'singleton.sqlite');
process.env.INSTAGRAM_STATE_FILE = join(dir, 'research-state.json');
process.env.GOOGLE_DISCOVERY_STATE_FILE = join(dir,'google-state.json');
async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}
test('real PostgreSQL migrations, shared storage contract, transfer and rollback', { timeout: 120000 }, async t => {
  const port = await availablePort();
  const cluster = new EmbeddedPostgres({ databaseDir: join(dir, 'cluster'), port, user: 'radar_test', password: 'local-test-only', persistent: true, createPostgresUser: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', `unix_socket_directories=${dir}`], onLog: () => {}, onError: () => {} });
  const databases: PostgresDatabase[] = [];
  let started = false;
  try {
    await cluster.initialise(); await cluster.start(); started = true;
    const connect = async (name: string) => {
      await cluster.createDatabase(name);
      const db = new PostgresDatabase(postgresConfig({ DATABASE_URL: `postgres://radar_test:local-test-only@127.0.0.1:${port}/${name}` }));
      databases.push(db); return db;
    };
    const target = await connect('contract');
    await t.test('migrations are transactional, idempotent and checksum protected', async () => {
      assert.equal((await migrate(target, { check: true })).length, 8);
      assert.equal((await migrate(target)).length, 8);
      assert.deepEqual(await migrate(target), []);
      const changed = join(dir, 'changed'); mkdirSync(changed);
      writeFileSync(join(changed, '003_discovery.sql'),readFileSync('migrations/003_discovery.sql','utf8'));
      writeFileSync(join(changed, '002_night_research.sql'),readFileSync('migrations/002_night_research.sql','utf8'));
      writeFileSync(join(changed, '001_supabase.sql'), readFileSync('migrations/001_supabase.sql', 'utf8') + '\n-- tampered\n');
      await assert.rejects(migrate(target, { directory: changed }), /differs/);
      const failing = join(dir, 'failing'); mkdirSync(failing);
      writeFileSync(join(failing, '001_bad.sql'), 'create table should_rollback(id int); SELECT missing_column FROM missing_table;');
      const clean = await connect('migration_rollback');
      await assert.rejects(migrate(clean, { directory: failing }));
      assert.equal((await first(clean, "SELECT to_regclass('public.should_rollback') AS name"))?.name, null);
      assert.equal((await first(clean, "SELECT to_regclass('public.radar_schema_migrations') AS name"))?.name, null);
      const tables = await all(target, "SELECT relname FROM pg_class WHERE relname IN ('creators','creator_sources','creator_metrics','suppressions','ingestion_jobs','logs','research_runs','research_candidates','research_posts','discovery_queries','discovery_results','discovery_frontier','discovery_observations','candidate_work','creator_evaluations','continuous_scan','research_activity','research_quarantine') AND relrowsecurity");
      assert.equal(tables.length, 18);
    });
    const { CreatorStore } = await import('../lib/db');
    const { storageContract } = await import('./storage-contract');
    await t.test('same ingestion contract on native PostgreSQL', () => storageContract(new CreatorStore(target)));
    const {nightContract}=await import('./night-contract');
    await t.test('persistent night run and caption evidence on native PostgreSQL',()=>nightContract(new CreatorStore(target)));
    const {discoveryContract}=await import('./discovery-contract');
    await t.test('seedless discovery and search provenance on native PostgreSQL',()=>discoveryContract(new CreatorStore(target)));
    await t.test('concurrent one-click starts create one PostgreSQL research job',async()=>{
      const auto=await connect('autonomous');await migrate(auto);
      const {startAutonomousResearch}=await import('../lib/autonomous-research');
      const {writeResearchState}=await import('../lib/instagram-state');
      writeResearchState({day:new Date().toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
      const store=new CreatorStore(auto),results=await Promise.all([startAutonomousResearch({},store),startAutonomousResearch({},store)]);
      assert.equal(results[0].id,results[1].id);assert.equal(Number((await first(auto,'SELECT count(*) n FROM ingestion_jobs'))?.n),1);
    });
    await t.test('continuous scan is durable, serial and cancellable on PostgreSQL',async()=>{
      const d=await connect('continuous');await migrate(d);const store=new CreatorStore(d),scan=await import('../lib/continuous-scan');const {writeResearchState}=await import('../lib/instagram-state');writeResearchState({day:new Date().toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
      await scan.startScan({topics:['Gaming'],country:'TR'},store);let calls=0;const fake=async()=>{calls++;return{id:await store.enqueue('instagram_night','{}'),reused:false,continued:false};};await Promise.all([scan.tickScan(store,Date.now(),fake),scan.tickScan(store,Date.now(),fake)]);assert.equal(calls,1);const state=await scan.scanStatus(store);assert.equal(state.cycle,1);await scan.stopScan(store);assert.equal(await store.isCancelled(state.job_id!),true);assert.equal((await scan.scanStatus(store)).enabled,false);
    });
    const {efficientContract}=await import('./efficient-contract');
    await t.test('small-batch continuation and yield ranking on native PostgreSQL',async()=>{const efficient=await connect('efficient');await migrate(efficient);await efficientContract(new CreatorStore(efficient));});
    const {poolContract}=await import('./pool-contract');
    await t.test('related pool expansion and isolated profile recovery on native PostgreSQL',async()=>{const pool=await connect('pool_recovery');await migrate(pool);await poolContract(new CreatorStore(pool));});
    const {tagScrollContract}=await import('./tag-scroll-contract');
    await t.test('tag load metering and partial discovery checkpoints on native PostgreSQL',async()=>{const scroll=await connect('tag_scroll');await migrate(scroll);await tagScrollContract(new CreatorStore(scroll));});
    const {frontierContract}=await import('./frontier-contract');
    await t.test('persistent scoped frontier, learning evidence, cooldown and owner diagnostics on PostgreSQL',async()=>{const f=await connect('frontier');await migrate(f);await frontierContract(new CreatorStore(f));});
    const {tagFailureContract}=await import('./tag-failure-contract');
    await t.test('isolated tag errors, partial checkpoints, source gates and explicit legacy recovery',async()=>{const d=await connect('tag_failure');await migrate(d);await tagFailureContract(new CreatorStore(d));});
    const {qualityContract}=await import('./research-quality-contract');
    await t.test('target-aware quality metrics, historical snapshots and exploration scheduling',async()=>{const d=await connect('quality');await migrate(d);await qualityContract(new CreatorStore(d));});
    const {deskReliabilityContract}=await import('./desk-reliability-contract');
    await t.test('isolated post routes, Turkish desk context and durable review contribution',async()=>{const d=await connect('desk_reliability');await migrate(d);await deskReliabilityContract(new CreatorStore(d));await deskReliabilityContract(new CreatorStore(d),5);});
    const {operationsContract}=await import('./research-operations-contract');
    await t.test('enrichment budgets, category sample audit and explicit continuation on PostgreSQL',async()=>{const d=await connect('operations');await migrate(d);await operationsContract(new CreatorStore(d));});
    const {httpRestrictionContract}=await import('./http-restriction-contract');
    await t.test('HTTP restriction proof, server waits and identity-aware owner caching',async()=>{const d=await connect('http_restriction');await migrate(d);await httpRestrictionContract(new CreatorStore(d));});
    const sqlite = new SQLiteDatabase(join(dir, 'source.sqlite'));
    await t.test('bounded HTTP retry and three-request circuit preserve PostgreSQL visit budgets',async()=>{
      const d=await connect('request_recovery');await migrate(d);const store=new CreatorStore(d);const {writeResearchState}=await import('../lib/instagram-state');let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
      const {enqueue}=await import('../lib/job-input'),{researchNight}=await import('../lib/night-research'),{NightStore}=await import('../lib/night-store'),{InstagramStop}=await import('../lib/instagram-extract');const request={content:'',limit:20,permission:'Own synthetic PostgreSQL retry fixture',efficientResearch:true,discoveryEnabled:true,discoveryKeywords:['retryone','retrytwo','retrythree'],discoveryProviders:['instagram_tags' as const],discoveryMaxQueries:3,discoveryResultsPerQuery:10,nightMaxPages:30,nightMaxPosts:0,nightMaxDepth:0,nightHours:8};const id=await enqueue({kind:'instagram_night',source:'synthetic-pg-retry',...request},store);await store.claimJob();let calls=0;
      await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async()=>{calls++;throw new InstagramStop('rate-limit','HTTP 429',{status:429,url:'https://www.instagram.com/p/PGFixture/',page_url:'https://www.instagram.com/p/PGFixture/',method:'GET',resource_type:'document',main_document:true,observed_at:new Date(clock).toISOString(),retry_after_at:null,retry_after_seconds:null});}}});const r=(await new NightStore(store).reports())[0];assert.equal(calls,5);assert.equal(r.page_requests,5);assert.equal(r.status,'paused');
    });
    await t.test('customer portal read-only filters, visibility, pagination and safe projection',async()=>{const d=await connect('portal');await migrate(d);const {portalContract}=await import('./portal-contract');await portalContract(new CreatorStore(d));});
    await t.test('phase-specific access recovery and active session timing on PostgreSQL',async()=>{const d=await connect('observability');await migrate(d);const {observabilityContract}=await import('./research-observability-contract');await observabilityContract(new CreatorStore(d));});
    await t.test('bounded technical recovery and durable quarantine on PostgreSQL',async()=>{const d=await connect('resilience');await migrate(d);const {resilienceContract}=await import('./continuous-resilience-contract');await resilienceContract(new CreatorStore(d));});
    try {
      const sourceStore = new CreatorStore(sqlite);
      const {TechnicalQuarantine}=await import('../lib/technical-recovery');await new TechnicalQuarantine(sourceStore).add('profile','https://www.instagram.com/transfer_fixture/','network_error');
      await storageContract(sourceStore);
      await nightContract(sourceStore);
      await discoveryContract(sourceStore);
      await operationsContract(sourceStore);
      const {scanStatus}=await import('../lib/continuous-scan');await scanStatus(sourceStore);
      const copy = await connect('transfer'); await migrate(copy);
      await t.test('dry-run writes no records and transfer preserves every table', async () => {
        const before = await sourceStore.snapshot();
        const readOnly = new SQLiteDatabase(sqlite.path, { readOnly: true });
        let dry;
        try { dry = await transferSQLiteToPostgres(readOnly, copy); } finally { await readOnly.close(); }
        assert.equal(dry.applied, false);
        assert.equal((await first(copy, 'SELECT count(*) AS n FROM creators'))?.n, 0);
        const imported = await transferSQLiteToPostgres(sqlite, copy, { apply: true });
        assert.equal(imported.applied, true);
        for (const table of TRANSFER_TABLES) {
          const a = await all(sqlite, `SELECT * FROM ${table.name} ORDER BY ${table.columns[0]}`);
          const b = await all(copy, `SELECT * FROM ${table.name} ORDER BY ${table.columns[0]}`);
          const normalize = (rows: typeof a) => rows.map(row => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['payload','settings','profile_data','evidence'].includes(key)&&value!==null?jsonObject(value):key==='cancel_requested'?Boolean(value):value])));
          assert.deepEqual(normalize(b), normalize(a));
        }
        assert.deepEqual(await sourceStore.snapshot(), before);
        await assert.rejects(transferSQLiteToPostgres(sqlite, copy, { apply: true }), /Target must be empty/);
        const { profileSchema } = await import('../lib/model');
        const store = new CreatorStore(copy);
        await store.saveProfile(profileSchema.parse({ username: 'synthetic_after_transfer', synthetic: true }), { provider: 'test', identifier: 'test', permission: 'test' });
        assert.ok((await store.snapshot()).creators.length > before.creators.length);
      });
      await t.test('invalid source rolls back whole transfer and leaves source untouched', async () => {
        const clean = await connect('bad_transfer'); await migrate(clean);
        const sourceBefore = await all(sqlite, 'SELECT * FROM creator_sources');
        await sqlite.query('UPDATE creator_sources SET creator_id=$1 WHERE id=(SELECT min(id) FROM creator_sources)', [999999]).then(() => assert.fail('SQLite FK should reject orphan'), () => {});
        // Legacy SQLite can have malformed JSON; PostgreSQL JSONB must reject it atomically.
        await sqlite.query("UPDATE creators SET payload='not-json' WHERE id=(SELECT min(id) FROM creators)");
        const sourceBroken = await all(sqlite, 'SELECT * FROM creators');
        await assert.rejects(transferSQLiteToPostgres(sqlite, clean, { apply: true }));
        for (const table of TRANSFER_TABLES) assert.equal((await first(clean, `SELECT count(*) AS n FROM ${table.name}`))?.n, 0);
        assert.deepEqual(await all(sqlite, 'SELECT * FROM creators'), sourceBroken);
        assert.deepEqual(await all(sqlite, 'SELECT * FROM creator_sources'), sourceBefore);
      });
    } finally { await sqlite.close(); }
    console.log('PostgreSQL integration cluster: ' + dir);
  } finally { for (const db of databases) await db.close(); if (started) await cluster.stop(); }
});

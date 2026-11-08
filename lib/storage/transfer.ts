import { all, first, LOCKS, type Database, type Param, type Row } from './driver';
export const TRANSFER_TABLES = [
  { name: 'creators', columns: ['id','username','instagram_user_id','profile_url','payload','validation_status','created_at','updated_at'] },
  { name: 'creator_sources', columns: ['id','creator_id','provider','source_identifier','permission_reference','collected_at'] },
  { name: 'creator_metrics', columns: ['id','creator_id','followers_count','measured_at','data_source'] },
  { name: 'suppressions', columns: ['username','instagram_user_id'] },
  { name: 'ingestion_jobs', columns: ['id','kind','payload','status','processed','inserted','updated','cancel_requested','created_at','completed_at','error'] },
  { name: 'logs', columns: ['id','job_id','message','created_at'] },
  { name: 'research_runs', columns: ['job_id','settings','page_requests','started_at','finished_at','stop_reason'] },
  { name: 'research_candidates', columns: ['id','job_id','url','depth','status','attempts','profile_data','outcome','category','fit_score','reason','created_at','updated_at'] },
  { name: 'research_posts', columns: ['id','candidate_id','url','status','attempts','evidence','reason'] },
  { name: 'discovery_queries', columns: ['id','job_id','provider','keyword','query_url','status','attempts','result_count','error','requested_at','completed_at'] },
  { name: 'discovery_results', columns: ['id','query_id','source_url','kind','title','status','attempts','profile_url','reason','discovered_at'] },
  { name: 'discovery_frontier', columns: ['id','scope_key','provider','keyword','query_url','origin','priority','evidence','created_at','updated_at'] },
  { name: 'discovery_observations', columns: ['query_id','frontier_id','pages','new_profiles','matched_profiles','observed_at'] },
  { name: 'candidate_work', columns: ['candidate_id','work_kind'] },
  { name: 'continuous_scan', columns: ['id','enabled','generation','config','cycle','job_id','next_at','status','message','updated_at'] },
  { name: 'creator_evaluations', columns: ['id','creator_id','verdict','predicted_category','expected_category','model_version','created_at'] },
] as const;
export async function transferSQLiteToPostgres(source: Database, target: Database, options: { apply?: boolean } = {}) {
  if (source.dialect !== 'sqlite' || target.dialect !== 'postgres') throw new Error('Transfer requires SQLite source and PostgreSQL target');
  const releaseSource = await source.acquireWorkerLock();
  let releaseTarget: (() => Promise<void>) | undefined;
  try {
    releaseTarget = await target.acquireWorkerLock();
    return await source.transaction(async sourceTx => {
      const rows: Record<string, Row[]> = {};
      for (const table of TRANSFER_TABLES) rows[table.name] = await all(sourceTx, `SELECT * FROM ${table.name}`);
      if(rows.continuous_scan.some(row=>Number(row.enabled)===1))throw new Error('Stop continuous scan before transfer');
      if (rows.ingestion_jobs.some(job => ['queued','running','paused'].includes(String(job.status)))) throw new Error('Finish or cancel all source jobs before transfer');
      const counts = Object.fromEntries(TRANSFER_TABLES.map(t => [t.name, rows[t.name].length]));
      await target.transaction(async tx => {
        await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCKS.writes]);
        // Blocks dashboard writes and enqueues during preflight and commit.
        await tx.query('LOCK TABLE ' + TRANSFER_TABLES.map(t => t.name).join(',') + ' IN ACCESS EXCLUSIVE MODE');
        for (const table of TRANSFER_TABLES) {
          if (await first(tx, `SELECT 1 FROM ${table.name} LIMIT 1`)) throw new Error('Target must be empty; use a fresh database. Existing data was not changed.');
        }
        if (!options.apply) return;
        for (const table of TRANSFER_TABLES) {
          for (const row of rows[table.name]) {
            const values: Param[] = table.columns.map(column => {
              const value = row[column];
              if (['payload','settings','profile_data','evidence'].includes(column)) return value === null ? null : typeof value === 'string' ? value : JSON.stringify(value);
              if (column === 'cancel_requested') return Boolean(value);
              if (value === null || typeof value === 'string' || typeof value === 'number') return value;
              throw new Error('Unsupported source value in ' + table.name + '.' + column);
            });
            const identity = table.columns.some(c => c === 'id') ? ' OVERRIDING SYSTEM VALUE' : '';
            await tx.query(`INSERT INTO ${table.name}(${table.columns.join(',')})${identity} VALUES(${values.map((_, i) => '$' + (i + 1)).join(',')})`, values);
          }
          const count = await first(tx, `SELECT count(*) AS n FROM ${table.name}`);
          if (Number(count?.n) !== rows[table.name].length) throw new Error('Transfer verification failed: ' + table.name);
        }
        // Restart identity sequences transactionally, including previously used empty targets.
        // RESTART rolls back with this transaction, unlike setval().
        for (const table of TRANSFER_TABLES) {
          if (table.name==='continuous_scan'||!table.columns.some(c => c === 'id')) continue;
          const max = rows[table.name].reduce((value, row) => Math.max(value, Number(row.id)), 0);
          if (!Number.isSafeInteger(max + 1)) throw new Error('Identity exceeds safe integer range');
          await tx.query(`ALTER TABLE ${table.name} ALTER COLUMN id RESTART WITH ${max + 1}`);
        }
      });
      return { applied: options.apply ?? false, counts };
    });
  } finally { await releaseTarget?.(); await releaseSource(); }
}

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, openSync, readFileSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Database, Executor, Param, QueryResult } from './driver';

export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS research_quarantine(kind TEXT NOT NULL CHECK(kind IN ('profile','post','tag')),url TEXT NOT NULL,reason TEXT NOT NULL,last_seen_at TEXT NOT NULL,expires_at TEXT NOT NULL,PRIMARY KEY(kind,url));
CREATE INDEX IF NOT EXISTS research_quarantine_expiry ON research_quarantine(expires_at);
CREATE TABLE IF NOT EXISTS continuous_scan(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL DEFAULT 0,config TEXT NOT NULL DEFAULT '{}',cycle INTEGER NOT NULL DEFAULT 0,job_id INTEGER REFERENCES ingestion_jobs(id),next_at TEXT,status TEXT NOT NULL DEFAULT 'stopped',message TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS creators(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,instagram_user_id TEXT UNIQUE,profile_url TEXT NOT NULL,payload TEXT NOT NULL,validation_status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS creator_sources(id INTEGER PRIMARY KEY,creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,provider TEXT NOT NULL,source_identifier TEXT NOT NULL,permission_reference TEXT NOT NULL,collected_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS creator_metrics(id INTEGER PRIMARY KEY,creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,followers_count INTEGER,measured_at TEXT NOT NULL,data_source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS suppressions(username TEXT PRIMARY KEY,instagram_user_id TEXT);
CREATE TABLE IF NOT EXISTS ingestion_jobs(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',processed INTEGER DEFAULT 0,inserted INTEGER DEFAULT 0,updated INTEGER DEFAULT 0,cancel_requested INTEGER DEFAULT 0,created_at TEXT NOT NULL,completed_at TEXT,error TEXT);
CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY,job_id INTEGER REFERENCES ingestion_jobs(id),message TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_activity(id INTEGER PRIMARY KEY,job_id INTEGER NOT NULL REFERENCES ingestion_jobs(id),started_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,ended_at TEXT,active_ms INTEGER NOT NULL DEFAULT 0,wait_ms INTEGER NOT NULL DEFAULT 0,unobserved_ms INTEGER NOT NULL DEFAULT 0,start_inserted INTEGER NOT NULL,end_inserted INTEGER NOT NULL,start_saved INTEGER NOT NULL,end_saved INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS research_activity_job ON research_activity(job_id,id);
CREATE TABLE IF NOT EXISTS research_runs(job_id INTEGER PRIMARY KEY REFERENCES ingestion_jobs(id),settings TEXT NOT NULL,page_requests INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL,finished_at TEXT,stop_reason TEXT);
CREATE TABLE IF NOT EXISTS research_candidates(id INTEGER PRIMARY KEY,job_id INTEGER NOT NULL REFERENCES research_runs(job_id),url TEXT NOT NULL,depth INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,profile_data TEXT,outcome TEXT,category TEXT,fit_score INTEGER,reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(job_id,url));
CREATE TABLE IF NOT EXISTS research_posts(id INTEGER PRIMARY KEY,candidate_id INTEGER NOT NULL REFERENCES research_candidates(id),url TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,evidence TEXT,reason TEXT,UNIQUE(candidate_id,url));
CREATE INDEX IF NOT EXISTS research_candidates_queue ON research_candidates(job_id,status,depth,id);
CREATE INDEX IF NOT EXISTS research_posts_candidate ON research_posts(candidate_id,status,id);
CREATE TABLE IF NOT EXISTS discovery_queries(id INTEGER PRIMARY KEY,job_id INTEGER NOT NULL REFERENCES research_runs(job_id),provider TEXT NOT NULL,keyword TEXT NOT NULL,query_url TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,result_count INTEGER NOT NULL DEFAULT 0,error TEXT,requested_at TEXT,completed_at TEXT,UNIQUE(job_id,provider,keyword));
CREATE TABLE IF NOT EXISTS discovery_results(id INTEGER PRIMARY KEY,query_id INTEGER NOT NULL REFERENCES discovery_queries(id),source_url TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,profile_url TEXT,reason TEXT,discovered_at TEXT NOT NULL,UNIQUE(query_id,source_url));
CREATE INDEX IF NOT EXISTS discovery_queries_queue ON discovery_queries(job_id,status,id);
CREATE INDEX IF NOT EXISTS discovery_results_queue ON discovery_results(query_id,status,id);
CREATE TABLE IF NOT EXISTS discovery_frontier(id INTEGER PRIMARY KEY,scope_key TEXT NOT NULL,provider TEXT NOT NULL,keyword TEXT NOT NULL,query_url TEXT NOT NULL,origin TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 0,evidence TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(scope_key,provider,keyword));
CREATE TABLE IF NOT EXISTS discovery_observations(query_id INTEGER PRIMARY KEY REFERENCES discovery_queries(id),frontier_id INTEGER NOT NULL REFERENCES discovery_frontier(id),pages INTEGER NOT NULL,new_profiles INTEGER NOT NULL,matched_profiles INTEGER NOT NULL,observed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS discovery_frontier_scope ON discovery_frontier(scope_key,priority,id);
CREATE INDEX IF NOT EXISTS discovery_observations_frontier ON discovery_observations(frontier_id,observed_at);
CREATE TABLE IF NOT EXISTS candidate_work(candidate_id INTEGER PRIMARY KEY REFERENCES research_candidates(id) ON DELETE CASCADE,work_kind TEXT NOT NULL CHECK(work_kind IN ('discovery','enrichment')));
CREATE TABLE IF NOT EXISTS creator_evaluations(id INTEGER PRIMARY KEY,creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,verdict TEXT NOT NULL CHECK(verdict IN ('correct','wrong','insufficient')),predicted_category TEXT,expected_category TEXT,model_version TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS creator_evaluations_creator ON creator_evaluations(creator_id,id);
CREATE INDEX IF NOT EXISTS sources_creator ON creator_sources(creator_id);
CREATE INDEX IF NOT EXISTS metrics_creator ON creator_metrics(creator_id,measured_at);
CREATE INDEX IF NOT EXISTS jobs_status ON ingestion_jobs(status,created_at);
`;

export class SQLiteDatabase implements Database {
  readonly dialect = 'sqlite' as const;
  private readonly connection: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  readonly path: string;
  private readonly readOnly: boolean;
  constructor(path: string, options: { readOnly?: boolean } = {}) {
    this.path = resolve(path);
    this.readOnly = options.readOnly ?? false;
    if (!options.readOnly) mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(this.path, { readOnly: options.readOnly ?? false });
    this.connection.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    if (!options.readOnly) this.connection.exec('PRAGMA journal_mode=WAL;' + SQLITE_SCHEMA);
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.catch(() => {});
    return next;
  }
  private execute(sql: string, params: Param[] = []): QueryResult {
    const values: (string | number | null)[] = [];
    const sqliteSql = sql.replace(/\$(\d+)/g, (_, i: string) => {
      const value = params[Number(i) - 1];
      if (value === undefined) throw new Error('Missing query parameter');
      values.push(typeof value === 'boolean' ? Number(value) : value);
      return '?';
    });
    const statement = this.connection.prepare(sqliteSql);
    if (statement.columns().length) {
      const rows = statement.all(...values);
      return { rows, rowCount: rows.length };
    }
    const result = statement.run(...values);
    return { rows: [], rowCount: Number(result.changes) };
  }
  query(sql: string, params?: Param[]) {
    return this.exclusive(async () => this.execute(sql, params));
  }
  transaction<T>(work: (tx: Executor) => Promise<T>) {
    return this.exclusive(async () => {
      this.connection.exec(this.readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
      try {
        const value = await work({ query: async (sql, params) => this.execute(sql, params) });
        this.connection.exec('COMMIT');
        return value;
      } catch (error) {
        this.connection.exec('ROLLBACK');
        throw error;
      }
    });
  }
  async close() { await this.exclusive(async () => this.connection.close()); }
  async acquireWorkerLock() {
    const path = this.path + '.worker.lock';
    // A local profile supports only one worker. PID locks are local-machine only.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = openSync(path, 'wx', 0o600);
        try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); }
        return async () => { unlinkSync(path); };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const pid = Number(readFileSync(path, 'utf8'));
        if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid worker lock; inspect it before removal');
        try { process.kill(pid, 0); } catch (check) {
          if ((check as NodeJS.ErrnoException).code === 'ESRCH') { unlinkSync(path); continue; }
          throw check;
        }
        throw new Error('Another worker is already running for this SQLite database');
      }
    }
    throw new Error('Could not acquire worker lock');
  }
}

import { Pool, types, type PoolConfig, type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import { LOCKS, type Database, type Executor, type Param, type Row } from './driver';

export function postgresConfig(env: Record<string, string | undefined> = process.env): PoolConfig {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required when RADAR_STORAGE=postgres');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  // URL SSL options override pg's explicit TLS options, so keep one source of truth.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl']) {
    if (url.searchParams.has(key)) throw new Error('Remove SSL query parameters from DATABASE_URL; use DATABASE_SSL and DATABASE_CA_FILE');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const ssl = env.DATABASE_SSL ?? (local ? 'disable' : 'verify-full');
  if (!['disable', 'verify-full'].includes(ssl)) throw new Error('DATABASE_SSL must be disable or verify-full');
  if (!local && ssl === 'disable') throw new Error('TLS verification is required for remote PostgreSQL');
  return {
    connectionString: env.DATABASE_URL,
    ssl: ssl === 'disable' ? false : { rejectUnauthorized: true, ...(env.DATABASE_CA_FILE ? { ca: readFileSync(env.DATABASE_CA_FILE, 'utf8') } : {}) },
    max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
    statement_timeout: 30_000, application_name: 'creator-radar',
    options: '-c search_path=public',
    types: { getTypeParser(oid, format) {
      if (oid === 20 && format !== 'binary') return (value: string) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds safe JavaScript range');
        return number;
      };
      return types.getTypeParser(oid, format);
    } },
  };
}
function normalize(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
}
function executor(client: Pick<PoolClient, 'query'>): Executor {
  return { async query(sql, params: Param[] = []) {
    const result = await client.query(sql, params);
    const results = Array.isArray(result) ? result : [result];
    return { rows: results.flatMap(r => r.rows.map(normalize)), rowCount: results.reduce((sum, r) => sum + (r.rowCount ?? 0), 0) };
  } };
}
export class PostgresDatabase implements Database {
  readonly dialect = 'postgres' as const;
  private readonly pool: Pool;
  constructor(config: PoolConfig = postgresConfig()) {
    this.pool = new Pool(config);
    // Avoid logging server connection strings or credentials on idle disconnects.
    this.pool.on('error', () => { console.error('PostgreSQL idle connection lost'); });
  }
  query(sql: string, params?: Param[]) { return executor(this.pool).query(sql, params); }
  async transaction<T>(work: (tx: Executor) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(executor(client));
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async acquireWorkerLock() {
    const client = await this.pool.connect();
    // Dedicated connection holds the lock. Direct or session-mode pooler only.
    try {
      const result = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCKS.worker]);
      if (!result.rows[0].acquired) throw new Error('Another worker or transfer is already running for this PostgreSQL database');
    } catch (error) { client.release(); throw error; }
    const lost = () => { console.error('Worker database lock connection lost; stopping to avoid concurrent workers'); process.exit(1); };
    client.on('error', lost);
    return async () => {
      client.off('error', lost);
      try { await client.query('SELECT pg_advisory_unlock($1)', [LOCKS.worker]); } finally { client.release(); }
    };
  }
  async close() { await this.pool.end(); }
}

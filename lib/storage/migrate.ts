import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { all, first, LOCKS, type Database } from './driver';
export function migrationFiles(directory = resolve('migrations')) {
  return readdirSync(directory).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort().map(name => {
    const raw = readFileSync(join(directory, name), 'utf8');
    return { name, checksum: createHash('sha256').update(raw).digest('hex'), sql: raw.replace(/^begin;\s*$/gmi, '').replace(/^commit;\s*$/gmi, '') };
  });
}
export async function migrate(database: Database, options: { check?: boolean; directory?: string } = {}) {
  if (database.dialect !== 'postgres') throw new Error('SQL migrations target PostgreSQL only');
  const files = migrationFiles(options.directory);
  return database.transaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCKS.migration]);
    let applied: Awaited<ReturnType<typeof all>> = [];
    if (await first(tx, "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='radar_schema_migrations'")) {
      applied = await all(tx, 'SELECT name,checksum FROM radar_schema_migrations');
    }
    for (const row of applied) {
      const file = files.find(f => f.name === row.name);
      if (!file || file.checksum !== row.checksum) throw new Error('Applied migration differs from source; restore original migration files');
    }
    const pending = files.filter(f => !applied.some(row => row.name === f.name));
    if (options.check) return pending.map(f => f.name);
    await tx.query('CREATE TABLE IF NOT EXISTS radar_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of pending) {
      await tx.query(file.sql);
      await tx.query('INSERT INTO radar_schema_migrations(name,checksum) VALUES($1,$2)', [file.name, file.checksum]);
    }
    return pending.map(f => f.name);
  });
}

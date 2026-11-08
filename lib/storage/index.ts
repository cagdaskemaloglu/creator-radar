import { SQLiteDatabase } from './sqlite';
import { PostgresDatabase, postgresConfig } from './postgres';
import type { Database } from './driver';
export function createDatabase(env: Record<string, string | undefined> = process.env): Database {
  const storage = env.RADAR_STORAGE ?? 'sqlite';
  if (storage === 'sqlite') return new SQLiteDatabase(env.RADAR_DB ?? 'data/radar.sqlite');
  if (storage === 'postgres') return new PostgresDatabase(postgresConfig(env));
  throw new Error('RADAR_STORAGE must be sqlite or postgres');
}

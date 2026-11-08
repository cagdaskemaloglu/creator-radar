export type Row = Record<string, unknown>;
export type Param = string | number | boolean | null;
export interface QueryResult { rows: Row[]; rowCount: number }
export interface Executor {
  query(sql: string, params?: Param[]): Promise<QueryResult>;
}
export interface Database extends Executor {
  readonly dialect: 'sqlite' | 'postgres';
  transaction<T>(work: (tx: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  acquireWorkerLock(): Promise<() => Promise<void>>;
}
export async function all(tx: Executor, sql: string, params?: Param[]) {
  return (await tx.query(sql, params)).rows;
}
export async function first(tx: Executor, sql: string, params?: Param[]) {
  return (await all(tx, sql, params))[0];
}
export function jsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid stored JSON object');
  return parsed as Record<string, unknown>;
}
export function safeId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid database identifier');
  return id;
}
// These advisory lock keys are reserved for this application within the database.
export const LOCKS = { writes: 728401, worker: 728402, migration: 728403 };

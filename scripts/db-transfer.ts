import { SQLiteDatabase } from '../lib/storage/sqlite';
import { PostgresDatabase } from '../lib/storage/postgres';
import { transferSQLiteToPostgres } from '../lib/storage/transfer';
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) throw new Error('Usage: npm run db:transfer -- [--apply]');
  const source = new SQLiteDatabase(process.env.RADAR_DB ?? 'data/radar.sqlite', { readOnly: true });
  const target = new PostgresDatabase();
  try { console.log(JSON.stringify(await transferSQLiteToPostgres(source, target, { apply: args.includes('--apply') }), null, 2)); }
  finally { await source.close(); await target.close(); }
}
main().catch(() => { console.error('Transfer failed. Stop workers and source app, finish/cancel queued jobs, migrate an empty PostgreSQL target and check connection settings. Source data was not changed; target transaction rolled back.'); process.exitCode = 1; });

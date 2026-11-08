import { PostgresDatabase } from '../lib/storage/postgres';
import { migrate } from '../lib/storage/migrate';
async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: npm run db:migrate -- [--check]');
  const database = new PostgresDatabase();
  try {
    const check = process.argv.includes('--check');
    const files = await migrate(database, { check });
    console.log(JSON.stringify({ mode: check ? 'check' : 'apply', migrations: files }, null, 2));
  } finally { await database.close(); }
}
main().catch(() => { console.error('Migration failed. Check DATABASE_URL, TLS, privileges and existing schema. No partial migration was committed.'); process.exitCode = 1; });

import { db, store } from '../lib/db';
import { enqueue } from '../lib/job-input';
import { instagramSeeds } from '../lib/instagram-policy';
async function main() {
  const args = process.argv.slice(2);
  const discoverMentions = args.includes('--mentions');
  const urls = instagramSeeds(args.filter(arg => arg !== '--mentions').join('\n'));
  const id = await enqueue({ kind: 'instagram_browser', content: urls.join('\n'), source: 'user-submitted-instagram-profile-list', permission: 'Operator explicitly authorized public creator research on the submitted profiles; no platform permission is asserted', limit: discoverMentions ? 10 : urls.length, discoverMentions });
  console.log(JSON.stringify({ job: id, profiles: urls, discoverMentions, status: 'queued', next: 'Run npm run worker or use the existing worker; progress appears in the dashboard.' }, null, 2));
  console.log('Active storage: ' + store.database.dialect);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Could not enqueue research'); process.exitCode = 1; }).finally(() => db.close());

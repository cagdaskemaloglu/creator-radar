import { readResearchState } from '../lib/instagram-state-read';
import { db, store } from '../lib/db';
async function main() {
  const state = await store.snapshot();
  console.log(JSON.stringify({ research: readResearchState(), jobs: state.jobs.filter(job => ['instagram_browser','instagram_resume'].includes(String(job.kind))).map(job => ({ ...job, error: typeof job.error === 'string' ? job.error.split('\n')[0] : job.error })), creators: state.creators.filter(c => c.sources.some(s => s.provider === 'instagram-browser')).map(c => ({ username: c.username, followers_count: c.followers_count, primary_niche: c.primary_niche, fit_score: c.fit_score, validation_status: c.validation_status })), logs: state.logs.slice(0, 10).map(log => ({ ...log, message: String(log.message).split('\n')[0] })) }, null, 2));
}
main().catch(() => { console.error('Research status unavailable'); process.exitCode = 1; }).finally(() => db.close());

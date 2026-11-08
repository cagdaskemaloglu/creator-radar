import {tickScan} from '../lib/continuous-scan';
import { WorkerInterrupted } from '../lib/job-control';
import { runNext } from '../lib/jobs';
import { db, store } from '../lib/db';
import { closeBrowser } from '../lib/browser';
import { writeWorkerHeartbeat } from '../lib/worker-service';
let stopping = false;
const shutdown = new AbortController();
process.on('SIGINT', () => { stopping = true; shutdown.abort(new WorkerInterrupted()); });
process.on('SIGTERM', () => { stopping = true; shutdown.abort(new WorkerInterrupted()); });
async function main() {
  const release = await db.acquireWorkerLock();
  writeWorkerHeartbeat();const heartbeat=setInterval(()=>writeWorkerHeartbeat(),5000);
  try {
    await store.recoverInterruptedJobs();
    console.log(`Creator Radar worker ready (${db.dialect}). Browser credentials stay local.`);
    let nextScanCheck=0;
    while (!stopping) {
      if(Date.now()>=nextScanCheck){await tickScan(store);nextScanCheck=Date.now()+5000;}
      if (!await runNext(store,shutdown.signal)) await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally { clearInterval(heartbeat);writeWorkerHeartbeat(false);await closeBrowser(); await release(); }
}
main().catch(() => { console.error('Worker stopped: database unavailable or worker lock held. Check configuration and database connectivity.'); process.exitCode = 1; }).finally(() => db.close());

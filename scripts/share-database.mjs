import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,renameSync,rmSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

if(process.env.RADAR_STORAGE==='postgres')throw Error('This snapshot command requires the local SQLite database.');
const source=resolve(process.env.RADAR_DB??'data/radar.sqlite');
const destination=resolve('shared-data/radar.snapshot.sqlite');
if(source===destination)throw Error('The live database must not be the shared snapshot.');
mkdirSync(dirname(destination),{recursive:true});
const temporary=destination+'.tmp';rmSync(temporary,{force:true});
const live=new DatabaseSync(source,{readOnly:true});
try{await backup(live,temporary);}finally{live.close();}
const copy=new DatabaseSync(temporary);
try{
 copy.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;');
 const timestamp=new Date().toISOString();
 // Change only the copy: collaborators must not automatically execute the owner's queue.
 copy.prepare("UPDATE research_runs SET finished_at=COALESCE(finished_at,?),stop_reason='shared_snapshot_inactive' WHERE job_id IN (SELECT id FROM ingestion_jobs WHERE status IN ('queued','running','paused'))").run(timestamp);
 copy.prepare("UPDATE ingestion_jobs SET status='cancelled',cancel_requested=1,completed_at=COALESCE(completed_at,?),error='shared_snapshot_inactive' WHERE status IN ('queued','running','paused')").run(timestamp);
 copy.prepare("UPDATE continuous_scan SET enabled=0,generation=generation+1,status='stopped',next_at=NULL,message='Paylaşılan kopya: otomatik tarama kapalı',updated_at=?").run(timestamp);
 copy.exec('COMMIT; VACUUM;');
 // Fail closed on credential-like values; report only the location, never the matched text.
 const secrets=/(?:sessionid|csrftoken|ig_did)\s*[=:]\s*[A-Za-z0-9%._-]{8,}|Bearer\s+[A-Za-z0-9._-]{16,}|(?:access_token|refresh_token|client_secret|password)\s*["']?\s*[:=]\s*["'][^"']{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
 const counts={};
 for(const {name} of copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  if(!/^[a-z_]+$/.test(name))throw Error('Unexpected table name');
  const rows=copy.prepare(`SELECT * FROM ${name}`).all();counts[name]=rows.length;
  for(const row of rows)for(const [column,value] of Object.entries(row))if(typeof value==='string'&&secrets.test(value))throw Error(`Credential-like content detected in ${name}.${column}; snapshot not published.`);
 }
 if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copy.prepare('PRAGMA foreign_key_check').all().length)throw Error('Snapshot integrity verification failed');
 copy.close();chmodSync(temporary,0o600);renameSync(temporary,destination);
 const bytes=readFileSync(destination);
 writeFileSync(resolve('shared-data/manifest.json'),JSON.stringify({created_at:timestamp,file:'radar.snapshot.sqlite',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),counts,automatic_work_disabled:true,contains_browser_session:false},null,2)+'\n');
 console.log(JSON.stringify({file:destination,creators:counts.creators,bytes:bytes.length,integrity:'ok',automatic_work_disabled:true}));
}catch(error){try{copy.close();}catch{}rmSync(temporary,{force:true});throw error;}

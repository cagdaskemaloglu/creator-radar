import { existsSync,readFileSync,mkdirSync,writeFileSync,renameSync,openSync,closeSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { spawn } from 'node:child_process';
const heartbeatPath=()=>resolve(process.env.WORKER_HEARTBEAT_FILE??'data/worker-heartbeat.json');
function alive(pid:unknown){if(!Number.isSafeInteger(pid)||Number(pid)<1)return false;try{process.kill(Number(pid),0);return true;}catch{return false;}}
export function writeWorkerHeartbeat(running=true){
 const file=heartbeatPath();mkdirSync(dirname(file),{recursive:true,mode:0o700});
 writeFileSync(file+'.tmp',JSON.stringify({pid:process.pid,seen_at:new Date().toISOString(),running}),{mode:0o600});renameSync(file+'.tmp',file);
}
export function readWorkerStatus(){
 try{const value=JSON.parse(readFileSync(heartbeatPath(),'utf8'));return{running:value.running===true&&Date.now()-Date.parse(value.seen_at)<25000&&alive(value.pid),seen_at:typeof value.seen_at==='string'?value.seen_at:null};}catch{return{running:false,seen_at:null};}
}
export async function ensureWorkerRunning(){
 if(process.env.WORKER_AUTO_START==='false')return;
 const status=readWorkerStatus();if(status.running)return;
 // Older SQLite workers have no heartbeat; the existing lock still prevents a second worker.
 const lock=resolve((process.env.RADAR_DB??'data/radar.sqlite')+'.worker.lock');
 if(existsSync(lock)&&alive(Number(readFileSync(lock,'utf8'))))return;
 const file=resolve('data/worker-runtime.log');mkdirSync(dirname(file),{recursive:true,mode:0o700});const fd=openSync(file,'a',0o600);
 try{
  await new Promise<void>((accept,reject)=>{
   const child=spawn(process.execPath,['--env-file-if-exists=.env','--import','tsx','scripts/worker.ts'],{cwd:process.cwd(),detached:true,stdio:['ignore',fd,fd]});
   child.once('error',()=>reject(new Error('Araştırma işçisi başlatılamadı. Yerel çalışma ortamını kontrol et.')));child.once('spawn',()=>{child.unref();accept();});
  });
 }finally{closeSync(fd);}
}

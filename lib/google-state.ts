import { existsSync,readFileSync,mkdirSync,writeFileSync,renameSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { researchStateSchema,type InstagramState } from './instagram-state-read';
const path=()=>resolve(process.env.GOOGLE_DISCOVERY_STATE_FILE??'data/google-discovery-state.json');
export function readGoogleState(now=Date.now()):InstagramState{
 const day=new Date(now).toISOString().slice(0,10);
 if(!existsSync(path()))return{day,visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null};
 const state=researchStateSchema.parse(JSON.parse(readFileSync(path(),'utf8')));
 return state.day===day?state:{...state,day,visits:0};
}
export function writeGoogleState(state:InstagramState){const file=path();mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file+'.tmp',JSON.stringify(researchStateSchema.parse(state)),{mode:0o600});renameSync(file+'.tmp',file);}
export function pauseGoogle(reason:string){writeGoogleState({...readGoogleState(),paused:true,reason,pausedAt:new Date().toISOString()});}
export function resumeGoogle(){writeGoogleState({...readGoogleState(),paused:false,reason:null,pausedAt:null});}
export function googleLimits(){
 const interval=Number(process.env.GOOGLE_DISCOVERY_INTERVAL_SECONDS??30),daily=Number(process.env.GOOGLE_DISCOVERY_DAILY_QUERIES??20);
 if(!Number.isInteger(interval)||interval<10||interval>3600||!Number.isInteger(daily)||daily<1||daily>100)throw new Error('Invalid Google discovery interval or daily query limit');
 return{intervalMs:interval*1000,daily};
}

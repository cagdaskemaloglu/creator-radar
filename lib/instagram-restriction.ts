import type {CreatorStore} from './db';
import {first} from './storage/driver';
import type {Response} from 'playwright';
export type HttpRestriction={status:403|429;url:string;page_url:string;method:string;resource_type:string;main_document:boolean;observed_at:string;retry_after_at:string|null;retry_after_seconds:number|null};
export function safeRequestUrl(raw:string,publicDocument=false){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.port||!/(^|\.)instagram\.com$/.test(u.hostname))return'[redacted]';let path=u.pathname;
  if(/^\/(?:challenge|checkpoint|accounts\/(?:password|reset|confirm))/i.test(path))path='/'+path.split('/').filter(Boolean).slice(0,1).join('/')+'/[redacted]';
  else if(!(publicDocument&&(/^\/[a-zA-Z0-9._]{1,30}\/?$/.test(path)||/^\/(?:[a-zA-Z0-9._]{1,30}\/)?(?:p|reel)\/[a-zA-Z0-9_-]{1,100}\/?$/.test(path)))){const known=new Set(['api','v1','v2','graphql','query','media','users','accounts','login','logout','direct','inbox','web','info','comments','reels','feed','timeline','explore','tags','logging_client_events','ajax','qe','sync','static','images','image','notifications','events']);path=path.split('/').map(part=>!part||known.has(part)?part:'[redacted]').join('/');}
  return(u.origin+path).slice(0,500);
 }catch{return'[redacted]';}
}
export function parseRetryAfter(raw:string|null|undefined,now=Date.now()){
 if(!raw||raw.length>128)return{at:null,seconds:null};const text=raw.trim();let deadline:number;
 if(/^\d+$/.test(text)){const seconds=Number(text);if(!Number.isSafeInteger(seconds))return{at:null,seconds:null};deadline=now+seconds*1000;}
 else if(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text))deadline=Date.parse(text);
 else return{at:null,seconds:null};
 if(!Number.isFinite(deadline)||deadline>253402300799999||deadline<0)return{at:null,seconds:null};
 return{at:new Date(deadline).toISOString(),seconds:Math.max(0,Math.ceil((deadline-now)/1000))};
}
export function responseRestriction(response:Response,pageUrl:string,now=Date.now()):HttpRestriction|null{
 const code=response.status();if(![403,429].includes(code)||!/(^|\.)instagram\.com$/.test(new URL(response.url()).hostname))return null;
 const request=response.request(),retry=parseRetryAfter(response.headers()['retry-after'],now);let main=false;try{main=request.isNavigationRequest()&&request.frame().parentFrame()===null;}catch{}
 return{status:code as 403|429,url:safeRequestUrl(response.url(),main),page_url:safeRequestUrl(pageUrl,true),method:request.method().slice(0,16),resource_type:request.resourceType().slice(0,32),main_document:main,observed_at:new Date(now).toISOString(),retry_after_at:retry.at,retry_after_seconds:retry.seconds};
}
export function restrictionDiagnostic(d:HttpRestriction){return JSON.stringify(d);}

export async function logRestriction(store:CreatorStore,job:number,detail:HttpRestriction){const message='Instagram restriction detail: '+restrictionDiagnostic(detail);if(!await first(store.database,'SELECT 1 FROM logs WHERE job_id=$1 AND message=$2 LIMIT 1',[job,message]))await store.log(job,message);}

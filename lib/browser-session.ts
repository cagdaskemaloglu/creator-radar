import {responseRestriction,type HttpRestriction} from './instagram-restriction';
import {assertServerWaitElapsed} from './instagram-state';
import type { BrowserContext } from 'playwright';
import { existsSync,readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { launchBrowser } from './browser';
import { browserPreferences } from './browser-preferences';
export type SessionStatus={status:'unverified'|'authenticated'|'login_required'|'blocked'|'unknown';checked_at:string|null;scope?:'session_only';restriction?:HttpRestriction};
const file=()=>resolve(process.env.BROWSER_SESSION_FILE??'data/browser-session.json');
export function readBrowserSession():SessionStatus{
 try{if(existsSync(file())){const data=JSON.parse(readFileSync(file(),'utf8'));if(data.profile===browserPreferences().profile&&['authenticated','login_required','blocked','unknown'].includes(data.status))return{status:data.status,checked_at:data.checked_at,scope:'session_only'};}}catch{}
 return{status:'unverified',checked_at:null,scope:'session_only'};
}
export async function checkBrowserSession(signal:AbortSignal,supplied?:BrowserContext):Promise<SessionStatus>{
 assertServerWaitElapsed();
 const ctx=supplied??await launchBrowser(),page=await ctx.newPage();let restriction:HttpRestriction|undefined;
 page.on('response',r=>{const incoming=responseRestriction(r,'https://www.instagram.com/');if(incoming){const currentWait=Date.parse(restriction?.retry_after_at??'')||0,nextWait=Date.parse(incoming.retry_after_at??'')||0;if(!restriction||nextWait>currentWait||incoming.status===429&&restriction.status!==429&&nextWait>=currentWait)restriction=incoming;}});
 const abort=()=>{void page.close();};signal.addEventListener('abort',abort,{once:true});
 try{
  signal.throwIfAborted();const response=await page.goto('https://www.instagram.com/',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('a[href*="/direct/"],input[type="password"],iframe[src*="captcha"],[data-sitekey]').first().waitFor({state:'visible',timeout:8000}).catch(()=>{});
  signal.throwIfAborted();
  // Only presence of session/navigation signals is returned. No feed text, account
  // identifier, cookies, passwords, screenshots or storage content is collected.
  const signals=await page.evaluate(()=>({instagram:location.origin==='https://www.instagram.com',path:location.pathname,password:Boolean(document.querySelector('input[type="password"]')),captcha:Boolean(document.querySelector('iframe[src*="captcha"],[data-sitekey]')),signedInNavigation:[...document.querySelectorAll<HTMLAnchorElement>('a[href*="/direct/"]')].some(a=>a.origin===location.origin&&a.pathname.startsWith('/direct/')&&a.getClientRects().length>0)}));
  const code=response?.status()??0;
  await page.close();signal.throwIfAborted();
  const status:SessionStatus['status']=signals.captcha||/\/(challenge|checkpoint)\b/.test(signals.path)||[403,429].includes(code)?'blocked':code===401||signals.password||signals.path.startsWith('/accounts/login')?'login_required':signals.instagram&&code>=200&&code<300&&signals.signedInNavigation?'authenticated':'unknown';
  const result:SessionStatus={status,checked_at:new Date().toISOString(),scope:'session_only',...(restriction?{restriction}:{})};
  if(!supplied){mkdirSync(dirname(file()),{recursive:true,mode:0o700});writeFileSync(file(),JSON.stringify({...result,profile:browserPreferences().profile}),{mode:0o600});}
  return result;
 }finally{signal.removeEventListener('abort',abort);if(!page.isClosed())await page.close();}
}

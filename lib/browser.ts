import { authorizedUrl } from './browser-policy';
export { authorizedUrl } from './browser-policy';
import { chromium,type BrowserContext } from 'playwright';
import { mkdirSync,chmodSync } from 'node:fs';
import { browserPreferences } from './browser-preferences';
let context:BrowserContext|undefined;
let manualContext:BrowserContext|undefined;
export const researchLaunchOptions=()=>({headless:true as const,acceptDownloads:false as const});
async function startPersistent(manual:boolean){
 const settings=browserPreferences();
 const dir=settings.profile;
 mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
 try{return await chromium.launchPersistentContext(dir,{...researchLaunchOptions(),headless:!manual});}
 catch(error){
  const message=error instanceof Error?error.message:'';
  if(/processsingleton|singletonlock|profile.*in use|Mevcut tarayıcı oturumunda|Opening in existing browser session/i.test(message))throw new Error('BROWSER_PROFILE_BUSY: Close the dedicated manual Chromium window normally before background research. Saved login is preserved.');
  throw new Error('BROWSER_START_FAILED: Dedicated Chromium could not start. Check installation and profile availability. Chrome fallback is disabled.');
 }
}
export async function launchBrowser(){
 if(manualContext)throw new Error('MANUAL_BROWSER_OPEN: Close manual Chromium from Radar before starting background research. No visible research fallback is allowed.');
 if(context)return context;
 const next=await startPersistent(false);context=next;
 next.on('close',()=>{if(context===next)context=undefined;});
 return next;
}
export async function openManualBrowser(){
 if(manualContext)return manualContext;
 await context?.close();context=undefined;
 const next=await startPersistent(true);manualContext=next;
 next.on('close',()=>{if(manualContext===next)manualContext=undefined;});
 return next;
}
export async function collectPage(raw:string,signal:AbortSignal){const url=authorizedUrl(raw);const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});const page=await ctx.newPage();
 // This page gets no authenticated storage: the manual login context is never collection authorization.
 await page.route('**/*',route=>route.request().url()===url&&route.request().isNavigationRequest()?route.continue():route.abort());
 const abort=()=>{void page.close();};signal.addEventListener('abort',abort,{once:true});
 try{signal.throwIfAborted();const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:Number(process.env.PAGE_TIMEOUT_MS??15000)});if(!response?.ok())throw new Error('Source returned an unsuccessful response');const html=await page.content();if(Buffer.byteLength(html)>Number(process.env.MAX_HTML_BYTES??1000000))throw new Error('HTML size limit exceeded');return html;}finally{signal.removeEventListener('abort',abort);await browser.close();}}
export async function closeBrowser(){await context?.close();context=undefined;await manualContext?.close();manualContext=undefined;}

export async function navigateManually(raw:string){const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!=='www.instagram.com'||!/^\/[a-zA-Z0-9._]{1,30}\/?$/.test(u.pathname)||u.search||u.hash||u.username||u.password||u.port)throw new Error('Submit a canonical https://www.instagram.com/username/ URL');const ctx=await openManualBrowser();const page=await ctx.newPage();await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:Number(process.env.PAGE_TIMEOUT_MS??15000)});}

export async function collectFixture(html:string,signal:AbortSignal){
 if(Buffer.byteLength(html)>Number(process.env.MAX_HTML_BYTES??1000000))throw new Error('HTML size limit exceeded');
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
 const page=await ctx.newPage();await page.route('**/*',r=>r.abort());
 const abort=()=>{void page.close();};signal.addEventListener('abort',abort,{once:true});
 try{signal.throwIfAborted();await page.setContent(html,{waitUntil:'domcontentloaded',timeout:Number(process.env.PAGE_TIMEOUT_MS??15000)});return await page.content();}
 finally{signal.removeEventListener('abort',abort);await browser.close();}
}


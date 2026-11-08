import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readInstagramDocument} from '../lib/instagram-browser';
import {InstagramStop} from '../lib/instagram-extract';
import {checkBrowserSession} from '../lib/browser-session';
import {pauseInstagram,resumeInstagram,readResearchState,writeResearchState} from '../lib/instagram-state';
async function main(){
 const dir=mkdtempSync(join(tmpdir(),'radar-http-browser-'));process.env.INSTAGRAM_STATE_FILE=join(dir,'state.json');process.env.BROWSER_SESSION_FILE=join(dir,'session.json');
 const reset=()=>writeResearchState({day:new Date().toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});reset();
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({serviceWorkers:'block'});let mode='main429',requests=0;
 await context.route('**/*',async route=>{requests++;const r=route.request(),u=new URL(r.url());if(u.pathname.startsWith('/api/'))return route.fulfill({status:429,headers:{'Retry-After':'120'},contentType:'text/plain',body:'Synthetic rate limit'});if(!r.isNavigationRequest())return route.abort();if(mode==='main429')return route.fulfill({status:429,headers:{'Retry-After':new Date(Date.now()+120000).toUTCString()},body:'Synthetic main restriction'});
  const html=mode==='auth'?'<main><a href="/direct/inbox/">Inbox</a></main>':`<main>Loading fixture</main><script>fetch('/api/v1/media/12345/info/?sessionid=secret',{method:'POST',headers:{Authorization:'Bearer private-secret'},body:'password=private-secret'}).finally(()=>{document.querySelector('main').innerHTML='<a href="/direct/inbox/">Inbox</a><a href="/p/FixtureResource/">Post</a>'});</script>`;return route.fulfill({contentType:'text/html',body:html});});
 try{
  let error:InstagramStop|undefined;try{await readInstagramDocument('https://www.instagram.com/p/FixtureMain/?token=secret',new AbortController().signal,context,'post-author');}catch(e){assert.ok(e instanceof InstagramStop);error=e;}
  assert.equal(error?.restriction?.status,429);assert.equal(error?.restriction?.main_document,true);assert.equal(error?.restriction?.resource_type,'document');assert.ok(error?.restriction?.retry_after_at);assert.ok(!JSON.stringify(error?.restriction).includes('secret'));assert.equal(context.pages().length,0);
  mode='fetch429';try{await readInstagramDocument('https://www.instagram.com/explore/tags/fixture/',new AbortController().signal,context,'discovery');assert.fail('Expected source restriction');}catch(e){assert.ok(e instanceof InstagramStop);assert.equal(e.reason,'rate-limit');assert.equal(e.restriction?.main_document,false);assert.equal(e.restriction?.resource_type,'fetch');assert.equal(e.restriction?.method,'POST');assert.equal(e.restriction?.retry_after_seconds,120);for(const secret of ['sessionid','private-secret','password','12345'])assert.ok(!JSON.stringify(e.restriction).includes(secret));error=e;}
  assert.equal(context.pages().length,0);pauseInstagram(error!.message,error!.restriction);const before=requests;await assert.rejects(checkBrowserSession(new AbortController().signal,context),/Sunucunun bildirdiği/);assert.equal(requests,before);assert.throws(()=>resumeInstagram());
  writeResearchState({...readResearchState(),retryNotBefore:new Date(Date.now()-1000).toISOString()});mode='auth';const auth=await checkBrowserSession(new AbortController().signal,context);assert.equal(auth.status,'authenticated');assert.equal(auth.scope,'session_only');assert.equal(readResearchState().paused,true);
  mode='fetch429';const mixed=await checkBrowserSession(new AbortController().signal,context);assert.equal(mixed.status,'authenticated');assert.equal(mixed.restriction?.status,429);assert.equal(mixed.restriction?.resource_type,'fetch');assert.equal(context.pages().length,0);
  console.log('PASS: intercepted main/fetch 429 details, safe redaction, Retry-After persistence, zero requests during server wait, authenticated session independent from research restriction, and closed research tabs. No live traffic.');
 }finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { launchBrowser, closeBrowser } from '../lib/browser';
async function port():Promise<number>{const s=createServer();await new Promise<void>((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});const a=s.address();if(!a||typeof a==='string')throw new Error('Missing port');await new Promise<void>(r=>s.close(()=>r()));return a.port;}
async function main(){
 process.env.WORKER_AUTO_START='false';
 const dir=mkdtempSync(join(tmpdir(),'radar-night-browser-'));
 process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(dir,'radar.sqlite');process.env.BROWSER_PROFILE=join(dir,'profile');process.env.BROWSER_HEADLESS='true';process.env.BROWSER_PREFERENCES_FILE=join(dir,'browser-preferences.json');process.env.INSTAGRAM_STATE_FILE=join(dir,'state.json');process.env.INSTAGRAM_INTERVAL_SECONDS='15';process.env.GOOGLE_DISCOVERY_STATE_FILE=join(dir,'google-state.json');process.env.INSTAGRAM_BROWSER_ENABLED='true';
 const a='https://www.instagram.com/synthetic_night_browser/',b='https://www.instagram.com/synthetic_next/',post='https://www.instagram.com/p/NightFixture01/';
 const profile=`<!doctype html><meta charset="utf-8"><title>Synthetic Creator (@synthetic_night_browser)</title><link rel="canonical" href="${a}"><meta property="og:title" content="Synthetic Creator (@synthetic_night_browser)"><main><header><h2>synthetic_night_browser</h2><span><div role="button">Independent creator</div></span><a href="${b}">@synthetic_next</a></header><a href="${post}">Own post</a></main>`;
 const caption=`<!doctype html><meta charset="utf-8"><title>Synthetic own post</title><main><article><header><a href="${a}">synthetic_night_browser</a></header><h1>My home decor ideas #homedecor</h1><ul><li>Audience comment: #tech #gadgets</li></ul></article></main>`;
 const persistent=await launchBrowser();
 const {db,store}=await import('../lib/db');
 let server:ChildProcess|undefined,ui;
 try{
  await persistent.route('**/*',route=>{const url=route.request().url();return route.request().isNavigationRequest()&&(url===a||url===post)?route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:url===a?profile:caption}):route.abort();});
  const {enqueue}=await import('../lib/job-input');const {runNext}=await import('../lib/jobs');const {NightStore}=await import('../lib/night-store');
  const id=await enqueue({kind:'instagram_night',source:'local-synthetic-night-fixtures',permission:'Own synthetic nightly browser test data',content:a,limit:1,nightMaxPages:3,nightMaxPosts:1,nightMaxDepth:1});
  await runNext();
  const state=await store.snapshot();assert.equal(state.jobs[0].status,'completed');assert.equal(state.creators.length,1);assert.equal(state.creators[0].primary_niche,'Interior Design');assert.equal(state.creators[0].categories instanceof Array&&state.creators[0].categories.includes('Tech / Gadgets'),false);
  const evidence=state.creators[0].classification_evidence as {source_url?:string}[];assert.ok(evidence.some(e=>e.source_url===post));
  const report=(await new NightStore(store).reports())[0];assert.equal(report.job_id,id);assert.equal(report.pending,1);assert.equal(report.page_requests,2);assert.equal(report.matched,1);
  const base=`http://127.0.0.1:${await port()}`;
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(base).port],{env:process.env,stdio:'ignore'});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/radar')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
  ui=await chromium.launch({headless:true});const page=await ui.newPage({viewport:{width:1440,height:1100}});await page.goto(base);await page.getByRole('heading',{name:'Araştırma merkezi',exact:true}).waitFor();
  assert.equal(await page.locator('textarea').count(),0);
  await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).click();
  await page.getByRole('button',{name:'Durdur',exact:true}).waitFor();
  const data=await(await fetch(base+'/api/radar')).json();assert.equal(data.jobs[0].kind,'instagram_night');assert.equal(data.jobs[0].status,'queued');
  await page.getByRole('button',{name:'Durdur',exact:true}).click();
  await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).waitFor();
  await page.screenshot({path:join(dir,'night-dashboard.png'),fullPage:true});
  writeFileSync(join(dir,'summary.json'),JSON.stringify(report,null,2));
  console.log('PASS: night job → real Chromium profile → own caption → evidence/DB → persisted discovery → dashboard/report/start/cancel. All Instagram traffic intercepted by local synthetic fixtures. Screenshot: '+join(dir,'night-dashboard.png'));
 }finally{
  await ui?.close();
  if(server&&server.exitCode===null){const end=new Promise<void>(r=>server!.once('exit',()=>r()));server.kill('SIGTERM');await end;}
  await closeBrowser();await db.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

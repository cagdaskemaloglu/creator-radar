import { chromium } from 'playwright';
import { spawn,type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { launchBrowser,closeBrowser } from '../lib/browser';
import { buildDiscoveryPlan,type DiscoverySettings } from '../lib/discovery-plan';
import {readInstagramPost} from '../lib/instagram-post';
import {InstagramPostRouteError} from '../lib/instagram-post-policy';
import {InstagramStop} from '../lib/instagram-extract';
import {InstagramTagReadError} from '../lib/tag-read-policy';
import { searchGoogle,DiscoveryStop,searchInstagramTag,resolvePostWithEvidence } from '../lib/discovery-browser';
async function port():Promise<number>{const s=createServer();await new Promise<void>((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});const a=s.address();if(!a||typeof a==='string')throw new Error('No port');await new Promise<void>(r=>s.close(()=>r()));return a.port;}
async function main(){
 process.env.WORKER_AUTO_START='false';
 const dir=mkdtempSync(join(tmpdir(),'radar-discovery-browser-'));
 Object.assign(process.env,{RADAR_STORAGE:'sqlite',RADAR_DB:join(dir,'radar.sqlite'),BROWSER_PROFILE:join(dir,'profile'),BROWSER_HEADLESS:'true',BROWSER_PREFERENCES_FILE:join(dir,'browser-preferences.json'),INSTAGRAM_STATE_FILE:join(dir,'ig.json'),GOOGLE_DISCOVERY_STATE_FILE:join(dir,'google.json'),INSTAGRAM_BROWSER_ENABLED:'true'});
 const url='https://www.instagram.com/synthetic_keyword_creator/';
 const profile=`<!doctype html><meta charset="utf-8"><meta property="og:title" content="Synthetic Creator (@synthetic_keyword_creator)"><link rel="canonical" href="${url}"><main><header><h2>synthetic_keyword_creator</h2><span><div role="button">Home Decor</div></span></header><p>Synthetic fixture only.</p></main>`;
 const serp=`<!doctype html><meta charset="utf-8"><title>Synthetic Google search</title><button onclick="this.remove()">Reject all</button><main id="search"><a href="https://www.google.com/url?q=${encodeURIComponent(url)}"><h3>Desk setup search hint</h3></a><a href="${url}"><h3>Duplicate</h3></a><a href="https://evil.example/profile"><h3>Non Instagram</h3></a></main>`;
 const context=await launchBrowser();let mode:'normal'|'captcha'|'limited'|'tags'|'empty-tags'='normal';
 const {db,store}=await import('../lib/db');let server:ChildProcess|undefined,ui;
 try{
  await context.route('**/*',route=>{
   if(!route.request().isNavigationRequest())return route.abort();const u=new URL(route.request().url());
   if(u.hostname==='www.google.com')return route.fulfill({status:mode==='limited'?429:200,contentType:'text/html; charset=utf-8',body:mode==='captcha'?'<main>Our systems detected unusual traffic <div data-sitekey="fixture"></div></main>':serp});
   if(u.href===url)return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:profile});
   if(u.pathname==='/p/RouteAlias/')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:`<link rel="canonical" href="https://www.instagram.com/reel/RouteAlias/"><main>${Array.from({length:150},(_,i)=>'<a href="/commenter_'+i+'/">Commenter</a>').join('')}<article style="display:none"><header><a href="/hidden_wrong_owner/">Hidden</a></header></article><h1>Creator caption without hashtags</h1></main><script>setTimeout(()=>{document.querySelector('main').insertAdjacentHTML('beforeend','<a href="${url}">synthetic_keyword_creator</a><a href="/synthetic_keyword_creator/reel/RouteAlias/">Timestamp</a>')},700)</script>`});
   if(u.pathname==='/reel/UnsupportedDestination/')return route.fulfill({status:302,headers:{location:'https://www.instagram.com/reels/'},body:''});
   if(u.pathname==='/reels/')return route.fulfill({contentType:'text/html',body:`<main><article><header><a href="${url}">Owner</a></header></article></main>`});
   if(u.pathname==='/reel/LoginRedirect/')return route.fulfill({status:302,headers:{location:'https://www.instagram.com/accounts/login/'},body:''});
   if(u.pathname==='/accounts/login/')return route.fulfill({contentType:'text/html',body:'<main><input type="password"></main>'});
   if(u.pathname==='/p/ModernCaption/')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:`<main><div><a href="${url}">synthetic_keyword_creator</a><span>Shop now #cozyroom <a href="/explore/tags/cozyroom/">#cozyroom</a></span></div><div><a href="/commenter/">commenter</a><span>Audience #tech</span><a href="/p/ModernCaption/c/123/">1h</a></div><a href="/synthetic_keyword_creator/p/ModernCaption/">Date</a></main>`});
   if(u.pathname.startsWith('/explore/tags/'))return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:mode==='empty-tags'?'<main>Loading fixture</main>':`<main></main><script>setTimeout(()=>{document.querySelector('main').innerHTML='<a href="${url}">Synthetic author</a><a href="https://www.instagram.com/p/SyntheticTag/">Synthetic post</a>'},700)</script>`});
   return route.abort();
  });
  const {enqueue}=await import('../lib/job-input');const {runNext}=await import('../lib/jobs');const {NightStore}=await import('../lib/night-store');
  const id=await enqueue({kind:'instagram_night',source:'synthetic-browser-discovery',permission:'Own synthetic keyword discovery fixtures',content:'',discoveryEnabled:true,discoveryKeywords:['desk setup'],discoveryTopics:[],discoveryProviders:['google'],discoveryMaxQueries:1,limit:1,nightMaxPages:3,nightMaxPosts:0});
  await runNext();const state=await store.snapshot();assert.equal(state.jobs[0].status,'completed');assert.equal(state.creators.length,1);assert.equal(state.creators[0].primary_niche,'Interior Design');
  assert.equal((state.creators[0].discovery_evidence as {keyword:string}[])[0].keyword,'desk setup');
  const r=(await new NightStore(store).reports())[0];assert.equal(r.page_requests,2);assert.equal((r.discovery as {results:unknown[]}).results.length,1);
  const settings:DiscoverySettings={enabled:true,topics:[],keywords:['desk setup'],providers:['google'],maxQueries:1,resultsPerQuery:10};const query=buildDiscoveryPlan(settings)[0];
  mode='captcha';await assert.rejects(searchGoogle(query,10,new AbortController().signal,context),DiscoveryStop);
  mode='limited';await assert.rejects(searchGoogle(query,10,new AbortController().signal,context),/429/);
  mode='tags';const tags=await searchInstagramTag(buildDiscoveryPlan({...settings,providers:['instagram_tags']})[0],10,new AbortController().signal,context);assert.equal(tags.links.length,2);
  mode='empty-tags';await assert.rejects(searchInstagramTag(buildDiscoveryPlan({...settings,providers:['instagram_tags']})[0],10,new AbortController().signal,context),InstagramTagReadError);
  const alias=await resolvePostWithEvidence('https://www.instagram.com/p/RouteAlias/',new AbortController().signal,true,context);assert.equal(alias.profile,url);assert.equal(alias.evidence?.caption,'Creator caption without hashtags');
  await assert.rejects(readInstagramPost('https://www.instagram.com/reel/UnsupportedDestination/',url,new AbortController().signal,context),InstagramPostRouteError);
  await assert.rejects(readInstagramPost('https://www.instagram.com/reel/LoginRedirect/',url,new AbortController().signal,context),e=>e instanceof InstagramStop&&e.reason==='login');
  const owned=await resolvePostWithEvidence('https://www.instagram.com/p/ModernCaption/',new AbortController().signal,true,context);
  assert.equal(owned?.profile,url);assert.match(owned?.evidence?.caption??'',/Shop now/);assert.deepEqual(owned?.evidence?.hashtags,['#cozyroom']);assert.ok(!owned?.evidence?.caption.includes('Audience'));
  const base=`http://127.0.0.1:${await port()}`;server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(base).port],{env:process.env,stdio:'ignore'});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/radar')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
  ui=await chromium.launch({headless:true});const page=await ui.newPage({viewport:{width:1440,height:1100}});await page.goto(base);await page.getByRole('heading',{name:'Araştırma merkezi',exact:true}).waitFor();
  assert.equal(await page.locator('textarea').count(),0);
  await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).click();
  await page.getByRole('button',{name:'Durdur',exact:true}).waitFor();
  const data=await(await fetch(base+'/api/radar')).json();assert.equal(data.jobs[0].kind,'instagram_night');assert.equal(data.jobs[0].status,'queued');
  await page.getByRole('button',{name:'Durdur',exact:true}).click();
  await page.getByRole('button',{name:'Araştırmayı başlat',exact:true}).waitFor();
  await page.screenshot({path:join(dir,'keyword-discovery.png'),fullPage:true});
  console.log('PASS: NO seed profile URLs → Chromium Google query → deduplicated discovery pool → profile classification → DB/provenance → topic-only dashboard start/cancel; CAPTCHA/429 and hashtag DOM also tested. All traffic intercepted by synthetic fixtures. Screenshot: '+join(dir,'keyword-discovery.png'));
 }finally{await ui?.close();if(server&&server.exitCode===null){const end=new Promise<void>(r=>server!.once('exit',()=>r()));server.kill('SIGTERM');await end;}await closeBrowser();await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {searchInstagramTag} from '../lib/discovery-browser';
import {InstagramTagReadError} from '../lib/tag-read-policy';
import {InstagramStop} from '../lib/instagram-extract';
import type {TagCollectionSummary} from '../lib/tag-collection';
async function main(){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({serviceWorkers:'block'});let mode='growth';
 await context.route('**/*',async route=>{
  const request=route.request();
  if(new URL(request.url()).pathname==='/fixture-blocked')return route.fulfill({status:mode==='http403'?403:429,body:'Synthetic blocked response'});
  if(!request.isNavigationRequest())return route.abort();
  if(mode==='loadfailed')return route.abort('connectionreset');
  if(mode==='unavailable')return route.fulfill({status:404,body:'Not found'});
  if(mode==='empty')return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><main>Henüz gönderi yok</main>'});
  if(mode==='unreadable')return route.fulfill({contentType:'text/html',body:'<main><a href="/accounts/settings/">Navigation</a><p>Loading fixture</p></main>'});
  const script=`let count=3,busy=false;(${JSON.stringify(mode)}==='nestedgrowth'?document.querySelector('#feed'):window).addEventListener('scroll',()=>{if(busy)return;busy=true;setTimeout(()=>{const mode=${JSON.stringify(mode)};if(mode==='challenge'){document.body.insertAdjacentHTML('beforeend','<div data-sitekey="synthetic">CAPTCHA fixture</div>');}else if(mode==='http403'||mode==='http429'){fetch('/fixture-blocked');}else if((mode==='growth'||mode==='nestedgrowth')&&count<18){for(let i=0;i<3;i++){count++;(document.querySelector('#posts')??document.querySelector('main')).insertAdjacentHTML('beforeend','<a href="/p/TagScroll'+count+'/">Synthetic post '+count+'</a>');}}busy=false;},40);});`;
  return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><title>Explicit synthetic hashtag fixture</title><style>body{margin:0}main{min-height:9000px}a{display:block;height:60px}</style></head><body><main>${mode==='nestedgrowth'?'<div id="feed" style="height:400px;overflow-y:auto"><div id="posts" style="min-height:9000px">':''}${[1,2,3].map(n=>`<a href="/p/TagScroll${n}/">Synthetic post ${n}</a>`).join('')}${mode==='nestedgrowth'?'</div></div>':''}</main><script>${script}</script></body></html>`});
 });
 const query={provider:'instagram_tags' as const,keyword:'scrollfixture',url:'https://www.instagram.com/explore/tags/scrollfixture/'};
 try{
 mode='empty';const empty=await searchInstagramTag(query,9,new AbortController().signal,context,{limit:9,beforeScroll:async()=>{throw Error('Empty results must not scroll');}});assert.equal(empty.outcome,'empty');assert.equal(empty.collection?.reason,'empty');assert.equal(empty.links.length,0);
 mode='unavailable';assert.equal((await searchInstagramTag(query,9,new AbortController().signal,context)).outcome,'unavailable');
 mode='unreadable';const before=context.pages().length;await assert.rejects(searchInstagramTag(query,9,new AbortController().signal,context,{limit:9,beforeScroll:async()=>false}),e=>e instanceof InstagramTagReadError&&e.reason==='tag_layout_unreadable');assert.equal(context.pages().length,before);
 mode='loadfailed';await assert.rejects(searchInstagramTag(query,9,new AbortController().signal,context),e=>e instanceof InstagramTagReadError&&e.reason==='tag_load_failed');
 mode='growth';let loads=0,summary:TagCollectionSummary|undefined;const batches:string[][]=[];
 const first=await searchInstagramTag(query,9,new AbortController().signal,context,{limit:9,beforeScroll:async()=>{loads++;return true;},onBatch:async urls=>{batches.push(urls);},onFinish:s=>{summary=s;}});
 assert.equal(first.links.length,9);assert.equal(loads,2);assert.equal(batches.length,3);assert.equal(summary?.reason,'target_reached');assert.equal(new Set(first.links.map(l=>l.url)).size,9);
 mode='nestedgrowth';const nested=await searchInstagramTag(query,9,new AbortController().signal,context,{limit:9,beforeScroll:async()=>true});assert.equal(nested.links.length,9);assert.equal(nested.collection?.scrolls,2);mode='growth';
 loads=0;const known=[1,2,3].map(n=>`https://www.instagram.com/p/TagScroll${n}/`);
 const second=await searchInstagramTag(query,6,new AbortController().signal,context,{limit:6,knownUrls:known,beforeScroll:async()=>{loads++;return true;}});assert.equal(second.links.length,6);assert.equal(loads,2);assert.ok(second.links.every(l=>!known.includes(l.url)));
 const denied=await searchInstagramTag(query,9,new AbortController().signal,context,{limit:9,beforeScroll:async()=>false});assert.equal(denied.links.length,3);assert.equal(denied.collection?.reason,'budget_or_share');assert.equal(denied.collection?.scrolls,0);
 mode='stagnant';loads=0;const stalled=await searchInstagramTag(query,9,new AbortController().signal,context,{limit:9,beforeScroll:async()=>{loads++;return true;}});assert.equal(stalled.collection?.reason,'no_new_links');assert.equal(loads,2);assert.equal(stalled.links.length,3);
 for(const restriction of ['challenge','http403','http429']){mode=restriction;loads=0;const persisted:string[]=[];await assert.rejects(searchInstagramTag(query,9,new AbortController().signal,context,{limit:9,beforeScroll:async()=>{loads++;return true;},onBatch:async urls=>{persisted.push(...urls);}}),InstagramStop);assert.equal(loads,1);assert.equal(persisted.length,3);}
 mode='growth';const controller=new AbortController();const saved:string[]=[];await assert.rejects(searchInstagramTag(query,9,controller.signal,context,{limit:9,onBatch:async urls=>{saved.push(...urls);},beforeScroll:async()=>{controller.abort();return true;}}));assert.equal(saved.length,3);
 console.log('PASS: synthetic visible tag scrolling grows beyond 3 links, skips known links, checkpoints batches, obeys load budget, stops without growth and preserves CAPTCHA/403/429/cancellation gates. No live traffic.');
 }finally{await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

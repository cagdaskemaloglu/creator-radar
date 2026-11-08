import type {Page} from 'playwright';
import type {InstagramSnapshot} from './instagram-extract';
import {checkInstagramGate,emptyInstagramTagPattern} from './instagram-extract';
import {uniqueDiscoveryLinks} from './discovery-plan';
export type TagCollectionSummary={reason:'target_reached'|'no_new_links'|'budget_or_share'|'empty';scrolls:number;newLinks:number};
export type TagCollectionOptions={limit:number;knownUrls?:string[];beforeScroll:()=>Promise<boolean>;onBatch?:(urls:string[])=>Promise<void>;onFinish?:(summary:TagCollectionSummary)=>void};
export async function collectTagLinks(page:Page,initial:InstagramSnapshot,options:TagCollectionOptions,read:()=>Promise<InstagramSnapshot>,checkRestriction:()=>void,signal:AbortSignal){
 const seen=new Set<string>(),novel=new Set<string>(),known=new Set(options.knownUrls??[]);let snapshot=initial,scrolls=0,stalled=0;
 const capture=async()=>{
  signal.throwIfAborted();checkRestriction();checkInstagramGate(snapshot);
  const links=uniqueDiscoveryLinks([...(snapshot.discoveryLinks??[]),...(snapshot.postLinks??[])].map(url=>({url,title:''})),Number.MAX_SAFE_INTEGER).filter(l=>l.kind==='post');
  let growth=0;const added:string[]=[];
  for(const link of links){if(!seen.has(link.url)){seen.add(link.url);growth++;}if(!known.has(link.url)&&!novel.has(link.url)&&novel.size<options.limit){novel.add(link.url);added.push(link.url);}}
  if(added.length)await options.onBatch?.(added);
  return growth;
 };
 const finish=(reason:TagCollectionSummary['reason'])=>{options.onFinish?.({reason,scrolls,newLinks:novel.size});return{...snapshot,discoveryLinks:[...seen],postLinks:[...seen]};};
 await capture();
 if(!seen.size&&emptyInstagramTagPattern.test(snapshot.mainText+' '+snapshot.bodyText))return finish('empty');
 while(novel.size<options.limit){
  signal.throwIfAborted();checkRestriction();
  if(!await options.beforeScroll())return finish('budget_or_share');
  signal.throwIfAborted();checkRestriction();
  const previous=await page.locator('main a[href],[role="main"] a[href]').evaluateAll(anchors=>anchors.map(a=>(a as HTMLAnchorElement).href));
  await page.evaluate(()=>{
   const root=document.querySelector<HTMLElement>('main,[role="main"]');
   const first=[...(root?.querySelectorAll<HTMLAnchorElement>('a[href]')??[])].find(a=>/\/(?:p|reel)\//.test(a.pathname)&&a.getClientRects().length>0);let container=first?.parentElement??root;
   while(container&&container!==document.body){const style=getComputedStyle(container);if(/auto|scroll/.test(style.overflowY)&&container.scrollHeight>container.clientHeight+10){container.scrollTop+=Math.max(400,Math.floor(container.clientHeight*0.85));return;}container=container.parentElement;}
   window.scrollBy(0,Math.max(500,Math.floor(innerHeight*0.85)));
  });scrolls++;
  await page.waitForFunction(old=>{
   const root=document.querySelector<HTMLElement>('main,[role="main"]');
   const fresh=[...(root?.querySelectorAll<HTMLAnchorElement>('a[href]')??[])].some(a=>a.getClientRects().length>0&&/\/(?:p|reel)\//.test(a.pathname)&&!old.includes(a.href));
   return fresh||Boolean(document.querySelector('input[type="password"],iframe[src*="captcha"],[data-sitekey]'))||/try again later|please wait a few minutes|çok fazla istek|daha sonra tekrar dene/i.test(document.body.innerText);
  },previous,{timeout:5000}).catch(()=>{});
  signal.throwIfAborted();checkRestriction();snapshot=await read();
  if(await capture())stalled=0;else stalled++;
  if(stalled>=2)return finish('no_new_links');
 }
 return finish('target_reached');
}

import type {TagCollectionOptions,TagCollectionSummary} from './tag-collection';
import type { BrowserContext } from 'playwright';
import { launchBrowser } from './browser';
import { readInstagramDocument } from './instagram-browser';
import { instagramProfileUrl } from './instagram-policy';
import { uniqueDiscoveryLinks,type DiscoveryQuery,type DiscoveryLink } from './discovery-plan';
import { instagramPostUrl } from './instagram-post-policy';
import { diagnoseSnapshotPostAuthor,resolveSnapshotPostAuthor } from './instagram-post-owner';
export { resolveSnapshotPostAuthor } from './instagram-post-owner';
import {emptyInstagramTagPattern} from './instagram-extract';
import { extractSnapshotCreatorCaption } from './instagram-post';
export class DiscoveryStop extends Error{
 constructor(readonly reason:'challenge'|'rate-limit'|'access-denied'|'layout',message:string){super(`GOOGLE_DISCOVERY_STOP:${reason}: ${message}`);}
}
export type DiscoveryResponse={links:DiscoveryLink[];sourceUrl:string;outcome?:'empty'|'unavailable';collection?:TagCollectionSummary};
export async function searchGoogle(query:DiscoveryQuery,limit:number,signal:AbortSignal,context?:BrowserContext):Promise<DiscoveryResponse>{
 const url=new URL(query.url);
 if(query.provider!=='google'||url.origin!=='https://www.google.com'||url.pathname!=='/search')throw new Error('Unsupported Google query URL');
 const ctx=context??await launchBrowser(),page=await ctx.newPage();let restriction:DiscoveryStop|undefined,keep=false;
 const abort=()=>{void page.close();};signal.addEventListener('abort',abort,{once:true});
 page.on('response',r=>{if(!/(^|\.)google\.com$/.test(new URL(r.url()).hostname))return;if(r.status()===429)restriction=new DiscoveryStop('rate-limit','HTTP 429; no retry');if(r.status()===403)restriction=new DiscoveryStop('access-denied','HTTP 403; no retry');});
 try{
  signal.throwIfAborted();const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:Number(process.env.PAGE_TIMEOUT_MS??15000)});
  if(restriction)throw restriction;if(!response?.ok())throw new DiscoveryStop('access-denied','Search response unavailable');
  const reject=page.getByRole('button',{name:/^(Reject all|Tümünü reddet)$/i});
  if(await reject.count())await reject.first().click();
  await page.locator('#search,#rso,main,[role="main"],form[action*="sorry"],iframe[src*="captcha"]').first().waitFor({state:'visible',timeout:5000}).catch(()=>{});
  const snap=await page.evaluate(()=>({url:location.href,text:document.body.innerText.slice(0,30000),captcha:Boolean(document.querySelector('iframe[src*="captcha"],[data-sitekey],form[action*="sorry"]')),root:Boolean(document.querySelector('#search,#rso,main,[role="main"]')),links:[...document.querySelectorAll<HTMLAnchorElement>('#search a[href],#rso a[href],main a[href],[role="main"] a[href]')].filter(a=>a.querySelector('h3')&&a.getClientRects().length>0).map(a=>({url:a.href,title:a.querySelector('h3')?.innerText??''})).slice(0,40)}));
  signal.throwIfAborted();if(restriction)throw restriction;
  if(snap.captcha||new URL(snap.url).pathname.startsWith('/sorry')||/unusual traffic|not a robot|olağan dışı trafik|robot olmadığınızı/i.test(snap.text))throw new DiscoveryStop('challenge','Manual browser attention required');
  if(!/(^|\.)google\.com$/.test(new URL(snap.url).hostname))throw new DiscoveryStop('access-denied','Unexpected search destination');
  if(!snap.root||(!snap.links.length&&!/did not match any documents|no results found|sonuç bulunamadı|eşleşen belge bulunamadı/i.test(snap.text)))throw new DiscoveryStop('layout','Search results layout not recognized');
  return{sourceUrl:query.url,links:uniqueDiscoveryLinks(snap.links,limit)};
 }catch(e){if(e instanceof DiscoveryStop||restriction)keep=true;if(restriction)throw restriction;throw e;}finally{signal.removeEventListener('abort',abort);if(!keep)await page.close();}
}
export async function searchInstagramTag(query:DiscoveryQuery,limit:number,signal:AbortSignal,context?:BrowserContext,collectionOptions?:TagCollectionOptions):Promise<DiscoveryResponse>{
 const u=new URL(query.url);if(query.provider!=='instagram_tags'||u.origin!=='https://www.instagram.com'||!/^\/explore\/tags\/[^/]+\/$/.test(u.pathname)||u.search)throw new Error('Unsupported Instagram hashtag query');
 const collected:string[]=[];let collection:TagCollectionSummary|undefined;
 const options=collectionOptions?{...collectionOptions,limit,onBatch:async(urls:string[])=>{collected.push(...urls);await collectionOptions.onBatch?.(urls);},onFinish:(value:TagCollectionSummary)=>{collection=value;collectionOptions.onFinish?.(value);}}:undefined;
 const loaded=await readInstagramDocument(u.href,signal,context,'discovery',options);
 if(!loaded.snapshot)return{sourceUrl:u.href,links:[],outcome:'unavailable'};
 return{sourceUrl:u.href,collection,...(emptyInstagramTagPattern.test(loaded.snapshot.mainText+' '+loaded.snapshot.bodyText)&&!collected.length?{outcome:'empty' as const}:{}),links:uniqueDiscoveryLinks((collectionOptions?collected:[...(loaded.snapshot.discoveryLinks??[]),...(loaded.snapshot.postLinks??[])]).map(url=>({url,title:''})),limit)};
}
export async function resolvePostAuthor(url:string,signal:AbortSignal,context?:BrowserContext){
 const loaded=await readInstagramDocument(instagramPostUrl(url),signal,context,'post-author');
 if(!loaded.snapshot)return null;
 return resolveSnapshotPostAuthor(loaded.snapshot,url);
}
export async function resolvePostWithEvidence(url:string,signal:AbortSignal,collectCaption:boolean,context?:BrowserContext){
 const loaded=await readInstagramDocument(instagramPostUrl(url),signal,context,'post-author');
 const resolution=diagnoseSnapshotPostAuthor(loaded.snapshot,url);
 return {...resolution,evidence:resolution.profile&&loaded.snapshot&&collectCaption?extractSnapshotCreatorCaption(loaded.snapshot,resolution.profile):null};
}

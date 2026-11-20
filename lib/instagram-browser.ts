import {responseRestriction} from './instagram-restriction';
import {recordResearchSuccess,assertAccessWindow} from './instagram-state';
import {InstagramTagReadError} from './tag-read-policy';
import { TransientHttpError } from './transient-error';
import {normalizeDiscoveryLink} from './discovery-plan';
import {collectTagLinks,type TagCollectionOptions} from './tag-collection';
import type { BrowserContext, Page } from 'playwright';
import { launchBrowser } from './browser';
import { instagramProfileUrl } from './instagram-policy';
import { InstagramStop, checkInstagramGate, emptyInstagramTagPattern, type InstagramSnapshot } from './instagram-extract';
import { resolveSnapshotPostAuthor } from './instagram-post-owner';
import { mkdirSync,readdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export async function snapshotInstagramPage(page: Page): Promise<InstagramSnapshot> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('[role="dialog"] main,[role="dialog"] [role="main"],main,[role="main"]');
    const postRoot=document.querySelector<HTMLElement>('[role="dialog"]')??main;
    const metadata: Record<string, string> = {};
    for (const tag of document.querySelectorAll<HTMLMetaElement>('meta[property],meta[name]')) {
      const key = tag.getAttribute('property') ?? tag.getAttribute('name');
      if (key) metadata[key] = tag.content;
    }
    const metrics: InstagramSnapshot['metrics'] = [];
    for (const anchor of main?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []) {
      const kind = /\/followers\/?$/.test(anchor.pathname) ? 'followers_count' : /\/following\/?$/.test(anchor.pathname) ? 'following_count' : null;
      if (!kind) continue;
      const label = anchor.innerText.trim().match(/^[\d][\d.,\s]*(?:[kmb]|bin|mn|milyon)?/i)?.[0]?.trim();
      const exact = anchor.querySelector<HTMLElement>('[title]')?.title ?? anchor.title;
      if (label) metrics.push({ kind, label, exact: exact || null });
    }
    const header = main?.querySelector<HTMLElement>('header');
    // Observed public profile DOM: the biography is a role=button DIV inside a SPAN.
    // A unique match is required to avoid mixing navigation, suggested accounts or comments.
    const bioCandidates = [...(header?.querySelectorAll<HTMLElement>('span > div[role="button"]') ?? [])]
      .filter(element => element.innerText.trim().length > 0 && !element.querySelector('img,svg,input'))
      .filter(element => !/^[.\u2026\s]*(?:more|see more|devamı|daha fazla)[.\u2026\s]*$/iu.test(element.innerText.trim()));
    const visibleBiography = bioCandidates.length === 1 ? bioCandidates[0].innerText.trim().slice(0, 5000) : null;
    const visibleStatLabels = [...(header?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].map(anchor => ({
      text: anchor.innerText.trim() || anchor.getAttribute('aria-label') || '',
      exact: anchor.querySelector<HTMLElement>('[title]')?.title || anchor.title || null,
    }));
    const captions=[...(main?.querySelectorAll<HTMLElement>('h1')??[])].filter(e=>e.getClientRects().length>0&&e.innerText.trim());
    let postCaption=captions.length===1?captions[0].innerText.trim().slice(0,5000):null;
    // Modern post captions can be DIV/SPAN blocks. Accept only the smallest
    // owner-labelled block with hashtag links, never an audience comment row.
    const postId=location.pathname.match(/\/(p|reel)\/([a-zA-Z0-9_-]+)\/?$/);
    if(!postCaption&&postId&&main){
      const ownerNames=new Set([...main.querySelectorAll<HTMLAnchorElement>('a[href]')].flatMap(a=>{
        const m=a.pathname.match(/^\/([a-zA-Z0-9._]{1,30})\/(p|reel)\/([a-zA-Z0-9_-]+)\/?$/);
        return m&&m[3]===postId[2]?[m[1]]:[];
      }));
      if(ownerNames.size===1){
        const owner=[...ownerNames][0],blocks=new Set<HTMLElement>();
        for(const a of main.querySelectorAll<HTMLAnchorElement>('a[href]')){
          if(a.pathname!==`/${owner}/`||a.innerText.trim()!==owner)continue;
          let parent=a.parentElement;
          for(let i=0;parent&&parent!==main&&i<7;i++,parent=parent.parentElement){
            if(parent.querySelector('a[href*="/c/"],button,textarea,input'))break;
            if(!parent.querySelector('a[href*="/explore/tags/"]'))continue;
            const others=[...parent.querySelectorAll<HTMLAnchorElement>('a[href]')].some(link=>/^\/[a-zA-Z0-9._]{1,30}\/$/.test(link.pathname)&&link.pathname!==`/${owner}/`);
            if(!others&&parent.getClientRects().length>0)blocks.add(parent);
            break;
          }
        }
        const unique=[...blocks];
        if(unique.length===1)postCaption=unique[0].innerText.trim().replace(new RegExp('^'+owner.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*'),'').slice(0,5000);
      }
    }
    return {
      discoveryLinks: [...(postRoot?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])].filter(a=>a.getClientRects().length>0).map(a=>a.href).slice(0,1000),
      postLinks: [...(main?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])].map(a => a.href).filter(href => /^https:\/\/(?:www\.)?instagram\.com\/(?:[a-zA-Z0-9._]+\/)?(?:p|reel)\/[a-zA-Z0-9_-]+\/?$/.test(href)).slice(0, 20),
      postAuthorLinks: [...(postRoot?.querySelectorAll<HTMLAnchorElement>('article header a[href]')??[])].filter(a=>a.getClientRects().length>0).map(a => a.href),
      postCaption,
      visibleBiography, visibleStatLabels, biographyCandidateCount: bioCandidates.length,
      url: location.href,
      canonicalUrl: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? (metadata['og:url'] ?? null),
      title: document.title, ogTitle: (metadata['og:title'] ?? null), description: metadata['og:description'] ?? metadata.description ?? null,
      bodyText: document.body.innerText.slice(0, 50000), mainText: main?.innerText.slice(0, 30000) ?? '',
      hasPasswordForm: Boolean(document.querySelector('input[type="password"]')),
      hasCaptcha: Boolean(document.querySelector('iframe[src*="captcha"],iframe[title*="captcha" i],[data-sitekey]')),
      metrics, profileLinks: [...(main?.querySelectorAll<HTMLAnchorElement>('header a[href]') ?? [])].map(a => a.href).slice(0, 100),
    };
  });
}
export async function readInstagramDocument(url: string, signal: AbortSignal, suppliedContext?: BrowserContext, waitForBiography: boolean | 'discovery' | 'post-author' = true,tagCollection?:TagCollectionOptions) {
  if(!suppliedContext)assertAccessWindow();
  const context = suppliedContext ?? await launchBrowser();
  const page = await context.newPage();
  let restriction: InstagramStop | undefined;
  const abort = () => { void page.close(); };
  signal.addEventListener('abort', abort, { once: true });
  page.on('response', response => {
    if (!/(^|\.)instagram\.com$/.test(new URL(response.url()).hostname)) return;
    const detail=responseRestriction(response,url);if(detail){const current=restriction?.restriction,newWait=Date.parse(detail.retry_after_at??'')||0,oldWait=Date.parse(current?.retry_after_at??'')||0;if(!restriction||newWait>oldWait||detail.status===429&&current?.status!==429&&newWait>=oldWait)restriction=new InstagramStop(detail.status===429?'rate-limit':'access-denied','HTTP '+detail.status+'; no retry attempted',detail);void page.close().catch(()=>{});}
  });
  try {
    signal.throwIfAborted();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.PAGE_TIMEOUT_MS ?? 15000) });
    if (restriction) throw restriction;
    if (response?.status() === 401) throw new InstagramStop('login', 'HTTP 401; manual login required');
    if (!response){if(waitForBiography==='discovery')throw new InstagramTagReadError('tag_load_failed','Tag page response unavailable');throw new InstagramStop('layout', 'Page response unavailable');}
    if (response.status() === 404) return { status: 'unavailable' as const, snapshot: null };
    if (response.status() >= 500) { if (waitForBiography === 'discovery') throw new InstagramTagReadError('tag_load_failed', 'Tag page HTTP ' + response.status()); throw new TransientHttpError(response.status()); }
    if (!response.ok()) throw new InstagramStop('access-denied', 'Source returned HTTP ' + response.status());
    // Read visible public UI only; extra tag loads require the caller’s budget reservation.
    await page.locator('main,[role="main"],input[type="password"],iframe[src*="captcha"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (waitForBiography === true) await page.locator('main header span > div[role="button"],[role="main"] header span > div[role="button"]').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    // A visible main shell may precede React's result links. Wait for rendered results,
    // not network-idle or hidden API data; the wait remains bounded and cancellable.
    if(waitForBiography==='discovery')await page.waitForFunction(pattern=>{
      const main=document.querySelector<HTMLElement>('main,[role="main"]');
      return Boolean(main&&[...main.querySelectorAll('a[href]')].some(a=>a.getClientRects().length>0))||new RegExp(pattern,'iu').test(main?.innerText??document.body.innerText)||Boolean(document.querySelector('input[type="password"],iframe[src*="captcha"],[data-sitekey]'));
    },emptyInstagramTagPattern.source,{timeout:10000}).catch(()=>{});
    if (waitForBiography === 'post-author') await page.waitForFunction(()=>{const root=document.querySelector('[role="dialog"]')??document.querySelector('main,[role="main"]');return Boolean(root&&[...root.querySelectorAll<HTMLAnchorElement>('a[href]')].some(a=>a.getClientRects().length>0&&(/\/(?:p|reel)\/[\w-]+\/?$/.test(a.pathname)||a.closest('article header'))));},undefined,{timeout:5000}).catch(()=>{});
    if (restriction) throw restriction;
    signal.throwIfAborted();
    if(waitForBiography===true){
      const username=new URL(url).pathname.split('/')[1];
      await page.waitForFunction(name=>{
        const title=document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content??document.title;
        return title.toLowerCase().includes('(@'+name.toLowerCase()+')')||Boolean(document.querySelector('input[type="password"],iframe[src*="captcha"]'))||/this account is private|bu hesap gizli|page isn't available|bu sayfaya ulaşılamıyor/i.test(document.body.innerText);
      },username,{timeout:4000}).catch(()=>{});
    }
    let snapshot = await snapshotInstagramPage(page);
    checkInstagramGate(snapshot);
    if(waitForBiography==='discovery'&&tagCollection)snapshot=await collectTagLinks(page,snapshot,tagCollection,()=>snapshotInstagramPage(page),()=>{if(restriction)throw restriction;},signal);
    if(waitForBiography==='post-author'&&process.env.INSTAGRAM_LAYOUT_DIAGNOSTICS==='true'&&!resolveSnapshotPostAuthor(snapshot,url)){
      const dir=resolve('data/browser-diagnostics'),id=new URL(url).pathname.match(/\/(?:p|reel)\/([\w-]+)/)?.[1];
      mkdirSync(dir,{recursive:true,mode:0o700});
      if(id&&readdirSync(dir).filter(name=>name.endsWith('.png')).length<3){
        await page.screenshot({path:resolve(dir,id+'.png')});
        writeFileSync(resolve(dir,id+'.json'),JSON.stringify({url:snapshot.url,title:snapshot.title,mainTextLength:snapshot.mainText.length,linkCount:snapshot.discoveryLinks?.length??0,headerAuthorCount:snapshot.postAuthorLinks?.length??0}),{mode:0o600});
      }
    }
    if (waitForBiography === 'discovery' && ![...(snapshot.discoveryLinks??[]),...(snapshot.postLinks??[])].some(link=>normalizeDiscoveryLink(link))&&!emptyInstagramTagPattern.test(snapshot.mainText+' '+snapshot.bodyText)) {
      throw new InstagramTagReadError('tag_layout_unreadable',`Tag result links unavailable after bounded render wait; main text length=${snapshot.mainText.length}`);
    }
    if(restriction)throw restriction;if(!suppliedContext)recordResearchSuccess();
    return { status: 'loaded' as const, snapshot };
  } catch (error) {
    if (restriction) throw restriction;
    if(!signal.aborted&&waitForBiography==='discovery'&&!(error instanceof InstagramStop)&&!(error instanceof InstagramTagReadError)&&error instanceof Error&&(/net::ERR_(CONNECTION_CLOSED|CONNECTION_RESET|CONNECTION_TIMED_OUT|TIMED_OUT|NETWORK_CHANGED)\b/.test(error.message)||error.name==='TimeoutError')){
      // A restriction may render during a navigation timeout. Inspect it before
      // classifying this as a local load failure; never turn a gate into a skip.
      const current=await snapshotInstagramPage(page).catch(()=>null);if(current)checkInstagramGate(current);
      throw new InstagramTagReadError('tag_load_failed','Tag page failed to load within the bounded navigation attempt');
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await page.close();
    if(restriction)throw restriction;
  }
}

export async function readInstagramProfile(raw: string, signal: AbortSignal, context?: BrowserContext) {
  return readInstagramDocument(instagramProfileUrl(raw), signal, context);
}

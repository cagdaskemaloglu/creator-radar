import { instagramPostUrl } from './instagram-post-policy';
export { instagramPostUrl } from './instagram-post-policy';
import type { BrowserContext } from 'playwright';
import { readInstagramDocument } from './instagram-browser';
import { instagramProfileUrl } from './instagram-policy';
import { resolveSnapshotPostAuthor } from './instagram-post-owner';
import type { InstagramSnapshot } from './instagram-extract';
export type PostEvidence = { url: string; caption: string; hashtags: string[]; collected_at: string };
export function extractCreatorCaption(data: { url: string; authorLinks: string[]; caption: string | null }, expectedProfile: string): PostEvidence | null {
  const expected = instagramProfileUrl(expectedProfile);
  const authors = data.authorLinks.flatMap(link => { try { return [instagramProfileUrl(link)]; } catch { return []; } });
  if (authors.length===0 || authors.some(author=>author!==expected) || !data.caption?.trim()) return null;
  const caption = data.caption.trim().slice(0, 5000);
  const hashtags = [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag => tag.toLocaleLowerCase('tr-TR')))];
  try{return { url: instagramPostUrl(data.url), caption, hashtags, collected_at: new Date().toISOString() };}catch{return null;}
}
export async function readInstagramPost(raw: string, owner: string, signal: AbortSignal, context?: BrowserContext) {
  const url = instagramPostUrl(raw);
  const loaded = await readInstagramDocument(url, signal, context, 'post-author');
  if (!loaded.snapshot) return null;
  instagramPostUrl(loaded.snapshot.url);
  return extractSnapshotCreatorCaption(loaded.snapshot,owner,url);
}
export function extractSnapshotCreatorCaption(snapshot:InstagramSnapshot,owner:string,requested=snapshot.url){
 const author=resolveSnapshotPostAuthor(snapshot,requested);
 return extractCreatorCaption({url:snapshot.url,authorLinks:author?[author]:[],caption:snapshot.postCaption??null},owner);
}

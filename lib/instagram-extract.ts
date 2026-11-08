import {publicCommerceUrl} from './commerce';
import { profileSchema } from './model';
import { instagramProfileUrl } from './instagram-policy';
export type InstagramSnapshot = {
  url: string; canonicalUrl: string | null; title: string; ogTitle: string | null; description: string | null;
  bodyText: string; mainText: string; hasPasswordForm: boolean; hasCaptcha: boolean;
  metrics: { kind: 'followers_count' | 'following_count' | 'posts_count'; label: string; exact: string | null }[];
  profileLinks: string[];
  postLinks?: string[];
  discoveryLinks?: string[];
  postAuthorLinks?: string[];
  postCaption?: string | null;
  visibleBiography?: string | null;
  biographyCandidateCount?: number;
  visibleStatLabels?: { text: string; exact: string | null }[];
};
export const emptyInstagramTagPattern=/no posts yet|no posts found|no results found|couldn't find any results|henüz (?:hiç )?gönderi yok|gönderi bulunamadı|sonuç bulunamadı/iu;
export class InstagramStop extends Error {
  constructor(readonly reason: 'login' | 'challenge' | 'rate-limit' | 'access-denied' | 'layout', message: string,readonly restriction?:import('./instagram-restriction').HttpRestriction) { super(`INSTAGRAM_STOP:${reason}: ${message}`); }
}
export class InstagramProfileReadError extends InstagramStop { constructor(){super('layout','Recognized public profile title and main content not found');} }
export function checkInstagramGate(snapshot: InstagramSnapshot) {
  const path = new URL(snapshot.url).pathname;
  if (/\/(challenge|checkpoint)\b/i.test(path) || snapshot.hasCaptcha || /captcha|confirm (?:that )?you(?:'re| are) human|verify (?:your identity|that you)|robot olmadığınızı|kimliğini doğrula|şüpheli hareket/i.test(snapshot.bodyText)) throw new InstagramStop('challenge', 'Manual attention required; no further profiles requested');
  if (/\/accounts\/(login|onetap)/i.test(path) || snapshot.hasPasswordForm || /log in to (?:see|continue|view)|login to (?:see|continue|view)|devam etmek için giriş yap|görmek için (?:kaydol veya )?giriş yap|görmek için kaydol/i.test(snapshot.bodyText)) throw new InstagramStop('login', 'Manual login required; collection stopped');
  if (/try again later|please wait a few minutes|we restrict certain activity|çok fazla istek|birkaç dakika bekle|daha sonra tekrar dene/i.test(snapshot.bodyText)) throw new InstagramStop('rate-limit', 'Restriction message detected; collection stopped');
}
export function exactCount(label: string | null): number | null {
  if (!label) return null;
  const trimmed = label.trim().replace(/\u00a0/g, ' ');
  // Compact numbers are labels, never fabricated exact measurements.
  if (/^\d+$/.test(trimmed)) { const value = Number(trimmed); return Number.isSafeInteger(value) ? value : null; }
  if (/^\d{1,3}(?:[, .]\d{3})+$/.test(trimmed)) { const value = Number(trimmed.replace(/[, .]/g, '')); return Number.isSafeInteger(value) ? value : null; }
  return null;
}
export function extractInstagramProfile(snapshot: InstagramSnapshot, requested: string) {
  checkInstagramGate(snapshot);
  if (/this account is private|this account is now private|bu hesap gizli|hesap gizli/i.test(snapshot.mainText)) return { status: 'private' as const, profile: null, links: [] as string[] };
  if (/sorry, this page isn't available|page (?:is not|isn't) available|bu sayfaya ulaşılamıyor|sayfa kullanılamıyor/i.test(snapshot.mainText)) return { status: 'unavailable' as const, profile: null, links: [] as string[] };
  const url = instagramProfileUrl(requested);
  if (instagramProfileUrl(snapshot.url) !== url || (snapshot.canonicalUrl && instagramProfileUrl(snapshot.canonicalUrl) !== url)) throw new InstagramStop('layout', 'Profile identity or canonical URL changed');
  const username = new URL(url).pathname.split('/')[1];
  const title = snapshot.ogTitle ?? snapshot.title;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleMatch = title.match(new RegExp(`^(.*?)\\s*\\(@${escaped}\\)`, 'i'));
  if (!titleMatch || !snapshot.mainText.trim()) throw new InstagramProfileReadError();
  const description = snapshot.description ?? '';
  const labels: Record<string, string | null> = { followers_count: null, following_count: null, posts_count: null };
  const counts: Record<string, number | null> = { followers_count: null, following_count: null, posts_count: null };
  const patterns = {
    followers_count: /([\d][\d.,\s]*(?:[kmb]|bin|mn|milyon)?)\s+(?:followers|takipçi)(?![\p{L}\p{N}_])/iu,
    following_count: /([\d][\d.,\s]*(?:[kmb]|bin|mn|milyon)?)\s+(?:following|takip)(?![\p{L}\p{N}_])/iu,
    posts_count: /([\d][\d.,\s]*(?:[kmb]|bin|mn|milyon)?)\s+(?:posts|gönderi)(?![\p{L}\p{N}_])/iu,
  };
  for (const [kind, pattern] of Object.entries(patterns)) {
    const metric = snapshot.metrics.find(m => m.kind === kind);
    const visible = snapshot.visibleStatLabels?.find(stat => pattern.test(stat.text));
    const label = visible?.text.match(pattern)?.[1]?.trim() ?? metric?.label ?? description.match(pattern)?.[1]?.trim() ?? null;
    labels[kind] = label;
    counts[kind] = exactCount(visible?.exact ?? metric?.exact ?? label);
  }
  // A localized profile meta description can contain no biography at all.
  // Read the dedicated public biography element first; never classify the entire page.
  const metaBio = description.match(/on Instagram:\s*["“]([\s\S]*)["”]\s*$/i)?.[1]?.trim() || null;
  const visibleBio = snapshot.visibleBiography?.trim() || null;
  const bio = visibleBio ?? metaBio;
  const warnings = Object.entries(counts).filter(([, value]) => value === null).map(([key]) => `${key}: exact measurement unavailable`);
  if (!bio) warnings.push('biography: not extracted; keyword absence is unknown');
  const profile = profileSchema.parse({ username, display_name: titleMatch[1].trim() || null, biography: bio, external_links:[...new Set(snapshot.profileLinks.map(publicCommerceUrl).filter((u):u is string=>Boolean(u)))].slice(0,30), ...counts, synthetic: false,
    extraction: { method: 'instagram-visible-page', warnings, metric_labels: labels,
      biography_source: visibleBio ? 'visible-profile-bio' : metaBio ? 'meta-description' : 'unavailable',
      coverage: { biography: bio ? 'collected' : 'not_available', post_captions: 'not_collected', hashtags: 'not_collected', comments: 'not_collected' },
    },
  });
  const links = [...new Set(snapshot.profileLinks.flatMap(link => { try { return [instagramProfileUrl(link)]; } catch { return []; } }))].filter(link => link !== url);
  return { status: 'public' as const, profile, links };
}

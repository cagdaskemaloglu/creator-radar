import {commerceProfile} from './commerce';
import {deskContext} from './desk-context';
import {contextClassification} from './context-classifier';
import {researchFit} from './research-fit';
import {gamingContext} from './gaming-context';
import {categoryTerms} from './taxonomy';
import {profileContext,targetMatch,countryMatch} from './profile-context';
import { z } from 'zod';
export const classificationVersion='weighted-keywords-v4.4';
export const profileSchema = z.object({
  username: z.string().trim().transform(s => s.replace(/^@/, '').toLowerCase()).pipe(z.string().regex(/^[a-z0-9._]{1,30}$/)),
  display_name: z.string().max(200).nullable().default(null), biography: z.string().max(5000).nullable().default(null),
  external_links:z.array(z.string().url().max(2000)).max(30).optional(),
  instagram_user_id: z.string().nullable().default(null),
  followers_count: z.number().int().nonnegative().nullable().default(null),
  following_count: z.number().int().nonnegative().nullable().default(null), posts_count: z.number().int().nonnegative().nullable().default(null),
  discovery_evidence:z.array(z.object({provider:z.string(),keyword:z.string(),search_url:z.string().url(),result_url:z.string().url(),discovered_at:z.string()})).max(20).optional(),
  content_evidence: z.array(z.object({ url: z.string().url(), caption: z.string().max(5000), hashtags: z.array(z.string()), collected_at: z.string().datetime() })).max(6).optional(),
  extraction: z.object({
    method: z.literal('instagram-visible-page'), warnings: z.array(z.string()), metric_labels: z.record(z.string(), z.string().nullable()),
    biography_source: z.enum(['visible-profile-bio','meta-description','unavailable']).optional(),
    coverage: z.object({ biography: z.enum(['collected','not_available']), post_captions: z.enum(['collected','not_collected','not_available']), hashtags: z.enum(['collected','not_collected','not_available']), comments: z.literal('not_collected') }).optional(),
  }).optional(),
  review_assessment:z.object({status:z.string(),before:z.string(),after:z.string(),attempts:z.number().int().nonnegative(),new_evidence:z.number().int().nonnegative(),resolved:z.boolean(),became_qualified:z.boolean()}).optional(),
  research_topics:z.array(z.string()).max(5).optional(),
  research_target:z.object({country:z.string().optional(),city:z.string().optional(),gender:z.enum(['female','male']).optional()}).optional(), target_match:z.enum(['not_requested','matched','estimated','unknown','different']).optional(),
  synthetic: z.boolean().default(false),
});
export type Profile = z.infer<typeof profileSchema>;
export const niches: Record<string, string[]> = {
  ...categoryTerms,
  'Gaming':[...categoryTerms['Gaming'],'oyun','oyuncu','oyun yayını','oyun yayıncısı','oyun inceleme','oyun videoları','twitch yayıncısı','oyun kanalı','bilgisayar oyunları','valorant','minecraft','fortnite','pubg','cs2','steam','playstation','xbox','nintendo','espor','oyun yayincisi','oyun videolari','oyun incelemesi','oyunrehberi','oyunvideoları'],
  'Desk Setup': ['desk setup','desksetup','desksetups','desk','deskmat','battlestation','workspace','workspaceinspiration','setupinspiration','workspacesetup','workspace setup','battlestations','çalışma masası','çalışma masam','çalışmamasası','bilgisayar masası','bilgisayarmasası','oyun masası','oyunmasası','masa kurulumu','masakurulumu','monitör kurulumu','monitor setup','klavye setup','masa düzeni','masadüzeni','calisma masasi','calisma masam','calismamasasi','bilgisayar masam','keyboardsetup','monitorsetup','keyboard setup','çalışma alanı','çalışmaalanı','calisma alani','calismaalani'],
  'Interior Design': ['interior design','interiordesign','interiorinspo','home decor','homedecor','roomdecor','minimalistinterior','interior','decor','home','iç mekan','iç mimar','iç mimarlık','içmimari','icmimari','ev dekorasyonu','evdekorasyonu','oda tasarımı','odatasarımı','dekorasyon'],
  'Tech / Gadgets': ['tech','technology','techsetup','techreview','gadget','gadgets','smartgadgets','deskaccessories','teknoloji'],
  'Productivity': ['productivity','productivitysetup','productivitytools','study','studysetup','work from home','workfromhome','verimlilik'],
  'Cozy Room': ['cozy room','cozyroom','cozy setup','cozysetup','cozy gaming','cozygaming','roominspiration','ambientlighting','cozy home','cozyhome','cozy homes','cozy living room','cozylivingroom','cozy bedroom','cozybedroom','cozy interiors','cozyinteriors','cozy'],
};
export type ClassificationEvidence = { category: string; keyword: string; field: 'biography' | 'display_name' | 'post_caption' | 'post_hashtag'; source_url?: string; weight: number; excerpt: string };
function normalize(text: string) { return ' ' + text.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '; }
export function classifyAccountType(profile:Profile){
  const signals:{type:'store'|'creator';keyword:string;field:string;source_url?:string}[]=[];
  const sources=[{field:'biography',text:profile.biography,url:undefined as string|undefined},...(profile.content_evidence??[]).map(p=>({field:'post_caption',text:p.caption,url:p.url}))];
  const rules={store:['shop now','online store','our products','free shipping','order now','mağaza','sipariş','buy now','kapıda ödeme','ücretsiz kargo','satın al','shopier'],creator:['content creator','digital creator','ugc creator','i share','i create','içerik üreticisi']};
  for(const [type,terms] of Object.entries(rules))for(const source of sources)for(const keyword of terms){
    if(source.text&&normalize(source.text).includes(normalize(keyword)))signals.push({type:type as 'store'|'creator',keyword,field:source.field,...(source.url?{source_url:source.url}:{})});
  }
  const types=new Set(signals.map(s=>s.type));
  return {account_type:types.size===2?'mixed':types.size===1?[...types][0]:'unknown',account_type_evidence:signals,account_type_method:'explicit-text-signals-v1'};
}
export function classify(profile: Profile) {
  const evidence: ClassificationEvidence[] = [];
  const scores = new Map<string, number>();
  const fields: { field: ClassificationEvidence['field']; text: string | null; weight: number; url?: string }[] = [{ field: 'biography', text: profile.biography, weight: 3 }, { field: 'display_name', text: profile.display_name, weight: 1 }];
  for (const post of profile.content_evidence ?? []) {
    fields.push({ field: 'post_caption', text: post.caption.replace(/#[\p{L}\p{N}_]+/gu, ' '), weight: 2, url: post.url });
    fields.push({ field: 'post_hashtag', text: post.hashtags.join(' '), weight: 1, url: post.url });
  }
  const desk=deskContext(fields.map(f=>f.text??'').join(' '));
  const gaming=gamingContext(fields.map(f=>f.text??'').join(' '));
  for (const [category, keywords] of Object.entries(niches)) {
    for (const source of fields) {
      if(category==='Gaming'&&!gaming.eligible)continue;
      if(category==='Desk Setup'&&!desk.eligible)continue;
      if (!source.text?.trim()) continue;
      const text = normalize(source.text);
      const selected: string[] = [];
      // Match whole words/hashtags and prefer specific phrases over nested generic terms.
      for (const keyword of [...keywords].sort((a, b) => b.length - a.length)) {
        const key = normalize(keyword).trim();
        if (!text.includes(' ' + key + ' ') || selected.some(term => (' ' + term + ' ').includes(' ' + key + ' '))) continue;
        selected.push(key);
        const weight = source.weight * (['home','decor','study','gaming'].includes(key) ? 1 : 3);
        evidence.push({ category, keyword, field: source.field, weight, excerpt: source.text.slice(0, 200), ...(source.url ? { source_url: source.url } : {}) });
        scores.set(category, (scores.get(category) ?? 0) + weight);
      }
    }
  }
  const fallbackUsed=!scores.size||Math.max(...scores.values())<6;
  const proposals=fallbackUsed?contextClassification(profile):[];
  for(const proposal of proposals){
    if((scores.get(proposal.category)??0)>=6)continue;
    scores.set(proposal.category,proposal.concepts*3);
    evidence.push(...proposal.evidence);
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const primary = ranked[0];
  const missing = profile.biography?.trim() ? '' : ' Biyografi alınamadı; bu alanda keyword olmadığı sonucuna varılamaz.';
  const context=profileContext(profile);
  const result = {
    ...classifyAccountType(profile),
    ...commerceProfile(profile),
    ...context,
    target_match:targetMatch(context,profile.research_target??{}),
    country_match:countryMatch(context,profile.research_target?.country),
    primary_niche: primary?.[0] ?? null,
    categories: ranked.map(([category]) => category),
    fit_score: primary ? Math.min(100, primary[1] * 8) : 0,
    classification_method: classificationVersion,
    context_classification:{method:'local-concept-rules-v1',attempted:fallbackUsed,status:proposals.length?'supported':fallbackUsed?'insufficient_evidence':'not_needed',candidates:proposals.map(p=>({category:p.category,concepts:p.concepts})),external_requests:0},
    classification_status: primary ? 'matched' : 'insufficient_evidence',
    classification_evidence: evidence,
    classification_warnings:[...(gaming.ambiguous?['Oyun/oyuncu sözcüğü video oyunu bağlamıyla doğrulanmadı; Gaming kanıtı sayılmadı.']:[]),...(desk.ambiguous?['Masa/dekorasyon sözcüğü çalışma veya bilgisayar kurulumu bağlamıyla doğrulanmadı; Desk Setup kanıtı sayılmadı.']:[])],
    classification_coverage: { display_name: Boolean(profile.display_name?.trim()), biography: Boolean(profile.biography?.trim()), post_captions: Boolean(profile.content_evidence?.length), hashtags: Boolean(profile.content_evidence?.length), comments: false },
    explanation: (proposals.length?'Yerel bağlam kurallarıyla ikinci değerlendirme: ':'') + (primary ? evidence.map(e => `${e.category}: ${({biography:'biyografi',display_name:'görünen ad',post_caption:'gönderi açıklaması',post_hashtag:'hashtag'} as Record<string,string>)[e.field]} alanında “${e.keyword}” (+${e.weight})`).join('; ') + '. Puan, anahtar kelime uyumudur; doğrulanmış uygunluk olasılığı değildir.' : 'Alınabilen ad ve biyografi alanlarında yeterli anahtar kelime kanıtı bulunamadı.') + missing + (profile.content_evidence?.length ? ` ${profile.content_evidence.length} gönderinin creator açıklaması/hashtag alanları incelendi; izleyici yorumları incelenmedi.` : ' Gönderi açıklamaları, hashtag’ler ve yorumlar bu sınıflandırmada incelenmedi.'),
  };
  const fit=researchFit(result,profile.research_topics??[]),uncertainty_reasons:string[]=[];
  if(!result.primary_niche||fit.category_match==='unknown')uncertainty_reasons.push('category_uncertain');
  if(profile.research_target?.country&&!context.country)uncertainty_reasons.push(context.location_status==='conflicting'?'country_conflicting':'country_unknown');
  if(profile.research_target?.city&&!context.city)uncertainty_reasons.push('city_unknown');
  if(profile.research_target?.gender&&!context.gender)uncertainty_reasons.push('gender_unknown');
  return{...result,...fit,uncertainty_reasons,coverage_gaps:[...(!profile.biography?.trim()?['biography_missing']:[]),...(!profile.content_evidence?.length?['caption_missing']:[])]};
}
export interface CreatorDataProvider {
  name: string;
  searchCreators(query: { limit: number }): Promise<unknown[]>;
  getCreatorProfile(username: string): Promise<unknown | null>;
}

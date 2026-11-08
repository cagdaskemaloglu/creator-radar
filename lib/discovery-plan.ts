import {instagramPostIdentity} from './instagram-post-policy';
import {categoryTerms,taxonomy} from './taxonomy';
import { z } from 'zod';
import { instagramProfileUrl } from './instagram-policy';
import { instagramPostUrl } from './instagram-post-policy';
export const discoveryProviders = ['google','instagram_tags'] as const;
export type DiscoveryProvider = typeof discoveryProviders[number];
export const discoveryTopics:Record<string,string[]> = {...Object.fromEntries(taxonomy.map(g=>[g.name,g.children.map(c=>c.terms[0])])),...categoryTerms,'Desk Setup':['desk setup','desksetup','workspace setup'],'Interior Design':['home decor','interior design','interiorinspo'],'Cozy Room':['cozy room','cozyroominspo','cozysetup'],'Tech / Gadgets':['tech gadgets','tech setup','gadgets'],'Productivity':['productivity setup','studysetup','work from home setup']};
export const discoveryKeyword = z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N}#_. -]+$/u,'Use keyword text, not URLs or search operators');
export type DiscoverySettings = {scopeKey?:string;priorityKeywords?:string[];fairBudget?:boolean; enabled:boolean; topics:string[]; keywords:string[]; providers:DiscoveryProvider[]; maxQueries:number; resultsPerQuery:number };
export function discoveryQueryKey(provider:string,keyword:string){const term=keyword.replace(/^#+/,'').toLowerCase();return provider+':'+(provider==='instagram_tags'?term.replace(/[ .-]+/g,''):term);}
export type DiscoveryQuery = {provider:DiscoveryProvider;keyword:string;url:string};
export function buildDiscoveryPlan(settings:DiscoverySettings):DiscoveryQuery[] {
  if(!settings.enabled)return [];
  const groups=settings.topics.map(topic=>discoveryTopics[topic]??[]),balanced:string[]=[];
  for(let i=0;i<3;i++)for(const group of groups)if(group[i])balanced.push(group[i]);
  const terms=[...new Set([...settings.keywords,...balanced].map(term=>discoveryKeyword.parse(term).replace(/^#+/,'').toLowerCase()))];
  if(!terms.length)throw new Error('Choose at least one research topic or keyword');
  const plan:DiscoveryQuery[]=[],seen=new Set<string>();
  for(const term of terms)for(const provider of settings.providers){
    const key=discoveryQueryKey(provider,term);if(seen.has(key))continue;
    if(plan.length>=settings.maxQueries)return plan;seen.add(key);
    if(provider==='google'){
      const u=new URL('https://www.google.com/search');
      u.searchParams.set('q',`site:instagram.com/ "${term}" -inurl:/p/ -inurl:/reel/ -inurl:/explore/ -inurl:/stories/`);
      plan.push({provider,keyword:term,url:u.href});
    }else{
      const tag=term.replace(/[ .-]+/g,'').replace(/^#+/,'');
      if(!/^[\p{L}\p{N}_]{2,80}$/u.test(tag))throw new Error('Unsupported hashtag');
      plan.push({provider,keyword:term,url:`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`});
    }
  }
  return plan;
}
export type DiscoveryLink = {url:string;kind:'profile'|'post';title:string};
export function normalizeDiscoveryLink(raw:string,title=''):DiscoveryLink|null {
  try{
    let u=new URL(raw,'https://www.google.com');
    if(u.hostname==='www.google.com'&&u.pathname==='/url')u=new URL(u.searchParams.get('q')??u.searchParams.get('url')??'');
    if(!['instagram.com','www.instagram.com'].includes(u.hostname)||u.protocol!=='https:'||u.username||u.password||u.port)return null;
    // Strip only public tracking/language parameters; reject auth-bearing or unknown query data.
    for(const key of u.searchParams.keys())if(!/^(utm_\w+|hl|igsh|igshid)$/.test(key))return null;
    u.search='';u.hash='';
    try{return{url:instagramProfileUrl(u.href),kind:'profile',title:title.slice(0,300)};}catch{}
    try{return{url:instagramPostUrl(u.href),kind:'post',title:title.slice(0,300)};}catch{}
    return null;
  }catch{return null;}
}
export function uniqueDiscoveryLinks(links:{url:string;title:string}[],limit:number):DiscoveryLink[]{
  const seen=new Set<string>(),result:DiscoveryLink[]=[];
  for(const raw of links){const item=normalizeDiscoveryLink(raw.url,raw.title);const key=item?.kind==='post'?'post:'+instagramPostIdentity(item.url):item?.url;if(item&&key&&!seen.has(key)){seen.add(key);result.push(item);if(result.length>=limit)break;}}
  return result;
}

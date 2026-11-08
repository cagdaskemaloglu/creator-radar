import type {Profile} from './model';
export const channelLabels:Record<string,string>={shopier:'Shopier',trendyol:'Trendyol',hepsiburada:'Hepsiburada',etsy:'Etsy',amazon:'Amazon',website:'Satış sitesi (sahiplik doğrulanmadı)',dm:'Instagram DM',whatsapp:'WhatsApp'};
const domains:Record<string,string>={'shopier.com':'shopier','trendyol.com':'trendyol','ty.gl':'trendyol','hepsiburada.com':'hepsiburada','etsy.com':'etsy','amazon.com':'amazon','amazon.com.tr':'amazon','amzn.to':'amazon','wa.me':'whatsapp','whatsapp.com':'whatsapp'};
export function publicCommerceUrl(raw:string){try{let u=new URL(raw);if(u.hostname==='l.instagram.com'&&u.searchParams.has('u'))u=new URL(u.searchParams.get('u')!);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!u.hostname.includes('.')||/(^|\.)(?:instagram.com|facebook.com)$/.test(u.hostname)||/\/(?:login|auth|reset|password|checkout|payment)(?:\/|$)/i.test(u.pathname))return null;return(u.origin+u.pathname).slice(0,2000);}catch{return null;}}
export function commerceProfile(profile:Pick<Profile,'username'|'biography'|'content_evidence'|'external_links'>){
 const profileUrl=`https://www.instagram.com/${profile.username}/`;
 const sources=[{field:'biography',text:profile.biography??'',source_url:profileUrl},...(profile.content_evidence??[]).map(p=>({field:'post_caption',text:p.caption,source_url:p.url}))];
 const evidence:{kind:string;field:string;excerpt:string;source_url:string;url?:string}[]=[];
 const channels:{channel:string;url:string|null;basis:'linked'|'text';source_url:string;excerpt:string;ownership:'unverified'}[]=[];
 const sale=/\b(?:order now|our products|online store|shop now|buy now|we sell)\b|sipariş(?:ler|iniz|inizi|i)?|kapıda ödeme|satın al|ücretsiz kargo|mağazamız|ürünlerimiz/iu;
 const affiliate=/affiliate|komisyon|reklam|işbirliği|indirim kod|discount code|amazon finds|storefront/iu;
 for(const source of sources){
  const lines=source.text.split(/\n/).filter(Boolean);
  for(const line of lines){if(affiliate.test(line))evidence.push({kind:'promotion',field:source.field,excerpt:line.slice(0,500),source_url:source.source_url});if(!sale.test(line)||affiliate.test(line)||/satış yapm|sipariş alm|satmıyor|not selling|do not sell/iu.test(line))continue;
   evidence.push({kind:'sale_signal',field:source.field,excerpt:line.slice(0,500),source_url:source.source_url});
   for(const [term,channel] of [['shopier','shopier'],['trendyol','trendyol'],['whatsapp','whatsapp'],['dm','dm']] as const)if(new RegExp('(?:^|[^\\p{L}])'+term+'(?:$|[^\\p{L}])','iu').test(line))channels.push({channel,url:null,basis:'text',source_url:source.source_url,excerpt:line.slice(0,500),ownership:'unverified'});
  }
 }
 const sales=evidence.some(e=>e.kind==='sale_signal');
 const links=[...(profile.external_links??[]).map(url=>({url,source_url:profileUrl,field:'profile_link'})),...sources.flatMap(s=>(s.text.match(/https?:\/\/[^\s<>"']+/g)??[]).map(url=>({url,source_url:s.source_url,field:s.field})))];
 for(const link of links){const url=publicCommerceUrl(link.url);if(!url)continue;const host=new URL(url).hostname.toLowerCase();const platform=Object.entries(domains).find(([d])=>host===d||host.endsWith('.'+d))?.[1];
  const aggregator=/(^|\.)(?:linktr.ee|beacons.ai|bio.site|youtube.com|youtu.be|tiktok.com|pinterest.com|x.com|twitter.com|gmail.com)$/i.test(host);
  const channel=platform??(sales&&!aggregator?'website':null);if(!channel)continue;
  channels.push({channel,url,basis:'linked',source_url:link.source_url,excerpt:url,ownership:'unverified'});
 }
 const unique=channels.filter((c,i,a)=>a.findIndex(v=>v.channel===c.channel&&v.url===c.url&&v.source_url===c.source_url)===i).slice(0,30);
 return{selling_status:sales?'sales_signals':unique.length?'channel_linked':'unknown',promotion_signals:evidence.some(e=>e.kind==='promotion'),sales_channels:unique,sales_evidence:evidence.slice(0,30),commerce_method:'public-commerce-signals-v1'};
}

export type SalesChannel=ReturnType<typeof commerceProfile>['sales_channels'][number];
export function commerceMatches(profile:{selling_status?:string;sales_channels?:SalesChannel[]},status:string,channel:string){return(!status||profile.selling_status===status)&&(!channel||Boolean(profile.sales_channels?.some(c=>c.channel===channel)));}

import {z} from 'zod';
export type ContactEmail={email:string;source_field:'biography';source_url:string;source_provider:string;excerpt:string;first_seen_at:string;last_seen_at:string;is_current:boolean};
export function extractBiographyEmails(biography:string):{email:string;excerpt:string}[]{
 const found=new Map<string,{email:string;excerpt:string}>();
 const pattern=/(?<![\w@.+-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}(?![\w@-])/gi;
 for(const match of biography.matchAll(pattern)){
  const email=match[0].replace(/^\.+/,'').toLowerCase();
  if(!z.email().safeParse(email).success)continue;
  const start=match.index??0;found.set(email,{email,excerpt:biography.slice(Math.max(0,start-50),Math.min(biography.length,start+match[0].length+50))});
 }
 return [...found.values()];
}
export function updateContactEmails(previous:ContactEmail[],biography:string|null,source:{url:string;provider:string;collected_at:string}):ContactEmail[]{
 // Missing biography is incomplete extraction, not evidence that contact details disappeared.
 if(biography===null)return previous;
 const current=extractBiographyEmails(biography),emails=new Set(current.map(c=>c.email));
 const result=previous.filter(c=>!emails.has(c.email)).map(c=>({...c,is_current:false}));
 for(const c of current){const old=previous.find(p=>p.email===c.email);result.push({...c,source_field:'biography',source_url:source.url,source_provider:source.provider,first_seen_at:old?.first_seen_at??source.collected_at,last_seen_at:source.collected_at,is_current:true});}
 return result;
}

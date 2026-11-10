import type {CreatorStore} from './db';
import {first} from './storage/driver';
import {instagramPostAliases} from './instagram-post-policy';
import {instagramProfileUrl} from './instagram-policy';
export const recoverableReasons=new Set(['consecutive_transport_errors','consecutive_profile_layout_errors','consecutive_tag_read_errors']);
export type QuarantineKind='profile'|'post'|'tag';
export type TechnicalReason='network_error'|'layout_unreadable';
function key(kind:QuarantineKind,url:string){if(kind==='post')return instagramPostAliases(url)[0];if(kind==='profile')return instagramProfileUrl(url);const u=new URL(url);if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash||!/^\/explore\/tags\/[^/]+\/$/.test(u.pathname))throw Error('Invalid tag quarantine URL');return'https://www.instagram.com'+u.pathname;}
export class TechnicalQuarantine{
 constructor(readonly store:CreatorStore){}
 async get(kind:QuarantineKind,url:string,now=Date.now()){return first(this.store.database,'SELECT reason,expires_at FROM research_quarantine WHERE kind=$1 AND url=$2 AND expires_at>$3',[kind,key(kind,url),new Date(now).toISOString()]);}
 async add(kind:QuarantineKind,url:string,reason:TechnicalReason,now=Date.now()){
  if(!['network_error','layout_unreadable'].includes(reason))throw Error('Only technical failures may be quarantined');
  const until=new Date(now+(reason==='network_error'?30*60000:2*3600000)).toISOString();await this.store.database.query('INSERT INTO research_quarantine(kind,url,reason,last_seen_at,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(kind,url) DO UPDATE SET reason=excluded.reason,last_seen_at=excluded.last_seen_at,expires_at=excluded.expires_at',[kind,key(kind,url),reason,new Date(now).toISOString(),until]);
 }
 async summary(now=Date.now()){const r=await first(this.store.database,'SELECT count(*) AS n FROM research_quarantine WHERE expires_at>$1',[new Date(now).toISOString()]);return Number(r?.n??0);}
}

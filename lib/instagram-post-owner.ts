import { instagramPostUrl,instagramPostIdentity } from './instagram-post-policy';
import { instagramProfileUrl } from './instagram-policy';
import type { InstagramSnapshot } from './instagram-extract';
export type OwnerFailure='owner_link_missing'|'multiple_owner_candidates'|'post_identity_mismatch'|'page_not_loaded';
export type OwnerResolution={profile:string|null;reason:OwnerFailure|null;candidates:string[];method:'header'|'permalink'|null};
export function diagnoseSnapshotPostAuthor(snapshot:InstagramSnapshot|null,requested:string):OwnerResolution{
 const fail=(reason:OwnerFailure,candidates:string[]=[]):OwnerResolution=>({profile:null,reason,candidates,method:null});
 if(!snapshot)return fail('page_not_loaded');
 let post:string;
 try{post=instagramPostIdentity(requested);if(instagramPostIdentity(snapshot.url)!==post||(snapshot.canonicalUrl&&instagramPostIdentity(snapshot.canonicalUrl)!==post))return fail('post_identity_mismatch');}catch{return fail('post_identity_mismatch');}
 const owners=new Set<string>();
 for(const link of snapshot.postAuthorLinks??[]){try{owners.add(instagramProfileUrl(link));}catch{}}
 const header=owners.size>0,links=snapshot.discoveryLinks??[];
 // An author-bearing timestamp must identify this exact post and have a visible
 // matching profile link. Mentions, commenters and other post cards are not proof.
 for(const link of links){try{
  const u=new URL(link),match=u.pathname.match(/^\/([a-zA-Z0-9._]{1,30})\/(?:p|reel)\/[a-zA-Z0-9_-]+\/?$/);
  if(!match||instagramPostIdentity(link)!==post)continue;
  const owner=instagramProfileUrl(`https://www.instagram.com/${match[1]}/`);
  if(links.some(candidate=>{try{return instagramProfileUrl(candidate)===owner;}catch{return false;}}))owners.add(owner);
 }catch{}}
 if(owners.size>1)return fail('multiple_owner_candidates',[...owners]);
 if(!owners.size)return fail(snapshot.mainText.trim()?'owner_link_missing':'page_not_loaded');
 return{profile:[...owners][0],reason:null,candidates:[...owners],method:header?'header':'permalink'};
}
export function resolveSnapshotPostAuthor(snapshot:InstagramSnapshot,requested:string):string|null{return diagnoseSnapshotPostAuthor(snapshot,requested).profile;}

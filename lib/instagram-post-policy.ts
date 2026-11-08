export class InstagramPostRouteError extends Error{constructor(message='Unsupported Instagram post route'){super(message);}}
export function instagramPostUrl(raw:string){
 let u:URL;try{u=new URL(raw);}catch{throw new InstagramPostRouteError('Invalid Instagram post URL');}
 if(u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash)throw new InstagramPostRouteError('Invalid Instagram post URL');
 const match=u.pathname.match(/^\/(?:[a-zA-Z0-9._]{1,30}\/)?(p|reel)\/([a-zA-Z0-9_-]{1,100})\/?$/);
 if(!match)throw new InstagramPostRouteError();
 return `https://www.instagram.com/${match[1]}/${match[2]}/`;
}
// Instagram serves the same shortcode through /p/ and /reel/ routes.
export function instagramPostIdentity(raw:string){return new URL(instagramPostUrl(raw)).pathname.split('/')[2];}
export function instagramPostAliases(raw:string){const id=instagramPostIdentity(raw);return[`https://www.instagram.com/p/${id}/`,`https://www.instagram.com/reel/${id}/`];}

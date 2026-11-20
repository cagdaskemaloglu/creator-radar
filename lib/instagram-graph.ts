import {createHash,createHmac} from 'node:crypto';
import {mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {publicCommerceUrl} from './commerce';
import {profileSchema,type Profile} from './model';
import {instagramPostUrl} from './instagram-post-policy';
import type {PostEvidence} from './instagram-post';

// Resmî Instagram Graph API "Business Discovery" ile herkese açık işletme/creator
// profillerini okur. Tarayıcı ziyareti, sayfa bekleme süresi veya Instagram sayfa
// bütçesi tüketmez. Meta'nın kendi kullanım sınırlarına uyulur: kullanım başlıkları
// %80'i aşınca veya sınır hatası gelince istemci kendini bekletir; asla zorlamaz.

export type GraphConfig={token:string;userId:string;version:string;hourlyCalls:number;mediaLimit:number;appSecret:string|null;timeoutMs:number;statePath:string};
export function graphConfig(env:Record<string,string|undefined>=process.env):GraphConfig|null{
 const token=env.INSTAGRAM_GRAPH_TOKEN?.trim(),userId=env.INSTAGRAM_GRAPH_USER_ID?.trim();
 if(!token||!userId||env.INSTAGRAM_GRAPH_ENABLED==='false')return null;
 if(!/^\d{5,30}$/.test(userId))throw new Error('Invalid INSTAGRAM_GRAPH_USER_ID: expected the numeric Instagram Business/Creator account id');
 const version=env.INSTAGRAM_GRAPH_API_VERSION?.trim()||'v23.0';
 if(!/^v\d{1,3}\.\d$/.test(version))throw new Error('Invalid INSTAGRAM_GRAPH_API_VERSION: expected a value like v23.0');
 const int=(key:string,fallback:number,min:number,max:number)=>{const value=Number(env[key]??fallback);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`Invalid ${key}: expected integer ${min}–${max}`);return value;};
 return {token,userId,version,hourlyCalls:int('INSTAGRAM_GRAPH_HOURLY_CALLS',150,1,5000),mediaLimit:int('INSTAGRAM_GRAPH_MEDIA_LIMIT',6,0,6),appSecret:env.INSTAGRAM_GRAPH_APP_SECRET?.trim()||null,timeoutMs:int('INSTAGRAM_GRAPH_TIMEOUT_MS',15000,1000,60000),statePath:resolve(env.INSTAGRAM_GRAPH_STATE_FILE??'data/instagram-graph-state.json')};
}

const stateSchema=z.object({windowStart:z.number().default(0),calls:z.number().int().nonnegative().default(0),cooldownUntil:z.string().nullable().default(null),cooldownReason:z.string().nullable().default(null),disabledReason:z.string().nullable().default(null),tokenFingerprint:z.string().nullable().default(null),lastUsagePercent:z.number().nullable().default(null),reads:z.number().int().nonnegative().default(0),notBusiness:z.number().int().nonnegative().default(0),
 // Kişisel/görünmeyen hesaplar 30 gün tekrar sorgulanmaz: API kotası boşa harcanmaz.
 notBusinessUsers:z.record(z.string(),z.string()).default({})});
export type GraphState=z.infer<typeof stateSchema>;
export function readGraphState(path:string):GraphState{try{return stateSchema.parse(JSON.parse(readFileSync(path,'utf8')));}catch{return stateSchema.parse({});}}
function writeGraphState(path:string,state:GraphState){mkdirSync(dirname(path),{recursive:true,mode:0o700});const temp=path+'.tmp';writeFileSync(temp,JSON.stringify(stateSchema.parse(state)),{mode:0o600});renameSync(temp,path);}

export type GraphResult={status:'loaded';profile:Profile;posts:PostEvidence[]}|{status:'not_business'}|{status:'unavailable';reason:string};
export type GraphReader=(username:string,signal:AbortSignal)=>Promise<GraphResult>;
type Fetch=(url:string,init:{signal:AbortSignal;headers:Record<string,string>})=>Promise<{status:number;headers:{get(name:string):string|null};json():Promise<unknown>}>;

const HOUR=3600000,USAGE_LIMIT=80,NOT_BUSINESS_TTL=30*24*HOUR,NOT_BUSINESS_MAX=5000;
const rateCodes=new Set([4,17,32,613,80002]);
// Personal/private accounts or unknown usernames: Business Discovery cannot see them.
const notBusinessSubcodes=new Set([2207013]);

// Highest percentage reported by Meta's usage headers, plus any regain-access estimate (minutes).
export function graphUsage(headers:{get(name:string):string|null}){
 let percent=0,regainMinutes=0;
 const parse=(raw:string|null)=>{try{return raw?JSON.parse(raw) as unknown:null;}catch{return null;}};
 const visit=(value:unknown)=>{
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(visit);return;}
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
   if(typeof item==='number'&&['call_count','total_cputime','total_time','acc_id_util_pct'].includes(key))percent=Math.max(percent,item);
   else if(typeof item==='number'&&key==='estimated_time_to_regain_access')regainMinutes=Math.max(regainMinutes,item);
   else visit(item);
  }
 };
 visit(parse(headers.get('x-app-usage')));visit(parse(headers.get('x-business-use-case-usage')));visit(parse(headers.get('x-ad-account-usage')));
 return {percent,regainMinutes};
}

export function graphProfile(data:Record<string,unknown>,username:string,now=new Date()):{profile:Profile;posts:PostEvidence[]}{
 const num=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
 const text=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null;
 const biography=text(data.biography)?.slice(0,5000)??null,website=text(data.website);
 const posts:PostEvidence[]=[];
 const media=(data.media as {data?:unknown[]}|undefined)?.data??[];
 for(const item of media){
  const m=item as Record<string,unknown>,caption=text(m.caption)?.slice(0,5000);
  if(!caption||typeof m.permalink!=='string')continue;
  let url:string;try{url=instagramPostUrl(m.permalink);}catch{continue;}
  posts.push({url,caption,hashtags:[...new Set((caption.match(/#[\p{L}\p{N}_]+/gu)??[]).map(t=>t.toLocaleLowerCase('tr-TR')))],collected_at:now.toISOString()});
  if(posts.length>=6)break;
 }
 const counts={followers_count:num(data.followers_count),following_count:num(data.follows_count),posts_count:num(data.media_count)};
 const warnings=Object.entries(counts).filter(([,v])=>v===null).map(([k])=>`${k}: not provided by Graph API`);
 if(!biography)warnings.push('biography: empty or not provided; keyword absence is unknown');
 const profile=profileSchema.parse({username,display_name:text(data.name)?.slice(0,200)??null,biography,instagram_user_id:typeof data.id==='string'?data.id:null,
  external_links:website&&publicCommerceUrl(website)?[publicCommerceUrl(website)]:[],...counts,synthetic:false,
  extraction:{method:'instagram-graph-api',warnings,metric_labels:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v===null?null:String(v)])),
   biography_source:biography?'graph-api':'unavailable',
   coverage:{biography:biography?'collected':'not_available',post_captions:posts.length?'collected':'not_available',hashtags:posts.length?'collected':'not_available',comments:'not_collected'}}});
 return {profile,posts};
}

export class InstagramGraphClient{
 constructor(readonly config:GraphConfig,readonly fetcher:Fetch=globalThis.fetch as unknown as Fetch,readonly now:()=>number=Date.now){}
 private fingerprint(){return createHash('sha256').update(this.config.token).digest('hex').slice(0,16);}
 state(){
  const state=readGraphState(this.config.statePath),fp=this.fingerprint();
  // A new token clears a previous invalid-token stop; nothing else is reset.
  if(state.tokenFingerprint!==fp)return {...state,tokenFingerprint:fp,disabledReason:null};
  return state;
 }
 // Why the API cannot be used right now (null = available). Never sends a request.
 blocked(state=this.state()){
  if(state.disabledReason)return state.disabledReason;
  if(state.cooldownUntil&&Date.parse(state.cooldownUntil)>this.now())return 'cooldown:'+state.cooldownReason;
  if(this.now()-state.windowStart<HOUR&&state.calls>=this.config.hourlyCalls)return 'hourly_budget';
  return null;
 }
 private cool(state:GraphState,reason:string,minutes:number){writeGraphState(this.config.statePath,{...state,cooldownUntil:new Date(this.now()+Math.max(minutes,60)*60000).toISOString(),cooldownReason:reason});}
 read:GraphReader=async(raw,signal)=>{
  const username=raw.replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9._]{1,30}$/.test(username))return {status:'unavailable',reason:'invalid_username'};
  let state=this.state();
  const known=state.notBusinessUsers[username];
  if(known&&this.now()-Date.parse(known)<NOT_BUSINESS_TTL)return {status:'not_business'};
  const blocked=this.blocked(state);if(blocked)return {status:'unavailable',reason:blocked};
  if(this.now()-state.windowStart>=HOUR)state={...state,windowStart:this.now(),calls:0};
  state={...state,calls:state.calls+1};writeGraphState(this.config.statePath,state);
  const media=this.config.mediaLimit?`,media.limit(${this.config.mediaLimit}){caption,permalink,timestamp}`:'';
  const params=new URLSearchParams({fields:`business_discovery.username(${username}){id,username,name,biography,website,followers_count,follows_count,media_count${media}}`,access_token:this.config.token});
  if(this.config.appSecret)params.set('appsecret_proof',createHmac('sha256',this.config.appSecret).update(this.config.token).digest('hex'));
  let response:Awaited<ReturnType<Fetch>>;
  try{response=await this.fetcher(`https://graph.facebook.com/${this.config.version}/${this.config.userId}?${params}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(this.config.timeoutMs)]),headers:{accept:'application/json'}});}
  catch(error){signal.throwIfAborted();return {status:'unavailable',reason:'network_error'};}
  const usage=graphUsage(response.headers);state={...readGraphState(this.config.statePath),tokenFingerprint:this.fingerprint(),lastUsagePercent:usage.percent};
  const body=await response.json().catch(()=>null) as {error?:{code?:number;error_subcode?:number;type?:string};business_discovery?:Record<string,unknown>}|null;
  const error=body?.error;
  if(error||response.status>=400||!body?.business_discovery){
   const code=Number(error?.code),sub=Number(error?.error_subcode);
   if(rateCodes.has(code)||response.status===429){this.cool(state,'rate_limit_'+(code||response.status),usage.regainMinutes);return {status:'unavailable',reason:'rate_limit'};}
   if(code===190||code===102){writeGraphState(this.config.statePath,{...state,disabledReason:'token_invalid'});return {status:'unavailable',reason:'token_invalid'};}
   if(code===110||notBusinessSubcodes.has(sub)||(!error&&response.status<400)){const users=Object.entries({...state.notBusinessUsers,[username]:new Date(this.now()).toISOString()}).filter(([,at])=>this.now()-Date.parse(at)<NOT_BUSINESS_TTL).slice(-NOT_BUSINESS_MAX);writeGraphState(this.config.statePath,{...state,notBusiness:state.notBusiness+1,notBusinessUsers:Object.fromEntries(users)});return {status:'not_business'};}
   writeGraphState(this.config.statePath,state);return {status:'unavailable',reason:response.status>=500?'server_error':'graph_error_'+(code||response.status)};
  }
  if(usage.percent>=USAGE_LIMIT)this.cool(state,'usage_'+Math.round(usage.percent),usage.regainMinutes);
  else writeGraphState(this.config.statePath,state);
  const latest=readGraphState(this.config.statePath);writeGraphState(this.config.statePath,{...latest,reads:latest.reads+1});
  try{return {status:'loaded',...graphProfile(body.business_discovery,username,new Date(this.now()))};}
  catch{return {status:'unavailable',reason:'unexpected_payload'};}
 };
}

export function defaultGraphReader():GraphReader|null{const config=graphConfig();return config?new InstagramGraphClient(config).read:null;}
// Panel/API için güvenli özet: token veya kimlik içermez.
export function graphSummary(){
 let config:GraphConfig|null;try{config=graphConfig();}catch(error){return {configured:false,error:error instanceof Error?error.message:'invalid configuration'};}
 if(!config)return {configured:false};
 const client=new InstagramGraphClient(config),state=client.state();
 return {configured:true,available:!client.blocked(state),blocked_reason:client.blocked(state),calls_this_hour:Date.now()-state.windowStart<HOUR?state.calls:0,hourly_limit:config.hourlyCalls,cooldown_until:state.cooldownUntil&&Date.parse(state.cooldownUntil)>Date.now()?state.cooldownUntil:null,last_usage_percent:state.lastUsagePercent,reads:state.reads,not_business:state.notBusiness};
}

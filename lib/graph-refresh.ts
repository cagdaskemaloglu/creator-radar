import type {CreatorStore} from './db';
import type {GraphReader} from './instagram-graph';
import {profileSchema} from './model';
import {all,jsonObject} from './storage/driver';

export type GraphRefreshOptions={limit:number;olderThanHours:number;now?:()=>number;signal?:AbortSignal};
export type GraphRefreshResult={checked:number;updated:number;not_business:number;stopped:string|null};

// Tarayıcı soğumadayken de iş üretmek için: kayıtlı creator'ların metrik, biyografi ve
// gönderi açıklamalarını yalnız resmî Graph API ile yeniler. Instagram'a tarayıcı isteği
// göndermez, tarayıcı bütçesini veya soğumayı etkilemez. API sınırına gelince durur.
export async function refreshViaGraph(store:CreatorStore,read:GraphReader,options:GraphRefreshOptions):Promise<GraphRefreshResult>{
 const now=options.now??Date.now,signal=options.signal??new AbortController().signal;
 const cutoff=new Date(now()-options.olderThanHours*3600000).toISOString();
 const rows=await all(store.database,"SELECT username,profile_url,payload,validation_status FROM creators WHERE updated_at<$1 AND validation_status NOT IN ('rejected','suppressed') ORDER BY updated_at ASC,id ASC LIMIT $2",[cutoff,options.limit*3]);
 const result:GraphRefreshResult={checked:0,updated:0,not_business:0,stopped:null};
 for(const row of rows){
  if(result.updated>=options.limit)break;
  signal.throwIfAborted();
  const stored=profileSchema.safeParse(jsonObject(row.payload));
  if(!stored.success||stored.data.synthetic)continue;
  result.checked++;
  const response=await read(String(row.username),signal);
  if(response.status==='not_business'){result.not_business++;continue;}
  if(response.status==='unavailable'){result.stopped=response.reason;break;}
  // Önceki araştırma bağlamı (konu/hedef) korunur; yeni API kanıtı önceki gönderi kanıtıyla birleşir.
  const evidence=[...response.posts,...(stored.data.content_evidence??[])].filter((p,i,list)=>list.findIndex(e=>e.url===p.url)===i).slice(0,6);
  const profile={...response.profile,content_evidence:evidence,research_topics:stored.data.research_topics,research_target:stored.data.research_target,...(stored.data.discovery_evidence?{discovery_evidence:stored.data.discovery_evidence}:{})};
  try{await store.saveProfile(profile,{provider:'instagram-graph',identifier:String(row.profile_url),permission:'Instagram Graph API business discovery'});result.updated++;}
  catch(error){if(error instanceof Error&&/suppressed|collision|Conflicting/.test(error.message))continue;throw error;}
 }
 return result;
}

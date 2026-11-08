import {estimateLanguageCountry} from './language-country';
import type {Profile} from './model';
import {countries,type ResearchTarget} from './taxonomy';
const cityRules:Record<string,{country:string;names:string[]}>= {
 İstanbul:{country:'TR',names:['istanbul']},Ankara:{country:'TR',names:['ankara']},İzmir:{country:'TR',names:['izmir']},Antalya:{country:'TR',names:['antalya']},Bursa:{country:'TR',names:['bursa']},Muğla:{country:'TR',names:['mugla']},Berlin:{country:'DE',names:['berlin']},London:{country:'GB',names:['london','londra']},Paris:{country:'FR',names:['paris']},Amsterdam:{country:'NL',names:['amsterdam']},Dubai:{country:'AE',names:['dubai']}
};
const norm=(s:string)=>s.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu,'').replace(/ı/g,'i');
export function profileContext(profile:Pick<Profile,'biography'|'content_evidence'>){
 const bio=profile.biography??'',evidence:{field:string;excerpt:string;source_url?:string}[]=[];
 // Residence needs an explicit first-person/based-in statement; language and travel tags never prove residence.
 const sources=[{text:bio,field:'biography',source_url:undefined as string|undefined},...(profile.content_evidence??[]).map(p=>({text:p.caption,field:'post_caption',source_url:p.url}))];
 const residenceSources=sources.map(s=>({...s,residence:s.text.split(/[\n|.!?]/).filter(line=>/(?:\b(?:based in|living in|i live in|located in)\b|yaşıyorum|ikamet|yaşayan)/iu.test(line)||(s.field==='biography'&&/^\s*📍/u.test(line))).join(' ')})).filter(s=>s.residence);
 const residence=residenceSources.map(s=>s.residence).join(' ');
 const location=norm(residence);let country:string|null=null,city:string|null=null;
 const hits=new Set<string>();
 for(const [code,label] of Object.entries(countries)){const aliases=[label,...(code==='TR'?['turkey','turkiye']:code==='DE'?['germany']:code==='GB'?['united kingdom','uk']:code==='US'?['united states','usa']:code==='FR'?['france']:code==='NL'?['netherlands','holland']:[])];if(aliases.some(n=>new RegExp('(?:^|[^a-z])'+norm(n)+'(?:$|[^a-z])').test(location)))hits.add(code);}
 const cities=Object.entries(cityRules).filter(([,r])=>r.names.some(n=>new RegExp('(?:^|[^a-z])'+n+'(?:$|[^a-z])').test(location)));
 for(const [,r] of cities)hits.add(r.country);
 if(hits.size===1){country=[...hits][0];if(cities.length===1)city=cities[0][0];evidence.push(...residenceSources.map(s=>({field:s.field,excerpt:s.residence.slice(0,500),...(s.source_url?{source_url:s.source_url}:{})}))); }
 const female=/\bshe\s*\/\s*her\b|\bi am a woman\b|\bkadınım\b/iu.test(bio),male=/\bhe\s*\/\s*him\b|\bi am a man\b|\berkeğim\b/iu.test(bio);
 const gender=female!==male?(female?'female':'male'):null;
 if(gender)evidence.push({field:'biography',excerpt:bio.slice(0,500)});
 const estimate=estimateLanguageCountry(sources);
 const location_status=country?'self_declared':hits.size>1?'conflicting':estimate.country?'language_estimate':estimate.language?'language_ambiguous':'no_signal';
 if(!country&&hits.size<=1&&estimate.country){country=estimate.country;evidence.push(...estimate.samples);}
 return {country,city,gender,location_status,language_hint:estimate.language,country_estimate:estimate,context_evidence:evidence,context_method:'residence-with-language-fallback-v2'};
}
export function targetMatch(context:ReturnType<typeof profileContext>,target:ResearchTarget){
 const checks=[target.country?context.country===target.country:null,target.city?(context.city?norm(context.city)===norm(target.city):false):null,target.gender?context.gender===target.gender:null].filter(x=>x!==null);
 return !checks.length?'not_requested':checks.every(Boolean)?(target.country&&context.location_status==='language_estimate'?'estimated':'matched'):((target.country&&!context.country)||(target.city&&!context.city)||(target.gender&&!context.gender))?'unknown':'different';
}

export function countryMatch(context:ReturnType<typeof profileContext>,target?:string){
 if(!target)return'not_requested';
 if(!context.country)return'unknown';
 if(context.country!==target)return'different';
 return context.location_status==='language_estimate'?'estimated':'matched';
}

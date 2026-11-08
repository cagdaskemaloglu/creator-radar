export type LanguageEstimate={language:string|null;country:string|null;candidates:string[];confidence:'low'|'none';method:'content-language-heuristic-v2';signals?:string[];samples:{field:string;excerpt:string;source_url?:string}[]};
const rules:{language:string;countries:string[];words:string[]}[]=[
 {language:'tr',countries:['TR'],words:['ve','bir','bu','için','ile','çok','ben','benim','siz','yeni','bugün','güzel','nasıl','bakım','cilt','ürün','ürünleri','paylaşım','her','daha','ev','dekorasyon','tarif','merhaba','tasarım','tasarımı','mekân','konut','uygulama','yaşam','alanı','odası','çalışma','renkler','ışık','sade','konfor']},
 {language:'en',countries:['US','GB','CA','AU','IE','NZ'],words:['the','and','my','your','with','this','for','today','you','our','from','love','new','how']},
 {language:'de',countries:['DE','AT','CH'],words:['und','ich','mein','meine','mit','für','heute','nicht','euch','das','ist','liebe']},
 {language:'fr',countries:['FR','BE','CA','CH'],words:['les','des','une','avec','pour','mon','mes','vous','dans','est','bonjour']},
 {language:'es',countries:['ES','MX','AR','CO','CL','PE'],words:['los','las','una','con','para','mis','hoy','como','hola','gracias','este']},
 {language:'pt',countries:['BR','PT'],words:['uma','com','para','meu','minha','hoje','vocês','obrigado','não','muito']},
 {language:'it',countries:['IT','CH'],words:['gli','una','con','per','mio','mia','oggi','sono','ciao','grazie','questo']},
 {language:'nl',countries:['NL','BE'],words:['het','een','mijn','met','voor','vandaag','niet','jullie','deze','zijn']}
];
export function estimateLanguageCountry(sources:{field:string;text:string;source_url?:string}[]):LanguageEstimate{
 const clean=sources.map(s=>({...s,text:s.text.replace(/https?:\/\/\S+|[@#][\p{L}\p{N}_]+/gu,' ')})).filter(s=>s.text.trim());
 const normalize=(word:string)=>word.toLowerCase().replace(/ı/g,'i').normalize('NFD').replace(/\p{M}/gu,'');
 const tokens=clean.flatMap(s=>s.text.toLowerCase().match(/\p{L}+/gu)??[]),words=new Set(tokens.map(normalize));
 const families:[string,RegExp][]=[['oyun',/^oyun(?:cu|cular|culari|lari|lar|u|unu|da|larda|larinda|larimi|lariyla)?$/],['yayın',/^yayin(?:ci|cisi|cilik|cilar|cilarin|lar|lari|im|imda|da|dayiz|a|ina|imiz|imizi|larim|larima)?$/],['oynamak',/^oyn(?:uyorum|uyoruz|uyor|ayin|ayalim|ayacagiz|ayacagim|adik|adim|arken|anir)$/],['izlemek',/^izle(?:yin|yici|yiciler|yicilerim|yicilerimiz|meye|mek|meyi|di|dik|dim)?$/],['abone',/^abone(?:lik|ler|lerim|lerimiz)?$/],['kanal',/^kanal(?:im|ima|imda|imiz|imizda|a|ina|i)$/],['video',/^video(?:larim|larimiz|lari|lar|larimi|mu|muz)$/],['yorum',/^yorum(?:lar|lara|larinizi|larda|larinizi|unu|unuz|larim)?$/],['eğlence',/^eglenc(?:e|eli|eye|eler)$/]];
 const domainSignals=families.filter(([,rule])=>[...words].some(w=>rule.test(w))).map(([label])=>label);
 const ranked=rules.map(r=>{const signals=r.words.filter(w=>words.has(normalize(w)));return{...r,signals:[...signals,...(r.language==='tr'?domainSignals:[])],score:signals.length+(r.language==='tr'?domainSignals.length:0)};}).sort((a,b)=>b.score-a.score),best=ranked[0],next=ranked[1];
 // Short captions, names, hashtags and conflicting languages cannot select a country.
 const language=tokens.length>=4&&best.score>=2&&best.score-next.score>=2?best.language:null;
 const candidates=language?best.countries:[];
 return{language,country:candidates.length===1?candidates[0]:null,candidates,confidence:language?'low':'none',method:'content-language-heuristic-v2',signals:language?best.signals:[],samples:language?clean.slice(0,3).map(s=>({field:s.field,excerpt:s.text.slice(0,300),...(s.source_url?{source_url:s.source_url}:{})})):[]};
}

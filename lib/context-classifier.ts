import {gamingContext} from './gaming-context';
import type {Profile,ClassificationEvidence} from './model';
// Local, explainable concept rules, not an external language model. Every
// decision needs two independent concepts in collected creator-authored text.
const norm=(s:string)=>s.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim();
const concepts:Record<string,RegExp[]>={
 'Bahçe & bitkiler':[/\b(?:bahce\w*|gardening|garden|houseplant\w*)\b/,/\b(?:sebze\w*|fide\w*|tohum\w*|bitki\w*|plant\w*)\b/,/\b(?:yetis\w*|sula\w*|toprak\w*|gubre\w*|grow\w*|soil|water\w*)\b/],
 'Interior Design':[/\b(?:oda\w*|room\w*|salon\w*|livingroom\w*|yatak\w*|bedroom\w*|evdekor\w*|icmimar\w*|interior\w*)\b/,/\b(?:dekor\w*|tasar\w*|design\w*|yenile\w*|renovat\w*|makeover\w*)\b/,/\b(?:dolap\w*|mobilya\w*|furniture|cabinet\w*|wall\w*|duvar\w*|shelf|shelves)\b/],
 'Temizlik & düzen':[/\b(?:temiz\w*|clean\w*|duzen\w*|organiz\w*|declutter\w*)\b/,/\b(?:ev(?:im|in|iniz|inde|imde|leri|ler|de)?|oda(?:m|n|si|siysa|niz|miz|lar|lari|da|nin)?|dolap\w*|kalem\w*|mutfak\w*|home\w*|room\w*|closet\w*|kitchen\w*)\b/,/\b(?:ipucl\w*|oneri\w*|rutin\w*|tips|routine\w*|sakla\w*|storage)\b/],
 'Makyaj':[/\b(?:make up|makeup|makyaj\w*)\b/,/\b(?:ruj\w*|lipstick\w*|eyeliner|foundation|fondoten\w*|far|mascara|tutorial\w*|haul\w*)\b/,/\b(?:beauty|cosmetic\w*|kozmetik\w*|guzellik)\b/],
 'Cilt bakımı':[/\b(?:cilt\w*|skin\w*)\b/,/\b(?:bakim\w*|care|serum\w*|nemlendir\w*|moisturi\w*|sunscreen|gunes krem\w*)\b/,/\b(?:rutin\w*|routine\w*|akne\w*|acne|derm\w*)\b/],
 'Gaming':[/\b(?:fivem|gta|valorant|minecraft|pubg|fortnite|twitch|playstation|xbox)\b/,/\b(?:game\w*|gaming|oyun\w*|yayin\w*|stream\w*|gta|fivem|graphics|drift)\b/],
};
export function contextClassification(profile:Profile){
 const sources:{field:ClassificationEvidence['field'];text:string;url?:string}[]=[{field:'biography',text:profile.biography??''},{field:'display_name',text:profile.display_name??''},...(profile.content_evidence??[]).map(p=>({field:'post_caption' as const,text:p.caption+' '+p.hashtags.join(' '),url:p.url}))];
 const proposals:{category:string;concepts:number;evidence:ClassificationEvidence[]}[]=[];
 for(const [category,rules] of Object.entries(concepts)){
  const hits=new Map<number,ClassificationEvidence>();
  for(const source of sources){const text=norm(source.text);for(let i=0;i<rules.length;i++){const match=text.match(rules[i]);if(!match||hits.has(i))continue;
   // One phrase cannot count as two independent concepts (e.g. GTA alone).
   if([...hits.values()].some(e=>e.keyword===match[0]))continue;
   hits.set(i,{category,keyword:match[0],field:source.field,weight:3,excerpt:text.slice(Math.max(0,(match.index??0)-80),(match.index??0)+220),...(source.url?{source_url:source.url}:{})});
  }}
  // Display names alone are discovery hints, not sufficient content evidence.
  const anchored=category==='Bahçe & bitkiler'?hits.has(1)&&(hits.has(0)||hits.has(2)):category==='Interior Design'?hits.has(1)&&(hits.has(0)||hits.has(2)):hits.has(0)&&hits.has(1);
  if(category==='Temizlik & düzen'&&gamingContext(sources.map(s=>s.text).join(' ')).eligible)continue;
  if(anchored&&hits.size>=2&&[...hits.values()].some(e=>e.field!=='display_name'))proposals.push({category,concepts:hits.size,evidence:[...hits.values()]});
 }
 return proposals.sort((a,b)=>b.concepts-a.concepts||a.category.localeCompare(b.category));
}

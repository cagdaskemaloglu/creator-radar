import {taxonomy} from './taxonomy';
export type FitStatus='matched'|'estimated'|'different'|'unknown'|'not_requested';
export function topicCategories(topics:string[]){return new Set(topics.flatMap(t=>taxonomy.find(g=>g.name===t)?.children.map(c=>c.id)??[t]));}
export function researchFit(c:{primary_niche:string|null;categories:string[];target_match:string;classification_evidence?:{category:string;weight:number}[]},topics:string[]){
 const selected=topicCategories(topics);
 const hits=c.categories.filter(category=>selected.has(category)),supported=hits.some(category=>!c.classification_evidence||c.classification_evidence.filter(e=>e.category===category).reduce((n,e)=>n+e.weight,0)>=6);
 const category_match:FitStatus=!selected.size?'not_requested':!c.primary_niche?'unknown':supported?'matched':hits.length?'unknown':'different';
 const parts=[category_match,c.target_match].filter(p=>p!=='not_requested');
 const research_match:FitStatus=!parts.length?'not_requested':parts.includes('different')?'different':parts.includes('unknown')?'unknown':parts.includes('estimated')?'estimated':'matched';
 return{category_match,research_match};
}

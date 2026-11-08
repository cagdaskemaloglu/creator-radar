export function needsSelectiveReview(c:{primary_niche:string|null;fit_score:number;category_match:string;target_match:string;research_match:string}){
 if(c.research_match==='different'&&c.fit_score>=48)return false;
 return !c.primary_niche||c.fit_score<48||c.category_match==='unknown'||c.target_match==='unknown';
}

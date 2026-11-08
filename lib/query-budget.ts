export function queryBudgetShares(pages:number,queries:{id:number;score:number;fresh:boolean;poor?:boolean}[]){
 const weights=queries.map(q=>q.fresh?1:Math.max(0.5,Math.min(2,q.score*3))),extra=Math.max(0,pages-queries.length*3),sum=weights.reduce((n,w)=>n+w,0)||1;
 return new Map(queries.map((q,i)=>[q.id,q.poor?3:3+Math.floor(extra*weights[i]/sum)]));
}

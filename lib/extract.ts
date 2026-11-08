import { parse } from 'csv-parse/sync';
import { profileSchema } from './model';
// A narrow, documented fixture contract: no scripts from submitted HTML are executed.
export function extractHtml(html:string){
 const match=html.match(/<script\b(?=[^>]*\bid=["']creator-radar["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/i);
 if(!match)throw new Error('HTML must contain <script id="creator-radar" type="application/json"> profile JSON. Arbitrary Instagram HTML is unsupported.');
 const data=JSON.parse(match[1]);return (Array.isArray(data)?data:[data]).map(p=>profileSchema.parse(p));
}
export function extractCsv(csv:string){return (parse(csv,{columns:true,skip_empty_lines:true,bom:true}) as Record<string,string>[]).map(row=>profileSchema.parse({...row,synthetic:row.synthetic==='true',...Object.fromEntries(['followers_count','following_count','posts_count'].map(k=>[k,row[k]?.trim()?Number(row[k]):null]))}));}

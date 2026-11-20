import {db,store} from '../lib/db';
import {defaultGraphReader,graphSummary} from '../lib/instagram-graph';
import {refreshViaGraph} from '../lib/graph-refresh';
// Kullanım: npm run graph:refresh -- --limit 100 --older-than-hours 72
function arg(name:string,fallback:number){const i=process.argv.indexOf(name);const v=i>=0?Number(process.argv[i+1]):fallback;if(!Number.isInteger(v)||v<1)throw new Error(`${name} pozitif tam sayı olmalı`);return v;}
async function main(){
 const read=defaultGraphReader();
 if(!read){console.error('Graph API yapılandırılmamış: .env içinde INSTAGRAM_GRAPH_TOKEN ve INSTAGRAM_GRAPH_USER_ID gerekli (docs/GRAPH_API.md).');process.exitCode=1;return;}
 const result=await refreshViaGraph(store,read,{limit:arg('--limit',100),olderThanHours:arg('--older-than-hours',72)});
 console.log(JSON.stringify({result,graph:graphSummary()},null,2));
}
main().catch(error=>{console.error('Graph yenileme başarısız:',error instanceof Error?error.message.split('\n')[0]:'bilinmeyen hata');process.exitCode=1;}).finally(()=>db.close());

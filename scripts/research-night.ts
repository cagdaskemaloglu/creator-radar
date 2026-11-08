import { db } from '../lib/db';
import { enqueue } from '../lib/job-input';
import { NightStore } from '../lib/night-store';
import { store } from '../lib/db';
async function main() {
  const args=process.argv.slice(2), urls:string[]=[],topics:string[]=[],keywords:string[]=[],providers:string[]=[];
  const options:Record<string,number>={};
  const flags:Record<string,string>={'--results':'discoveryResultsPerQuery','--pool':'poolSourceJob','--profiles':'limit','--pages':'nightMaxPages','--posts':'nightMaxPosts','--depth':'nightMaxDepth','--hours':'nightHours','--queries':'discoveryMaxQueries'};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--topic')topics.push(args[++i]??'');
    else if(args[i]==='--keyword')keywords.push(args[++i]??'');
    else if(args[i]==='--provider')providers.push(args[++i]??'');
    else if(flags[args[i]]) options[flags[args[i]]]=Number(args[++i]);
    else if(args[i].startsWith('--')) throw new Error('Unknown option');
    else urls.push(args[i]);
  }
  if(options.poolSourceJob){
    if(urls.length||topics.length||keywords.length||providers.length)throw new Error('--pool continues the existing source plan; do not combine it with new seeds or search terms');
    const settings=(await new NightStore(store).run(options.poolSourceJob)).settings;
    const job=await enqueue({kind:'instagram_night',source:`continued-pool:${options.poolSourceJob}`,permission:settings.permission,content:'',discoveryEnabled:settings.discovery?.enabled??false,discoveryTopics:settings.discovery?.topics??[],discoveryKeywords:settings.discovery?.keywords??[],discoveryProviders:settings.discovery?.providers??['google'],discoveryMaxQueries:settings.discovery?.maxQueries??4,discoveryResultsPerQuery:settings.discovery?.resultsPerQuery??10,limit:settings.maxProfiles,nightMaxPages:settings.maxPages,nightMaxPosts:Math.max(1,settings.maxPosts),nightMaxDepth:settings.maxDepth,nightHours:settings.hours,...options});
    console.log(JSON.stringify({job,status:'queued',poolSourceJob:options.poolSourceJob}));return;
  }
  const automatic=!urls.length||topics.length>0||keywords.length>0;
  const job=await enqueue({discoveryEnabled:automatic,discoveryTopics:topics.length?topics:automatic&&!keywords.length?['Interior Design','Cozy Room']:[],discoveryKeywords:keywords,discoveryProviders:providers.length?providers:['google'],kind:'instagram_night',source:'operator-night-research-cli',content:urls.join('\n'),permission:'Operator requested bounded public creator and creator-caption research',limit:20,...options});
  console.log(JSON.stringify({job,status:'queued',next:'Run npm run worker; reports appear in Veri Toplama → Gece turu özeti'},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Could not enqueue night research');process.exitCode=1;}).finally(()=>db.close());

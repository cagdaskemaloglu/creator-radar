import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {InstagramGraphClient,graphConfig,graphUsage,readGraphState,type GraphConfig} from '../lib/instagram-graph';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {writeResearchState} from '../lib/instagram-state';
const root=mkdtempSync(join(tmpdir(),'radar-graph-'));
process.env.RADAR_STORAGE='sqlite';process.env.INSTAGRAM_STATE_FILE=join(root,'instagram.json');process.env.INSTAGRAM_DAILY_PAGES='500';
let n=0;
const config=(patch:Partial<GraphConfig>={}):GraphConfig=>({token:'SECRET_TOKEN_VALUE',userId:'17841400000000000',version:'v23.0',hourlyCalls:150,mediaLimit:6,appSecret:null,timeoutMs:5000,statePath:join(root,`graph-${++n}.json`),...patch});
const headers=(values:Record<string,string>={})=>({get:(name:string)=>values[name.toLowerCase()]??null});
const ok=(username:string,extra:Record<string,unknown>={})=>({status:200,headers:headers(),json:async()=>({business_discovery:{id:'99'+[...username].map(c=>c.charCodeAt(0)).join(''),username,name:'Cozy Ev',biography:'Ev dekorasyonu ve cozy room #cozyroom',website:'https://example.com/shop',followers_count:12345,follows_count:321,media_count:88,media:{data:[{caption:'Yeni oda #CozyRoom #homedecor',permalink:'https://www.instagram.com/p/Abc123/',timestamp:'2026-11-01T10:00:00+0000'},{caption:null,permalink:'https://www.instagram.com/p/NoCap1/'},{caption:'Reel',permalink:'https://www.instagram.com/reel/Reel99/'}]},...extra}})});
const error=(code:number,status=400,sub?:number,extraHeaders:Record<string,string>={})=>({status,headers:headers(extraHeaders),json:async()=>({error:{code,error_subcode:sub,type:'OAuthException',message:'x'}})});

test('graph config is opt-in and validates the account id',()=>{
 assert.equal(graphConfig({}),null);
 assert.equal(graphConfig({INSTAGRAM_GRAPH_TOKEN:'t',INSTAGRAM_GRAPH_USER_ID:'17841400000000000',INSTAGRAM_GRAPH_ENABLED:'false'}),null);
 assert.throws(()=>graphConfig({INSTAGRAM_GRAPH_TOKEN:'t',INSTAGRAM_GRAPH_USER_ID:'me'}));
 const c=graphConfig({INSTAGRAM_GRAPH_TOKEN:'t',INSTAGRAM_GRAPH_USER_ID:'17841400000000000'});assert.equal(c?.hourlyCalls,150);assert.equal(c?.mediaLimit,6);
});

test('business discovery maps profile, metrics and owner-verified captions',async()=>{
 const urls:string[]=[];const client=new InstagramGraphClient(config(),async url=>{urls.push(url);return ok('cozy.ev');});
 const r=await client.read('@Cozy.Ev',new AbortController().signal);
 assert.equal(r.status,'loaded');if(r.status!=='loaded')return;
 assert.equal(r.profile.username,'cozy.ev');assert.equal(r.profile.followers_count,12345);assert.equal(r.profile.following_count,321);assert.equal(r.profile.posts_count,88);
 assert.match(String(r.profile.instagram_user_id),/^99\d+$/);assert.equal(r.profile.extraction?.method,'instagram-graph-api');assert.equal(r.profile.extraction?.biography_source,'graph-api');
 assert.equal(r.posts.length,2);assert.deepEqual(r.posts[0].hashtags,['#cozyroom','#homedecor']);assert.equal(r.posts[0].url,'https://www.instagram.com/p/Abc123/');
 assert.match(urls[0],/^https:\/\/graph\.facebook\.com\/v23\.0\/17841400000000000\?/);assert.match(decodeURIComponent(urls[0]),/business_discovery\.username\(cozy\.ev\)/);
 const state=readGraphState(client.config.statePath);assert.equal(state.calls,1);assert.equal(state.reads,1);assert.ok(!JSON.stringify(state).includes('SECRET_TOKEN_VALUE'));
});

test('personal or unknown accounts fall back without a cooldown',async()=>{
 const client=new InstagramGraphClient(config(),async()=>error(110));
 assert.deepEqual(await client.read('someone',new AbortController().signal),{status:'not_business'});
 const sub=new InstagramGraphClient(config(),async()=>error(100,400,2207013));
 assert.deepEqual(await sub.read('someone',new AbortController().signal),{status:'not_business'});assert.equal(sub.blocked(),null);
});

test('rate-limit errors and high usage headers pause the API for at least an hour',async()=>{
 let clock=Date.parse('2026-11-20T12:00:00Z'),calls=0;
 const limited=new InstagramGraphClient(config(),async()=>{calls++;return error(4);},()=>clock);
 assert.deepEqual(await limited.read('a',new AbortController().signal),{status:'unavailable',reason:'rate_limit'});
 assert.match(String(limited.blocked()),/^cooldown:/);
 assert.deepEqual(await limited.read('b',new AbortController().signal),{status:'unavailable',reason:'cooldown:rate_limit_4'});assert.equal(calls,1);
 clock+=3600001;assert.equal(limited.blocked(),null);
 const busy=new InstagramGraphClient(config(),async()=>({...ok('a'),headers:headers({'x-business-use-case-usage':JSON.stringify({'1':[{type:'instagram',call_count:85,total_cputime:10,total_time:12,estimated_time_to_regain_access:90}]})})}),()=>clock);
 assert.equal((await busy.read('a',new AbortController().signal)).status,'loaded');
 const until=readGraphState(busy.config.statePath).cooldownUntil;assert.equal(Date.parse(String(until)),clock+90*60000);
});

test('hourly self-imposed budget stops before sending a request',async()=>{
 let clock=0,calls=0;const client=new InstagramGraphClient(config({hourlyCalls:2}),async()=>{calls++;return ok('a');},()=>clock);
 await client.read('a',new AbortController().signal);await client.read('a',new AbortController().signal);
 assert.deepEqual(await client.read('a',new AbortController().signal),{status:'unavailable',reason:'hourly_budget'});assert.equal(calls,2);
 clock+=3600000;assert.equal((await client.read('a',new AbortController().signal)).status,'loaded');
});

test('an invalid token disables the API until the token changes',async()=>{
 const c=config();const bad=new InstagramGraphClient(c,async()=>error(190,401));
 assert.deepEqual(await bad.read('a',new AbortController().signal),{status:'unavailable',reason:'token_invalid'});
 assert.equal(bad.blocked(),'token_invalid');
 const renewed=new InstagramGraphClient({...c,token:'NEW_TOKEN'},async()=>ok('a'));assert.equal(renewed.blocked(),null);
});

test('usage header parsing takes the highest reported percentage',()=>{
 assert.deepEqual(graphUsage(headers({'x-app-usage':JSON.stringify({call_count:12,total_time:40,total_cputime:5})})),{percent:40,regainMinutes:0});
 assert.deepEqual(graphUsage(headers({'x-app-usage':'not json'})),{percent:0,regainMinutes:0});
});

test('night research reads business profiles through the API without browser page visits',async()=>{
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{enqueue}=await import('../lib/job-input');
 const db=new SQLiteDatabase(join(root,'night.sqlite')),store=new CreatorStore(db);
 const profile=(i:number)=>`https://www.instagram.com/graph_${i}/`,post=(i:number)=>`https://www.instagram.com/p/Graph_${i}/`;
 const request:NightRequest={efficientResearch:true,selectiveReview:true,content:'',limit:20,permission:'Own synthetic graph fixtures',nightMaxPages:40,nightMaxPosts:1,nightMaxDepth:0,nightHours:8,discoveryEnabled:true,discoveryKeywords:['graphone'],discoveryProviders:['instagram_tags'],discoveryMaxQueries:1,discoveryResultsPerQuery:20};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-graph',...request},store);await store.claimJob();
 let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});
 const browserProfiles:string[]=[],browserPosts:string[]=[];
 const graph=async(username:string)=>{const i=Number(username.split('_')[1]);if(i%4===3)return {status:'not_business' as const};const r=new InstagramGraphClient(config(),async()=>ok(username));return r.read(username,new AbortController().signal);};
 try{
  await researchNight(id,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},graph,
   discovery:{now:()=>clock,sleep:async ms=>{clock+=ms;},search:async q=>({sourceUrl:q.url,links:Array.from({length:8},(_,i)=>({kind:'post',url:post(i),title:''}))}),author:async url=>profile(Number(new URL(url).pathname.match(/_(\d+)/)![1]))},
   profile:async url=>{browserProfiles.push(url);return{status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:`Synthetic (@${new URL(url).pathname.split('/')[1]})`,description:null,bodyText:'x',mainText:'x',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor #homedecor'}};},
   post:async url=>{browserPosts.push(url);return null;}});
  const creators=(await store.database.query('SELECT payload FROM creators')).rows,report=(await new NightStore(store).reports())[0];
  assert.equal(creators.length,8);
  assert.deepEqual(browserProfiles.sort(),[profile(3),profile(7)].sort());
  const api=creators.filter(c=>JSON.stringify(c).includes('instagram-graph-api'));assert.equal(api.length,6);
  // 1 tag page + 8 owner resolutions + only 2 browser profile visits.
  assert.equal(report.page_requests,11);
  const logs=JSON.stringify(await store.database.query('SELECT message FROM logs WHERE job_id=$1',[id]));assert.ok(!logs.includes('SECRET_TOKEN_VALUE'));
 }finally{await db.close();}
});

test('personal accounts are remembered for 30 days so API quota is not spent twice',async()=>{
 let clock=Date.parse('2026-11-20T12:00:00Z'),calls=0;const client=new InstagramGraphClient(config(),async()=>{calls++;return error(110);},()=>clock);
 await client.read('kisisel',new AbortController().signal);await client.read('kisisel',new AbortController().signal);assert.equal(calls,1);
 clock+=31*24*3600000;await client.read('kisisel',new AbortController().signal);assert.equal(calls,2);
});

test('graph refresh updates stale creators, keeps research context and stops at the API limit',async()=>{
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{refreshViaGraph}=await import('../lib/graph-refresh'),{profileSchema}=await import('../lib/model');
 const db=new SQLiteDatabase(join(root,'refresh.sqlite')),store=new CreatorStore(db);
 try{
  for(const u of ['eski_a','eski_b','eski_c','kisisel_d'])await store.saveProfile(profileSchema.parse({username:u,biography:'eski',followers_count:10,research_topics:['Cozy Room']}),{provider:'instagram-night',identifier:`https://www.instagram.com/${u}/`,permission:'fixture'});
  await db.query("UPDATE creators SET updated_at='2026-01-01T00:00:00.000Z'");
  let calls=0;
  const read=async(username:string)=>{calls++;if(username.startsWith('kisisel'))return {status:'not_business' as const};if(calls>3)return {status:'unavailable' as const,reason:'hourly_budget'};return new InstagramGraphClient(config(),async()=>ok(username)).read(username,new AbortController().signal);};
  const result=await refreshViaGraph(store,read,{limit:10,olderThanHours:24});
  assert.equal(result.updated,3);assert.equal(result.not_business,1);assert.equal(result.stopped,null);
  const row=(await db.query("SELECT payload FROM creators WHERE username='eski_a'")).rows[0] as {payload:string};const p=JSON.parse(row.payload);
  assert.equal(p.followers_count,12345);assert.deepEqual(p.research_topics,['Cozy Room']);assert.equal(p.content_evidence.length,2);
  const sources=(await db.query("SELECT count(*) AS n FROM creator_sources WHERE provider='instagram-graph'")).rows[0] as {n:number};assert.equal(Number(sources.n),3);
  await db.query("UPDATE creators SET updated_at='2026-01-01T00:00:00.000Z'");
  const limited=await refreshViaGraph(store,async()=>({status:'unavailable',reason:'cooldown:rate_limit_4'}),{limit:10,olderThanHours:24});
  assert.equal(limited.updated,0);assert.equal(limited.stopped,'cooldown:rate_limit_4');assert.equal(limited.checked,1);
 }finally{await db.close();}
});

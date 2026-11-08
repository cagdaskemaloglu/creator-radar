import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {autonomousPlan} from '../lib/autonomous-research';
import {localizedDiscoveryKeywords} from '../lib/localized-discovery';
import {estimateLanguageCountry} from '../lib/language-country';
import {classify,profileSchema} from '../lib/model';
import {turkeyStatus} from '../app/dashboard-types';
import {researchNight,type NightRequest} from '../lib/night-research';
import {NightStore} from '../lib/night-store';
import {DiscoveryStore} from '../lib/discovery-store';
import {writeResearchState} from '../lib/instagram-state';
import {safeId} from '../lib/storage/driver';
const root=mkdtempSync(join(tmpdir(),'radar-tr-research-'));process.env.RADAR_DB=join(root,'singleton.sqlite');process.env.RADAR_STORAGE='sqlite';process.env.INSTAGRAM_STATE_FILE=join(root,'state.json');process.env.INSTAGRAM_DAILY_PAGES='0';
const trCaption='Canlı yayınlar ve oyun videoları kanalıma abone olmayı unutmayın';
test('Turkey gaming plan puts curated Turkish terms before worldwide gaming tags without inventing country suffixes',()=>{
 const p=autonomousPlan({topics:['Gaming'],country:'TR',pages:50});assert.deepEqual(p.keywords.slice(0,4),['oyun','oyuncu','yayıncı','oyuninceleme']);assert.ok(p.keywords.indexOf('gaming')>p.keywords.indexOf('türkyayıncı'));assert.deepEqual(p.priorityKeywords,p.keywords.filter(k=>localizedDiscoveryKeywords(['Gaming'],'TR').includes(k)));assert.ok(!p.keywords.includes('gamingtürkiye'));
 assert.deepEqual(autonomousPlan({topics:['Gaming'],country:'DE',pages:50}).priorityKeywords,[]);
 assert.ok(localizedDiscoveryKeywords(['Teknoloji & oyun'],'TR').slice(0,6).includes('oyun'));
});
test('gaming and streamer Turkish is recognized in accented and ASCII captions, never from platform names or hashtags alone',()=>{
 for(const caption of [trCaption,'Canli yayinlar ve oyun videolari kanalima abone olmayi unutmayin','Yayındayız oyun oynuyoruz bizi izleyin']){const e=estimateLanguageCountry([{field:'post_caption',text:caption,source_url:'https://example.com/post'}]);assert.equal(e.language,'tr');assert.equal(e.country,'TR');assert.equal(e.confidence,'low');assert.ok(e.signals?.length);}
 for(const caption of ['Gaming Twitch Discord YouTube','#oyun #yayıncı #oyuncu #türkiye','oyun yayın','my and for the oyun yayın'])assert.equal(estimateLanguageCountry([{field:'biography',text:caption}]).country,null);
});
test('country result separates residence declaration, language estimate and missing country independently of gender',()=>{
 const declared=classify(profileSchema.parse({username:'declared',biography:'Based in Istanbul, Turkey',research_target:{country:'TR',gender:'female'}}));assert.equal(declared.country_match,'matched');assert.equal(declared.target_match,'unknown');assert.equal(turkeyStatus(declared),'matched');
 const estimated=classify(profileSchema.parse({username:'estimated',biography:trCaption,research_target:{country:'TR'}}));assert.equal(estimated.country_match,'estimated');assert.equal(estimated.primary_niche,'Gaming');assert.equal(turkeyStatus(estimated),'estimated');assert.equal(estimated.city,null);
 const unknown=classify(profileSchema.parse({username:'unknown',biography:'Gaming Twitch Discord YouTube',research_target:{country:'TR'}}));assert.equal(unknown.country_match,'unknown');assert.equal(turkeyStatus(unknown),'unknown');
 const abroad=classify(profileSchema.parse({username:'abroad',biography:'Based in Berlin. '+trCaption,research_target:{country:'TR'}}));assert.equal(abroad.country,'DE');assert.equal(abroad.country_match,'different');assert.equal(turkeyStatus(abroad),'different');
});
async function setup(name:string){
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{enqueue}=await import('../lib/job-input');const db=new SQLiteDatabase(join(root,name+'.sqlite')),store=new CreatorStore(db),p=autonomousPlan({topics:['Gaming'],country:'TR',pages:50});
 const request:NightRequest={efficientResearch:true,content:'',limit:50,nightMaxPages:50,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic Turkish research fixture',target:{country:'TR'},discoveryEnabled:true,discoveryKeywords:p.keywords,discoveryPriorityKeywords:p.priorityKeywords,discoveryFairBudget:true,discoveryProviders:['instagram_tags'],discoveryMaxQueries:p.queries,discoveryResultsPerQuery:20};
 const id=await enqueue({kind:'instagram_night',source:'synthetic-tr-research',...request},store);await store.claimJob();let clock=Date.now();writeResearchState({day:new Date(clock).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});return{db,store,id,request,p,time:{now:()=>clock,sleep:async(ms:number)=>{clock+=ms;}}};
}
test('high-yield worldwide history cannot outrank Turkish tags, and early tags cannot consume the whole run',async()=>{
 const s=await setup('fair');const searched:{keyword:string;pages:number}[]=[];
 try{
 const old=await s.store.enqueue('instagram_night','{}'),night=new NightStore(s.store),pool=new DiscoveryStore(s.store);await night.initialize(old,{maxProfiles:5,maxPages:10,maxPosts:0,maxDepth:0,hours:8,permission:'Synthetic fixture',seeds:[]});await pool.initialize(old,[{provider:'instagram_tags',keyword:'gaming',url:'https://www.instagram.com/explore/tags/gaming/'}]);const q=(await pool.queries(old))[0];await pool.reserve(old,safeId(q.id));await pool.complete(old,safeId(q.id),[0,1,2].map(i=>({kind:'profile',url:`https://www.instagram.com/history_gaming_${i}/`,title:''})));
 for(const c of (await s.db.query('SELECT id,url FROM research_candidates WHERE job_id=$1',[old])).rows){await night.reserve(old,safeId(c.id));await s.store.saveProfile(profileSchema.parse({username:new URL(String(c.url)).pathname.split('/')[1],biography:'Gaming'}),{provider:'fixture',identifier:'local',permission:'Own synthetic fixture'},{candidate:safeId(c.id),job:old});}await s.store.finish(old,'completed');
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async q=>{searched.push({keyword:q.keyword,pages:Number((await night.run(s.id)).page_requests)});const index=s.p.keywords.indexOf(q.keyword);return{sourceUrl:q.url,links:Array.from({length:6},(_,i)=>({kind:'post',url:`https://www.instagram.com/p/TrFair_${index}_${i}/`,title:''}))};},author:async()=>null},profile:async()=>{throw new Error('No owners expected');}});
 assert.deepEqual(searched.slice(0,s.p.priorityKeywords.length).map(q=>q.keyword),s.p.priorityKeywords);assert.equal(searched.length,s.p.keywords.length);assert.ok(searched.find(q=>q.keyword==='gaming')!.pages>=s.p.priorityKeywords.length);assert.ok(Number((await night.run(s.id)).page_requests)<=50);assert.equal((await night.reports()).find(r=>r.job_id===s.id)?.inserted,0);
 }finally{await s.db.close();}
});
test('fair Turkish discovery saves verified profiles while leaving room for every planned tag',async()=>{
 const s=await setup('fair-success');const searched:string[]=[];
 try{
 await researchNight(s.id,s.request,s.store,new AbortController().signal,{...s.time,discovery:{search:async q=>{searched.push(q.keyword);const index=s.p.keywords.indexOf(q.keyword);return{sourceUrl:q.url,links:Array.from({length:6},(_,i)=>({kind:'post',url:`https://www.instagram.com/p/TrSuccess_${index}_${i}/`,title:''}))};},author:async url=>`https://www.instagram.com/tr_success_${url.match(/TrSuccess_(\d+_\d+)/)![1]}/`},profile:async url=>({status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:`Creator (@${new URL(url).pathname.split('/')[1]})`,description:null,bodyText:'Synthetic fixture',mainText:'Synthetic fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:trCaption}})});
 assert.deepEqual(searched,s.p.keywords);const run=(await new NightStore(s.store).reports()).find(r=>r.job_id===s.id)!;assert.ok(Number(run.inserted)>0);assert.ok(Number(run.page_requests)<=50);assert.ok((await s.store.snapshot()).creators.every(c=>c.country==='TR'&&c.location_status==='language_estimate'));
 }finally{await s.db.close();}
});

import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {NightStore} from '../lib/night-store';
import {startScan,stopScan,tickScan,scanStatus} from '../lib/continuous-scan';
import {recoverContinuousJob,isRecoverableReason} from '../lib/continuous-recovery';
import {TechnicalQuarantine} from '../lib/technical-recovery';
import {writeResearchState} from '../lib/instagram-state';
import {researchNight} from '../lib/night-research';
import {enqueue} from '../lib/job-input';
import {DiscoveryStore} from '../lib/discovery-store';
export async function resilienceContract(store:CreatorStore){
 const now=Date.now();const reset=()=>writeResearchState({day:new Date(now).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:false,reason:null,pausedAt:null});reset();
 const quarantine=new TechnicalQuarantine(store);
 await quarantine.add('post','https://www.instagram.com/reel/RecoveryFixture/','network_error',now);
 assert.ok(await quarantine.get('post','https://www.instagram.com/p/RecoveryFixture/',now));
 assert.equal(await quarantine.get('post','https://www.instagram.com/p/RecoveryFixture/',now+30*60000),undefined);
 await quarantine.add('profile','https://www.instagram.com/recovery_fixture/','layout_unreadable',now);
 assert.ok(await quarantine.get('profile','https://www.instagram.com/recovery_fixture/',now+3600000));
 assert.equal(await quarantine.get('profile','https://www.instagram.com/recovery_fixture/',now+2*3600000),undefined);
 await quarantine.add('tag','https://instagram.com/explore/tags/recoveryfixture/','network_error',now);
 assert.equal(await quarantine.summary(now),3);
 await assert.rejects(quarantine.add('tag','https://example.com/explore/tags/fixture/','network_error',now));
 for(const reason of ['INSTAGRAM_STOP:rate-limit: HTTP 429','INSTAGRAM_STOP:challenge: CAPTCHA','post_access_deferred','owner_identity_mismatch','database unavailable'])assert.equal(isRecoverableReason(reason),false);
 assert.equal(isRecoverableReason('page.goto: Timeout 30000ms exceeded.'),true);
 const night=new NightStore(store);let created=0;
 // A quarantined profile consumes no page and does not prevent a healthy candidate from saving.
 let clock=now,reads=0;
 const request={content:'https://www.instagram.com/recovery_fixture/\nhttps://www.instagram.com/healthy_fixture/',limit:2,nightMaxPages:10,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic recovery profiles'};
 const fixture=await enqueue({kind:'instagram_night',source:'synthetic-quarantine',...request},store);await store.claimJob();
 await researchNight(fixture,request,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},profile:async url=>{reads++;assert.ok(url.includes('healthy_fixture'));return{status:'loaded',snapshot:{url,canonicalUrl:url,title:'',ogTitle:'Fixture (@healthy_fixture)',description:null,bodyText:'Home decor',mainText:'Home decor',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],visibleBiography:'Home decor'}};}});
 const fixtureReport=(await night.reports()).find(r=>r.job_id===fixture)!;assert.equal(reads,1);assert.equal(fixtureReport.inserted,1);assert.equal(fixtureReport.page_requests,1);
 // Quarantined tags/posts are skipped before browser visits; fresh results continue normally.
 const discovery={content:'',limit:10,nightMaxPages:10,nightMaxPosts:0,nightMaxDepth:0,nightHours:8,permission:'Own synthetic recovery discovery',discoveryEnabled:true,discoveryKeywords:['recoveryfixture','freshfixture'],discoveryProviders:['instagram_tags' as const],discoveryMaxQueries:2,discoveryResultsPerQuery:10};
 const discoveryJob=await enqueue({kind:'instagram_night',source:'synthetic-quarantine-discovery',...discovery},store);await store.claimJob();let searches=0,owners=0;
 await researchNight(discoveryJob,discovery,store,new AbortController().signal,{now:()=>clock,sleep:async ms=>{clock+=ms;},discovery:{search:async q=>{searches++;assert.equal(q.keyword,'freshfixture');return{sourceUrl:q.url,links:[{kind:'post',url:'https://www.instagram.com/p/RecoveryFixture/',title:''},{kind:'post',url:'https://www.instagram.com/p/FreshRecoveryFixture/',title:''}]};},author:async url=>{owners++;assert.ok(url.includes('FreshRecoveryFixture'));return null;}}});
 assert.equal(searches,1);assert.equal(owners,1);assert.equal((await new DiscoveryStore(store).queries(discoveryJob))[0].error,'technical_quarantine');
 const fake=async()=>{created++;const id=await store.enqueue('instagram_night','{}');await night.initialize(id,{hours:8,maxPages:50,maxProfiles:50,maxPosts:0,maxDepth:0,permission:'Synthetic local recovery fixture',seeds:['https://www.instagram.com/preserved_fixture/']});return{id,reused:false,continued:false};};
 await startScan({topics:['Gaming'],country:'TR'},store);await tickScan(store,now,fake);
 const id=(await scanStatus(store)).job_id!;
 const generation=Number((await store.database.query('SELECT generation FROM continuous_scan WHERE id=1')).rows[0].generation);
 const pause=async()=>{await night.stop(id,'paused','consecutive_transport_errors');};
 await store.database.query('UPDATE research_runs SET page_requests=7 WHERE job_id=$1',[id]);
 const original=await night.run(id);await pause();await tickScan(store,now+61000,fake);
 assert.equal((await scanStatus(store)).status,'recovering');
 assert.equal(Date.parse((await scanStatus(store)).next_at!),now+181000);
 await tickScan(store,now+180000,fake);assert.equal((await night.reports()).find(r=>r.job_id===id)?.status,'paused');
 await tickScan(store,now+181000,fake);assert.equal((await night.reports()).find(r=>r.job_id===id)?.status,'queued');
 assert.equal(created,1);assert.equal((await night.run(id)).started_at,original.started_at);assert.equal((await night.run(id)).page_requests,7);
 await pause();await tickScan(store,now+192000,fake);assert.equal(Date.parse((await scanStatus(store)).next_at!),now+492000);
 await tickScan(store,now+492000,fake);assert.equal((await night.reports()).find(r=>r.job_id===id)?.status,'queued');
 await pause();await tickScan(store,now+503000,fake);assert.equal((await scanStatus(store)).status,'blocked');
 assert.equal(Number((await store.database.query("SELECT count(*) AS n FROM logs WHERE job_id=$1 AND message LIKE 'Continuous technical recovery queued:%'",[id])).rows[0].n),2);
 // Exhausted budget closes this round without resetting time, usage or pending candidates.
 await store.database.query('UPDATE research_runs SET page_requests=50 WHERE job_id=$1',[id]);
 assert.equal(await recoverContinuousJob(store,id,generation,'blocked',now+534000),'next_round');
 assert.equal((await night.reports()).find(r=>r.job_id===id)?.status,'completed');
 assert.equal(Number((await store.database.query("SELECT count(*) AS n FROM research_candidates WHERE job_id=$1 AND status='pending'",[id])).rows[0].n),1);
 await tickScan(store,now+535000,fake);assert.equal(created,2);
 const second=(await scanStatus(store)).job_id!;await night.stop(second,'paused','consecutive_tag_read_errors');await tickScan(store,now+596000,fake);
 assert.equal((await scanStatus(store)).status,'recovering');await stopScan(store);
 assert.equal(await recoverContinuousJob(store,second,generation,'recovering',now+900000),'unchanged');
 await tickScan(store,now+900000,fake);assert.equal(created,2);assert.equal((await scanStatus(store)).enabled,false);
 // Source restrictions also win over an otherwise eligible technical retry.
 await startScan({topics:['Gaming'],country:'TR'},store);await tickScan(store,now+901000,fake);const third=(await scanStatus(store)).job_id!;
 await night.stop(third,'paused','consecutive_profile_layout_errors');
 writeResearchState({day:new Date(now).toISOString().slice(0,10),visits:0,lastVisitAt:0,paused:true,reason:'INSTAGRAM_STOP:rate-limit: HTTP 429',pausedAt:new Date(now).toISOString()});
 await tickScan(store,now+962000,fake);assert.equal((await scanStatus(store)).status,'blocked');assert.equal((await night.reports()).find(r=>r.job_id===third)?.status,'paused');
 await stopScan(store);reset();
}

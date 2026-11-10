import assert from 'node:assert/strict';
import type {CreatorStore} from '../lib/db';
import {profileSchema} from '../lib/model';
import {searchPortal} from '../lib/portal-search';
import {first} from '../lib/storage/driver';
export async function portalContract(store:CreatorStore){
 const source={provider:'fixture',identifier:'private-internal-marker',permission:'Own synthetic portal fixture'};
 for(let i=0;i<14;i++)await store.saveProfile(profileSchema.parse({username:'portal_'+String(i).padStart(2,'0'),display_name:'İlham Köşesi '+i,biography:'Home decor. Based in Turkey. Sipariş için Shopier. contact@example.com',followers_count:(i+1)*1000,external_links:['https://shopier.com/synthetic?private_tracking=secret']}),source);
 for(const [username,bio] of [['portal_germany','Home decor. Based in Germany'],['portal_unknown','Home decor and my favorite things']])await store.saveProfile(profileSchema.parse({username,biography:bio,followers_count:null}),source);
 await store.saveProfile(profileSchema.parse({username:'portal_synthetic',biography:'Home decor',synthetic:true}),source);
 await store.saveProfile(profileSchema.parse({username:'portal_rejected',biography:'Home decor'}),source);const rejected=await first(store.database,"SELECT id FROM creators WHERE username='portal_rejected'");await store.review(Number(rejected?.id),'rejected');
 await store.saveProfile(profileSchema.parse({username:'portal_suppressed',biography:'Home decor'}),source);await store.database.query('INSERT INTO suppressions(username) VALUES($1)',['portal_suppressed']);
 const before=await first(store.database,'SELECT count(*) AS n FROM creator_metrics');const all=await searchPortal(store.database,{});assert.equal(all.total,16);assert.equal(all.creators.length,12);assert.equal(all.pages,2);assert.equal((await searchPortal(store.database,{page:2})).creators.length,4);assert.equal((await searchPortal(store.database,{page:99999})).page,2);
 const filtered=await searchPortal(store.database,{category:'Interior Design',country:'TR',selling:'sales_signals',channel:'shopier'});assert.equal(filtered.total,14);assert.ok(filtered.creators.every(c=>c.country==='TR'&&c.selling_status==='sales_signals'));assert.equal(filtered.creators[0].sales_channels.find(s=>s.url)?.url,'https://shopier.com/synthetic');
 const one=await searchPortal(store.database,{q:'portal_03'});assert.equal(one.total,1);assert.equal(one.creators[0].username,'portal_03');assert.deepEqual(one.creators[0].emails,['contact@example.com']);assert.ok(one.creators[0].evidence.length);
 assert.equal((await searchPortal(store.database,{q:'ilham kosesi',category:'Ev & yaşam'})).total,14);assert.equal((await searchPortal(store.database,{country:'FR'})).total,0);assert.equal((await searchPortal(store.database,{country:'TR',followers:'micro'})).total,13);
 const sorted=await searchPortal(store.database,{sort:'followers_desc'});assert.equal(sorted.creators[0].followers_count,14000);const small=await searchPortal(store.database,{sort:'followers_asc'});assert.equal(small.creators[0].followers_count,1000);
 const json=JSON.stringify(all);for(const hidden of ['private-internal-marker','permission_reference','payload','worker','private_tracking','secret'])assert.equal(json.includes(hidden),false);
 await assert.rejects(searchPortal(store.database,{country:'INVALID'}));await assert.rejects(searchPortal(store.database,{page:-1}));assert.deepEqual(await first(store.database,'SELECT count(*) AS n FROM creator_metrics'),before);
}

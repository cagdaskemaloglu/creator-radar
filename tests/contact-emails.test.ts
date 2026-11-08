import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractBiographyEmails,updateContactEmails} from '../lib/contact-emails';
const root=mkdtempSync(join(tmpdir(),'radar-contacts-'));process.env.RADAR_DB=join(root,'singleton.sqlite');
test('explicit biography emails normalize, deduplicate and retain supporting excerpt',()=>{
 const emails=extractBiographyEmails('Contact: Hello@Example.com; hello@example.com\nİş: collab+tr@example.co.uk.');
 assert.deepEqual(emails.map(e=>e.email),['hello@example.com','collab+tr@example.co.uk']);assert.match(emails[0].excerpt,/Hello@Example.com/);
 assert.deepEqual(extractBiographyEmails('@creator | mail@example | invalid..name@example.com | name@@example.com | contact [at] example [dot] com'),[]);
});
test('removed addresses become historical, unavailable biographies preserve current contacts',()=>{
 const source={url:'https://www.instagram.com/synthetic/',provider:'fixture',collected_at:'2026-01-01T00:00:00.000Z'};
 const first=updateContactEmails([],'a@example.com',source);assert.equal(first[0].is_current,true);
 const missing=updateContactEmails(first,null,{...source,collected_at:'2026-02-01T00:00:00.000Z'});assert.deepEqual(missing,first);
 const changed=updateContactEmails(first,'Contact b@example.com',{...source,collected_at:'2026-02-01T00:00:00.000Z'});assert.equal(changed.find(e=>e.email==='a@example.com')?.is_current,false);assert.equal(changed.find(e=>e.email==='a@example.com')?.last_seen_at,source.collected_at);
 const again=updateContactEmails(first,'a@example.com',{...source,collected_at:'2026-02-01T00:00:00.000Z'});assert.equal(again[0].first_seen_at,source.collected_at);assert.equal(again[0].last_seen_at,'2026-02-01T00:00:00.000Z');
});
test('store persists contact provenance and backfills without changing review or collection history',async()=>{
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{profileSchema}=await import('../lib/model');const db=new SQLiteDatabase(join(root,'test.sqlite')),store=new CreatorStore(db);
 try{
 await store.saveProfile(profileSchema.parse({username:'synthetic_contact',biography:'Business: contact@example.com'}),{provider:'fixture',identifier:'local-fixture',permission:'Local synthetic fixture'});
 let row=(await db.query('SELECT * FROM creators')).rows[0];let p=JSON.parse(String(row.payload));assert.equal(p.contact_emails[0].email,'contact@example.com');assert.equal(p.contact_emails[0].source_url,'https://www.instagram.com/synthetic_contact/');
 await store.saveProfile(profileSchema.parse({username:'synthetic_contact',biography:null}),{provider:'fixture',identifier:'local-fixture',permission:'Local synthetic fixture'});
 row=(await db.query('SELECT * FROM creators')).rows[0];p=JSON.parse(String(row.payload));assert.equal(p.contact_emails[0].is_current,true);
 delete p.contact_emails;await db.query("UPDATE creators SET payload=$1,validation_status='reviewed' WHERE id=$2",[JSON.stringify(p),Number(row.id)]);
 assert.deepEqual(await store.refreshContactEmails(),{updated:1,emails:1});assert.deepEqual(await store.refreshContactEmails(),{updated:0,emails:1});
 const result=(await store.snapshot()).creators[0];assert.equal(result.validation_status,'reviewed');assert.equal(result.updated_at,row.updated_at);assert.equal(result.sources.length,2);
 }finally{await db.close();}
});

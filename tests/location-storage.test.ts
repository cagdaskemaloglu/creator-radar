import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=mkdtempSync(join(tmpdir(),'radar-location-'));
process.env.RADAR_DB=join(root,'singleton.sqlite');
test('location refresh persists estimates without changing original sources, timestamps or review state',async()=>{
 const {SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{profileSchema}=await import('../lib/model');
 const db=new SQLiteDatabase(join(root,'test.sqlite')),store=new CreatorStore(db);
 try{
 await store.saveProfile(profileSchema.parse({username:'language_test',biography:'Bugün sizin için yeni ürünleri ve cilt bakım önerilerimi paylaşıyorum',research_target:{country:'TR'}}),{provider:'fixture',identifier:'local-fixture',permission:'Local synthetic fixture'});
 const row=(await db.query('SELECT * FROM creators')).rows[0],payload=JSON.parse(String(row.payload));assert.equal(payload.country,'TR');assert.equal(payload.target_match,'estimated');
 delete payload.country;delete payload.country_estimate;payload.location_status='unknown';payload.target_match='unknown';
 await db.query("UPDATE creators SET payload=$1,validation_status='reviewed' WHERE id=$2",[JSON.stringify(payload),Number(row.id)]);
 assert.equal(await store.refreshLocationEstimates(),1);
 const after=(await store.snapshot()).creators[0];assert.equal(after.country,'TR');assert.equal(after.target_match,'estimated');assert.equal(after.validation_status,'reviewed');assert.equal(after.updated_at,row.updated_at);assert.equal(after.sources.length,1);
 assert.equal(await store.refreshLocationEstimates(),0);
 }finally{await db.close();}
});

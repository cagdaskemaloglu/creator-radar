import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractHtml,extractCsv } from '../lib/extract';
import { authorizedUrl } from '../lib/browser';
import { profileSchema,classify } from '../lib/model';
process.env.RADAR_DB=join(mkdtempSync(join(tmpdir(),'radar-test-')),'test.sqlite');
test('normalizes usernames, preserves zero and null',()=>{const p=profileSchema.parse({username:' @Demo ',followers_count:0});assert.equal(p.username,'demo');assert.equal(p.followers_count,0);assert.equal(p.posts_count,null);assert.throws(()=>profileSchema.parse({username:'invalid/path'}));});
test('HTML fixtures and CSV are explicitly synthetic',()=>{assert.equal(extractHtml(readFileSync('fixtures/creator.html','utf8')).length,2);const p=extractCsv(readFileSync('fixtures/creators.csv','utf8'))[0];assert.equal(p.synthetic,true);assert.equal(p.following_count,0);assert.throws(()=>extractHtml('<p>no contract</p>'));assert.throws(()=>extractCsv('username,followers_count\na,-5'));});
test('classification uses explicit keywords only',()=>{assert.equal(classify(profileSchema.parse({username:'a',biography:'desk setup'})).primary_niche,'Desk Setup');assert.equal(classify(profileSchema.parse({username:'a'})).fit_score,0);});
test('store and creator signals remain separate from niche matching and never invent account identity',()=>{
 assert.equal(classify(profileSchema.parse({username:'a',biography:'Shop now. Free shipping. Home decor'})).account_type,'store');
 assert.equal(classify(profileSchema.parse({username:'a',biography:'Digital creator. Cozy room'})).account_type,'creator');
 assert.equal(classify(profileSchema.parse({username:'a',biography:'Digital creator. Shop now'})).account_type,'mixed');
 assert.equal(classify(profileSchema.parse({username:'a',biography:'Turn your space into a galaxy'})).account_type,'unknown');
});
test('page authorization is exact host and blocks Instagram even if configured',()=>{process.env.AUTHORIZED_HOSTS='example.com,instagram.com';assert.equal(authorizedUrl('https://example.com/profile'),'https://example.com/profile');for(const url of ['https://instagram.com/a/','https://example.com.evil.org','http://example.com','https://example.com/?token=secret','https://user:pass@example.com/','http://127.0.0.1/'])assert.throws(()=>authorizedUrl(url));});
test('SQLite storage contract', async () => {
 const { SQLiteDatabase } = await import('../lib/storage/sqlite');
 const { CreatorStore } = await import('../lib/db');
 const { storageContract } = await import('./storage-contract');
 const database = new SQLiteDatabase(process.env.RADAR_DB!);
 try { await storageContract(new CreatorStore(database)); }
 finally { await database.close(); }
});

test('provider adapters share the normalized contract',async()=>{const {CSVImportProvider,MockDataProvider}=await import('../lib/providers');const csv=new CSVImportProvider(readFileSync('fixtures/creators.csv','utf8'));assert.equal((await csv.searchCreators({limit:1})).length,1);assert.equal((await csv.getCreatorProfile('@SYNTHETIC_CSV_DEMO'))?.synthetic,true);assert.equal(await csv.getCreatorProfile('missing'),null);assert.equal((await new MockDataProvider().searchCreators({limit:1}))[0].synthetic,true);});

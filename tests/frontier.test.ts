import {test} from 'node:test';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'radar-frontier-'));process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(dir,'singleton.sqlite');process.env.INSTAGRAM_STATE_FILE=join(dir,'state.json');process.env.INSTAGRAM_DAILY_PAGES='0';
test('durable scoped query frontier learns conservatively, meters runs, and rests exhausted queries',async()=>{const{SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{frontierContract}=await import('./frontier-contract');const db=new SQLiteDatabase(join(dir,'frontier.sqlite'));try{await frontierContract(new CreatorStore(db));}finally{await db.close();}});
test('owner diagnostics distinguish no link, multiple owners, wrong identity and unavailable page',async()=>{
 const {diagnoseSnapshotPostAuthor}=await import('../lib/instagram-post-owner');const url='https://www.instagram.com/p/DiagnosisFixture/';const s={url,canonicalUrl:url,title:'Instagram',ogTitle:null,description:null,bodyText:'',mainText:'Visible post',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[]};
 assert.equal(diagnoseSnapshotPostAuthor(null,url).reason,'page_not_loaded');assert.equal(diagnoseSnapshotPostAuthor(s,url).reason,'owner_link_missing');assert.equal(diagnoseSnapshotPostAuthor({...s,canonicalUrl:'https://www.instagram.com/p/Different/'},url).reason,'post_identity_mismatch');assert.equal(diagnoseSnapshotPostAuthor({...s,postAuthorLinks:['https://www.instagram.com/first/','https://www.instagram.com/second/']},url).reason,'multiple_owner_candidates');assert.equal(diagnoseSnapshotPostAuthor({...s,postAuthorLinks:['https://www.instagram.com/first/']},url).profile,'https://www.instagram.com/first/');
});
test('observed Instagram p/reel aliases verify the same shortcode but never a different post',async()=>{
 const {readFileSync}=await import('node:fs'),{diagnoseSnapshotPostAuthor}=await import('../lib/instagram-post-owner');const fixture=JSON.parse(readFileSync('fixtures/instagram-post-routes.json','utf8'));
 for(const {code,owner} of fixture.cases){const url=`https://www.instagram.com/p/${code}/`,profile=`https://www.instagram.com/${owner}/`,s={url,canonicalUrl:`https://www.instagram.com/reel/${code}/`,title:'Instagram',ogTitle:null,description:null,bodyText:'',mainText:'visible content',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],discoveryLinks:[profile,`https://www.instagram.com/${owner}/reel/${code}/`,'https://www.instagram.com/commenter/','https://www.instagram.com/other/reel/AnotherCode/']};assert.equal(diagnoseSnapshotPostAuthor(s,url).profile,profile);assert.equal(diagnoseSnapshotPostAuthor({...s,canonicalUrl:'https://www.instagram.com/reel/DifferentCode/'},url).reason,'post_identity_mismatch');}
});

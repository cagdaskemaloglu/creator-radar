import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {classify,profileSchema} from '../lib/model';
import {diagnoseSnapshotPostAuthor} from '../lib/instagram-post-owner';
import {extractSnapshotCreatorCaption} from '../lib/instagram-post';
import {instagramPostUrl,InstagramPostRouteError} from '../lib/instagram-post-policy';
const dir=mkdtempSync(join(tmpdir(),'radar-desk-reliability-'));process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(dir,'singleton.sqlite');process.env.INSTAGRAM_STATE_FILE=join(dir,'state.json');process.env.INSTAGRAM_DAILY_PAGES='0';
test('Turkish and ASCII workstations match while dining tables and generic decoration do not',async()=>{
 const {autonomousPlan}=await import('../lib/autonomous-research');
 for(const biography of ['Çalışma masası bilgisayar monitör klavye','Calisma masasi monitor klavye','Desk setup battlestation','Monitor setup incelemesi','Workspacesetup keyboard monitor','Battlestations']){const c=classify(profileSchema.parse({username:'fixture',biography,research_topics:['Desk Setup']}));assert.equal(c.category_match,'matched',biography);}
 for(const biography of ['Yemek masası sofra sunum vazo #deskdecor','Masa dekorasyonu','Dining table workspace decor','Masa düzeni ve vazo'])assert.ok(!classify(profileSchema.parse({username:'fixture',biography})).categories.includes('Desk Setup'),biography);
 const plan=autonomousPlan({topics:['Desk Setup'],country:'TR',pages:100});assert.equal(plan.keywords[0],'çalışmamasası');assert.ok(!plan.allKeywords.includes('masadekorasyonu'));assert.ok(!plan.allKeywords.includes('deskdecor'));assert.ok(!plan.allKeywords.includes('workspace'));
});
test('unsupported destinations and changed post codes cannot crash or misattribute captions',()=>{
 const url='https://www.instagram.com/reel/FixtureIdentity/',owner='https://www.instagram.com/fixture_owner/',snapshot={url,canonicalUrl:url,title:'Instagram',ogTitle:null,description:null,bodyText:'Visible fixture',mainText:'Visible fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],profileLinks:[],postAuthorLinks:[owner],postCaption:'Desk setup'};
 const unsupported={...snapshot,url:'https://www.instagram.com/reels/'};assert.equal(diagnoseSnapshotPostAuthor(unsupported,url).reason,'post_identity_mismatch');assert.equal(extractSnapshotCreatorCaption(unsupported,owner,url),null);assert.equal(extractSnapshotCreatorCaption({...snapshot,url:'https://www.instagram.com/p/AnotherCode/',canonicalUrl:'https://www.instagram.com/p/AnotherCode/'},owner,url),null);assert.ok(extractSnapshotCreatorCaption(snapshot,owner,url));
 for(const bad of ['https://www.instagram.com/reels/','https://evil.example/p/Foo/','https://www.instagram.com/p/Foo/?token=fixture'])assert.throws(()=>instagramPostUrl(bad),InstagramPostRouteError);
});
for(const budget of [20,5])test(`bad post is isolated; review contribution and budget deferral are durable (${budget} pages)`,async()=>{const{SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{deskReliabilityContract}=await import('./desk-reliability-contract');const db=new SQLiteDatabase(join(dir,`contract-${budget}.sqlite`));try{await deskReliabilityContract(new CreatorStore(db),budget);}finally{await db.close();}});

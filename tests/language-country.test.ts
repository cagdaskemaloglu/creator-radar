import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileContext,targetMatch} from '../lib/profile-context';
import {classify,profileSchema} from '../lib/model';
const tr='Bugün sizin için yeni ürünleri ve cilt bakım önerilerimi paylaşıyorum';
test('Turkish content provides an attributed low-confidence country estimate without inventing city or gender',()=>{
 const p=profileSchema.parse({username:'language_fixture',content_evidence:[{url:'https://example.com/post',caption:tr,hashtags:[],collected_at:new Date().toISOString()}]});
 const c=classify(p);assert.equal(c.country,'TR');assert.equal(c.location_status,'language_estimate');assert.equal(c.country_estimate.confidence,'low');assert.equal(c.city,null);assert.equal(c.gender,null);assert.equal(targetMatch(c,{country:'TR'}),'estimated');assert.equal(c.context_evidence[0].source_url,'https://example.com/post');
});
test('explicit residence overrides language and conflicting locations are never overwritten',()=>{
 assert.equal(profileContext({biography:'I live in Berlin. '+tr}).country,'DE');
 const conflict=profileContext({biography:'I live in Berlin and Istanbul. '+tr});assert.equal(conflict.country,null);assert.equal(conflict.location_status,'conflicting');
});
test('English, mixed text, hashtags and absent text never choose a country arbitrarily',()=>{
 const en=profileContext({biography:'My new room and the decor I love today'});assert.equal(en.language_hint,'en');assert.equal(en.country,null);assert.ok(en.country_estimate.candidates.includes('US'));assert.ok(en.country_estimate.candidates.includes('GB'));
 for(const biography of [null,'#türkiye #istanbul #bir #ve','Özge','My room ve bir bugün for the'])assert.equal(profileContext({biography}).country,null);
});

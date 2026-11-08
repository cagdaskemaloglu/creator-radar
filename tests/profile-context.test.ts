import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileContext,targetMatch} from '../lib/profile-context';
import {autonomousPlan} from '../lib/autonomous-research';
import {classify,profileSchema} from '../lib/model';
import {taxonomy} from '../lib/taxonomy';
test('language estimates never establish residence or gender',()=>{
 const c=profileContext({biography:'Makeup artist | İstanbul tatili | women beauty',content_evidence:[{url:'https://example.com',caption:'Güzel bir gün',hashtags:[],collected_at:new Date().toISOString()}]});
 assert.equal(c.country,'TR');assert.equal(c.location_status,'language_estimate');assert.equal(c.city,null);assert.equal(c.gender,null);assert.equal(c.language_hint,'tr');assert.equal(targetMatch(c,{country:'TR',gender:'female'}),'unknown');
});
test('explicit residence and pronouns are attributed; conflicting residences remain unknown',()=>{
 const c=profileContext({biography:'Based in Istanbul, Turkey | she/her'});assert.equal(c.country,'TR');assert.equal(c.city,'İstanbul');assert.equal(c.gender,'female');assert.equal(targetMatch(c,{country:'TR',city:'İstanbul',gender:'female'}),'matched');assert.equal(targetMatch(c,{country:'DE'}),'different');
 assert.equal(profileContext({biography:'Living in Berlin and Istanbul'}).country,null);
 assert.equal(profileContext({biography:'Ankara’da yaşıyorum'}).city,'Ankara');
 const post=profileContext({biography:null,content_evidence:[{url:'https://example.com/post',caption:'I live in Berlin',hashtags:[],collected_at:new Date().toISOString()}]});assert.equal(post.country,'DE');assert.equal(post.context_evidence[0].source_url,'https://example.com/post');
});
test('taxonomy covers commercial niches and page budgets propagate without URLs',()=>{
 assert.ok(taxonomy.length>=10);assert.ok(taxonomy.reduce((n,g)=>n+g.children.length,0)>=60);
 const plan=autonomousPlan({topics:['Makyaj'],pages:200,country:'TR',gender:'female'});assert.equal(plan.pages,200);assert.equal(plan.target.country,'TR');assert.ok(plan.keywords.includes('makeup'));assert.ok(!plan.keywords.includes('makeuptürkiye'));
 const gardening=autonomousPlan({topics:['Bahçe & bitkiler'],country:'TR',pages:50});assert.equal(gardening.keywords[0],'bitkibakımı');assert.ok(!gardening.keywords.includes('gardeningtürkiye'));
 assert.throws(()=>autonomousPlan({pages:999}));
 assert.equal(classify(profileSchema.parse({username:'fixture',biography:'bodybuilding'})).primary_niche,'Vücut geliştirme');
});

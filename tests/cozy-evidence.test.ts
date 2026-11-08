import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify,profileSchema} from '../lib/model';
const post=(caption:string,hashtags:string[])=>({url:'https://www.instagram.com/p/SyntheticCozy/',caption,hashtags,collected_at:new Date().toISOString()});
test('cozy evidence matches its own category without relabeling general interiors or guessing residence',()=>{
 const c=classify(profileSchema.parse({username:'synthetic_cozy',biography:'Home decor',research_topics:['Cozy Room'],research_target:{country:'TR'},content_evidence:[post('My cozy home. Bugün ev için yeni bir fikir paylaşıyorum.',['#cozyhome','#cozylivingroom'])]}));
 assert.equal(c.category_match,'matched');assert.equal(c.country,'TR');assert.equal(c.research_match,'estimated');
 const general=classify(profileSchema.parse({username:'synthetic_general',biography:'Interior design and home decor',research_topics:['Cozy Room']}));assert.equal(general.category_match,'different');
 const english=classify(profileSchema.parse({username:'synthetic_english',biography:'My cozy home and the things I love',research_target:{country:'TR'}}));assert.equal(english.country,null);
});
test('explicit Netherlands residence wins over caption language; Turkish interior terms are recognized',()=>{
 const c=classify(profileSchema.parse({username:'synthetic_dutch',biography:'Based in The Netherlands',research_target:{country:'TR'},content_evidence:[post('Bugün ev için yeni bir fikir paylaşıyorum.',[])]}));assert.equal(c.country,'NL');assert.equal(c.location_status,'self_declared');assert.equal(c.country_match,'different');
 const tr=classify(profileSchema.parse({username:'synthetic_design',biography:'İç Mimarlık',content_evidence:[post('Oda tasarımı',['#odatasarımı','#icmimari'])]}));assert.equal(tr.primary_niche,'Interior Design');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classify,profileSchema} from '../lib/model';
const post=(caption:string)=>({url:'https://www.instagram.com/p/ContextFixture/',caption,hashtags:caption.match(/#[\p{L}\p{N}_]+/gu)??[],collected_at:new Date().toISOString()});
test('local second pass resolves gardening from independent concepts and keeps author evidence',()=>{
 const c=classify(profileSchema.parse({username:'synthetic_garden',display_name:'Hobi Bahçem',biography:'Doğal savaşçı. Bilgi paylaştıkça güzel',research_topics:['Bahçe & bitkiler'],content_evidence:[post('Güneş sevmeyen, gölgede daha sağlıklı yetişen sebzeler. #bahçe #doğal #fide')]}));
 assert.equal(c.primary_niche,'Bahçe & bitkiler');assert.equal(c.category_match,'matched');assert.equal(c.context_classification.status,'supported');assert.ok(c.classification_evidence.some(e=>e.source_url));assert.equal(c.context_classification.external_requests,0);
});
test('second pass handles Turkish suffixes, room design and independent makeup concepts',()=>{
 const interior=classify(profileSchema.parse({username:'synthetic_room',biography:'Kişiye özel dolaplarımız',content_evidence:[post('Yatak odası projemiz. Dar alanlarda kullanışlı tasarımlar.')]}));assert.ok(interior.categories.includes('Interior Design'));assert.equal(interior.categories.includes('Cozy Room'),false);
 const makeup=classify(profileSchema.parse({username:'synthetic_beauty',biography:'Self care • Make up • hauls'}));assert.equal(makeup.primary_niche,'Makyaj');
});
test('missing or conflicting content stays uncertain; discovery hints and names alone cannot classify',()=>{
 for(const patch of [{},{biography:'Merhaba dünyam, işbirliği için mesaj atın'},{display_name:'Garden Plants'},{content_evidence:[post('GTA')]},{biography:'Odam güzel' }]){
 const c=classify(profileSchema.parse({username:'synthetic_unknown',...patch}));assert.equal(c.primary_niche,null);assert.equal(c.context_classification.status,'insufficient_evidence');}
 const c=classify(profileSchema.parse({username:'synthetic_hint',discovery_evidence:[{provider:'instagram_tags',keyword:'gardening',search_url:'https://www.instagram.com/explore/tags/gardening/',result_url:'https://www.instagram.com/p/X/',discovered_at:new Date().toISOString()}]}));assert.equal(c.primary_niche,null);
});
test('strong existing categories survive fallback; country and account type remain separate',()=>{
 const c=classify(profileSchema.parse({username:'synthetic_store',biography:'Tech gadgets. Kapıda ödeme. Ücretsiz kargo',research_target:{country:'TR'},content_evidence:[post('Oda tasarımları ve dolaplar')]}));assert.equal(c.primary_niche,'Tech / Gadgets');assert.equal(c.context_classification.attempted,false);assert.equal(c.account_type,'store');
 const en=classify(profileSchema.parse({username:'synthetic_english',biography:'Make up tutorials and beauty hauls',research_target:{country:'TR'}}));assert.equal(en.country,null);assert.equal(en.country_match,'unknown');
});
test('unrelated suffixes and gaming metaphors cannot become home organization',()=>{
 for(const caption of ['Operasyon odaklı görev yapısı. Mobil oyun önerileri.','Eve biri girdi, saklan! Oyun challenge.','Ayı beraber temizlemek istediğin arkadaşına gönder. #oyun #oyunonerisi','Yeni ev için öneriler']){
 const c=classify(profileSchema.parse({username:'synthetic_negative',content_evidence:[post(caption)]}));assert.equal(c.categories.includes('Temizlik & düzen'),false);
 }
});

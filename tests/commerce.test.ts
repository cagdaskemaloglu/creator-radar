import {test} from 'node:test';import assert from 'node:assert/strict';
import {commerceProfile,publicCommerceUrl,commerceMatches} from '../lib/commerce';import {classify,profileSchema} from '../lib/model';
const c=(biography:string,external_links:string[]=[])=>commerceProfile(profileSchema.parse({username:'synthetic_seller',biography,external_links}));
test('selling and marketplace links are orthogonal to category and country',()=>{
 const p=profileSchema.parse({username:'synthetic_seller',biography:'Home decor. Based in Turkey. Sipariş için Shopier mağazamız.',external_links:['https://www.shopier.com/store?token=secret'],research_topics:['Interior Design'],research_target:{country:'TR'}}),r=classify(p);
 assert.equal(r.selling_status,'sales_signals');assert.equal(r.country,'TR');assert.equal(r.primary_niche,'Interior Design');assert.equal(r.sales_channels.find(s=>s.channel==='shopier'&&s.url)?.url,'https://www.shopier.com/store');assert.equal(commerceMatches(r,'sales_signals','shopier'),true);assert.equal(commerceMatches(r,'sales_signals','trendyol'),false);
});
test('affiliate or shopping links alone do not assert direct selling',()=>{
 const r=c('Reklam. Trendyol indirim kodum. Amazon finds.', ['https://ty.gl/synthetic','https://www.amazon.com/shop/fixture']);assert.equal(r.selling_status,'channel_linked');assert.equal(r.promotion_signals,true);assert.equal(r.sales_channels.length,2);
 assert.equal(c('Trendyol güzel bir uygulama').selling_status,'unknown');assert.equal(c('Satış yapmıyorum, sipariş almıyorum').selling_status,'unknown');
});
test('multiple channels, DM sales, own-site candidates and aggregators retain separate evidence',()=>{
 const r=c('Sipariş için DM.\nÜrünlerimiz. Ücretsiz kargo.', ['https://brand.example/products','https://shopier.com/brand','https://wa.me/900000000000','https://linktr.ee/brand']);assert.ok(r.sales_channels.some(s=>s.channel==='dm'));assert.ok(r.sales_channels.some(s=>s.channel==='website'&&s.ownership==='unverified'));assert.ok(r.sales_channels.some(s=>s.channel==='shopier'));assert.equal(r.sales_channels.some(s=>s.url?.includes('linktr.ee')),false);assert.ok(r.sales_evidence.every(e=>e.source_url.includes('instagram.com')));
});
test('visible Instagram redirects normalize offline; credentials, unsafe schemes and lookalike platforms cannot be trusted',()=>{
 assert.equal(publicCommerceUrl('https://l.instagram.com/?u=https%3A%2F%2Fshopier.com%2Fbrand%3Ftoken%3Dsecret'),'https://shopier.com/brand');for(const u of ['javascript:alert(1)','https://user:password@shopier.com/brand','https://shopier.com/login/secret'])assert.equal(publicCommerceUrl(u),null);
 assert.equal(c('Hello',['https://shopier.com.evil.example/path']).sales_channels.length,0);
});
test('post sales evidence keeps the original post source without inferring location',()=>{
 const p=profileSchema.parse({username:'synthetic_post',biography:'Creator',content_evidence:[{url:'https://www.instagram.com/p/SalesFixture/',caption:'Sipariş için https://www.trendyol.com/magaza/synthetic',hashtags:[],collected_at:new Date().toISOString()}]});const r=classify(p);assert.equal(r.selling_status,'sales_signals');assert.equal(r.sales_channels[0].channel,'trendyol');assert.equal(r.sales_channels[0].source_url,p.content_evidence![0].url);assert.equal(r.country,null);
});
test('profile extraction retains sanitized public outbound links without confusing discovered Instagram profiles',async()=>{
 const {extractInstagramProfile}=await import('../lib/instagram-extract');const url='https://www.instagram.com/synthetic_seller/';
 const r=extractInstagramProfile({url,canonicalUrl:url,title:'',ogTitle:'Synthetic (@synthetic_seller)',description:null,bodyText:'Public fixture',mainText:'Public fixture',hasPasswordForm:false,hasCaptcha:false,metrics:[],visibleBiography:'Sipariş için Shopier',profileLinks:['https://l.instagram.com/?u=https%3A%2F%2Fshopier.com%2Fbrand%3Futm_source%3Dig','https://www.instagram.com/other_profile/']},url);
 assert.deepEqual(r.profile?.external_links,['https://shopier.com/brand']);assert.deepEqual(r.links,['https://www.instagram.com/other_profile/']);assert.equal(classify(r.profile!).sales_channels.find(s=>s.url)?.channel,'shopier');
});

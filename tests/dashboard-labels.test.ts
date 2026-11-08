import {test} from 'node:test';
import assert from 'node:assert/strict';
import {logLabel,stopLabel} from '../app/dashboard-types';
test('tag layout pause explains the failure instead of pointing back to the same logs',()=>{
 const raw='INSTAGRAM_STOP:layout: Tag result links unavailable after bounded render wait; main text length=71; page kept open for manual inspection';
 assert.match(logLabel('Night run paused: '+raw),/Etiket sayfasında gönderi bağlantısı okunamadı/);
 assert.doesNotMatch(stopLabel(raw),/Ayrıntı için logları/);
 assert.match(stopLabel('INSTAGRAM_STOP:rate-limit: HTTP 429'),/sınırladı/);
 assert.match(stopLabel('INSTAGRAM_STOP:challenge: captcha'),/doğrulaması/);
});
test('research target logs show country and effective budget in Turkish',()=>{
 assert.equal(logLabel('Research target: {"country":"TR"}; requested pages: 50; effective pages: 50'),'Hedef: Türkiye. Sayfa bütçesi: 50');
 assert.match(logLabel('Research target: {"country":"TR","gender":"female"}; requested pages: 200; effective pages: 80'),/Kadın beyanı.*80.*200/);
});

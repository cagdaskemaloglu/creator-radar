import {test} from 'node:test';
import assert from 'node:assert/strict';
import {researchLimits,instagramWaitMs} from '../lib/instagram-policy';
test('Instagram pauses stay within 10–30 seconds including both endpoints',()=>{
 const limits=researchLimits({});assert.equal(limits.waitMinMs,10000);assert.equal(limits.waitMaxMs,30000);assert.equal(limits.intervalMs,20000);
 assert.equal(instagramWaitMs(limits,()=>0),10000);assert.equal(instagramWaitMs(limits,()=>1),30000);
 const values=new Set(Array.from({length:100},(_,i)=>instagramWaitMs(limits,()=>i/100)));assert.ok(values.size>10);assert.ok([...values].every(n=>n>=10000&&n<=30000));
 assert.throws(()=>researchLimits({INSTAGRAM_WAIT_MIN_SECONDS:'31',INSTAGRAM_WAIT_MAX_SECONDS:'30'}));
 assert.equal(instagramWaitMs(researchLimits({INSTAGRAM_INTERVAL_SECONDS:'25'})),25000);
});

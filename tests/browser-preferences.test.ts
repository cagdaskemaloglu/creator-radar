import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,symlinkSync,readFileSync,statSync,realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDedicatedProfile,browserPreferences,saveBrowserPreferences } from '../lib/browser-preferences';
import { researchLaunchOptions,launchBrowser,openManualBrowser,closeBrowser } from '../lib/browser';
import { chromium } from 'playwright';
import { EventEmitter } from 'node:events';
const dir=realpathSync(mkdtempSync(join(tmpdir(),'radar-browser-settings-')));
process.env.BROWSER_PREFERENCES_FILE=join(dir,'preferences.json');
process.env.RADAR_DB=join(dir,'jobs.sqlite');
test('personal Chrome profiles and symlink aliases are refused',()=>{
 const home=join(dir,'fake-home'),personal=join(home,'Library/Application Support/Google/Chrome');mkdirSync(personal,{recursive:true});
 assert.throws(()=>validateDedicatedProfile(personal,home),/PERSONAL_CHROME_PROFILE_REFUSED/);
 assert.throws(()=>validateDedicatedProfile(join(personal,'Profile 1'),home),/PERSONAL_CHROME_PROFILE_REFUSED/);
 const alias=join(dir,'alias');symlinkSync(personal,alias);assert.throws(()=>validateDedicatedProfile(join(alias,'NewProfile'),home),/PERSONAL_CHROME_PROFILE_REFUSED/);
 assert.equal(validateDedicatedProfile(join(dir,'dedicated'),home),join(dir,'dedicated'));
});
test('research cannot opt into visible windows or installed Chrome',()=>{
 process.env.BROWSER_HEADLESS='false';
 assert.deepEqual(researchLaunchOptions(),{headless:true,acceptDownloads:false});
 assert.throws(()=>browserPreferences({BROWSER_CHANNEL:'chrome'}));
 assert.throws(()=>validateDedicatedProfile('data/manual-chrome-profile'),/LEGACY_CHROME_PROFILE_REFUSED/);
 assert.throws(()=>saveBrowserPreferences({channel:'chrome',profile:join(dir,'other')} as never));
});
test('browser selection persists only channel and dedicated path, never authentication data',()=>{
 const fallback=browserPreferences({BROWSER_PROFILE:join(dir,'initial'),BROWSER_CHANNEL:'chromium'});assert.equal(fallback.channel,'chromium');
 assert.throws(()=>browserPreferences({BROWSER_CHANNEL:'unsupported'}));
 const chosen={channel:'chromium' as const,profile:join(dir,'manual profile')};saveBrowserPreferences(chosen);assert.deepEqual(browserPreferences({}),chosen);
 assert.deepEqual(Object.keys(JSON.parse(readFileSync(process.env.BROWSER_PREFERENCES_FILE!,'utf8'))).sort(),['channel','profile']);
 assert.equal(statSync(process.env.BROWSER_PREFERENCES_FILE!).mode&0o777,0o600);
});
test('background and explicit manual contexts cannot silently reuse each other',async t=>{
 const launches:boolean[]=[];
 // Fake contexts deliberately avoid opening a visible browser during this test.
 t.mock.method(chromium,'launchPersistentContext',async(_profile:string,options:{headless:boolean})=>{
  launches.push(options.headless);const ctx=new EventEmitter();
  return Object.assign(ctx,{close:async()=>{ctx.emit('close');}});
 });
 try{
  const background=await launchBrowser();assert.equal(await launchBrowser(),background);
  await openManualBrowser();await assert.rejects(launchBrowser(),/MANUAL_BROWSER_OPEN/);
  await closeBrowser();await launchBrowser();assert.deepEqual(launches,[true,false,true]);
 }finally{await closeBrowser();t.mock.restoreAll();}
});
test('legacy Chrome jobs cannot be enqueued',async()=>{
 const {enqueue}=await import('../lib/job-input');
 for(const kind of ['browser_manual_chrome','browser_use_manual_chrome'])await assert.rejects(enqueue({kind,source:'legacy',permission:'Explicit old Chrome job'}),/CHROME_DISABLED/);
});

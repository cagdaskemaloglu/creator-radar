import { existsSync,readFileSync,mkdirSync,writeFileSync,renameSync,realpathSync } from 'node:fs';
import { resolve,dirname,join,sep } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
export type ResearchBrowserSettings={channel:'chromium';profile:string};
const schema=z.object({channel:z.literal('chromium'),profile:z.string().min(1)});
function canonicalProfilePath(input:string){
 const raw=resolve(input);let existing=raw;const suffix:string[]=[];
 while(!existsSync(existing)&&dirname(existing)!==existing){suffix.unshift(existing.slice(dirname(existing).length+1));existing=dirname(existing);}
 return resolve(realpathSync(existing),...suffix);
}
export function validateDedicatedProfile(profile:string,home=homedir()){
 const path=canonicalProfilePath(profile);
 if(path===canonicalProfilePath('data/manual-chrome-profile')||path.startsWith(canonicalProfilePath('data/manual-chrome-profile')+sep))throw new Error('LEGACY_CHROME_PROFILE_REFUSED: Chromium must use its own dedicated profile');
 const roots=[join(home,'Library/Application Support/Google/Chrome'),join(home,'.config/google-chrome')];
 if(process.env.LOCALAPPDATA)roots.push(join(process.env.LOCALAPPDATA,'Google/Chrome/User Data'));
 if(roots.map(canonicalProfilePath).some(root=>path===root||path.startsWith(root+sep)))throw new Error('PERSONAL_CHROME_PROFILE_REFUSED: use a dedicated research profile, not the personal Chrome user-data directory');
 return path;
}
function preferencesPath(){return resolve(process.env.BROWSER_PREFERENCES_FILE??'data/browser-preferences.json');}
export function browserPreferences(env:Record<string,string|undefined>=process.env):ResearchBrowserSettings{
 const file=preferencesPath();
 const settings=existsSync(file)?schema.parse(JSON.parse(readFileSync(file,'utf8'))):schema.parse({channel:env.BROWSER_CHANNEL??'chromium',profile:env.BROWSER_PROFILE??'data/chromium-research-profile'});
 return{channel:settings.channel,profile:validateDedicatedProfile(settings.profile)};
}
export function saveBrowserPreferences(input:ResearchBrowserSettings){
 const settings=schema.parse(input),file=preferencesPath();settings.profile=validateDedicatedProfile(settings.profile);
 mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file+'.tmp',JSON.stringify(settings),{mode:0o600});renameSync(file+'.tmp',file);
}

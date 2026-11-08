import {createHash} from 'node:crypto';
import {classify,classificationVersion,type Profile} from './model';
// Pure evidence evaluation only. The key includes captions, target and topics;
// it never caches database state or bypasses source/browser access controls.
const cache=new Map<string,ReturnType<typeof classify>>();
export function cachedClassification(profile:Profile){
 const key=createHash('sha256').update(classificationVersion+'\n'+JSON.stringify(profile)).digest('hex'),hit=cache.get(key);
 if(hit){cache.delete(key);cache.set(key,hit);return hit;}
 const result=classify(profile);cache.set(key,result);if(cache.size>2048)cache.delete(cache.keys().next().value!);return result;
}

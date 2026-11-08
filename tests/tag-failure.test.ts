import {test} from 'node:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'radar-tag-failure-'));process.env.RADAR_STORAGE='sqlite';process.env.RADAR_DB=join(dir,'singleton.sqlite');process.env.INSTAGRAM_STATE_FILE=join(dir,'state.json');process.env.INSTAGRAM_DAILY_PAGES='0';
test('single tag failures retain partial links and continue; repeated failures and source gates pause; legacy resume preserves budgets',async()=>{const{SQLiteDatabase}=await import('../lib/storage/sqlite'),{CreatorStore}=await import('../lib/db'),{tagFailureContract}=await import('./tag-failure-contract');const db=new SQLiteDatabase(join(dir,'test.sqlite'));try{await tagFailureContract(new CreatorStore(db));}finally{await db.close();}});

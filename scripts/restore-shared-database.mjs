import {readFileSync,mkdirSync,copyFileSync,constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
if(process.env.RADAR_STORAGE==='postgres')throw Error('Shared snapshots restore to SQLite only.');
const source=resolve('shared-data/radar.snapshot.sqlite'),destination=resolve(process.env.RADAR_DB??'data/radar.sqlite');
const manifest=JSON.parse(readFileSync('shared-data/manifest.json','utf8'));
if(createHash('sha256').update(readFileSync(source)).digest('hex')!==manifest.sha256)throw Error('Snapshot checksum mismatch.');
mkdirSync(dirname(destination),{recursive:true});
// Never overwrite a collaborator's existing database.
copyFileSync(source,destination,constants.COPYFILE_EXCL);
console.log('Paylaşılan veritabanı yeni yerel dosyaya kopyalandı. Otomatik tarama kapalı; Chromium girişi ayrıca yapılmalı.');

import { extractCsv,extractHtml } from './extract';
import type { CreatorDataProvider,Profile } from './model';
// Providers consume normalized input; browser sessions stay in the extraction layer.
abstract class ImportedProvider implements CreatorDataProvider {
 abstract name:string;
 constructor(protected readonly records:Profile[]){}
 async searchCreators({limit}:{limit:number}){return this.records.slice(0,limit);}
 async getCreatorProfile(username:string){return this.records.find(p=>p.username===username.replace(/^@/,'').toLowerCase())??null;}
}
export class CSVImportProvider extends ImportedProvider {name='csv';constructor(csv:string){super(extractCsv(csv));}}
export class HTMLImportProvider extends ImportedProvider {name='html';constructor(html:string){super(extractHtml(html));}}
export class MockDataProvider extends ImportedProvider {name='synthetic';constructor(){super([{username:'synthetic_provider_demo',display_name:'Synthetic Provider Demo',biography:'Synthetic desk setup fixture',instagram_user_id:null,followers_count:5000,following_count:null,posts_count:null,synthetic:true}]);}}

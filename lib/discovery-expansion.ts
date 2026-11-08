import {DiscoveryFrontier} from './discovery-frontier';
import {discoveryQueryKey,buildDiscoveryPlan,type DiscoverySettings} from './discovery-plan';
import {DiscoveryStore} from './discovery-store';
import {first,jsonObject} from './storage/driver';
import type {CreatorStore} from './db';
// Explicit related search terms. No invented country suffixes or expansion into unrelated categories.
const related:Record<string,string[]>={
 oyun:['oyunönerileri','bilgisayaroyunları','oyunrehberi','oyunvideoları'],oyuncu:['oyuncuekipmanları','oyunoynuyorum','oyuncukanalı'],yayıncı:['canlıyayın','oyunyayıncısı','yayınkesitleri'],oyuninceleme:['oyunyorumları','oyuntavsiyeleri'],
 cozyroom:['cozyhome','cozybedroom','cozyinteriors','roominspo','livingroomdecor','bedroominspo','apartmentdecor','cozyspaces'],
 interiordesign:['interiorstyling','interiordecor','interiorinspiration','interiorlovers','interiorarchitecture'],
 homedecor:['homestyling','homeinspiration','homedecoration','decorinspo','livingroominspo'],
 desksetup:['workspacesetup','battlestation','monitorsetup','keyboardsetup','bilgisayarmasası','oyunmasası'],çalışmamasası:['bilgisayarmasası','oyuncumasası','masakurulumu'],bilgisayarmasası:['monitörkurulumu','kablodüzeni','çalışmaalanı'],
 gardening:['plantcare','plantlover','indoorplants','gardeninspiration','gardeningtips','urbanjungle'],
 houseplants:['plantsofinstagram','houseplantclub','houseplantcommunity','indoorjungle','plantcollection'],
 diy:['diyprojects','handmadecrafts','craftideas','diyhomedecor'],cleaning:['cleaningmotivation','cleaningtips','organizedhome','decluttering'],
 makeup:['makeuptutorial','makeuplooks','makeupartist','beautycreator','makyajönerileri','makyajvideoları'],
 skincare:['skincareroutine','skincaretips','skinfluencer','ciltbakımrutini','ciltbakımönerileri'],
 haircare:['haircareroutine','hairtutorial','hairtips','saçbakımönerileri'],perfume:['perfumereview','fragrancelover','fragrancecollection','parfümönerileri'],
 nailart:['naildesign','nailinspiration','nailartist','nailtutorial'],mensgrooming:['beardcare','mensskincare','groomingtips'],
 bodybuilding:['bodybuilder','musclebuilding','hypertrophytraining','gymmotivation','vucutgelistirme'],
 fitness:['fitnesstrainer','fitnessmotivation','strengthtraining','gymworkout','antrenman'],sportsnutrition:['supplements','proteinreview','sporcuürünleri','fitnessnutrition'],
 pilates:['pilatesinstructor','pilatesworkout','reformerpilates','pilatesstudio'],yoga:['yogateacher','yogaflow','yogapractice'],running:['runnersofinstagram','runningcommunity','runningtips','marathontraining'],
 cycling:['cyclinglife','cyclistlife','roadcycling'],swimming:['swimtraining','swimcoach','swimmerslife'],football:['footballtraining','basketballtraining','volleyballtraining'],
 boxing:['boxingtraining','martialartstraining','kickboxingtraining'],hiking:['hikingadventures','trekkinglife','climbinglife'],
 womensfashion:['fashionblogger','styleinspiration','ootdfashion','outfitideas'],mensfashion:['menswear','mensoutfit','mensfashionblogger'],modestfashion:['modeststyle','modestoutfit','hijabfashion'],
 jewelry:['jewelrydesigner','jewelrylover','jewelryinspiration'],sneakers:['sneakercommunity','sneakercollection','sneakerstyle'],sustainablefashion:['slowfashion','thriftfashion','vintagestyle'],
 recipes:['recipecreator','foodblogger','easyrecipes','yemektarifleri'],baking:['bakingrecipes','bakingblogger','cakeartist'],coffee:['coffeeblogger','coffeelover','homebarista'],
 foodie:['foodreview','restaurantblogger','foodcontentcreator'],veganrecipes:['plantbasedfood','veganfoodblogger','veganmeals'],kitchengadgets:['kitchentools','kitchenreview','cookingtools'],
 tech:['techcreator','techreviews','gadgetreview','technologyreview'],techgadgets:['techcreator','gadgetreview','smartdevices'],smartphone:['smartphonereview','mobilephotography','phonereviews'],
 gaming:['gamingcreator','gamingcommunity','gamereview','valorant','cs2','leagueoflegends','pubgmobile','minecraft','fortnite','simracing','espor','mobiloyun','oyunrehberi'],coding:['programminglife','codingcommunity','developerlife'],photography:['photographygear','camerareview','videocreator'],audiogear:['headphonereview','audioreview','homestudio'],
 travel:['travelcreator','travelblogger','travelguide','gezgin'],hotelreview:['hotelblogger','hotelstay','boutiquehotels'],camping:['camplife','campinglife','vanlifediaries'],cityguide:['cityexplorer','citywalks','citytips'],aviation:['aviationphotography','aviationlovers','pilotlife'],
 parenting:['parentingblogger','parentingtips','familycreator'],babyproducts:['babyproductreview','babyessentials','bebekbakımı'],petcare:['petcreator','petblogger','petproductreview'],lifestyle:['lifestylecreator','lifestyleblogger','dailyvlog'],wedding:['weddingplanner','weddinginspiration','bridalstyle'],
 productivity:['productivitytips','studygram','studymotivation','workfromhomelife'],productivitysetup:['productivitytips','studygram','studymotivation'],languagelearning:['languagelearner','languageteacher','learnenglish'],bookstagram:['bookblogger','bookrecommendations','kitapönerileri'],
 entrepreneurship:['businesscreator','entrepreneurlife','startuplife'],digitalmarketing:['marketingtips','ecommercetips','socialmediamarketing'],financialeducation:['personalfinance','budgetingtips','financialliteracy'],
 musician:['musiccreator','independentmusician','musicproduction'],dance:['dancecreator','dancetutorial','choreographer'],illustration:['illustrator','digitalartist','designcreator'],moviereview:['filmcreator','filmrecommendations','movieblogger'],comedy:['comedycreator','sketchcomedy','comedysketch'],collectibles:['collectorcommunity','collectors','boardgamecommunity'],
 automotive:['carreviewer','carcontent','carenthusiast'],motorcycle:['motorcyclelife','motorcyclecreator','motovlogger'],electricvehicle:['electriccars','evcommunity','evreviews'],realestate:['architecturelovers','architecturaldesign','realestatecreator'],zerowaste:['zerowasteliving','ecofriendlyliving','sustainabilitytips']
};
export function relatedDiscoveryKeywords(keywords:string[]){
 const existing=new Set(keywords.map(k=>discoveryQueryKey('instagram_tags',k))),result:string[]=[];
 const depth=Math.max(0,...keywords.map(k=>related[discoveryQueryKey('instagram_tags',k).slice('instagram_tags:'.length)]?.length??0));
 for(let i=0;i<depth;i++)for(const keyword of keywords){const key=discoveryQueryKey('instagram_tags',keyword).slice('instagram_tags:'.length),term=related[key]?.[i];if(term&&!existing.has(discoveryQueryKey('instagram_tags',term))){existing.add(discoveryQueryKey('instagram_tags',term));result.push(term);}}
 return result;
}
export async function expandDiscoveryPool(job:number,settings:DiscoverySettings,store:CreatorStore,remainingPages:number){
 if(!settings.providers.includes('instagram_tags'))return{added:0,reason:'provider'};
 if(remainingPages<3)return{added:0,reason:'budget'};
 const repo=new DiscoveryStore(store);
 const queued=await first(store.database,"SELECT count(*) AS n FROM research_candidates WHERE job_id=$1 AND status IN ('pending','visiting')",[job]);
 if(await repo.hasPending(job)||Number(queued?.n)>0)return{added:0,reason:'pending'};
 const existing=await repo.queries(job),keys=new Set(existing.map(q=>discoveryQueryKey(String(q.provider),String(q.keyword))));
 const base=new Set(buildDiscoveryPlan(settings).map(q=>discoveryQueryKey(q.provider,q.keyword)));
 const used=new Set(existing.filter(q=>q.provider==='instagram_tags'&&!base.has(discoveryQueryKey(String(q.provider),String(q.keyword)))).map(q=>discoveryQueryKey(String(q.provider),String(q.keyword)))).size;
 // Continue through all curated related tags, bounded by remaining page/time budgets.
 const count=Math.min(2,remainingPages-2);
 if(settings.scopeKey){const frontier=new DiscoveryFrontier(store);await frontier.syncJob(job);const run=await first(store.database,'SELECT settings FROM research_runs WHERE job_id=$1',[job]);const context=run?jsonObject(run.settings):{};await frontier.learn(settings.scopeKey,settings.topics,(context.target??{}) as import('./taxonomy').ResearchTarget);const ranked=await frontier.ranked(settings.scopeKey),observed=new Set(ranked.filter(t=>t.origin==='observed').map(t=>t.keyword)),usedObserved=existing.filter(q=>observed.has(String(q.keyword))).length;const allowance=Math.max(0,Math.floor((existing.length+count)*0.2)-usedObserved);const next=await frontier.pick(settings.scopeKey,count,existing.map(q=>String(q.keyword)),Date.now(),allowance);if(!next.length)return{added:0,reason:'terms'};await repo.initialize(job,next.map(q=>({provider:'instagram_tags',keyword:String(q.keyword),url:String(q.query_url)})));await store.log(job,`Frontier expanded: ${next.map(q=>q.keyword).join(', ')}; budgets preserved`);return{added:next.length,reason:'expanded'};}
 const candidates=[...new Set([...relatedDiscoveryKeywords(settings.priorityKeywords??[]),...relatedDiscoveryKeywords(settings.keywords)])];
 const terms=candidates.filter(k=>!keys.has(discoveryQueryKey('instagram_tags',k))).slice(0,count);if(!terms.length)return{added:0,reason:'terms'};
 await repo.initialize(job,buildDiscoveryPlan({...settings,topics:[],keywords:terms,providers:['instagram_tags'],maxQueries:terms.length}));
 await store.log(job,`Pool expanded: ${terms.join(', ')}; additional tags ${used+terms.length}; budgets preserved`);
 return{added:terms.length,reason:'expanded'};
}

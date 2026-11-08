import {taxonomy} from './taxonomy';
import {discoveryQueryKey} from './discovery-plan';
// Curated Turkish terms; never concatenate a country name onto arbitrary keywords.
const tr:Record<string,string[]>={
 'Gaming':['oyun','oyuncu','yayıncı','oyuninceleme','oyunyayını','türkyayıncı','oyunvideoları','twitchyayıncısı'],
 'Tech / Gadgets':['teknoloji','teknolojiinceleme','teknolojikürünler'], 'Telefon & mobil':['telefoninceleme','akıllıtelefon','mobilteknoloji'],
 'Yazılım & yapay zekâ':['yazılım','yazılımcı','yapayzeka'],'Fotoğraf & video':['fotoğrafçılık','videoçekimi','kamerainceleme'],'Ses & müzik ekipmanı':['sesekipmanları','kulaklıkinceleme','evstüdyosu'],
 'Cozy Room':['odadekorasyonu','evdekorasyonu','odatasarımı','yatakodasıdekorasyonu'],'Interior Design':['içmimari','evdekorasyonu','dekorasyon'],'Desk Setup':['çalışmamasası','bilgisayarmasası','oyunmasası','masakurulumu','çalışmaalanı'],
 'Bahçe & bitkiler':['bitkibakımı','bahçe','sukulent'],'DIY & el işi':['kendinyap','elişi','elürünleri'],'Temizlik & düzen':['evtemizliği','evdüzeni','temizlikönerileri'],
 'Makyaj':['makyaj','makyajönerileri','makyajvideoları'],'Cilt bakımı':['ciltbakımı','ciltbakımrutini','ciltbakımönerileri'],'Saç bakımı':['saçbakımı','saçmodelleri','saçbakımönerileri'],
 'Parfüm':['parfüm','parfümönerileri','parfüminceleme'],'Tırnak & nail art':['tırnaktasarımı','proteztırnak','manikür'],'Erkek bakım':['erkekbakım','sakalbakımı','erkeksaçmodelleri'],
 'Vücut geliştirme':['vücutgeliştirme','kasgeliştirme','ağırlıkantrenmanı'],'Fitness & antrenman':['antrenman','sporyap','kişiselantrenör'],'Sporcu beslenmesi':['sporcubeslenmesi','protein','supplementinceleme'],
 'Pilates':['pilateseğitmeni','pilatesdersi','reformerpilates'],'Yoga':['yogaeğitmeni','yogadersi','yogapratiği'],'Koşu':['koşu','koşucu','maraton'],'Bisiklet':['bisiklet','bisikletçi','bisikletturu'],'Yüzme':['yüzme','yüzmeeğitmeni','yüzmeantrenmanı'],
 'Takım sporları':['futbol','basketbol','voleybol'],'Dövüş sporları':['boks','kickboks','dövüşsporları'],'Outdoor sporları':['doğayürüyüşü','tırmanış','trekking'],
 'Kadın moda':['kadınmoda','kombin','kombinönerileri'],'Erkek moda':['erkekmoda','erkekkombin','erkekgiyim'],'Tesettür moda':['tesettürmoda','tesettürkombin','tesettürgiyim'],
 'Takı & aksesuar':['takı','takıtasarım','aksesuar'],'Ayakkabı & sneaker':['ayakkabı','sporayakkabı','ayakkabıinceleme'],'Sürdürülebilir moda':['sürdürülebilirmoda','ikincielmoda','vintagegiyim'],
 'Yemek tarifleri':['yemektarifleri','yemek','kolaytarifler'],'Pastacılık':['pastacılık','pastatarifleri','tatlıtarifleri'],'Kahve & çay':['kahve','kahveönerileri','kahvedemleme'],
 'Restoran & gastronomi':['mekanönerileri','restoranönerileri','gastronomi'],'Bitkisel tarifler':['vegantarifler','veganyemek','bitkiselbeslenme'],'Mutfak ekipmanları':['mutfakürünleri','mutfakgereçleri','mutfakaleti'],
 'Seyahat':['gezi','gezgin','gezirehberi'],'Otel & konaklama':['otelönerileri','butikotel','tatilönerileri'],'Kamp & karavan':['kamp','karavan','kampçılık'],'Şehir rehberi':['şehirrehberi','gezilecekyerler','gezirehberi'],'Havacılık':['havacılık','uçak','pilot'],
 'Ebeveynlik':['ebeveynlik','annelik','çocukgelişimi'],'Bebek & çocuk ürünleri':['bebekürünleri','bebekbakımı','çocukürünleri'],'Evcil hayvanlar':['evcilhayvan','kedibakımı','köpekeğitimi'],'Lifestyle':['günlükyaşam','yaşamtarzı','günlükvlog'],'Düğün & organizasyon':['düğün','düğünorganizasyonu','gelinlik'],
 'Productivity':['verimlilik','dersçalışma','çalışmadüzeni'],'Dil öğrenimi':['dilöğrenimi','ingilizceöğren','yabancıdil'],'Kitap & edebiyat':['kitap','kitapönerileri','kitapyorumu'],
 'Kariyer & girişimcilik':['kariyer','girişimcilik','girişimci'],'Pazarlama & e-ticaret':['pazarlama','eticaret','dijitalpazarlama'],'Finans eğitimi':['finansokuryazarlığı','bütçeyönetimi','finanseğitimi'],
 'Müzik':['müzik','müzisyen','şarkıyazarı'],'Dans':['dans','koreografi','dansdersi'],'Çizim & tasarım':['çizim','illüstrasyon','grafiktasarım'],'Sinema & dizi':['filmönerileri','diziönerileri','sinemayorumu'],
 'Mizah & komedi':['mizah','komedi','skeç'],'Hobi & koleksiyon':['hobi','koleksiyon','kutuoyunları'],
 'Otomobil':['otomobil','arabainceleme','otomobilinceleme'],'Motosiklet':['motosiklet','motovlog','motosikletinceleme'],'Elektrikli araçlar':['elektrikliaraç','elektrikliotomobil','elektrikliaraçinceleme'],
 'Gayrimenkul & mimari':['gayrimenkul','mimari','mimaritasarım'],'Sürdürülebilir yaşam':['sürdürülebiliryaşam','sıfıratık','ekolojikyaşam']
};
export function localizedDiscoveryKeywords(topics:string[],country?:string){
 if(country!=='TR')return[];
 const roundRobin=(groups:string[][])=>Array.from({length:Math.max(0,...groups.map(g=>g.length))},(_,i)=>groups.flatMap(g=>g[i]?[g[i]]:[])).flat();
 const groups=topics.map(topic=>tr[topic]??roundRobin(taxonomy.find(g=>g.name===topic)?.children.map(c=>tr[c.id]??[])??[])),result:string[]=[],seen=new Set<string>();
 for(let i=0;i<Math.max(0,...groups.map(g=>g.length));i++)for(const group of groups){const term=group[i];if(term&&!seen.has(discoveryQueryKey('instagram_tags',term))){seen.add(discoveryQueryKey('instagram_tags',term));result.push(term);}}
 return result;
}

# Özellik ayrıntıları

Bu belge README'den taşınan ayrıntılı davranış notlarını içerir. Kurulum ve günlük kullanım için [README](../README.md), mimari için [ARCHITECTURE.md](ARCHITECTURE.md), tarih sıralı değişiklik günlüğü için [STATUS.md](STATUS.md) dosyasına bak.

## Ziyaret beklemesi
Instagram ziyaretlerinden önce 10–30 saniye arasında tam saniyeli rastgele beklenir. `INSTAGRAM_WAIT_MIN_SECONDS` ve `INSTAGRAM_WAIT_MAX_SECONDS` ayarlarıyla yönetilir. Bu süre sayfanın yüklenmesinden ayrıdır; tahmini ortalama sayfa başına 20 saniye + yükleme süresidir. Eski `INSTAGRAM_INTERVAL_SECONDS` ayarı yalnızca yeni sınırlar tanımlanmamışsa sabit bekleme için korunur. Google bekleme politikası değişmez. İptal ve erişim engelleri beklemeyi kesebilir.

## İçerik dilinden ülke tahmini
Açık ikamet beyanı yoksa toplanmış biyografi ve creator açıklamalarındaki dil sinyalleri değerlendirilir. İlk sözlük TR/EN/DE/FR/ES/PT/IT/NL dillerini kapsar. Türkçe içerik için Türkiye düşük güvenli ülke tahmini olarak saklanır (`location_status=language_estimate`). Çok ülkeli dillerde tek ülke seçilmez, olası ülkeler saklanır. Az veya karışık metin, tek başına hashtag ve arama hedefi ülke atamaz. Açık konum beyanları tahmini geçersiz kılar, çelişen beyanlar korunur. Tahmini ülke hedefi `estimated`, açık beyan hedefi `matched` olarak ayrılır; CSV konum yöntemi, dil ve aday ülkeleri içerir. Şehir ve cinsiyet dilden tahmin edilmez.

## Biyografideki iletişim e-postaları
Biyografide açık metin olarak bulunan geçerli e-posta adresleri `contact_emails` içinde tekilleştirilerek saklanır. Her adres kaynak profil URL'si, sağlayıcı, metin alıntısı, ilk/son görülme zamanı ve güncel biyografide bulunma durumu taşır. Metinden adres tahmin edilmez, yorumlar taranmaz, e-posta gönderimi veya teslim edilebilirlik kontrolü yapılmaz. Yeni alınan biyografide kaldırılan adres tarihsel olarak korunur ve güncel dışa aktarımdan çıkar. Biyografinin alınamaması eski adresi silmez. Hesap tablosu, detay, e-posta filtresi ve CSV güncel adresleri destekler. Mevcut biyografilerin yeniden değerlendirilmesi kaynak ve toplama zamanlarını değiştirmez.

## Verimli araştırma akışı
Panelin yeni işleri `efficientResearch=true` ayarıyla kaydedilir. Tek bir iş içinde keşif ve kayıt dönüşümlü sürer: önce bir etiket, ardından en fazla 5 adaylık çözümleme grubu, bulunan profillerin kaydı ve sonraki grup. Doğrudan profil bağlantısı bulunduğunda kayıt işine öncelik verilir. Toplam sayfa, süre, günlük ziyaret, MAX_RECORDS ve 200 adaylık havuz sınırları korunur. Bu akış yeni iş oluşturup bütçeyi sıfırlamaz. Kuyruk tükenirse erken tamamlanır.

Bir etikette ilk beş gönderi ziyareti hesap sahibi doğrulayamıyorsa diğer bekleyen etiketler denenir; kalan gönderiler silinmez. Yakın geçmişteki kayıt oranıyla etiketler sıralanır; denenmemiş etiketler de araştırılır. Instagram’da aynı etikete açılan farklı yazımlar (ör. home decor / homedecor) yeni sorgularda ve verim hesabında tekilleştirilir. Verim son 200 tamamlanmış/iptal edilmiş sorgudan hesaplanır: benzersiz yeni kayıt / etiket + gönderi sahibi + profil ziyareti. Aynı aday aynı etikette bir kez sayılır. Farklı etiketler aynı kayda kaynak olabilir; tablo satırları toplanarak toplam kayıt hesaplanmamalıdır. Bu oran ülke/cinsiyet veya ticari uygunluk doğrulaması değildir.

Son 4 saatte güncellenmiş profiller arka plan araştırmasında tekrar açılmaz. Bilinen gönderi sahipleri ve atfedilmiş açıklamalar 4 saatlik önbellekten kullanılabilir. Açık profil güncellemesi isteyen eski CLI işleri bu atlama modunu kullanmaz. Eski/çalışan işlerin kaydedilmiş ayarları değiştirilmez. Kesinti sonrasında tamamlanan kayıtlar ve tüketilmiş bütçe korunur. Üç ardışık taşıma hatası, CAPTCHA, 403/429 ve giriş engeli kontrolleri devam eder; sağlayıcı/profil değiştirilmez.

Panelde yeni hesap/saat tur ortalaması, ziyaret/kayıt ve ziyaret edilmeden atlanan profil sayıları gösterilir. Etiket verimi tablosu ayrıntı olarak açılabilir. Bu sürüm için gerçek canlı kapasite artışı ayrıca ölçülmelidir; fixture testindeki kayıt sayısı gerçek saatlik kapasite değildir.

## Günlük toplam ziyaret sınırı
Bu çalışma ortamında `INSTAGRAM_DAILY_PAGES=0` günlük üst sınırı kapatır; API `dailyPages:null`, panel “Sınırsız” gösterir. Ziyaret sayacı istatistik için çalışmaya devam eder. Pozitif değerle günlük sınır yeniden açılabilir. Değişken tanımlanmamış eski kurulumlarda 30 varsayılanı korunur. Tur başına sayfa, süre, kayıt, bekleme ve erişim engeli kontrolleri değişmez. Google kaynağının bağımsız politikası değişmez.

## Havuz tükenmesi ve tekil profil okuma hataları
Verimli araştırmada kuyruk ve bekleyen sorgular tükendiğinde aynı alanla ilgili önceden tanımlanmış etiketler denenir. Her genişletmede en fazla 2 etiket açılır; sabit toplam 6 etiket sınırı kaldırılmıştır. Mevcut bütçeye sığan, önceden tanımlanmış ilişkili terimler sırayla denenir. En az 3 sayfa bütçesi kalmalıdır; sayfa/süre/ziyaret sayaçları sıfırlanmaz. Yeni sorgular normal keşif tablosuna yazılır; yeniden başlatmada aynı etiket tekrarlanmaz. Bütçe veya ilgili terimler/yeni bağlantılar tükenince tur açıklayıcı nedenle tamamlanır; sınırsız hesap garantisi değildir.

Açık “No posts yet / sonuç bulunamadı” sayfası normal boş sonuçtur. Giriş/CAPTCHA/HTTP kontrolleri önce uygulanır; tanınmayan etiket sayfası yine duraklatılır. Profilde başlık veya ana içerik okunamıyorsa sınırlı yüklenme beklemesinden sonra yalnız o profil atlanır. Art arda üç profil bu nedenle okunamazsa tur duraklatılır. Kimlik/canonical URL uyuşmazlığı, giriş, CAPTCHA, 403/429 ve diğer erişim engelleri atlama kapsamına girmez.

Eski sürümün yalnızca “Recognized public profile title and main content not found” nedeniyle duraklattığı turda panelde “Sorunlu profili atla ve devam et” kullanılabilir. İşlem sadece son hatalı adayı atlar ve bu eski tekil nedene ait kaynak kilidini kaldırır; daha yeni/farklı erişim engelini kaldıramaz. İlk başlama zamanı ve tüketilen bütçe korunur. Turun süresi dolmuşsa yeniden başlatılan iş süre sınırında tamamlanır; yeni tur ayrı başlatılmalıdır.

## Etiket sayfalarında kontrollü kaydırma
Panelin verimli araştırma modu, ilk bağlantılarla yetinmez: görünür etiket sayfasını veya iç kaydırma alanını ilerleterek yeni gönderi bağlantıları toplar. Gizli API/JSON kullanılmaz. Her ek yükleme öncesinde normal 10–30 saniye bekleme, iptal, süre, kaynak ve bütçe kontrolleri uygulanır; yükleme denemesi 1 ziyaret tüketir. Diğer etiketler ve hesap kaydı için bütçe payı bırakılır. Sorgu başına hedef 20 yeni bağlantıdır; son dört saatte işlenmiş bağlantılar bu hedefi doldurmaz.

Bağlantılar her görünür grupta ayrı işlemle kalıcı yazılır. Kesinti/erişim engelinden önce alınan gruplar kaybolmaz; yeniden başlatma mevcut sonuçları tekilleştirir. Kaydırmalar yeniden deneme sayısını artırmaz; harcanan ziyaretler ve etiket verimi hesabına dahil edilir. Kaydırma ölçümü `Tag scroll reserved: query=...` loglarıyla atomik tutulur.

İki yükleme denemesinde DOM'da yeni gönderi bağlantısı gelmezse o etiketin yüklenmesi durur. Bilinen eski bağlantılardan ilerlenebilir; ancak bütçe payı aşılmaz. Sonraki etiket ve ilişkili terimler işlenir; hepsinde yeni bağlantı kalmazsa tur `no_new_links` nedeniyle biter. Sayfa bütçesi üst sınırdır, yeni hesap sayısı veya mutlaka tamamı tüketilecek bir hedef değildir. Yerel test: `npm run test:tag-browser`.

## Türkiye odaklı keşif ve ülke sonuçları
Türkiye seçilen yeni panel araştırmalarında kategoriye uygun Türkçe terimler önce denenir. Gaming için ilk terimler `oyun`, `oyuncu`, `yayıncı`, `oyuninceleme` olur; genel `gaming` ve `gamer` daha sonra gelir. Üst kategoriler alt alanlardan dönüşümlü Türkçe terim alır. Genel etiketlerin geçmiş verimi yerel önceliği değiştirmez; ilişkili Türkçe genişletmeler de önceliklidir.

İlk geçişte etiket başına toplam bütçenin sorgu sayısına bölünmesiyle pay ayrılır (en az 3 ziyaret). Etiket açılışı, kaydırma, sahip çözümleme ve profil ziyareti bu paya dahildir. Diğer etiketler denenene kadar fazla gönderiler bekletilir; ilk geçişten sonra kalan bütçe yeniden kullanılabilir. Turun toplam sayfa ve süre sınırları her zaman geçerlidir. Eski işlerin kaydedilmiş arama planları değiştirilmez.

Dil tespiti v2 Türkçe oyun/yayın/abone/izleyici gibi farklı kelime ailelerini, Türkçe karakterli ve ASCII yazımlarıyla değerlendirir. Tekrarlanan aynı kelime ailesi güveni şişirmez. Platform adları, tek başına hashtag veya seçilen ülke Türkiye atamak için yeterli değildir. Türkçe dil tahmini Türkiye'de ikamet kanıtı değildir ve düşük güvenli kalır.

Hesaplar ve Türkiye hedefli tur özeti dört grubu ayırır: **Türkiye eşleşmesi** (açık konum beyanı), **Türkiye tahmini** (dilden, düşük güven), **ülkesi belirlenemeyen**, **diğer ülkeler**. Hesaplarda gruplar filtrelenebilir; CSV ülke eşleşmesini ve Türkiye grubunu içerir. Ülke sonucu cinsiyet/şehir bilgisinin eksik olmasından bağımsızdır. Kaynak ve toplama zamanları yeniden değerlendirmede korunur.

## Kalıcı ve öğrenen keşif havuzu
Yeni panel işleri sorgu havuzunu kategori, ülke, şehir ve beyan filtresine göre ayrı saklar. `discovery_frontier` terimin kaynağını ve kanıtını, `discovery_observations` sorgu başına ziyaret/yeni kayıt/hedef uyumu sonuçlarını tutar. PostgreSQL için `004_discovery_frontier.sql` uygulanmalıdır; SQLite tabloları açılışta ekler. SQLite→PostgreSQL aktarımı bu tabloları da içerir.

Başlangıç sözlüğü Türkçe ve genel kategori terimlerini, ilgili alt alanları ve Gaming için oyun/platform terimlerini kapsar. Yerel terimler önceliklidir. Aynı kapsam içinde sıralama `(2 × hedefe uyan yeni kayıt + tüm yeni kayıt + 1) / (ziyaret + 3)` puanını kullanır; her beş seçimde denenmemiş sorguya bir keşif fırsatı verilir. İlk ayarlarda hiç yeni kayıt getirmeyen terimler 6 saat, kayıt getirenler 1 saat dinlendirilir. Bunlar keşif tekrarını azaltma ayarlarıdır; erişim engelinden kaçınma yöntemi değildir. Bekleyen profiller ve gönderiler sonraki tura taşınır. Mevcut çalışan işler kayıtlı planlarını korur.

Havuz genişlemesinde ve sonraki tur başlangıcında, zaten toplanmış ve sahibine atfedilmiş açıklamalardan yeni etiketler önerilir. Aynı kategori ve hedef konuma uyan en az iki farklı creator kanıtı gerekir. Tek creator, izleyici yorumu, arama snippet'i, genel viral/çekiliş/etkileşim etiketleri ve başka kategoriyle eşleşen terimler öğrenme kaynağı değildir. Gözlenen terimler başlangıçta en fazla seçilen sorguların %20'sine ayrılır; beşten küçük gruplarda denenmez. Bu kural sayfa maliyetini veya içerik ilgisini garanti etmez. Genel saatlik kapasite canlı turlarla ayrıca ölçülmelidir.

Panel tur özetinde toplam/denenmemiş/öğrenilmiş/dinlenen sorgu sayıları gösterilir. Sistem bütçe, süre, iptal, günlük politika ve CAPTCHA/403/429 kontrollerini korur. Kişisel Chrome kullanılmaz; arka plan araştırması ayrı, başsız Chromium profilindedir.

## Gönderi sahibi teşhisi
Başarısız çözümlemeler `owner_link_missing`, `multiple_owner_candidates`, `post_identity_mismatch`, `page_not_loaded` olarak saklanır; log ve tur ayrıntısı bunları ayrı gösterir. Eski `public_author_unavailable` kayıtlarına sonradan neden uydurulmaz ve eski başarısızlık önbelleği yeni okuyucuyu engellemez. Erişim/CAPTCHA hataları bu gruplara gizlenmez, kaynağı duraklatır.

Instagram aynı gönderi kodunu `/p/` ve `/reel/` yollarından sunabilir. URL ve canonical kimlikleri gönderi koduyla karşılaştırılır; farklı kod, çelişen sahip veya sadece yorumcu bağlantısı kabul edilmez. Görünür bağlantılar incelenir; 100 bağlantı sınırı 1000'e yükseltilmiştir. Üç operatör izinli gerçek sayfanın küçültülmüş/anonim yapısı `fixtures/instagram-post-routes.json` içinde regresyon örneğidir. `scripts/inspect-owner-samples.ts --live` en fazla üç eski başarısız gönderiyi ayrı başsız profilde inceler, normal bekleme/erişim kontrollerini uygular ve yalnızca yerel yapısal teşhis dosyaları yazar. Gerçek sayfalardaki üç örneğin düzelmesi genel başarı oranı değildir.

## Tekil etiket okuma hatalarında devam
Başsız tarayıcı, kaynak erişim kontrollerinden sonra bir etiketi okuyamazsa `tag_layout_unreadable`, bağlantı veya sınırlı gezinme süresi hatasında `tag_load_failed` üretir. Yalnız bu iki türde sorgu `skipped` olarak kaydedilir; aynı turda tekrar denenmez. Önceden bulunan bağlantılar ve ayrılan bütçe korunur, kalan gönderiler ve etiketler işlenir. Boş sonuç yalnızca sayfada açık boş sonuç mesajı varsa `empty_results` olarak kaydedilir; HTTP 404 `tag_unavailable` olur. Bilinmeyen hatalar sessizce atlanmaz.

Üç ardışık etiket okuma/yükleme hatası turu `consecutive_tag_read_errors` nedeniyle duraklatır. Açık boş veya başarılı sorgu bu diziyi keser. CAPTCHA, giriş ve ölçülmemiş erişim kısıtları tek seferde kaynağı durdurur; ölçülen 403/429 için sınırlı yeniden deneme politikası uygulanır. Atlanan sorguların gerçek maliyeti kalıcı havuzun verim/dinlenme hesabına dahildir. İptal ve zaman/bütçe sınırları korunur.

Panel atlanan/boş etiketleri nedenleriyle listeler. Önceki sürümde yalnızca tam olarak bilinen “Tag result links unavailable after bounded render wait” hatasında durmuş tur için **Sorunlu etiketi atla ve devam et** sunulur. Bu açık kullanıcı işlemi yalnız ilgili etiketi atlar; daha yeni veya farklı bir kaynak engelini kaldırmaz. Kaydedilen hesaplar, bekleyen bağlantılar, başlangıç zamanı ve harcanan ziyaretler değişmez. Süresi dolmuş bir tur devam ettirildiğinde mevcut süre sınırında sonlanır.

## Hedefe uygunluk ve seçici inceleme
Sınıflandırma v3 kategori bulunmasını (`primary_niche`) istenen kategoriye uyumdan (`category_match`) ayırır. `research_match`, kategori ve konum/beyan filtrelerini birlikte değerlendirir: açık kanıtla uyum, düşük güvenli ülke tahminiyle uyum, belirsiz veya hedef dışı. İstenen kategori için en az 6 ağırlıklı kanıt puanı gerekir; tek bir zayıf hashtag yeterli olmaz. Bu eşik, doğrulanmış ticari uygunluk olasılığı değildir.

Gaming için genel `oyun/oyuncu` sözcükleri tek başına kanıt sayılmaz. Oyuncak, Montessori, çocuk etkinliği ve oyunculuk bağlamı video oyunu bağlamından ayrılır; somut oyun/platform kanıtı varsa çok kategorili hesaplar yine Gaming olabilir. Sadece `gaming` sözcüğü artık Cozy Room sınıflandırması üretmez. Genel sözcüğün neden Gaming sayılmadığı hesap detayında açıklanır.

Tur raporu artık **tüm yeni hesap/saat**, **hedefe açık kanıtla uyan yeni hesap/saat** ve **hedefe tahminen uyan yeni hesap/saat** değerlerini ayrı gösterir. Güncellenen hesaplar yeni hesap sayısına eklenmez. Kategorisiz, hedefi belirsiz ve hedef dışı sonuçlar ayrı tutulur. Yeni tamamlanan adaylarda son ham profil/açıklama kanıtı tur kaydında saklanır; sonraki profil güncellemesi geçmiş turun kanıtını değiştirmez. Eski turlarda mevcut aday checkpoint'i ve gönderi kanıtı kullanılır; checkpoint bulunmayan eski kayıtlar mevcut profil verisine dayanır. Raporlar güncel sınıflandırma kurallarıyla yeniden değerlendirilir. Sınıflandırma yenilemesi kaynakları, toplama zamanlarını ve inceleme durumunu değiştirmez.

Yeni panel işleri `selectiveReview=true` kullanır. Belirsiz veya zayıf kanıtlarda en fazla 3 sahipliği doğrulanmış açıklama alınabilir; yeterli kanıt veya açık hedef dışı kararında durulur. Açıklama okumaları toplam tur bütçesinin %20'sini aşmaz ve sonraki profil ziyareti için en az bir sayfa bırakılır. Normal bütçe, süre, kaynak erişimi, iptal ve tekrar sınırları geçerlidir. `maxPosts=0` olan işlerde ek okuma yapılmaz. Eski çalışan işlerin kayıtlı ayarları değiştirilmez.

Kalıcı havuz seçiminde her beşinci yere tüm öncelik gruplarını aşabilen bir keşif fırsatı ayrılır; uygun öğrenilmiş yeni terimler burada denenir. Öğrenilmiş terimlerin sayısı istenen seçim kapasitesinin en fazla %20'sidir. İkili genişletmeler bu payı turun toplam sorgu sayısına göre hesaplar. Türkçe terimler diğer yerlerde önceliklidir. Yeni turun planlı sorguları, önceki turdan devralınan bekleyen sorgulardan önce çalışır. Havuz özeti öğrenilen terimlerin kaçının denendiğini ve kaçının beklediğini gösterir. Sorgu verim puanı hedefe uyan yeni kayıtları ağırlıklandırır; çok sayıda hedef dışı kayıt artık yüksek puanı tek başına sağlayamaz.

Önceki kurallardan öğrenilmiş terimler de yeni kategori/hedef kanıtıyla yeniden değerlendirilir. En az iki uygun creator tarafından artık desteklenmeyen gözlenen terimler silinmeden beklemeye alınır (`evidence.eligible=false`); yeni sorgu olarak seçilmez. Kanıt tekrar yeterli hale gelirse yeniden etkinleşebilir. Kaynak geçmişi ve önceki ölçümler korunur. Panel bu terimleri kanıtı yetersiz öğrenilmiş sorgular olarak ayrıca sayar.

## Desk Setup ve gönderi adresi dayanıklılığı
Sınıflandırma v4 çalışma/bilgisayar masası, monitör/klavye kurulumu ve Türkçe/ASCII yazımlarını tanır. Yemek masası, sofra, vazo veya genel masa dekorasyonu tek başına Desk Setup kanıtı değildir. Donanımla birlikte açık masa/kurulum bağlamı aranır. Türkçe keşif çalışma masası, bilgisayar masası, oyun masası ve masa kurulumu terimleriyle başlar; geniş masa dekorasyonu terimleri yeni planlardan çıkarılmıştır. Önceki hazır terimler kaynak geçmişi silinmeden devre dışı bırakılır, tekrar plana eklenirlerse yeniden etkinleştirilebilir.

Gönderi URL doğrulaması `InstagramPostRouteError` ile diğer hatalardan ayrılır. Desteklenmeyen bir gönderi, yalnız ilgili açıklama/keşif sonucunda `unsupported_post_route` olarak atlanır; diğer gönderiler ve profil kaydı devam eder. Geçerli bir istekten farklı gönderiye veya desteklenmeyen sayfaya yönlenme açıklamayı yanlış profile bağlamaz. Gizli parametreler veya farklı alan adları kabul edilmez. Giriş, CAPTCHA ve 403/429 kontrolleri bu atlamadan önce uygulanır ve kaynağı yine durdurur.

## Belirsizlik nedenleri ve ek inceleme katkısı
Hesap ve tur raporu kategori, ülke, şehir ve istenen beyan eksikliğini ayrı sayar. Biyografi/açıklama eksikleri ayrıca kapsam bilgisi olarak gösterilir; tek başına hedef dışı kararı değildir. Aynı hesap birden fazla neden taşıyabilir; bu sayılar benzersiz hesap sayısı gibi toplanmamalıdır.

Yeni seçici inceleme kayıtlarında `review_assessment`, ek ziyaret öncesi ve sonrası araştırma uyumunu, gerçekten ayrılan ziyaretleri, yeni açıklama sayısını ve durma nedenini saklar. Önceden sahip çözümlemesinde alınmış açıklamalar başlangıç kanıtıdır; ek inceleme kazancı sayılmaz. Belirsizden açık uyum/tahmini uyum/hedef dışına geçiş belirsizliği çözme olarak ölçülür; yalnız ilk ikisine geçiş ek hedefe uygun hesap olarak ayrıca sayılır. Bütçe nedeniyle ertelenme, gönderi bulunamaması, açıklama/sahiplik doğrulanamaması ve kaynak engeli ayrılır. Ölçüm eski turlara uydurulmaz; panel kaç hesap için bu ölçümün bulunduğunu gösterir. Ziyaret rezervasyonları ve sonuçlar kuyrukla birlikte kalıcıdır.

## Keşif ve iyileştirme kuyruğu
Yeni panelde çalışma biçimi seçilir: yeni hesap keşfi, %25 veya %50 iyileştirme payı, ya da yalnız mevcut belirsiz hesaplar. Profil URL'si istenmez; uygun kayıtlar veritabanından seçilir. İstenen kategori/ülke/beyan hedefi dışında kalanlar, bastırılmış veya sentetik hesaplar seçilmez. İyileştirme ziyaretleri `candidate_work` ve atomik ziyaret loglarıyla ayrı izlenir; profil ve açıklama ziyaretleri aynı iyileştirme üst sınırını tüketir. Ayrılan pay bitince kayıt korunur ve diğer keşif işleri devam eder. Boş kalan pay keşifte kullanılabilir; toplam tur bütçesi artmaz. Aynı hesaba otomatik iyileştirme aralığı `ENRICHMENT_COOLDOWN_HOURS` ile belirlenir (varsayılan 4 saat). Bu aralık kaynak erişim kısıtını kaldırmaz. Mevcut çalışan işlerin planı otomatik değiştirilmez.

## Erişim geçmişi ve yarım kalan işler
Oturum bölümü son kaynak kısıtını ve oturum kontrol zamanını ayrı gösterir. Gün veya bekleme süresi değişmesi açılmış kaynak kilidini kaldırmaz; sınırlı HTTP yeniden denemesi kilit açılmadan önceki ayrı aşamadır. Her turda kalan sayfa bütçesi, süre sonu ve taşınabilir iş sayısı gösterilir. Süresi veya sayfa bütçesi biten tur aynı bütçeyle devam ettirilmez. Açık **Kalan havuzla yeni tur** işlemi hedef, izin ve keşif ayarlarını devralır; yeni turun bütçesini ayrıca açar. Eski turun zamanı ve harcaması korunur. Eski turu kapatma ile yeni işi oluşturma tek işlemde yapılır; eşzamanlı istekler ikinci tur oluşturamaz. Kaynak kilitliyken taşıma veya devam engellenir. İptal edilen yeni iş, henüz devralınmamış eski havuzu silmez.

## Manuel kategori doğruluğu örneklemi
Hesap detayında doğru kategori, yanlış kategori (beklenen kategoriyle) ve yetersiz kanıt etiketleri eklenebilir. `creator_evaluations` tahmini, beklenen kategoriyi, sınıflandırma sürümünü ve zamanı değiştirilemeyen yeni satırlar olarak saklar. Görülen kategori işlem sırasında değişmişse yeniden değerlendirme istenir. Güncel sürümde hesap başına son değerlendirme sayılır; tekrar etiketlemek örneklem sayısını şişirmez. Gösterilen oran doğru / (doğru + yanlış) şeklindedir; yetersiz kanıt paydadan ayrılır. Bu örneklem oranı veritabanının genel doğruluğu değildir. İnsan etiketleri otomatik tahmini sessizce değiştirmez.

## Hedef verimine göre ilk tarama payları
Kapsam içindeki sorgu verim puanı ilk geçişte 0,5–2 arasında ağırlığa çevrilir. Yeni sorgular başlangıç ağırlığını ve keşif fırsatını korur. Üç kayıt üretip hiçbir hedef uyumu/tahmini uyum sağlamayan sorguya diğer sorgular denenirken en az pay ayrılır. Pay hesabından gerçek iyileştirme ziyaretleri düşülür. Sayfa, süre, kaynak, iptal ve sonraki profil ziyareti rezervleri her durumda üst sınırdır; etiket payları toplam kayıt garantisi değildir. Bekleyen bağlantılar silinmez; ilk geçiş sonrasında kalan bütçe kullanılabilir.

PostgreSQL kurulumları `005_research_operations.sql` geçişini uygulamalıdır; yerel SQLite tabloları açılışta eklenir. SQLite→PostgreSQL aktarımı çalışma türü ve değerlendirme geçmişini de içerir.

## HTTP kısıtının kanıtı ve sunucu beklemesi
403/429 yanıtlarında yalnız güvenli istek adresi, ziyaret edilen sayfa, yöntem, kaynak türü, ana istek olup olmadığı, ölçüm zamanı ve geçerli `Retry-After` bilgisi saklanır. Kullanıcı bilgisi, sorgu parametreleri, fragment, gizli/değişken alt kaynak yolu bölümleri temizlenir; çerez, Authorization başlığı, istek gövdesi veya yanıt içeriği bu teşhiste kaydedilmez. Ayrıntı yerel kaynak durumunda ve `Instagram restriction detail` logunda bulunur. Ana belge ile görsel/veri isteği ayrılır; alt kaynaktaki kısıt da mevcut okuma denemesini keser ve araştırma katmanındaki sınırlı yeniden deneme/devre politikasına iletilir, sessizce yok sayılmaz. Kısıtlı araştırma sekmesi kapatılır; oturum profili silinmez.

`Retry-After` saniye veya standart HTTP tarihi olarak okunur. Bilinmeyen/geçersiz değerden süre üretilmez. Bir sayfada birden çok kısıt görülürse daha uzun bildirilen bekleme korunur. `retryNotBefore` süreç yeniden başlatıldığında ve gün değiştiğinde korunur. Süre dolmadan devam, manuel tarayıcı açma/gezinme ve oturum kontrolü uygulama üzerinden gönderilmez; API ve işçi katmanları ayrı kontrol eder. Sürenin dolması açılmış kilidi kendiliğinden kaldırmaz. Devre açılmadan önce aktif araştırmanın sınırlı yeniden deneme politikası bu süreyi alt sınır olarak kullanır. Süre bildirilmemişse bitiş zamanının bilinmediği gösterilir; rastgele bir "güvenli" bekleme tahmin edilmez.

Oturum kontrolü yalnız ana sayfadaki giriş sinyallerini doğrular (`session_only`). Başarılı giriş, araştırma erişiminin açık olduğunu kanıtlamaz ve mevcut kısıtı kaldırmaz. Aynı ana sayfada giriş açıkken alt istekte 429 görülebilir; iki durum ayrı raporlanır. Araştırma erişimi durumları: sunucu beklemesi, kısıtlı, yerel durdurma kaldırıldı fakat yeniden doğrulanmadı, son araştırma sayfası açıldı veya henüz ölçülmedi. Son sayfanın açılması tüm uç noktaların erişilebilir olduğunu garanti etmez. Eski olayların ölçülmemiş istek ayrıntıları sonradan uydurulmaz.

Aynı gönderinin `/p/<kod>/` ve `/reel/<kod>/` adresleri keşifte tekilleştirilir ve doğrulanmış sahip/açıklama önbelleğini paylaşır. İlk kaynak adresi korunur; dört saatlik güncellik ve kimlik doğrulama sınırları değişmez. Böylece rota takma adları ikinci bir sahip veya profil ziyaretini gerektirmez. Sentetik tarayıcı testi: `npm run test:http-browser` (tüm trafik yerel fixture ile karşılanır).

## Otomatik verimli araştırma: kayıt–keşif dönüşümü

Otomatik verimli araştırma artık doğrulanmış tek bir bekleyen creator'dan sonra keşfe ara verir, o creator'ı işleyip kaydeder ve ardından keşfe devam eder. Sonradan gelen bir kaynak kısıtı tamamlanmış kayıtları kalıcı bırakır; bekleyen keşif, açık bir devam isteği için saklı kalır. Bu, kaynak kısıtlarını aşmaz ve ziyaret bütçelerini sıfırlamaz.

## Yalnız yeni creator keşfi ve bekleyen gönderi önceliği

Verimli keşif artık yalnızca yeni creator içindir: mevcut creator URL'leri, yakın zamanlı profil beklemesi dolsa bile profil ziyaretinden önce atlanır. Açık iyileştirme adayları ayrı paylarıyla uygun kalır. Uygulanabilir bekleyen gönderi işi yeni bir etiket sorgusundan önce tüketilir; verimsiz etiketler ve tükenmiş sorgu payları taze sorgulara yine yol verir, böylece biriken iş keşfi tıkayamaz.

## Sınıflandırma v4.2 — Cozy Room ve Hollanda ipuçları

Kanıt sınıflandırması v4.2 açık "cozy home" etiketlerini ve Türkçe iç tasarım terimlerini tanır; genel iç mekânları Cozy Room saymaz. Açık Hollanda ikameti ve biyografideki konum işareti (location pin) ülke etiketleri tanınır; belirsiz İngilizce içerik yine ülke seçemez. Kapsamlı sorgu sıralaması, yerellik katmanları içinde hedefe uygun yeni profil verimini kullanır. Verim hesabı kesinleşmiş kanıtı kullanır ve güncellemeleri hariç tutar. Zaten creator olarak kayıtlı bilinen gönderi sahibi takma adları, sahip/profil ziyareti yapılmadan atlanır. Sahibine atfedilmiş mevcut açıklamalar, seçici inceleme planlanmadan önce değerlendirilir.

## Sınıflandırma v4.3 — yerel ikinci geçiş

Sınıflandırma v4.3, eksik veya zayıf anahtar kelime kategorileri için yerel bir ikinci geçiş ekler. Toplanmış biyografi/görünen ad/açıklama metinlerindeki bağımsız kavram ailelerini; kategoriye özgü çapalar, Türkçe ek işleme ve oyun bağlamı dışlamalarıyla kullanır. Yalnız ad, kullanıcı adı, seçilen konular, arama snippet'leri ve keşif hashtag'leri hiçbir zaman kanıt sayılmaz. Katman yöntemini, aday kategorileri, eşleşen alıntıları/kaynak URL'lerini ve sıfır dış istek bilgisini kaydeder. Açıklanabilir, kural tabanlı bir yedektir; LLM veya embedding modeli değildir ve uyum puanı kalibre edilmiş güven değildir. Güçlü ilk geçiş kategorileri korunur; ülke ve hesap türü ayrıca değerlendirilir. Zayıf girdiler belirsiz kalır. Kayıtlı sınıflandırmanın yenilenmesi elle doğrulamayı değiştirmez, metrik/kaynak kaydı oluşturmaz.

## Herkese açık satış sinyalleri

Satış sinyalleri içerik kategorilerinden ve ikametten bağımsızdır. Profiller görünür, sadeleştirilmiş dış bağlantıları (profil başlığı) saklar; Instagram yönlendirme URL'leri yerelde çözülür, hiçbir dış site veya bağlantı toplayıcı taranmaz. Biyografi ve atfedilmiş açıklamalar satış kanıtı, kaynak URL'leri ve kanallar üretir: Shopier, Trendyol, Hepsiburada, Etsy, Amazon, WhatsApp, DM ve aday satış siteleri. Sorgu dizeleri/kimlik bilgileri saklanan dış bağlantılardan çıkarılır. Açık satış sinyali, doğrudan satış kanıtlanmamış bağlı kanallar ve bilinmeyen ayrı tutulur; yalnız affiliate/tanıtım metni doğrudan satışı kanıtlamaz. Site/hesap sahipliği ve işlemler doğrulanmamıştır. Tek başına bir kanal ifadesi yetersizdir. Hesaplar paneli satış/kanal filtrelerini kategori ve ülkeyle birleştirir, destekleyici kanıtı ayrıntıda gösterir ve satış durumu/kanal/URL bilgilerini CSV'ye aktarır. Mevcut kayıtlar saklı biyografi/açıklamalardan yerelde yeniden hesaplanabilir; daha önce toplanmamış dış bağlantılar uydurulmaz.

## Sürekli tarama

"Otomatik tara" açıldığında, açıkça durdurulana kadar sınırlı araştırma turları oluşturmaya devam eder. Tekil kontrolcü/ayar/döngü/sahip olunan güncel iş veritabanında kalıcıdır (PostgreSQL migration 006). Seçilen konular/ülke sabit kalır; eksik konu taksonomi gruplarını, eksik ülke desteklenen ülkeleri döndürür. İkisi de otomatikse, sonraki ülkeye geçmeden önce bir ülke için her konu grubu ziyaret edilir. Kararlar loglanır; şehir için ülke seçilmiş olmalıdır. Tur başına sayfa/süre sınırları, kaynak kapıları, beklemeler, günlük sınırlar, MAX_RECORDS, kaynak önbellekleri ve yineleme korumaları değişmez. İşçi boştayken beş saniyede bir kontrol eder; panel kapalı olabilir ama bilgisayar ve işçi çalışır kalmalıdır. Geçici planlama/bekleme hataları tarayıcı isteği yapmadan beş dakika bekler. Kaynak kısıtları ve duraklatılmış/başarısız sahip olunan işler elle müdahale gerektirir; kendiliğinden açılmaz veya devam ettirilmez. Durdurma gelecekteki zamanlamayı atomik olarak kapatır ve yalnız kontrolcüye ait aktif işi iptal eder; yarışan kuyruğa alma işlemleri iptal edilir ve ilgisiz elle araştırma devralınmaz. Ayar/durdurma durumu süreç yeniden başlatmasından sonra korunur. Veritabanı taşımadan önce bu modu durdur. Mod kapalı kurulur; açmak panelden ayrı bir eylemdir.

## Sınırlı HTTP yeniden deneme politikası — 2026-11-09

**2026-11-19 güncellemesi:** HTTP 429 bu politikanın dışındadır. 429 adres bazlı değil istemci bazlı bir limittir; bu yüzden aynı adres yeniden denenmez ve başka adrese geçilmez. İlk 429'da tur duraklatılır, havuz korunur, sunucu bekleme süresi bildirildiyse `retryNotBefore` olarak saklanır. Aşağıdaki üçlü deneme politikası yalnız HTTP 403 için geçerlidir.

Arka plan gece araştırması ve keşif katmanında ölçülen HTTP 403 için ilk sorunlu istek toplam üç defa denenir (ilk deneme dahil). Denemeler arasında en az 120 saniye + normal ziyaret beklemesi vardır; sunucu daha uzun Retry-After bildirirse daha uzun süre korunur. Üç deneme de başarısızsa istek atlanır. Sonraki istekte aynı HTTP kodu gelirse ek üçlü döngü yapılmaz, o istek de atlanır. Üçüncü ardışık başarısız istekte kaynak ve tur durur; otomatik kilit kaldırılmaz. Başarılı okuma yalnız kendi fazının (etiket/gönderi/profil) serisini sıfırlar.

`lib/request-recovery.ts` bu politikayı profil, creator açıklaması, etiket ve gönderi sahibi okumalarında uygular. Her tekrar normal rezervasyon üzerinden sayfa/günlük/iyileştirme bütçesinden düşer; süre ve iptal kontrolü korunur. Başarısız caption yüzünden alınmış temel profil kaybolmaz. Deneme ve hata sayacı yerel state dosyasında kalır; kesintide ilk istek tekrar sınırsız başlatılmaz.

`requestRetryAt` uygulamanın kullanıcı tarafından istenmiş iki dakikalık beklemesidir; `retryNotBefore` yalnız sunucunun bildirdiği süredir. Birbirinin yerine sunulmaz. CAPTCHA, giriş, challenge/accounts yanıtları, DOM erişim engelleri ve kimlik sorunları bu mekanizmayla atlanmaz. Ham tarayıcı tek-deneme okuyucusu ve manuel oturum kontrolü kendi anlık hata korumalarını sürdürür. Güncel erişim durumu geçmiş son hatadan ayrıdır; geçici yeniden-deneme beklemesi panelde ayrı görünür.

## Müşteri portalı — yerel önizleme

Menüde **Hesaplar** yanındaki **Müşteri portalı**, `/portal` adresini açar.
Ayrı `/api/portal` GET uç noktası kayıtlı creator kütüphanesinde ad/biyografi,
kategori/ana grup, ülke, açık cinsiyet beyanı, takipçi aralığı, hesap türü, satış
sinyali ve kanal filtresi uygular. Sonuçlar 12'şer sayfalanır; takipçiye veya
son güncellemeye göre sıralanır. Filtre URL'leri paylaşılabilir ve geri/ileri
gezinme desteklenir. Profil detayı kategori kanıtı, konum tahmini, açık biyografi
e-postaları ve satış kanallarını gösterir. Araştırma/inceleme/düzenleme işlemi yoktur.

Portal API yalnız izinli alanları döndürür; ham payload, iş/log, izin referansları,
Chromium oturumu veya iç kaynak geçmişi göndermez. Synthetic, rejected ve
suppressed kayıtlar gizlenir. Okumalar tarama başlatmaz veya veri yazmaz.
Mevcut prototip küçük kütüphaneyi sunucuda filtreler; büyük ölçek için SQL indeksli
arama/keyset sayfalama daha sonra gerekir.

Bu bir yerel müşteri deneyimi önizlemesidir; localhost erişimi korunur, site
internete açılmaz. Müşteri kimliği, tenant/rol yetkileri ve üretim dağıtımı henüz
yoktur. Yönetim menüsünün gizlenmesi bir yetkilendirme sistemi değildir; yayına
almadan önce admin ve müşteri erişim sınırları ayrıca uygulanmalıdır.

## Faz bazlı erişim ve aktif süre — 2026-11-09

Etiket, gönderi (sahip/caption) ve profil okumaları ayrı kalıcı hata sayaçları
kullanır. Başarılı etiket, gönderi 429 sayacını temizlemez. Gönderi arızası
sürerken mevcut gönderi havuzu sorgu payı tarafından engellenmeden denenir; yeni
etiket sorguları açılmaz. Üç farklı gönderide aynı HTTP hatası devreyi açar.
Elde gönderi kalmazsa tur `post_access_deferred` nedeniyle bekler; bu genel
kaynak kilidi değildir. Operatörün açık devam isteği sunucu süresini koruyarak
kısmi hata sayaçlarını sıfırlayabilir. Kendiliğinden yeni etiketle döngü başlatılmaz.

`research_activity` (PostgreSQL migration 007, SQLite otomatik şema) her çalışma
oturumunda işleme, normal/yeniden-deneme beklemesi ve ölçülemeyen boşlukları ayırır.
Saatlik hız aktif oturum süresine (işleme + zorunlu bekleme) dayanır; duraklatılmış
ve kapalı süre eklenmez. Eski turlarda ölçüm yoksa hız null/— olur. Kısmi ölçüm
eski kayıtları paya eklemez; uzun ölçüm boşluğunda hız gizlenir. Tur durum kodları
korunur, kullanıcıya `completion_label` ile kayıtlı/bütçe bitti ama kayıtsız sonuç
ayrı gösterilir.

## Zorunlu soğuma (HTTP 429 sonrası)
İlk HTTP 429'da tur duraklatılır ve zorunlu soğuma başlar: son 72 saatteki 1. olayda 24 saat, 2. olayda 48 saat, 3. ve sonraki olaylarda 72 saat. Aynı olayın bir dakika içindeki tekrar bildirimi tek sayılır. Soğuma bitmeden yeni araştırma, sürekli tarama, tur devamı, oturum kontrolü, manuel Chromium açma/gezinme ve "durdurmayı kaldır" işlemleri reddedilir; panel bitiş zamanını ve son 72 saatteki olay sayısını gösterir. Operatör "Soğumayı bilerek geçersiz kıl" düğmesiyle (onay penceresi ve API'de `confirm: true` gerekir) yalnız bu soğumayı kaldırabilir; durdurma kilidini ayrıca elle kaldırması gerekir. Sunucunun bildirdiği bekleme süresi (`retryNotBefore`) geçersiz kılınamaz. Geçersiz kılmalar durum dosyasında (`cooldownOverrides`) kayıtlıdır. 403 ve diğer kapılar bu soğumayı başlatmaz.

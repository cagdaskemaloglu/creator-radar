# Creator Radar

Proje konumu: `/Users/cagdas/creator-radar`. Diğer yapay zekalar için başlangıç: [CLAUDE.md](CLAUDE.md). Ürün özeti, mimari, durum, yol haritası ve işletim rehberi [docs/](docs/) içindedir.

Türkçe, yerel creator araştırma paneli. Program başlangıç profili veya URL istemez: araştırma alanlarından Instagram etiket havuzunu oluşturur, hesap sahiplerini doğrular, profilleri ve creator açıklamalarını sınıflandırır, kaynaklarıyla kaydeder.

## Kurulum

Node.js 22.13+ gerekir.

```sh
npm install
cp .env.example .env
npm run browser:install
npm run dev
```

[Paneli aç](http://127.0.0.1:3000). İlk **Araştırmayı başlat** tıklaması gerekirse arka plan işçisini de açar. İşçiyi servis olarak ayrı yönetmek istersen `npm run worker` kullan ve `WORKER_AUTO_START=false` ayarla. Aynı veritabanı için yalnızca bir işçi çalışır.

## Kategori ve konum hedefleme

11 ana kategori altında 68 alt alan vardır. Ana kategori ve alt kategori seçicileri paneli düzenli tutar. Fitness/vücut geliştirme, sporcu beslenmesi, güzellik/cilt/saç bakımı, moda, yemek, teknoloji, seyahat, aile, eğitim, sanat ve otomotiv kapsanır. Taksonomi `lib/taxonomy.ts` içindedir.

Ülke, isteğe bağlı şehir ve açık cinsiyet beyanı hedefleri işin ayarlarıyla birlikte saklanır. Biyografi ve toplanmış creator açıklamalarındaki açık ikamet beyanı ülke/şehir sinyali üretir; paylaşım dili ve seyahat etiketleri ikamet kanıtı değildir. Çelişen veya eksik beyanlar belirsiz kalır. Yüz, ad veya içerik türünden cinsiyet tahmini yapılmaz. `target_match` yalnızca konum/beyan hedeflerinin sonucudur; kategori kanıtları ayrıca saklanır. Belirsiz ve farklı adaylar denetlenebilmek için korunur; Hesaplar filtresinden eşleşenler seçilir. Bu sürüm 11 ülke ve sınırlı şehir sözlüğü kullanır; küresel konum çözümleyici değildir.

Sayfa seçenekleri 5/10/25/50/100/200, varsayılan 50. Eski API istemcileri 56 varsayılanını korur. Gerçek tur bütçesi günlük kalana göre küçülür; günlük sınır kendiliğinden yükselmez. Bir sayfa bir profil değildir: etiket ve gönderi ziyaretleri de sayılır. Ortalama 20 sn beklemeyle yaklaşık süreler 1,7/3,3/8,3/16,7/33,3/66,7 dakikadır; ağ, erken duruş ve havuzun tükenmesi süreyi değiştirir. Paneldeki araştırmada 16/30 profil sınırı kaldırılmıştır; toplam sayfa bütçesi ve yapılandırmadaki MAX_RECORDS üst sınırı korunur. Eski CLI işleri 30 profil sınırını korur.

## Panel

- **Araştırma:** Varsayılan Cozy Room alanıyla tek tıkla başlat. İstersen başka alanları seç. URL, başlangıç listesi, izin referansı veya dosya formu yoktur.
- Uygun, tamamlanmamış önceki havuz varsa otomatik devralınır. Aksi halde seçili alanlardan etiket sorguları üretilir. Birden fazla alan seçildiğinde sorgular dengeli dağıtılır.
- Panel varsayılanı 50 sayfadır; kayıt sınırı seçilen sayfa bütçesi ve MAX_RECORDS ayarının küçüğüdür. Belirsiz profil başına en fazla 1 ek gönderi okunur. Cozy Room planında 6 etiketten en fazla 120 bağlantı hedeflenir; bağlantı ve kayıt sayısı garanti değildir. Günlük kalan bütçe daha azsa tur bütçesi küçültülür.
- Aktif turda **Durdur** işlemi checkpoint ve yazılmış kayıtları korur. Hızlı/tekrarlanan başlatmalar ikinci aktif araştırma oluşturmaz; SQLite ve PostgreSQL'de atomik koruma vardır.
- Türkçe loglar iki saniyede bir güncellenir. Tur seçicisiyle geçmiş logları incele; **Takip et** otomatik kaydırmayı açar/kapatır. Sunucu tur başına son 200 olayı getirir.
- **Hesaplar:** Arama, kategori, takipçi aralığı ve inceleme durumu filtreleri; kategori kanıtları; kaynak bağlantıları; inceleme ve CSV dışa aktarma. Sentetik fixture kayıtları gerçek hesap listesinde gösterilmez.
- **Chromium:** Gerektiğinde manuel Instagram girişi ve görünmez oturum kontrolü. Görünür pencere yalnızca bu bölümdeki açık kullanıcı eylemiyle açılır.

## Tarayıcı ve veri sınırları

Araştırma yalnızca Playwright Chromium ve ayrı `data/chromium-research-profile` ile **headless** çalışır. Kişisel Chrome, kurulu Chrome kanalı ve eski Chrome araştırma profili reddedilir. `BROWSER_HEADLESS=false` görünür araştırma açamaz. Manuel bağlam arka plan araştırması için devralınmaz; manuel pencere kapatılınca aynı ayrı profil headless açılır. Chrome çerezleri kopyalanmaz. Oturum bilgileri yerel kalır, API/log/veritabanına taşınmaz.

Giriş kontrolü yalnızca gezinme/giriş sinyallerini okur; feed, hesap kimliği veya çerez içeriği kaydetmez. Son kontrol ve zaman `data/browser-session.json` içinde tutulur; bu kontrol araştırma başlatmaz ve sonraki erişimi garanti etmez.

CAPTCHA ve giriş engeli kaynağı hemen durdurur. Ölçülen HTTP 403/429, aşağıdaki 2026-11-09 yeniden deneme politikasına tabidir; üç ardışık başarısız istekte devre açılır. Oturum değiştirme, stealth, CAPTCHA bypass, proxy rotasyonu ve otomatik hesap oluşturma yoktur. Oturum açılması tek başına veri toplama izni sayılmaz. Arama snippet'i/etikette bulunmak kategori kanıtı değildir. Yalnızca doğrulanmış creator açıklaması ve hashtag'leri kanıt sayılır; izleyici yorumları kullanılmaz.

Tek gönderideki bağlantı kapanması/sıfırlanması hatası tekrar denenmeden atlanır. Art arda üç taşıma hatası keşfi erteler; doğrulanmış adaylar ve kuyruk korunur. Açıklama bağlantısı bozulursa alınmış temel profil mevcut kanıtla kaydedilebilir. Erişim engelleri bu atlama kuralına girmez.

Yazar çözümleme sırasında zaten okunan açıklamalar yeniden açılmadan kullanılır. Son dört saatte araştırılmış veya yazarı doğrulanamamış aynı gönderiler yeniden açılmadan atlanabilir. Tamamlanmış/iptal edilmiş turların bekleyen adayları ve gönderileri kaynak geçmişiyle atomik devredilir. Kaynak ve collection timestamp korunur; upsert ile kayıt tekilleştirilir.

Niş kategorisi, mağaza/creator metin sinyallerinden ayrı hesaplanır. Keyword puanı olasılık değildir. Yeni ve güncellenmiş kayıtlar `needs_review` durumundadır; kaynak ve kanıtlar insan incelemesine açıktır.

## Yerel çalışma ve yapılandırma

`.env`, veritabanı, profil ve `data/` Git dışında tutulur. İşçi 5 saniyede bir yerel heartbeat yazar; panel eski/yok heartbeat'i çevrimdışı gösterir. İşçi açılışında yarım gece turları checkpoint'ten kurtarılır. Bütçeler ve başlangıç zamanı sıfırlanmaz. Panel başka bir kaynağa veya depoya sessizce geçmez.

- `INSTAGRAM_DAILY_PAGES`: Varsayılan 30. Etiket, gönderi ve profil ziyaretleri ortak bütçeyi tüketir. Kullanıcı ortamında farklı ayarlanabilir. Gün 03:00 Türkiye saatinde yenilenir.
- `INSTAGRAM_WAIT_MIN_SECONDS` / `INSTAGRAM_WAIT_MAX_SECONDS`: Varsayılan 10–30 saniye bekleme. Bunlar uygulama sınırlarıdır, Instagram'ın resmî kotası veya hesap güvenliği garantisi değildir.
- `INSTAGRAM_BROWSER_ENABLED=false`: Canlı Instagram araştırmasını kapatır.
- `BROWSER_CHANNEL`: Yalnızca `chromium`. `BROWSER_PROFILE`: ayrı yerel profil.
- `BROWSER_PREFERENCES_FILE`, `BROWSER_SESSION_FILE`, `WORKER_HEARTBEAT_FILE`: Yerel durum dosyaları.
- `WORKER_AUTO_START=false`: İşçiyi ayrıca yöneten kurulumlar için panelden otomatik süreç açmayı kapatır.

Sunucu localhost ve aynı origin ile sınırlıdır. Çok kullanıcılı/uzak yayına uygun kimlik doğrulama sunmaz.

## Geliştirici araçları

Eski HTML/CSV/izinli sayfa adaptörleri backend ve testlerde korunur; panelde formları yoktur. Genel izinli sayfa adaptörü ayrı, boş bir bağlam kullanır ve `AUTHORIZED_HOSTS` listesiyle kısıtlanır; Instagram/Facebook hostları reddedilir. Instagram araştırma katmanı veri sağlayıcılarından ayrıdır. Çıkarım sözleşmesi sentetik HTML'deki `id="creator-radar" type="application/json"` script etiketidir.

```sh
npm run research:night -- --keyword cozyroom --provider instagram_tags --queries 1 --results 20 --profiles 5 --pages 20
npm run research:night -- --pool JOB_ID --profiles 5 --pages 12
npm run typecheck
npm test
npm run build
npm run test:smoke
npm run test:instagram-browser
npm run test:night-browser
npm run test:discovery-browser
npm run test:postgres
npm run test:smoke:postgres
```

Tarayıcı testleri headless çalışır; geçici veritabanı/profil ve yerel sentetik fixture kullanır. Smoke testi gerçek hesaba bağlanmadan tek tıkla başlat/durdur, URL'siz plan, canlı log, filtre, inceleme, dışa aktarma ve mobil taşma kontrolünü kapsar. Browser UI testlerinden önce `npm run build` çalıştır. Gerçek kullanıcı profilleri test ortamına taşınmaz.

## PostgreSQL / Supabase kullanımı

Varsayılan `RADAR_STORAGE=sqlite` mevcut yerel dosyayı kullanır. PostgreSQL seçmek otomatik veri taşımaz veya uzak veritabanında tablo oluşturmaz.

1. Yeni, boş bir PostgreSQL veritabanı veya Supabase projesi hazırla.
2. Supabase **Connect** panelinden **Direct connection** veya **Session pooler** URL’sini al. İşçi bağlantı boyunca advisory lock tuttuğundan **transaction pooler kullanma**. Direct/session seçenekleri [Supabase bağlantı belgesinde](https://supabase.com/docs/guides/database/connecting-to-postgres) açıklanır.
3. `.env` içine sunucu tarafı ayarları ekle. Paroladaki özel karakterleri URL encode et; URL’yi sohbet, tarayıcı kodu veya Git’e koyma.

```dotenv
RADAR_STORAGE=postgres
DATABASE_URL=postgresql://USER:ENCODED_PASSWORD@HOST:5432/postgres
DATABASE_SSL=verify-full
# Sağlayıcının özel kök sertifikası gerekiyorsa:
# DATABASE_CA_FILE=/absolute/path/to/provider-ca.pem
```

Uzak bağlantıda sertifika doğrulaması zorunludur. URL içindeki `sslmode`, `sslrootcert`, `sslcert`, `sslkey` ve `ssl` parametrelerini kaldır; TLS ayarlarını yukarıdaki değişkenlerle ver. `node-postgres` URL SSL parametreleri ile programatik TLS seçeneklerini birlikte kullanırken bunları geçersiz kılabildiği için tek ayar yolu kullanıyoruz. [Sürücü TLS belgesi](https://node-postgres.com/features/ssl).

Yerel PostgreSQL için `postgresql://USER:PASSWORD@127.0.0.1:5432/radar` ve `DATABASE_SSL=disable` kullanılabilir. Her Node.js süreci en fazla beş bağlantı açar; işçi bunlardan birini kilide ayırır. Direct veya session bağlantısıyla migration için tablo oluşturma; aktarım için identity sequence değiştirme yetkisi gerekir. RLS açık tablolara sunucu tarafından erişebilen bir rol kullan (Supabase projesinin veritabanı sahibi bağlantısı gibi). Supabase anon/publishable API anahtarı bir PostgreSQL bağlantı parolası değildir. Uygulama bu sürümde yönetim bağlantısıyla çalışır; internete açılacak çok kullanıcılı bir ürün için ayrı, sınırlı uygulama rolü ve kimlik doğrulama gerekir.

Önce migration durumuna bak, sonra uygula:

```sh
npm run db:migrate -- --check
npm run db:migrate
npm run dev
# Ayrı terminal:
npm run worker
```

Migration komutları `RADAR_STORAGE` değerinden bağımsız olarak her zaman `DATABASE_URL` hedefini kullanır. SQL dosyalarının SHA-256 özeti `radar_schema_migrations` tablosuna kaydedilir; tekrar çalıştırma etkisizdir. Uygulanmış bir dosya değişirse komut durur. Migration grubu tek transaction içinde çalışır; hata olursa tablolar ve migration kaydı birlikte geri alınır. İlk şemayı önceden elle uyguladıysan, bu sürüm otomatik baseline yapmaz; yeni boş bir hedef kullan. [PostgreSQL işlem bağlantısı](https://node-postgres.com/features/transactions).

Aktif depo `.env` içindeki `RADAR_STORAGE` ile seçilir. Uygulama PostgreSQL bağlantı hatasında SQLite’a sessizce dönmez; panelde bağlantı hatası görünür. Tarayıcı profili PostgreSQL’e taşınmaz ve yerel kalır.

### Mevcut SQLite kayıtlarını taşıma

1. Kaynak panelde bekleyen işleri bitir veya iptal et. Uygulamayı ve işçiyi durdur; taşıma sırasında kaynağa yeni iş gönderme.
2. SQLite dosyasını yedekle. `.env` içindeki `RADAR_DB` kaynağı, `DATABASE_URL` boş PostgreSQL hedefini göstermeli. Hedefe yukarıdaki migration komutunu uygula.
3. Ön kontrolü çalıştır; varsayılan kip kayıt yazmaz:

```sh
npm run db:transfer
```

Ön kontrol tablo sayılarını ve hedefin boş olduğunu doğrular. Kaynak verinin PostgreSQL kısıtlarına uygunluğunun tam kontrolü gerçek aktarım sırasında yapılır. Uygula:

```sh
npm run db:transfer -- --apply
```

Tüm creator, kaynak, metrik geçmişi, engelleme, tamamlanmış/iptal edilmiş/başarısız iş, günlük, gece turu/aday/gönderi ve keşif sorgusu/sonucu kayıtları özgün kimlikleri ve zamanlarıyla aktarılır. Kaynak salt okunur açılır. Eski SQLite dosyasının yeni araştırma tablolarını içermesi için önce güncel uygulamayı veya işçiyi bir kez açıp kapat. Hedef doluysa veya kaynakta bekleyen/çalışan/duraklatılmış iş varsa komut durur. Her iki depoda işçi kilidi tutulur; hedef tablolar aktarım boyunca kilitlenir. Hedef yazımları tek transaction içindedir; JSON, FK veya başka bir hata olduğunda tüm hedef yazımları geri alınır. Identity sequence değerleri de transaction içinde yeniden başlatılır. Kaynak değiştirilmez.

Aktarım sonrası `.env` içinde `RADAR_STORAGE=postgres` seç, uygulama ve işçiyi yeniden başlat. Aktarılmış kayıtlar üzerinde normal güncelleme/tekilleştirme çalışır. SQLite’a dönüş `RADAR_STORAGE=sqlite` ile mümkündür; PostgreSQL’de sonradan yapılan değişiklikler eski SQLite dosyasına geri kopyalanmaz. Çift yönlü senkronizasyon yoktur.


### Ziyaret beklemesi
Instagram ziyaretlerinden önce 10–30 saniye arasında tam saniyeli rastgele beklenir. `INSTAGRAM_WAIT_MIN_SECONDS` ve `INSTAGRAM_WAIT_MAX_SECONDS` ayarlarıyla yönetilir. Bu süre sayfanın yüklenmesinden ayrıdır; tahmini ortalama sayfa başına 20 saniye + yükleme süresidir. Eski `INSTAGRAM_INTERVAL_SECONDS` ayarı yalnızca yeni sınırlar tanımlanmamışsa sabit bekleme için korunur. Google bekleme politikası değişmez. İptal ve erişim engelleri beklemeyi kesebilir.

### İçerik dilinden ülke tahmini
Açık ikamet beyanı yoksa toplanmış biyografi ve creator açıklamalarındaki dil sinyalleri değerlendirilir. İlk sözlük TR/EN/DE/FR/ES/PT/IT/NL dillerini kapsar. Türkçe içerik için Türkiye düşük güvenli ülke tahmini olarak saklanır (`location_status=language_estimate`). Çok ülkeli dillerde tek ülke seçilmez, olası ülkeler saklanır. Az veya karışık metin, tek başına hashtag ve arama hedefi ülke atamaz. Açık konum beyanları tahmini geçersiz kılar, çelişen beyanlar korunur. Tahmini ülke hedefi `estimated`, açık beyan hedefi `matched` olarak ayrılır; CSV konum yöntemi, dil ve aday ülkeleri içerir. Şehir ve cinsiyet dilden tahmin edilmez.

### Biyografideki iletişim e-postaları
Biyografide açık metin olarak bulunan geçerli e-posta adresleri `contact_emails` içinde tekilleştirilerek saklanır. Her adres kaynak profil URL'si, sağlayıcı, metin alıntısı, ilk/son görülme zamanı ve güncel biyografide bulunma durumu taşır. Metinden adres tahmin edilmez, yorumlar taranmaz, e-posta gönderimi veya teslim edilebilirlik kontrolü yapılmaz. Yeni alınan biyografide kaldırılan adres tarihsel olarak korunur ve güncel dışa aktarımdan çıkar. Biyografinin alınamaması eski adresi silmez. Hesap tablosu, detay, e-posta filtresi ve CSV güncel adresleri destekler. Mevcut biyografilerin yeniden değerlendirilmesi kaynak ve toplama zamanlarını değiştirmez.

### Verimli araştırma akışı
Panelin yeni işleri `efficientResearch=true` ayarıyla kaydedilir. Tek bir iş içinde keşif ve kayıt dönüşümlü sürer: önce bir etiket, ardından en fazla 5 adaylık çözümleme grubu, bulunan profillerin kaydı ve sonraki grup. Doğrudan profil bağlantısı bulunduğunda kayıt işine öncelik verilir. Toplam sayfa, süre, günlük ziyaret, MAX_RECORDS ve 200 adaylık havuz sınırları korunur. Bu akış yeni iş oluşturup bütçeyi sıfırlamaz. Kuyruk tükenirse erken tamamlanır.

Bir etikette ilk beş gönderi ziyareti hesap sahibi doğrulayamıyorsa diğer bekleyen etiketler denenir; kalan gönderiler silinmez. Yakın geçmişteki kayıt oranıyla etiketler sıralanır; denenmemiş etiketler de araştırılır. Instagram’da aynı etikete açılan farklı yazımlar (ör. home decor / homedecor) yeni sorgularda ve verim hesabında tekilleştirilir. Verim son 200 tamamlanmış/iptal edilmiş sorgudan hesaplanır: benzersiz yeni kayıt / etiket + gönderi sahibi + profil ziyareti. Aynı aday aynı etikette bir kez sayılır. Farklı etiketler aynı kayda kaynak olabilir; tablo satırları toplanarak toplam kayıt hesaplanmamalıdır. Bu oran ülke/cinsiyet veya ticari uygunluk doğrulaması değildir.

Son 4 saatte güncellenmiş profiller arka plan araştırmasında tekrar açılmaz. Bilinen gönderi sahipleri ve atfedilmiş açıklamalar 4 saatlik önbellekten kullanılabilir. Açık profil güncellemesi isteyen eski CLI işleri bu atlama modunu kullanmaz. Eski/çalışan işlerin kaydedilmiş ayarları değiştirilmez. Kesinti sonrasında tamamlanan kayıtlar ve tüketilmiş bütçe korunur. Üç ardışık taşıma hatası, CAPTCHA, 403/429 ve giriş engeli kontrolleri devam eder; sağlayıcı/profil değiştirilmez.

Panelde yeni hesap/saat tur ortalaması, ziyaret/kayıt ve ziyaret edilmeden atlanan profil sayıları gösterilir. Etiket verimi tablosu ayrıntı olarak açılabilir. Bu sürüm için gerçek canlı kapasite artışı ayrıca ölçülmelidir; fixture testindeki kayıt sayısı gerçek saatlik kapasite değildir.

### Günlük toplam ziyaret sınırı
Bu çalışma ortamında `INSTAGRAM_DAILY_PAGES=0` günlük üst sınırı kapatır; API `dailyPages:null`, panel “Sınırsız” gösterir. Ziyaret sayacı istatistik için çalışmaya devam eder. Pozitif değerle günlük sınır yeniden açılabilir. Değişken tanımlanmamış eski kurulumlarda 30 varsayılanı korunur. Tur başına sayfa, süre, kayıt, bekleme ve erişim engeli kontrolleri değişmez. Google kaynağının bağımsız politikası değişmez.

### Havuz tükenmesi ve tekil profil okuma hataları
Verimli araştırmada kuyruk ve bekleyen sorgular tükendiğinde aynı alanla ilgili önceden tanımlanmış etiketler denenir. Her genişletmede en fazla 2 etiket açılır; sabit toplam 6 etiket sınırı kaldırılmıştır. Mevcut bütçeye sığan, önceden tanımlanmış ilişkili terimler sırayla denenir. En az 3 sayfa bütçesi kalmalıdır; sayfa/süre/ziyaret sayaçları sıfırlanmaz. Yeni sorgular normal keşif tablosuna yazılır; yeniden başlatmada aynı etiket tekrarlanmaz. Bütçe veya ilgili terimler/yeni bağlantılar tükenince tur açıklayıcı nedenle tamamlanır; sınırsız hesap garantisi değildir.

Açık “No posts yet / sonuç bulunamadı” sayfası normal boş sonuçtur. Giriş/CAPTCHA/HTTP kontrolleri önce uygulanır; tanınmayan etiket sayfası yine duraklatılır. Profilde başlık veya ana içerik okunamıyorsa sınırlı yüklenme beklemesinden sonra yalnız o profil atlanır. Art arda üç profil bu nedenle okunamazsa tur duraklatılır. Kimlik/canonical URL uyuşmazlığı, giriş, CAPTCHA, 403/429 ve diğer erişim engelleri atlama kapsamına girmez.

Eski sürümün yalnızca “Recognized public profile title and main content not found” nedeniyle duraklattığı turda panelde “Sorunlu profili atla ve devam et” kullanılabilir. İşlem sadece son hatalı adayı atlar ve bu eski tekil nedene ait kaynak kilidini kaldırır; daha yeni/farklı erişim engelini kaldıramaz. İlk başlama zamanı ve tüketilen bütçe korunur. Turun süresi dolmuşsa yeniden başlatılan iş süre sınırında tamamlanır; yeni tur ayrı başlatılmalıdır.

### Etiket sayfalarında kontrollü kaydırma
Panelin verimli araştırma modu, ilk bağlantılarla yetinmez: görünür etiket sayfasını veya iç kaydırma alanını ilerleterek yeni gönderi bağlantıları toplar. Gizli API/JSON kullanılmaz. Her ek yükleme öncesinde normal 10–30 saniye bekleme, iptal, süre, kaynak ve bütçe kontrolleri uygulanır; yükleme denemesi 1 ziyaret tüketir. Diğer etiketler ve hesap kaydı için bütçe payı bırakılır. Sorgu başına hedef 20 yeni bağlantıdır; son dört saatte işlenmiş bağlantılar bu hedefi doldurmaz.

Bağlantılar her görünür grupta ayrı işlemle kalıcı yazılır. Kesinti/erişim engelinden önce alınan gruplar kaybolmaz; yeniden başlatma mevcut sonuçları tekilleştirir. Kaydırmalar yeniden deneme sayısını artırmaz; harcanan ziyaretler ve etiket verimi hesabına dahil edilir. Kaydırma ölçümü `Tag scroll reserved: query=...` loglarıyla atomik tutulur.

İki yükleme denemesinde DOM'da yeni gönderi bağlantısı gelmezse o etiketin yüklenmesi durur. Bilinen eski bağlantılardan ilerlenebilir; ancak bütçe payı aşılmaz. Sonraki etiket ve ilişkili terimler işlenir; hepsinde yeni bağlantı kalmazsa tur `no_new_links` nedeniyle biter. Sayfa bütçesi üst sınırdır, yeni hesap sayısı veya mutlaka tamamı tüketilecek bir hedef değildir. Yerel test: `npm run test:tag-browser`.

### Türkiye odaklı keşif ve ülke sonuçları
Türkiye seçilen yeni panel araştırmalarında kategoriye uygun Türkçe terimler önce denenir. Gaming için ilk terimler `oyun`, `oyuncu`, `yayıncı`, `oyuninceleme` olur; genel `gaming` ve `gamer` daha sonra gelir. Üst kategoriler alt alanlardan dönüşümlü Türkçe terim alır. Genel etiketlerin geçmiş verimi yerel önceliği değiştirmez; ilişkili Türkçe genişletmeler de önceliklidir.

İlk geçişte etiket başına toplam bütçenin sorgu sayısına bölünmesiyle pay ayrılır (en az 3 ziyaret). Etiket açılışı, kaydırma, sahip çözümleme ve profil ziyareti bu paya dahildir. Diğer etiketler denenene kadar fazla gönderiler bekletilir; ilk geçişten sonra kalan bütçe yeniden kullanılabilir. Turun toplam sayfa ve süre sınırları her zaman geçerlidir. Eski işlerin kaydedilmiş arama planları değiştirilmez.

Dil tespiti v2 Türkçe oyun/yayın/abone/izleyici gibi farklı kelime ailelerini, Türkçe karakterli ve ASCII yazımlarıyla değerlendirir. Tekrarlanan aynı kelime ailesi güveni şişirmez. Platform adları, tek başına hashtag veya seçilen ülke Türkiye atamak için yeterli değildir. Türkçe dil tahmini Türkiye'de ikamet kanıtı değildir ve düşük güvenli kalır.

Hesaplar ve Türkiye hedefli tur özeti dört grubu ayırır: **Türkiye eşleşmesi** (açık konum beyanı), **Türkiye tahmini** (dilden, düşük güven), **ülkesi belirlenemeyen**, **diğer ülkeler**. Hesaplarda gruplar filtrelenebilir; CSV ülke eşleşmesini ve Türkiye grubunu içerir. Ülke sonucu cinsiyet/şehir bilgisinin eksik olmasından bağımsızdır. Kaynak ve toplama zamanları yeniden değerlendirmede korunur.

### Kalıcı ve öğrenen keşif havuzu
Yeni panel işleri sorgu havuzunu kategori, ülke, şehir ve beyan filtresine göre ayrı saklar. `discovery_frontier` terimin kaynağını ve kanıtını, `discovery_observations` sorgu başına ziyaret/yeni kayıt/hedef uyumu sonuçlarını tutar. PostgreSQL için `004_discovery_frontier.sql` uygulanmalıdır; SQLite tabloları açılışta ekler. SQLite→PostgreSQL aktarımı bu tabloları da içerir.

Başlangıç sözlüğü Türkçe ve genel kategori terimlerini, ilgili alt alanları ve Gaming için oyun/platform terimlerini kapsar. Yerel terimler önceliklidir. Aynı kapsam içinde sıralama `(2 × hedefe uyan yeni kayıt + tüm yeni kayıt + 1) / (ziyaret + 3)` puanını kullanır; her beş seçimde denenmemiş sorguya bir keşif fırsatı verilir. İlk ayarlarda hiç yeni kayıt getirmeyen terimler 6 saat, kayıt getirenler 1 saat dinlendirilir. Bunlar keşif tekrarını azaltma ayarlarıdır; erişim engelinden kaçınma yöntemi değildir. Bekleyen profiller ve gönderiler sonraki tura taşınır. Mevcut çalışan işler kayıtlı planlarını korur.

Havuz genişlemesinde ve sonraki tur başlangıcında, zaten toplanmış ve sahibine atfedilmiş açıklamalardan yeni etiketler önerilir. Aynı kategori ve hedef konuma uyan en az iki farklı creator kanıtı gerekir. Tek creator, izleyici yorumu, arama snippet'i, genel viral/çekiliş/etkileşim etiketleri ve başka kategoriyle eşleşen terimler öğrenme kaynağı değildir. Gözlenen terimler başlangıçta en fazla seçilen sorguların %20'sine ayrılır; beşten küçük gruplarda denenmez. Bu kural sayfa maliyetini veya içerik ilgisini garanti etmez. Genel saatlik kapasite canlı turlarla ayrıca ölçülmelidir.

Panel tur özetinde toplam/denenmemiş/öğrenilmiş/dinlenen sorgu sayıları gösterilir. Sistem bütçe, süre, iptal, günlük politika ve CAPTCHA/403/429 kontrollerini korur. Kişisel Chrome kullanılmaz; arka plan araştırması ayrı, başsız Chromium profilindedir.

### Gönderi sahibi teşhisi
Başarısız çözümlemeler `owner_link_missing`, `multiple_owner_candidates`, `post_identity_mismatch`, `page_not_loaded` olarak saklanır; log ve tur ayrıntısı bunları ayrı gösterir. Eski `public_author_unavailable` kayıtlarına sonradan neden uydurulmaz ve eski başarısızlık önbelleği yeni okuyucuyu engellemez. Erişim/CAPTCHA hataları bu gruplara gizlenmez, kaynağı duraklatır.

Instagram aynı gönderi kodunu `/p/` ve `/reel/` yollarından sunabilir. URL ve canonical kimlikleri gönderi koduyla karşılaştırılır; farklı kod, çelişen sahip veya sadece yorumcu bağlantısı kabul edilmez. Görünür bağlantılar incelenir; 100 bağlantı sınırı 1000'e yükseltilmiştir. Üç operatör izinli gerçek sayfanın küçültülmüş/anonim yapısı `fixtures/instagram-post-routes.json` içinde regresyon örneğidir. `scripts/inspect-owner-samples.ts --live` en fazla üç eski başarısız gönderiyi ayrı başsız profilde inceler, normal bekleme/erişim kontrollerini uygular ve yalnızca yerel yapısal teşhis dosyaları yazar. Gerçek sayfalardaki üç örneğin düzelmesi genel başarı oranı değildir.

### Tekil etiket okuma hatalarında devam
Başsız tarayıcı, kaynak erişim kontrollerinden sonra bir etiketi okuyamazsa `tag_layout_unreadable`, bağlantı veya sınırlı gezinme süresi hatasında `tag_load_failed` üretir. Yalnız bu iki türde sorgu `skipped` olarak kaydedilir; aynı turda tekrar denenmez. Önceden bulunan bağlantılar ve ayrılan bütçe korunur, kalan gönderiler ve etiketler işlenir. Boş sonuç yalnızca sayfada açık boş sonuç mesajı varsa `empty_results` olarak kaydedilir; HTTP 404 `tag_unavailable` olur. Bilinmeyen hatalar sessizce atlanmaz.

Üç ardışık etiket okuma/yükleme hatası turu `consecutive_tag_read_errors` nedeniyle duraklatır. Açık boş veya başarılı sorgu bu diziyi keser. CAPTCHA, giriş ve ölçülmemiş erişim kısıtları tek seferde kaynağı durdurur; ölçülen 403/429 için sınırlı yeniden deneme politikası uygulanır. Atlanan sorguların gerçek maliyeti kalıcı havuzun verim/dinlenme hesabına dahildir. İptal ve zaman/bütçe sınırları korunur.

Panel atlanan/boş etiketleri nedenleriyle listeler. Önceki sürümde yalnızca tam olarak bilinen “Tag result links unavailable after bounded render wait” hatasında durmuş tur için **Sorunlu etiketi atla ve devam et** sunulur. Bu açık kullanıcı işlemi yalnız ilgili etiketi atlar; daha yeni veya farklı bir kaynak engelini kaldırmaz. Kaydedilen hesaplar, bekleyen bağlantılar, başlangıç zamanı ve harcanan ziyaretler değişmez. Süresi dolmuş bir tur devam ettirildiğinde mevcut süre sınırında sonlanır.

### Hedefe uygunluk ve seçici inceleme
Sınıflandırma v3 kategori bulunmasını (`primary_niche`) istenen kategoriye uyumdan (`category_match`) ayırır. `research_match`, kategori ve konum/beyan filtrelerini birlikte değerlendirir: açık kanıtla uyum, düşük güvenli ülke tahminiyle uyum, belirsiz veya hedef dışı. İstenen kategori için en az 6 ağırlıklı kanıt puanı gerekir; tek bir zayıf hashtag yeterli olmaz. Bu eşik, doğrulanmış ticari uygunluk olasılığı değildir.

Gaming için genel `oyun/oyuncu` sözcükleri tek başına kanıt sayılmaz. Oyuncak, Montessori, çocuk etkinliği ve oyunculuk bağlamı video oyunu bağlamından ayrılır; somut oyun/platform kanıtı varsa çok kategorili hesaplar yine Gaming olabilir. Sadece `gaming` sözcüğü artık Cozy Room sınıflandırması üretmez. Genel sözcüğün neden Gaming sayılmadığı hesap detayında açıklanır.

Tur raporu artık **tüm yeni hesap/saat**, **hedefe açık kanıtla uyan yeni hesap/saat** ve **hedefe tahminen uyan yeni hesap/saat** değerlerini ayrı gösterir. Güncellenen hesaplar yeni hesap sayısına eklenmez. Kategorisiz, hedefi belirsiz ve hedef dışı sonuçlar ayrı tutulur. Yeni tamamlanan adaylarda son ham profil/açıklama kanıtı tur kaydında saklanır; sonraki profil güncellemesi geçmiş turun kanıtını değiştirmez. Eski turlarda mevcut aday checkpoint'i ve gönderi kanıtı kullanılır; checkpoint bulunmayan eski kayıtlar mevcut profil verisine dayanır. Raporlar güncel sınıflandırma kurallarıyla yeniden değerlendirilir. Sınıflandırma yenilemesi kaynakları, toplama zamanlarını ve inceleme durumunu değiştirmez.

Yeni panel işleri `selectiveReview=true` kullanır. Belirsiz veya zayıf kanıtlarda en fazla 3 sahipliği doğrulanmış açıklama alınabilir; yeterli kanıt veya açık hedef dışı kararında durulur. Açıklama okumaları toplam tur bütçesinin %20'sini aşmaz ve sonraki profil ziyareti için en az bir sayfa bırakılır. Normal bütçe, süre, kaynak erişimi, iptal ve tekrar sınırları geçerlidir. `maxPosts=0` olan işlerde ek okuma yapılmaz. Eski çalışan işlerin kayıtlı ayarları değiştirilmez.

Kalıcı havuz seçiminde her beşinci yere tüm öncelik gruplarını aşabilen bir keşif fırsatı ayrılır; uygun öğrenilmiş yeni terimler burada denenir. Öğrenilmiş terimlerin sayısı istenen seçim kapasitesinin en fazla %20'sidir. İkili genişletmeler bu payı turun toplam sorgu sayısına göre hesaplar. Türkçe terimler diğer yerlerde önceliklidir. Yeni turun planlı sorguları, önceki turdan devralınan bekleyen sorgulardan önce çalışır. Havuz özeti öğrenilen terimlerin kaçının denendiğini ve kaçının beklediğini gösterir. Sorgu verim puanı hedefe uyan yeni kayıtları ağırlıklandırır; çok sayıda hedef dışı kayıt artık yüksek puanı tek başına sağlayamaz.

Önceki kurallardan öğrenilmiş terimler de yeni kategori/hedef kanıtıyla yeniden değerlendirilir. En az iki uygun creator tarafından artık desteklenmeyen gözlenen terimler silinmeden beklemeye alınır (`evidence.eligible=false`); yeni sorgu olarak seçilmez. Kanıt tekrar yeterli hale gelirse yeniden etkinleşebilir. Kaynak geçmişi ve önceki ölçümler korunur. Panel bu terimleri kanıtı yetersiz öğrenilmiş sorgular olarak ayrıca sayar.

### Desk Setup ve gönderi adresi dayanıklılığı
Sınıflandırma v4 çalışma/bilgisayar masası, monitör/klavye kurulumu ve Türkçe/ASCII yazımlarını tanır. Yemek masası, sofra, vazo veya genel masa dekorasyonu tek başına Desk Setup kanıtı değildir. Donanımla birlikte açık masa/kurulum bağlamı aranır. Türkçe keşif çalışma masası, bilgisayar masası, oyun masası ve masa kurulumu terimleriyle başlar; geniş masa dekorasyonu terimleri yeni planlardan çıkarılmıştır. Önceki hazır terimler kaynak geçmişi silinmeden devre dışı bırakılır, tekrar plana eklenirlerse yeniden etkinleştirilebilir.

Gönderi URL doğrulaması `InstagramPostRouteError` ile diğer hatalardan ayrılır. Desteklenmeyen bir gönderi, yalnız ilgili açıklama/keşif sonucunda `unsupported_post_route` olarak atlanır; diğer gönderiler ve profil kaydı devam eder. Geçerli bir istekten farklı gönderiye veya desteklenmeyen sayfaya yönlenme açıklamayı yanlış profile bağlamaz. Gizli parametreler veya farklı alan adları kabul edilmez. Giriş, CAPTCHA ve 403/429 kontrolleri bu atlamadan önce uygulanır ve kaynağı yine durdurur.

### Belirsizlik nedenleri ve ek inceleme katkısı
Hesap ve tur raporu kategori, ülke, şehir ve istenen beyan eksikliğini ayrı sayar. Biyografi/açıklama eksikleri ayrıca kapsam bilgisi olarak gösterilir; tek başına hedef dışı kararı değildir. Aynı hesap birden fazla neden taşıyabilir; bu sayılar benzersiz hesap sayısı gibi toplanmamalıdır.

Yeni seçici inceleme kayıtlarında `review_assessment`, ek ziyaret öncesi ve sonrası araştırma uyumunu, gerçekten ayrılan ziyaretleri, yeni açıklama sayısını ve durma nedenini saklar. Önceden sahip çözümlemesinde alınmış açıklamalar başlangıç kanıtıdır; ek inceleme kazancı sayılmaz. Belirsizden açık uyum/tahmini uyum/hedef dışına geçiş belirsizliği çözme olarak ölçülür; yalnız ilk ikisine geçiş ek hedefe uygun hesap olarak ayrıca sayılır. Bütçe nedeniyle ertelenme, gönderi bulunamaması, açıklama/sahiplik doğrulanamaması ve kaynak engeli ayrılır. Ölçüm eski turlara uydurulmaz; panel kaç hesap için bu ölçümün bulunduğunu gösterir. Ziyaret rezervasyonları ve sonuçlar kuyrukla birlikte kalıcıdır.

### Keşif ve iyileştirme kuyruğu
Yeni panelde çalışma biçimi seçilir: yeni hesap keşfi, %25 veya %50 iyileştirme payı, ya da yalnız mevcut belirsiz hesaplar. Profil URL'si istenmez; uygun kayıtlar veritabanından seçilir. İstenen kategori/ülke/beyan hedefi dışında kalanlar, bastırılmış veya sentetik hesaplar seçilmez. İyileştirme ziyaretleri `candidate_work` ve atomik ziyaret loglarıyla ayrı izlenir; profil ve açıklama ziyaretleri aynı iyileştirme üst sınırını tüketir. Ayrılan pay bitince kayıt korunur ve diğer keşif işleri devam eder. Boş kalan pay keşifte kullanılabilir; toplam tur bütçesi artmaz. Aynı hesaba otomatik iyileştirme aralığı `ENRICHMENT_COOLDOWN_HOURS` ile belirlenir (varsayılan 4 saat). Bu aralık kaynak erişim kısıtını kaldırmaz. Mevcut çalışan işlerin planı otomatik değiştirilmez.

### Erişim geçmişi ve yarım kalan işler
Oturum bölümü son kaynak kısıtını ve oturum kontrol zamanını ayrı gösterir. Gün veya bekleme süresi değişmesi açılmış kaynak kilidini kaldırmaz; sınırlı HTTP yeniden denemesi kilit açılmadan önceki ayrı aşamadır. Her turda kalan sayfa bütçesi, süre sonu ve taşınabilir iş sayısı gösterilir. Süresi veya sayfa bütçesi biten tur aynı bütçeyle devam ettirilmez. Açık **Kalan havuzla yeni tur** işlemi hedef, izin ve keşif ayarlarını devralır; yeni turun bütçesini ayrıca açar. Eski turun zamanı ve harcaması korunur. Eski turu kapatma ile yeni işi oluşturma tek işlemde yapılır; eşzamanlı istekler ikinci tur oluşturamaz. Kaynak kilitliyken taşıma veya devam engellenir. İptal edilen yeni iş, henüz devralınmamış eski havuzu silmez.

### Manuel kategori doğruluğu örneklemi
Hesap detayında doğru kategori, yanlış kategori (beklenen kategoriyle) ve yetersiz kanıt etiketleri eklenebilir. `creator_evaluations` tahmini, beklenen kategoriyi, sınıflandırma sürümünü ve zamanı değiştirilemeyen yeni satırlar olarak saklar. Görülen kategori işlem sırasında değişmişse yeniden değerlendirme istenir. Güncel sürümde hesap başına son değerlendirme sayılır; tekrar etiketlemek örneklem sayısını şişirmez. Gösterilen oran doğru / (doğru + yanlış) şeklindedir; yetersiz kanıt paydadan ayrılır. Bu örneklem oranı veritabanının genel doğruluğu değildir. İnsan etiketleri otomatik tahmini sessizce değiştirmez.

### Hedef verimine göre ilk tarama payları
Kapsam içindeki sorgu verim puanı ilk geçişte 0,5–2 arasında ağırlığa çevrilir. Yeni sorgular başlangıç ağırlığını ve keşif fırsatını korur. Üç kayıt üretip hiçbir hedef uyumu/tahmini uyum sağlamayan sorguya diğer sorgular denenirken en az pay ayrılır. Pay hesabından gerçek iyileştirme ziyaretleri düşülür. Sayfa, süre, kaynak, iptal ve sonraki profil ziyareti rezervleri her durumda üst sınırdır; etiket payları toplam kayıt garantisi değildir. Bekleyen bağlantılar silinmez; ilk geçiş sonrasında kalan bütçe kullanılabilir.

PostgreSQL kurulumları `005_research_operations.sql` geçişini uygulamalıdır; yerel SQLite tabloları açılışta eklenir. SQLite→PostgreSQL aktarımı çalışma türü ve değerlendirme geçmişini de içerir.

### HTTP kısıtının kanıtı ve sunucu beklemesi
403/429 yanıtlarında yalnız güvenli istek adresi, ziyaret edilen sayfa, yöntem, kaynak türü, ana istek olup olmadığı, ölçüm zamanı ve geçerli `Retry-After` bilgisi saklanır. Kullanıcı bilgisi, sorgu parametreleri, fragment, gizli/değişken alt kaynak yolu bölümleri temizlenir; çerez, Authorization başlığı, istek gövdesi veya yanıt içeriği bu teşhiste kaydedilmez. Ayrıntı yerel kaynak durumunda ve `Instagram restriction detail` logunda bulunur. Ana belge ile görsel/veri isteği ayrılır; alt kaynaktaki kısıt da mevcut okuma denemesini keser ve araştırma katmanındaki sınırlı yeniden deneme/devre politikasına iletilir, sessizce yok sayılmaz. Kısıtlı araştırma sekmesi kapatılır; oturum profili silinmez.

`Retry-After` saniye veya standart HTTP tarihi olarak okunur. Bilinmeyen/geçersiz değerden süre üretilmez. Bir sayfada birden çok kısıt görülürse daha uzun bildirilen bekleme korunur. `retryNotBefore` süreç yeniden başlatıldığında ve gün değiştiğinde korunur. Süre dolmadan devam, manuel tarayıcı açma/gezinme ve oturum kontrolü uygulama üzerinden gönderilmez; API ve işçi katmanları ayrı kontrol eder. Sürenin dolması açılmış kilidi kendiliğinden kaldırmaz. Devre açılmadan önce aktif araştırmanın sınırlı yeniden deneme politikası bu süreyi alt sınır olarak kullanır. Süre bildirilmemişse bitiş zamanının bilinmediği gösterilir; rastgele bir "güvenli" bekleme tahmin edilmez.

Oturum kontrolü yalnız ana sayfadaki giriş sinyallerini doğrular (`session_only`). Başarılı giriş, araştırma erişiminin açık olduğunu kanıtlamaz ve mevcut kısıtı kaldırmaz. Aynı ana sayfada giriş açıkken alt istekte 429 görülebilir; iki durum ayrı raporlanır. Araştırma erişimi durumları: sunucu beklemesi, kısıtlı, yerel durdurma kaldırıldı fakat yeniden doğrulanmadı, son araştırma sayfası açıldı veya henüz ölçülmedi. Son sayfanın açılması tüm uç noktaların erişilebilir olduğunu garanti etmez. Eski olayların ölçülmemiş istek ayrıntıları sonradan uydurulmaz.

Aynı gönderinin `/p/<kod>/` ve `/reel/<kod>/` adresleri keşifte tekilleştirilir ve doğrulanmış sahip/açıklama önbelleğini paylaşır. İlk kaynak adresi korunur; dört saatlik güncellik ve kimlik doğrulama sınırları değişmez. Böylece rota takma adları ikinci bir sahip veya profil ziyaretini gerektirmez. Sentetik tarayıcı testi: `npm run test:http-browser` (tüm trafik yerel fixture ile karşılanır).

Automatic efficient research now yields discovery after one verified pending creator,
processes and commits that creator, then continues discovering. A later source
restriction leaves completed records durable and pending discovery available for
explicit resume. This does not bypass source restrictions or reset visit budgets.

Efficient discovery is now new-creator-only: existing creator URLs are skipped
before profile visits, even after the recent-profile cooldown. Explicit enrichment
candidates remain eligible under their separate allocation. Viable pending post
work is drained before another tag query; poor tags and exhausted query shares
still yield to fresh queries so the backlog cannot stall exploration.

Evidence classification v4.2 recognizes explicit cozy-home hashtags and Turkish
interior-design terms without treating general interiors as Cozy Room. Explicit
Netherlands residence and biography location-pin country labels are recognized;
ambiguous English content still cannot select a country. Scoped query ordering
uses target-qualified new-profile yield within locality tiers. Yield evaluation
uses finalized evidence and excludes updates. Known post-owner aliases already
stored as creators are skipped without owner/profile visits. Existing attributed
captions are assessed before scheduling selective review.

Classification v4.3 adds a local second pass for missing/weak keyword categories.
It uses independent concept families in collected biography/display-name/caption
text, with category-specific anchors, Turkish suffix handling and gaming-context
exclusions. Names alone, usernames, selected topics, search snippets and discovery
hashtags never constitute evidence. The layer records its method, candidate
categories, matched excerpts/source URLs and zero external requests. It is an
explainable rule-based fallback, not an LLM or an embedding model; the fit score
is not calibrated confidence. Strong first-pass categories remain intact; country
and account type are evaluated separately. Weak inputs remain uncertain. Saved
classification refresh does not change manual validation or create metrics/sources.

Public commerce signals are independent of content categories and residence.
Profiles retain sanitized visible outbound header links (Instagram redirect URLs
are decoded locally; no external site or link aggregator is crawled). Biography
and attributed captions produce sales evidence, source URLs, and channels:
Shopier, Trendyol, Hepsiburada, Etsy, Amazon, WhatsApp, DM and candidate sales sites.
Query strings/credentials are excluded from outbound stored links. Explicit sales
signals, linked channels without proven direct selling, and unknown are separate;
affiliate/promotion text alone does not establish direct selling. Site/account
ownership and transactions are unverified. A channel mention alone is insufficient.
The Accounts panel combines sales/channel filters with category and country,
shows supporting evidence in details, and exports sales status/channels/URLs in
CSV. Existing records can be recomputed locally from stored biography/captions;
previously uncollected outbound links are not invented.

Continuous scan: enable “Otomatik tara” to keep creating bounded research rounds
until explicitly stopped. The singleton controller/config/cycle/current owned job
are persisted in the database (PostgreSQL migration 006). Selected topics/country
remain fixed; missing topics rotate taxonomy groups, and missing country rotates
the supported countries. With both automatic, every topic group is visited for a
country before moving to the next country. Decisions are logged; city requires a
selected country. Per-round page/time limits, source gates, waits, daily limits,
MAX_RECORDS, source caches and duplicate guards remain unchanged. The worker
checks every five seconds while idle; the dashboard may be closed but the machine
and worker must keep running. Transient planning/cooldown failures wait five
minutes without browser requests. Source restrictions and paused/failed owned jobs
require manual action and are never auto-unlocked or auto-resumed. Stop disables
future scheduling atomically and cancels only the controller-owned active job;
enqueue races are cancelled, and unrelated manual research is not taken over.
Configuration/stop state survive process restart. Stop this mode before database
transfer. The mode is installed disabled; enabling it is a separate panel action.

## Sınırlı HTTP yeniden deneme politikası — 2026-11-09

Arka plan gece araştırması ve keşif katmanında ölçülen HTTP 403/429 için ilk sorunlu istek toplam üç defa denenir (ilk deneme dahil). Denemeler arasında en az 120 saniye + normal ziyaret beklemesi vardır; sunucu daha uzun Retry-After bildirirse daha uzun süre korunur. Üç deneme de başarısızsa istek atlanır. Sonraki istekte aynı HTTP kodu gelirse ek üçlü döngü yapılmaz, o istek de atlanır. Üçüncü ardışık başarısız istekte kaynak ve tur durur; otomatik kilit kaldırılmaz. Başarılı okuma yalnız kendi fazının (etiket/gönderi/profil) serisini sıfırlar.

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

## 2026-11-10 — Sürekli taramada teknik toparlanma
Yalnız sürekli taramanın sahip olduğu turlarda, ardışık ağ/profil düzeni/etiket okuma hatalarında kontrollü devam vardır. İlk toparlanma 2 dakika, ikinci 5 dakika sonra; tur başına en fazla iki kez. Aynı iş/kuyruk, başlangıç zamanı ve sayfa bütçesi korunur. Tükenen süre/bütçede eski tur kapatılıp yeni tura geçilir; bekleyen havuz devam mekanizmasına bırakılır. Kullanıcı durdurması ve eşzamanlı başka araştırma önceliklidir.

`research_quarantine` (PostgreSQL migration 008) teknik sorunlu profil/gönderi/etiket adreslerini ağ hatasında 30 dakika, düzen okunamamasında 2 saat ayırır. Gönderinin /p/ ve /reel/ biçimleri aynı kimliğe bağlanır. Süresi dolmuş adres sonraki keşifte yeniden değerlendirilebilir; eski turdaki skipped kayıtlar kendiliğinden pending yapılmaz. Diğer adaylar ziyaret edilip kaydedilebilir. Panel toparlanma nedenini, planlanan devam saatini ve etkin geçici adres sayısını gösterir.

403/429 kaynak kilidi, sunucu bekleme süresi, CAPTCHA, giriş gereksinimi, kimlik çelişkisi, `post_access_deferred` ve tanınmayan hatalar bu toparlanmayla açılmaz. Mevcut HTTP yeniden deneme politikası ayrı kalır. Kapalı sürekli tarama kendiliğinden etkinleştirilmez; manuel araştırmalar otomatik devam kapsamına alınmaz.

# Creator Radar

Diğer yapay zekalar için başlangıç: [CLAUDE.md](CLAUDE.md). Ürün özeti, mimari, durum, yol haritası ve işletim rehberi [docs/](docs/) içindedir. Ayrıntılı özellik notları: [docs/FEATURES.md](docs/FEATURES.md).

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

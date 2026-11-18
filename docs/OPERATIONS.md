# İşletim, veriler ve güvenli devam

## Konum
Kanonik proje: `/Users/cagdas/creator-radar`. Panel: http://127.0.0.1:3000/. Eski klasör sembolik bağlantıyla yeni klasöre yönlenebilir; çalışma dizini olarak yeni konumu tercih et.

## Başlatma
```sh
cd /Users/cagdas/creator-radar
npm run dev
```
Panelde araştırma başlatılması gerekirse işçiyi açar. Sürekli tarama zaten etkinse ve işçi kapalıysa ayrı terminalde `npm run worker` çalıştır; aynı DB için ikinci işçi açma (kilit/heartbeat kontrolü vardır). `WORKER_AUTO_START=false` otomatik açılmayı kapatır. Güncel ayarlar için `.env` dosyasını yerelde incele; içeriğini paylaşma.

`npm run build` üretim build; `npm start` üretim panelidir. İzole doğrulama için `RADAR_BUILD_DIR=.next-validation npm run build` kullanılır; böylece çalışan dev çıktısı ezilmez.

## Sürekli tarama
Panelde ülke/kategori seçip “Otomatik taramayı başlat”. “Kategoriyi otomatik seç” işaretlenirse alanlar döner; ülke boşsa desteklenen ülkeler döner. Sayfa bütçesi her tur içindir. Bilgisayar ve işçi çalıştıkça turlar devam eder; panelin açık kalması gerekmez. “Otomatik taramayı durdur” kontrolü kapatır ve sahip olduğu aktif işi iptal eder.

Ölçülen HTTP 403/429 için ilk istekte toplam üç deneme, en az iki dakika aralık, sonra sonraki isteğe geçiş uygulanır; üç farklı ardışık istekte aynı kod gelirse devre açılır. Açılmış kaynak kilidi, CAPTCHA veya giriş engeli otomatik kaldırılmaz. Bilinen Retry-After dolmadan kontrol/manuel açma/devam da reddedilir. Süre dolması erişimin açıldığı anlamına gelmez. Oturum kontrolü araştırma erişimini doğrulamaz.

## Dosyalar
- `.env`: yerel ayarlar/gizli bilgiler; kopyalama veya sıfırlama yapma.
- `data/radar.sqlite` ve varsa WAL/SHM: canlı SQLite verisi. Açık DB'yi yalnız ana dosyayı kopyalayarak yedekleme; SQLite backup API veya kontrollü kapanış kullan.
- `data/chromium-research-profile`: ayrı Chromium oturumu/kimlik bilgileri; yerelde kalır.
- `data/browser-preferences.json`, `data/browser-session.json`: profil yolu ve son oturum kontrolü. Dizin taşınırsa bu alanlar da kontrollü güncellenmeli.
- `data/instagram-research-state.json`: kaynak kısıtı ve ziyaret bütçesi. Silmek/sıfırlamak iyileştirme değildir.
- `data/worker-heartbeat.json`, `*.worker.lock`: süreç sağlığı ve tek işçi kilidi. Çalışan sürece ait kilidi silme.
- `data/*runtime.log`: yerel operasyon logları; paylaşmadan önce gizli alanları gözden geçir.
- `data/backups/`: yerel yedekler; kaynak kod değildir.

## Kesintisiz veri koruma
İşçi normal SIGTERM ile kapanınca aktif iş checkpoint üzerinden `queued` olarak geri alınır; restart kaydı ve bütçeyi korur. Sürekli tarama enabled/config/cycle alanlarını taşıma için sıfırlama. Kapanış tamamlanmadan DB/profil taşıma. SIGKILL yalnız kaçınılmaz durum için son çaredir; rutin geçişte kullanma.

Chromium profilini iki süreçte aynı anda açma. Yalnız özel manuel giriş penceresini normal kapat; kişisel Chrome'u kapatma veya profilini değiştirme. Eski `manual-chrome-profile` aktif araştırma profili değildir.

## Testler
```sh
npm test
npm run typecheck
npm run test:postgres
RADAR_BUILD_DIR=.next-validation npm run build
RADAR_BUILD_DIR=.next-validation npm run test:smoke
RADAR_BUILD_DIR=.next-validation npm run test:smoke:postgres
npm run test:http-browser
npm run test:tag-browser
```
Tarayıcı testleri geçici profiller ve fixture/engellenmiş ağ yanıtları kullanır. Canlı Instagram üzerinden otomatik “test” yapma. PostgreSQL testleri yerel geçici cluster açar; bağlantı izni gerekebilir.

## Şema/transfer
PostgreSQL: `npm run db:migrate`. SQLite şeması uygulama açılışında oluşturulur. Veri taşıma için mevcut `db:transfer` dry-run/apply talimatlarını README'den izle. Önce sürekli taramayı durdur, aktif işleri bitir/iptal et, yedek al ve hedefin boş olduğunu doğrula. Taşıma yeni boş DB oluşturma bahanesi değildir.

## Müşteri deneyimini açma
http://127.0.0.1:3000/portal adresini veya menüdeki Müşteri portalı bağlantısını kullan.
Bu ekran kayıtlı kütüphaneyi arar; araştırma başlatmaz, hesabı düzenlemez. Filtreleri
uygulamak için Hesapları keşfet düğmesine bas. Ülke tahmini kartta ayrıca belirtilir.
URL arama ayarlarını taşır. İnternete yayın veya müşteri üyelik/yetkisi bu yerel
önizlemenin parçası değildir; admin erişimini bir menü görünümüyle sınırlandırma.

Sürekli taramadaki teknik toparlanma ve adres karantinası ayrıntıları için `docs/STATUS.md` (2026-11-10) ve `docs/ARCHITECTURE.md` dosyalarına bak.

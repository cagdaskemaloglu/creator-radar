# Paylaşılabilir veritabanı kopyası

`radar.snapshot.sqlite`, araştırma veritabanının belirli bir andaki SQLite kopyasıdır. Profil kayıtları, açık iletişim bilgileri, kaynakları, sınıflandırmaları ve araştırma geçmişini içerir. Canlı ortak veritabanı değildir: Git pull/push yerel veritabanlarını birleştirmez; yeni araştırmalar kendiliğinden paylaşılmaz.

Chromium profili, çerezler, giriş bilgileri ve `.env` dosyası dahil değildir. Eski aktif/bekleyen/duraklatılmış işler yalnız kopyada iptal edilmiş, sürekli tarama kapatılmıştır. Asıl bilgisayardaki işler ve ayarlar değiştirilmez. Gizli değer örüntüleri kontrol edilir; bu kontrol tüm olası hassas içerik için garanti değildir.

## Arkadaşın bilgisayarında kullanma

Önce bağımlılıkları yükle (`npm ci`). `.env.example` dosyasını yerel `.env` olarak kopyala; SQLite ayarlarını koru. Ardından:

```sh
node --env-file-if-exists=.env scripts/restore-shared-database.mjs
npm run dev
```

Geri yükleme SHA-256 kontrolü yapar ve mevcut veritabanının üzerine yazmayı reddeder. Zaten yerel verin varsa ayrı bir hedef seç (`RADAR_DB=data/shared-preview.sqlite`); paneli de aynı RADAR_DB ile çalıştır. Instagram araştırması için kendi ayrı Chromium oturumunu ayrıca kur. Veri aramak için giriş gerekmez.

## Kopyayı güncelleme

```sh
node --env-file-if-exists=.env scripts/share-database.mjs
```

SQLite backup API ile tutarlı anlık kopya alınır; canlı işçi durdurulmaz. Kopyanın bütünlük/ilişki kontrolleri ve SHA-256 bilgisi `manifest.json` içindedir. Kaynak veritabanı ve oturum dosyaları Git dışında kalır.

Repo şu anda public olduğundan kopyanın dışarı gönderilmesi kullanıcı kararını bekliyor. Bu nedenle `*.sqlite` geçici olarak `.gitignore` kapsamındadır. Paylaşım hedefi kesinleşmeden bu korumayı kaldırma veya `git add -f` kullanma. Public repoya gönderilen dosyayı herkes indirebilir; sonraki silme eski Git geçmişini kaldırmaz.

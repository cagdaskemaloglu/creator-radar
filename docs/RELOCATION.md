# Taşıma ve doğrulama kaydı

Tarih: 2026-11-08 (Europe/Istanbul). Gerçek taşıma zamanı UTC: 2026-11-08T10:13:48.695416+00:00.

## Konum
- Yeni, gerçek proje klasörü: `/Users/cagdas/creator-radar`.
- Eski yol: `/Users/cagdas/Documents/ChatGPT/cr34t0r r4d4r`.
- Eski yol yeni konuma sembolik bağlantıdır; ikinci proje/veri kopyası değildir. Eski kısayollar ve mevcut çalışma alanı bu nedenle çalışmayı sürdürür. Yeni işlerde kanonik konumu kullan.
- Paket adı zaten `creator-radar` idi; kaynak paket kimliği değiştirilmedi.

## Korunan durum
- İşçi normal SIGTERM ile kayıt noktasında kapatıldı; kullanıcı iptali yapılmadı.
- Panel süreçleri yalnız bu projeye ait oldukları doğrulanarak kapatıldı.
- Aynı dosya sistemi içinde klasör atomik yeniden adlandırmayla taşındı; `.env`, `.git`, bağımlılıklar, bütün `data/` ve Chromium profilleri korundu.
- SQLite backup API ile tutarlı yedek alındı: `/Users/cagdas/creator-radar/data/backups/before-relocation-20261108T101348Z/radar.sqlite`.
- Kaynak durum dosyaları ve profil yolu ayarları aynı yerel yedek klasöründe korundu. Yedek gizlidir; Git'e veya dış servise gönderme.
- Taşıma anındaki bütünlük kontrolü: **OK**. Kaynak/ölçüm/aday/keşif sayıları taşımadan önce ve sonra aynıydı.
- Taşıma anında 598 profil, 691 kaynak, 691 ölçüm, 834 araştırma adayı ve 5304 keşif sonucu vardı. Canlı tarama sürerken bu sayılar artabilir.
- Sürekli tarama enabled/generation/cycle/job alanları aynı kaldı: enabled=1, generation=1, cycle=8, job_id=96.
- #96 kayıtlı kuyruktan yeni konumda devam etti. İlk başlangıç zamanı değişmedi, harcanan sayfa bütçesi sıfırlanmadı.
- Araştırma Chromium'unun kendisi taşındı; yalnız `browser-preferences.json` ve `browser-session.json` içindeki profil yolu yeni konumla güncellendi. Çerezler kopyalanmadı/sıfırlanmadı. Saklanan son oturum kontrolü geçmiş bir gözlemdir; yeni erişim garantisi değildir.
- Eski Next.js dev çıktısı `.next-before-relocation-*` adıyla korundu ve Git'ten hariç tutuldu. Yeni dev çıktısı yeni konumda üretildi.

## Yeniden başlatma ve kontrol
Panel ve işçinin çalışma dizinleri süreç üzerinden `/Users/cagdas/creator-radar` olarak doğrulandı. Panel adresi aynı: http://127.0.0.1:3000/. Otomatik tarama taşıma öncesi açık olduğu için açık bırakıldı; yeni bir hedef/kota ayarı yapılmadı.

Yeni konumda geçen kontroller:
- `npm test`: 124/124.
- `npm run typecheck`: geçti.
- `npm run test:postgres`: 18/18 (migration, transfer, rollback ve kontratlar).
- `RADAR_BUILD_DIR=.next-validation npm run build`: geçti.
- `npm run test:http-browser`: geçti; canlı Instagram trafiği yok.
- `RADAR_BUILD_DIR=.next-validation npm run test:smoke`: geçti; fixture → DB → panel, filtre/CSV, sürekli tarama ve mobil korumalar.

Bunlar taşıma anının doğrulamasıdır. Sonraki değişikliklerde ilgili testleri yeniden çalıştır.

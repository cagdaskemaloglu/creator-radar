# Creator Radar — AI handoff

Bu dosya Claude ve diğer kodlama asistanları için giriş noktasıdır. Kullanıcıyla Türkçe konuş.

## Önce oku
1. `AGENTS.md` — özellikle kurulu Next.js sürümünün yerel dokümantasyon şartı.
2. `docs/PROJECT_BRIEF.md` — ürün, vizyon, misyon ve sınırlar.
3. `docs/ARCHITECTURE.md` — veri akışı ve kod haritası.
4. `docs/STATUS.md` — tamamlanan işler ve mevcut kısıtlar.
5. `docs/ROADMAP.md` — öncelikli yapılacaklar.
6. `docs/OPERATIONS.md` — başlatma, test, veri ve oturum koruma.
7. `docs/DECISIONS.md` — önceki kararların nedenleri.
8. `docs/FEATURES.md` — özellik davranışlarının ayrıntıları (yalnız gerektiğinde).

Kanonik konum: `/Users/cagdas/creator-radar`. Paket adı `creator-radar`.
Panel: http://127.0.0.1:3000/. Veri, `.env` ve Chromium oturumu bu bilgisayarda kalır.
Eski konum uyumluluk için sembolik bağlantı olabilir; ikinci bir proje/veritabanı oluşturma.

## Çalışma disiplini
- Önce canlı API ve kalıcı kayıtları incele; eski sohbetlerdeki sayıları güncel sayma.
- Aktif araştırma ve sürekli tarama olabilir. Veri/kuyruk/bütçe/oturum korumadan süreç kapatma veya klasör temizleme yapma. Normal SIGTERM kayıt noktasından devam içindir; kullanıcı iptaliyle aynı değildir.
- Kişisel Chrome'a veya kişisel Chrome profillerine dokunma. Yalnız ayrı araştırma Chromium profili kullanılır. Görünür pencere yalnız açık manuel giriş eyleminde açılır.
- `.env`, çerezler, parola, token, profil dosyaları ve veri tabanını yanıtlara/loglara/Git'e koyma. Mevcut `.env` dosyasını `.env.example` ile değiştirme.
- Ölçülen HTTP 403/429 için kullanıcı onaylı sınırlı yeniden deneme politikası `lib/request-recovery.ts` ve README son bölümündedir: ilk istekte toplam 3 deneme, en az 2 dakika/sunucu süresi; aynı fazda 3 ardışık başarısız istekte kaynak durur. Etiket başarısı gönderi/profil sayacını sıfırlamaz. Açılmış kilit kendiliğinden kaldırılmaz.
- Oturum açılmış olması toplama yetkisi değildir. 403/429/CAPTCHA/giriş engelini aşma; proxy, stealth ve otomatik hesap açma ekleme. Kısıtları sahte başarı veya otomatik kilit kaldırmayla gizleme.
- Ülke, kategori ve satış durumu birbirinden ayrıdır. Dil tahmini ikamet doğrulaması değildir; komisyon bağlantısı doğrudan satıcılık kanıtı değildir.
- Yeni anlamsal/AI özellikleri varmış gibi davranma: mevcut ikinci katman yerel bağlam kurallarıdır; LLM/embedding servisi yoktur.
- Şema değişikliğinde SQLite şeması + PostgreSQL migration + transfer + ilgili iki veri tabanı testini birlikte ele al.
- `npm test`, `npm run typecheck`; veri tabanı değişikliklerinde `npm run test:postgres`; panel akışında üretim build + smoke çalıştır. İzole fixture kullan; test için canlı Instagram isteği gönderme.
- İnsan değerlendirmesi olan `validation_status` ile otomatik belirsizliği karıştırma. Yeniden sınıflandırma kaynak/metrik kaydı çoğaltmamalı.

Son dokümantasyon tarihi: 2026-11-08. Gerçek uygulama ve test sonuçları her zaman belgelerden daha güncel olabilir.

## Değişiklik günlüğü
Tarih sıralı güncellemeler `docs/STATUS.md` içindedir; özellik ayrıntıları `docs/FEATURES.md` içindedir. Aynı metni burada tekrarlama.

## Veritabanı paylaşımı — kullanıcı isteği
Kullanıcı veritabanının repo üzerinden paylaşılmasını istedi. `shared-data/` altında 882 creator içeren anlık kopya ve hazırlama/geri yükleme komutları hazırlandı. GitHub deposu public olduğu anlaşıldığından dışarı gönderme henüz yapılmadı; kullanıcının public paylaşım veya repo görünürlüğü kararını bekle. Kopya şu an `.gitignore` ile korunur. Kaynak `data/radar.sqlite`, `.env` ve Chromium dosyaları her durumda Git dışında kalır. `shared-data/README.md` dosyasını oku.

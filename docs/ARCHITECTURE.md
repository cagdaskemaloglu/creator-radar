# Mimari ve kod haritası

## Teknoloji
Node.js 22.13+, TypeScript, Next.js 16.4.x App Router (Webpack), React, Zod, Playwright Chromium. SQLite yerel varsayılan; PostgreSQL/Supabase uyumlu alternatif. Yerel sürümler için `package.json`/kilit dosyasına bak.

## Akış
Panel → yerel korumalı `/api/radar` → planlama → `ingestion_jobs` → tek işçi → etiket keşfi → gönderi sahibini doğrulama → profil okuma → gerekirse sınırlı caption incelemesi → sınıflandırma → atomik kayıt → canlı log/filtre/CSV.

Keşif, tarayıcı okuma, normalizasyon, saklama ve gösterim ayrıdır. İlk aday doğrulanınca profil işlenip kaydedilir; beşli grup dolması beklenmez. Sonraki kısıtlama tamamlanmış kaydı kaybettirmez.

## Başlıca modüller
- `app/page.tsx`: panel durumu ve yenileme.
- `app/research-panel.tsx`: hedefler, turlar, otomatik tarama, loglar.
- `app/accounts-panel.tsx`, `app/creator-detail.tsx`: birleşik filtreler, satış/iletişim/kategori kanıtı, CSV, insan incelemesi.
- `app/api/radar/route.ts`: yalnız localhost + POST origin koruması, yerel API.
- `lib/autonomous-research.ts`: URL gerektirmeyen tek tur planı; lokal terimler, havuz devralma.
- `lib/continuous-scan.ts`: kalıcı sürekli tarama; nesil/generation, tur sahipliği, zamanlama ve durdurma yarışları.
- `scripts/worker.ts`, `lib/jobs.ts`, `lib/worker-service.ts`: tek işçi kilidi, heartbeat, SIGTERM/checkpoint, iş yürütme.
- `lib/night-research.ts`, `lib/night-store.ts`: profil/caption kuyruğu, bütçeler, kayıt ve devam raporları.
- `lib/discovery-run.ts`, `lib/discovery-store.ts`: sorgu/gönderi kuyruğu, owner önbelleği, yeni hesap önceliği.
- `lib/discovery-frontier.ts`, `lib/query-budget.ts`: scope bazlı etiket geçmişi, hedefe uygun yeni kayıt verimi, keşif payı ve dinlenme.
- `lib/instagram-browser.ts`, `lib/instagram-extract.ts`, `lib/instagram-post*.ts`: görünür sayfa okuma, kimlik/sahiplik doğrulama ve normalize veri.
- `lib/instagram-restriction.ts`, `lib/instagram-state*.ts`, `lib/browser-session.ts`: HTTP kanıtı, Retry-After, kaynak kilidi ve oturum/araştırma ayrımı.
- `lib/model.ts`: profil şeması ve sınıflandırma; `lib/context-classifier.ts`: zayıf kanıtta yerel kavram kuralları.
- `lib/profile-context.ts`, `lib/language-country.ts`: açık konum + düşük güvenli dil tahmini.
- `lib/commerce.ts`: satış sinyali/kanal/kanıt, URL sadeleştirme; dış mağazayı taramaz.
- `lib/db.ts`, `lib/storage/*`: ortak veri erişimi, transaction, geçiş ve transfer.

## Veri modeli
`creators`: benzersiz username, profil URL, normalize payload ve insan inceleme durumu. `creator_sources`: asıl kaynak/izin referansı/toplama tarihi. `creator_metrics`: ölçüm geçmişi. `suppressions`: hariç tutma.

`ingestion_jobs` ve `logs`: yürütme; `research_runs`, `research_candidates`, `research_posts`: bütçeli checkpoint; `discovery_queries`, `discovery_results`: keşif; `discovery_frontier`, `discovery_observations`: kalıcı sorgu öğrenimi; `candidate_work`: keşif/iyileştirme ayrımı; `creator_evaluations`: model sürümüne göre insan değerlendirmesi; `continuous_scan`: tek kalıcı kontrol kaydı.

SQLite şeması `lib/storage/sqlite.ts` içinde otomatik oluşturulur. PostgreSQL migration dosyaları `migrations/001...006` içindedir; uygulanmış dosyaları değiştirme. Yeni migration ekle. Yeni tabloyu transfer ve iki veri tabanı testlerine ekle.

## Kritik ayrımlar
- `category_match`: seçilen kategoriye uyum; `target_match`: konum/açık beyan; `research_match`: birleşik sonuç.
- `matched`, `estimated`, `unknown`, `different`, `not_requested` ayrıdır.
- `validation_status` insan incelemesidir; otomatik sınıflandırmayı veya gerçek uygunluğu tek başına göstermez.
- `account_type` içerik üreticisi/mağaza/mixed; `selling_status` satış sinyali/yalnız kanal/belirsiz; kategori korunur.
- `sales_channels`: platform, bağlantı/metin temeli, kaynak URL, kanıt ve doğrulanmamış sahiplik.
- Puan, kalibre edilmiş olasılık değildir. Dil, cinsiyet, ikamet ve mağaza sahipliği birbirinin yerine kullanılmaz.

## Sürekli tarama
Tek tek turların limitleri korunur. Seçilen hedefler sabit kalır; boş kategori/ülke desteklenen taksonomi/ülkeler arasında deterministik döner. Bu adaptif AI karar sistemi değildir. Kısıtlı veya durmuş iş kendiliğinden açılmaz. Generation alanı, tur oluşturma–durdurma–yeniden başlama yarışlarında eski işin yanlış sahiplenilmesini engeller. İş payload'ındaki `continuousGeneration` kesinti sonrası tur sahipliğini kurtarmaya yarar.

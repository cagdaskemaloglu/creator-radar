# Mevcut durum ve tamamlanan işler

Tarih: 2026-11-08. Bu belge bir anlık durumdur; canlı sayı ve son işi API/DB'den kontrol et.

## Tamamlandı
- Başlangıç listesi olmadan kategori/ülke tabanlı havuz oluşturma.
- Türkçe arama terimlerinin önceliği; sorgulara adil sayfa payı; verimsiz etiketten çıkış.
- Kalıcı havuz, scope bazlı verim, farklı creator kanıtından kontrollü terim öğrenimi.
- Gönderi kimliği ve sahibini doğrulama; hata nedenlerini ayırma; `/p/`–`/reel/` alias önbelleği.
- Adayı tek tek sınıflandırıp atomik kaydetme; kesintide kısmi iş kaybını azaltma.
- Yeni hesap keşfini mevcut hesap iyileştirmesinden ayırma; bilinen hesap ve gönderi sahiplerini erken eleme.
- Kategori kanıtları, açıklama/hashtag okuma ve bütçeli seçici ek inceleme.
- İkinci yerel bağlam katmanı: bağımsız kavramlar, Türkçe ekler, negatif oyun örnekleri; dış LLM isteği yok.
- Açık konum + düşük güvenli ülke tahmini; belirsizliğin görünür tutulması.
- Açık biyografi e-postaları, kaynak ve görülme geçmişi; teslim edilebilirlik doğrulaması yok.
- Satış sinyalleri ve Shopier/Trendyol/Hepsiburada/Etsy/Amazon/site/WhatsApp/DM kanalları; kategoriyle birleşik filtre/CSV.
- Kalıcı sürekli tarama alanı; seçili veya dönüşümlü otomatik hedefler; durdurma ve yeniden başlama korumaları.
- Yalnız ayrı headless Chromium; kişisel Chrome profiline karşı koruma; manuel giriş akışı.
- HTTP 403/429 istek kanıtları, güvenli URL kaydı, Retry-After koruması; oturum açık ≠ araştırma erişimi açık.
- SQLite/PostgreSQL ortak kontratlar, migration/transfer, fixture tarayıcı ve responsive panel testleri.

## Son bilinen doğrulama
Son özellik geliştirmesinde 124 birim/kontrat testi, 18 PostgreSQL testi, üretim build, tip kontrolü ve her iki veri tabanında panel smoke testleri geçti. Taşıma sonrası sonuçlar `docs/RELOCATION.md` dosyasında kaydedilir. Rakamları güncellemeden yeni geliştirmeler için başarı varsayma.

## Önemli sınırlar
- Kaynak 429/403 uyguladığında araştırma durabilir; bu uydurma bir duruş değildir. Oturum testi yalnız giriş sinyalleridir.
- Bazı kategorisiz hesaplarda kanıt mevcut ama sözlük/bağlam yetersiz; bazılarında eksik metin veya çok karma içerik vardır.
- 2026-11-08 yerel ikinci katman değerlendirmesinde aynı 459 hesaplık örneklemde kategorisiz sayı 153→133 oldu. Bu genel doğruluk ölçümü değildir; veri büyüdükçe sayı değişir.
- Örnek eski çalışmalarda 45–53 yeni profil/saat görüldü. Uzun vadeli hız garantisi yoktur; saat hesabı kapalı/duraklatılmış süreleri içerebilir.
- Ülke sözlüğü ve dil kapsaması sınırlıdır. İngilizce içerikten tek başına ABD/İngiltere seçilmez.
- Mağaza bağlantısı veya reklam ifadesi satıcılık/sahiplik doğrulaması değildir.
- Gerçek SaaS kimlik/tenant/rol/faturalama ve dağıtım katmanları henüz yoktur.
- Depo başlangıçta büyük ölçüde untracked durumdadır; otomatik commit/push yapılmamıştır. Yerel kişisel verileri commit etme.

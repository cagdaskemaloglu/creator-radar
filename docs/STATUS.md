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

## 2026-11-09 güncellemesi
Ölçülen HTTP 403/429 için ilk sorunlu istek toplam üç deneme (en az iki dakika ve sunucu süresi), ardından aynı hata alan isteği atlama, üçüncü ardışık başarısız istekte duraklatma eklendi. Başarı seriyi sıfırlar; checkpoint deneme sayısı, bütçe ve iptal korunur. Geçmiş hata ile güncel erişim/yeniden-deneme beklemesi panelde ayrıldı. CAPTCHA/giriş/kimlik korumaları anlıktır. Güncel doğrulama: 131 birim/kontrat testi, 19 PostgreSQL testi; üretim build, tip kontrolü, ham Chromium erişim testleri ve SQLite/PostgreSQL panel smoke akışları geçti.

## 2026-11-09 müşteri portalı
`/portal` üzerinde gerçek veritabanına bağlı, salt okunur müşteri arama önizlemesi eklendi. Birleşik filtreler, 12'li sayfalama, paylaşılabilir URL, profil/iletişim/satış kanalı/kategori kanıtı detayı ve mobil kartlar bulunur. Ayrı `/api/portal` GET uç noktası admin alanlarını döndürmez; test, rejected ve suppressed kayıtlar gizlenir. Kimlik/tenant/üretim yayını eklenmedi; localhost koruması sürer.
Portal doğrulaması: 132 birim/kontrat testi, 20 PostgreSQL testi, üretim build ve tip kontrolü geçti. SQLite/PostgreSQL tarayıcı testlerinde birleşik arama, sıfır sonuç, sayfalama, salt okunur profil detayı, mobil taşmama ve yerel erişim/GET korumaları doğrulandı. Masaüstü ve mobil ekran görüntüleri geçici test klasörlerinde görsel olarak incelendi.

## Faz bazlı hata ve ölçüm güncellemesi
Etiket/gönderi/profil sayaçları ayrıldı; gönderi hatası sürerken yeni etiket araması bekletilir. Turun kayıtsız tamamlanması açık etiketle gösterilir. Yeni research_activity tablosu ile aktif oturum/bekleme/ölçülemeyen süre ve ölçülen yeni kayıt farkı tutulur; eski turlarda hız uydurulmaz. PostgreSQL migration 007 ve transfer desteği vardır.
Doğrulama: 133 birim/kontrat testi, 21 PostgreSQL testi; üretim build, tip kontrolü ve SQLite/PostgreSQL panel smoke kontrolleri geçti. Etiket/profil başarısının gönderi serisini temizlememesi, düşük sorgu payında mevcut gönderilere geçiş, kaynak kuyruğu boşken güvenli erteleme, kapalı sürenin dışlanması, ölçüm boşluğu ve veri transferi senaryoları test edildi. Canlı veritabanı yedeği alınarak servis güncellendi; mevcut erişim kilidi otomatik açılmadı.

## 2026-11-10 — Sürekli taramada teknik toparlanma
Yalnız sürekli taramanın sahip olduğu turlarda, ardışık ağ/profil düzeni/etiket okuma hatalarında kontrollü devam vardır. İlk toparlanma 2 dakika, ikinci 5 dakika sonra; tur başına en fazla iki kez. Aynı iş/kuyruk, başlangıç zamanı ve sayfa bütçesi korunur. Tükenen süre/bütçede eski tur kapatılıp yeni tura geçilir; bekleyen havuz devam mekanizmasına bırakılır. Kullanıcı durdurması ve eşzamanlı başka araştırma önceliklidir.

`research_quarantine` (PostgreSQL migration 008) teknik sorunlu profil/gönderi/etiket adreslerini ağ hatasında 30 dakika, düzen okunamamasında 2 saat ayırır. Gönderinin /p/ ve /reel/ biçimleri aynı kimliğe bağlanır. Süresi dolmuş adres sonraki keşifte yeniden değerlendirilebilir; eski turdaki skipped kayıtlar kendiliğinden pending yapılmaz. Diğer adaylar ziyaret edilip kaydedilebilir. Panel toparlanma nedenini, planlanan devam saatini ve etkin geçici adres sayısını gösterir.

403/429 kaynak kilidi, sunucu bekleme süresi, CAPTCHA, giriş gereksinimi, kimlik çelişkisi, `post_access_deferred` ve tanınmayan hatalar bu toparlanmayla açılmaz. Mevcut HTTP yeniden deneme politikası ayrı kalır. Kapalı sürekli tarama kendiliğinden etkinleştirilmez; manuel araştırmalar otomatik devam kapsamına alınmaz.

Bu güncellemenin doğrulaması: 134 birim/kontrat testi, 22 PostgreSQL testi, tip kontrolü, üretim derlemesi ve SQLite/PostgreSQL panel smoke testleri geçti. Testler canlı Instagram trafiği üretmedi. Teknik adreslerin ziyaret öncesi atlanması, sağlıklı adayın kaydı, iki toparlanma sınırı, bütçe korunması, kullanıcı durdurması ve kaynak kilidinin önceliği doğrulandı.

## 2026-11-18 — Depo ve belge temizliği
Kod davranışı değişmedi. İlgisiz çalışma çıktıları (`outputs/` 3B modeller, `output/pdf`, `tmp/`) depodan çıkarıldı ve `.gitignore` kapsamına alındı; denetim JSON'ları `docs/audits/` altına taşındı. README kurulum ve günlük kullanım odağına indirildi, ayrıntılı davranış notları `docs/FEATURES.md` dosyasına taşındı (altı İngilizce paragraf Türkçeleştirildi, yanlış başlıklardan ayrıldı). Dört dosyada yinelenen 2026-11-10 bölümü tek yere (bu dosya) indirildi. `package.json` içine `engines` (Node >=22.13) ve `validate` betiği eklendi. Taban doğrulama: tip kontrolü temiz, 134/134 birim testi geçti.

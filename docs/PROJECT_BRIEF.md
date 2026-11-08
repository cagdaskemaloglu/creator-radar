# Ürün özeti, vizyon ve misyon

## Ürün
Creator Radar, markaların ve e-ticaret işletmelerinin içerik üreticilerini kategori, konum, içerik uygunluğu, iletişim ve satış kanalı üzerinden bulup değerlendirmesini hedefleyen SaaS projesinin yerel prototipidir.

Kullanıcı başlangıç URL/profil listesi vermek istemez. Ülke/kategori seçip tek tıkla keşif başlatır; sistem etiketlerden kendi aday havuzunu oluşturur, gönderi sahibini doğrular, creator verisini sınıflandırır ve kaynağıyla kaydeder. Arayüz Türkçedir ve teknik olmayan kullanıcı için tasarlanmıştır.

## Vizyon
Kanıtı incelenebilir, kalıcı ve tekrar kullanılabilir bir creator veri kütüphanesi üzerinden doğru markayı doğru içerik üreticisiyle eşleştiren bir araştırma platformu olmak.

## Misyon
Elle profil tarama yükünü azaltmak; yeni ve hedefe uygun hesapları kaynak, tarih ve belirsizlikleriyle sunmak. Kayıt adedini artırırken verinin doğruluğunu ve kullanıcının çalışma ortamını korumak.

## Örnek müşteriler ve sorgular
- Sporcu beslenmesi markası: Türkiye + fitness/vücut geliştirme.
- Kozmetik markası: Türkiye + makyaj/cilt bakımı + açık kadın beyanı.
- Ev dekorasyonu markası: iç tasarım/dekorasyon + Türkiye + Shopier satış işareti.
- Teknoloji aksesuarı markası: gaming/masa kurulumu + hedef takipçi aralığı.

## Başarı ölçütleri
Yeni tekil hesap/saat, hedefe açık kanıtla veya tahminen uyan yeni hesap/saat, yeni hesap başına ziyaret, yinelenen ziyaret oranı, ülke/kategori belirsizliği, elle değerlendirilen örneklem doğruluğu ve kesinti sonrası kayıpsız devam.

Yüzlerce/binlerce profil hedefi ürün vizyonudur; mevcut erişim ve sayfa başına maliyetle garanti edilen bir hız değildir. Kayıt sayısını yanlış eşleşme ve mağaza/creator karışıklığı pahasına artırma.

## Bugünkü kapsam
Yerel Next.js paneli, SQLite veya PostgreSQL, Playwright Chromium, manuel giriş, arka plan keşif işçisi, kalıcı kuyruk, sürekli tarama, kanıtlı sınıflandırma, filtreler ve CSV. 11 ana grup/68 alt kategori `lib/taxonomy.ts` içindedir.

## Henüz olmayanlar
Çok kiracılı SaaS, müşteriye açık oturum/yetki/faturalama, bulut dağıtımı, kalibre edilmiş ML modeli, LLM/embedding sınıflandırması, tam küresel konum çözümleme, resmi API sağlayıcısı entegrasyonu ve satış/mağaza sahipliği doğrulaması. Kullanıcıya bu özellikleri mevcutmuş gibi sunma.

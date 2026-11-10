# Yol haritası

Tamamlanan özellikler için `STATUS.md` dosyasına bak. Aşağıdakiler önerilen işlerdir; uygulanmış kabul etme.

## P0 — Ölçüm ve doğruluk
1. İnsan değerlendirmeli, kategori/ülke/mağaza türü açısından dengeli bir örneklem oluştur. Model sürümüne göre doğruluk, yanlış pozitif ve belirsizlik oranını ölç.
2. Temel aktif oturum/bekleme/kesinti ölçümü tamamlandı (migration 007). Sonraki adım ölçümlerin canlı örneklerle doğrulanması ve daha ayrıntılı aşama maliyetlerinin izlenmesi.
3. Kategorisiz hesapları nedenlerine göre grupla: eksik veri, sözlük eksiği, çoklu kategori, düşük kanıt, hedef dışında. Panelde açık sayımlar sun.
4. Bahçe, dekorasyon, alışveriş, aydınlatma ve mobilya örnekleriyle yerel bağlam kurallarının negatif testlerini büyüt. Kategori eklemeden önce mevcut kategoriyi kaçırıp kaçırmadığını ölç.
5. Her yeni turda hedefe uygun yeni hesap / ziyaret ve bilinen hesap ziyaret kaybını karşılaştır. Etiket sıralamasındaki kazancı gerçek verilerle ölç.

## P1 — Kalite ve işletim
- Kanıtı ve zaman aşımını ayrı tutan owner/URL önbelleği; username değişimi/kimlik çelişkisi testleri.
- Eski kayıtları ziyaret etmeden yeniden değerlendirme ve alan bazlı kanıt tazeliği.
- Satış kanalı için affiliate, marka elçisi, doğrudan satıcı ayrımını daha iyi ölç; doğrulanmamış siteyi otomatik sahiplenme.
- Sürekli taramada sadece round-robin yerine ölçülmüş uygun-yeni hesap verimine göre alan seçimi; adil yeni alan keşfini koru.
- Sınırlı teknik toparlanma ve geçici adres karantinası tamamlandı (migration 008). Sonraki adım gerçek turlarda toparlanma verimini ve karantina sürelerini ölçmek.
- Yedekleme/geri yükleme akışını standartlaştır ve otomatik geri yükleme testi ekle.

## P2 — SaaS'a hazırlık
- Yetkili/veri sağlayıcı API entegrasyonları; mevcut normalize model ve dashboard korunmalı.
- Tenant izolasyonu, kimlik/roller, kota, gizli anahtar yönetimi ve veri saklama/silme politikaları.
- Kuyruk/işçi dağıtımı ve gözlemlenebilirlik; çoklu kiracı için tek global kontrol kaydını tenant kapsamına taşı.
- Faturalama, müşteri onboarding, arama kaydetme ve izinli dışa aktarma.
- Gerçek anlamsal model/embedding/LLM değerlendirilecekse önce yerel test seti, maliyet, veri paylaşımı tercihi ve açıklanabilirlik tasarımı. Mevcut kuralları AI modeli diye yeniden adlandırma.

## Yapılmayacak kısa yollar
CAPTCHA atlatma, stealth/parmak izi gizleme, proxy rotasyonu, otomatik hesap açma, kişisel Chrome'a geçme, kısıtlama işaretlerini yok sayma veya belirsiz ülkeyi kullanıcı hedefiyle doldurma. Bunlar verimlilik geliştirmesi değildir.

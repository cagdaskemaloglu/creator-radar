# Resmî Instagram Graph API (Business Discovery)

Amaç: profil okumalarını tarayıcı yerine Meta'nın resmî API'siyle yapmak. Bir profil API'den okunduğunda Chromium sayfası açılmaz, 10–30 sn bekleme yapılmaz, `INSTAGRAM_DAILY_PAGES` bütçesi ve tur sayfa sınırı tüketilmez. API son 6 gönderinin açıklamasını da verdiği için o profile ayrıca gönderi ziyareti gerekmez. Tarayıcı yalnız keşif (etiket sayfası ve gönderi sahibini bulma) ve API'nin göremediği hesaplar için kullanılır.

## Neyi görür, neyi görmez
- **Görür:** Herkese açık **İşletme** ve **İçerik Üreticisi** hesaplarının kullanıcı adı, ad, biyografi, web sitesi, takipçi/takip/gönderi sayıları ve son gönderi açıklamaları.
- **Görmez:** Kişisel hesaplar ve gizli hesaplar. Bunlar otomatik olarak tarayıcıyla okunur. Böyle hesaplar 30 gün boyunca API'ye yeniden sorulmaz.
- Etiketle yeni hesap bulma API ile yapılamaz (hashtag API gönderi sahibini vermez). Keşif tarayıcıda kalır.

## Kurulum
1. Kendi Instagram hesabını **Profesyonel hesaba** (İşletme veya İçerik Üreticisi) çevir.
2. Bir **Facebook Sayfası** oluştur ve Instagram hesabını bu sayfaya bağla.
3. [developers.facebook.com](https://developers.facebook.com/) üzerinde bir uygulama oluştur ve **Instagram API with Facebook Login** ürününü ekle.
4. Graph API Explorer'da uygulamanı seç; `instagram_basic`, `pages_show_list` ve `pages_read_engagement` izinleriyle kullanıcı token'ı al.
5. Token'ı uzun ömürlü yap (yaklaşık 60 gün):
   `GET https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=KISA_TOKEN`
6. Instagram hesap kimliğini bul:
   `GET https://graph.facebook.com/v23.0/me/accounts?fields=name,instagram_business_account&access_token=TOKEN`
   Dönen `instagram_business_account.id` değeri `INSTAGRAM_GRAPH_USER_ID` olur.
7. `.env` dosyasına ekle (Git'e girmez):

```dotenv
INSTAGRAM_GRAPH_TOKEN=...
INSTAGRAM_GRAPH_USER_ID=1784...
# İsteğe bağlı: appsecret_proof gönderilir (önerilir)
INSTAGRAM_GRAPH_APP_SECRET=...
```

8. Paneli ve işçiyi yeniden başlat. **Oturum ve bağlantı** panelinde "Graph API · Hazır" görünür.

Meta, başka hesapları Business Discovery ile okumak için uygulama incelemesi (Advanced Access) isteyebilir. Önce geliştirme modunda birkaç hesapla dene. Meta izin adlarını ve sürümleri zaman zaman değiştirir; güncel adımlar için Meta belgelerine bak.

## Sınırlar ve güvenlik
- Saatlik öz sınır: `INSTAGRAM_GRAPH_HOURLY_CALLS` (varsayılan 150; Meta'nın yaklaşık 200/saat sınırının altında).
- Meta kullanım başlıkları (`X-App-Usage`, `X-Business-Use-Case-Usage`) %80'i aşarsa veya sınır hatası (kod 4/17/32/613/80002) gelirse API en az 1 saat (Meta'nın bildirdiği süre daha uzunsa o kadar) kullanılmaz. Bu süre boyunca profiller tarayıcıyla, normal bekleme ve bütçe kurallarıyla okunur.
- Geçersiz/süresi dolmuş token (kod 190) API'yi kapatır; yeni token girilince kendiliğinden açılır.
- Token loglara, veritabanına veya durum dosyasına yazılmaz; durum dosyasında yalnız kısa bir SHA-256 parmak izi tutulur.
- Graph API, tarayıcının 429 soğumasını **atlatmaz** ve etkilemez; ayrı ve yetkili bir kanaldır.

## Soğuma sırasında yenileme
Tarayıcı 429 soğumasındayken (24–72 saat) kayıtlı hesapların metrik ve açıklamalarını yalnız API ile yenile:

```sh
npm run graph:refresh -- --limit 100 --older-than-hours 72
```

En eski güncellenenlerden başlar, `rejected` kayıtlara dokunmaz, araştırma konusu/hedef bilgisini korur ve API sınırına gelince durur. Not: mevcut kayıt kuralı gereği güncellenen kayıt yeniden `needs_review` durumuna geçer.

## Ayarlar
| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `INSTAGRAM_GRAPH_TOKEN` | — | Uzun ömürlü erişim token'ı. Boşsa özellik kapalıdır. |
| `INSTAGRAM_GRAPH_USER_ID` | — | Kendi Instagram Profesyonel hesabının sayısal kimliği. |
| `INSTAGRAM_GRAPH_APP_SECRET` | — | Varsa `appsecret_proof` eklenir. |
| `INSTAGRAM_GRAPH_ENABLED` | `true` | `false` ise token olsa da kullanılmaz. |
| `INSTAGRAM_GRAPH_API_VERSION` | `v23.0` | Meta Graph API sürümü. |
| `INSTAGRAM_GRAPH_HOURLY_CALLS` | `150` | Saatlik öz sınır. |
| `INSTAGRAM_GRAPH_MEDIA_LIMIT` | `6` | Profil başına okunacak gönderi açıklaması (0–6). |
| `INSTAGRAM_GRAPH_STATE_FILE` | `data/instagram-graph-state.json` | Yerel sayaç/bekleme durumu. |

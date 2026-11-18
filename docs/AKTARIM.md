# QuadRan arayüz paketi: aktarım notları

Bu paket, Figma'daki "Kristal Tasarım" sayfasının düz CSS + EJS karşılığıdır.
Hedef proje: Node 22 (TypeScript dosyalarını doğrudan çalıştırır), Express 5, mysql2 (ORM yok, saf SQL), EJS, MySQL 8.4.

## Durum

Sayfaların hepsi gerçek veritabanına bağlı ve uçtan uca denendi (curl ile: giriş, konu açma, cevap, oy, sohbet,
özel mesaj, şikâyet, ayarlar, moderasyon, çıkış; misafir yönlendirmeleri ve 403 kutusu dahil).
`/onizleme/...` adresleri hâlâ örnek veriyle çalışır ve tasarım karşılaştırması için durur.

Çalıştırma:

```
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/06_etkilesim.sql   # yalnızca çalışan veritabanı 06'yı görmediyse
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/07_hesap.sql       # yalnızca çalışan veritabanı 07'yi görmediyse
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/08_yonetim.sql      # yönetim paneli tabloları (bir kez; ALTER TABLE tekrar çalışmaz)
node --env-file=.env src/server.ts
```

Deneme kullanıcıları (şifre hepsinde `test1234`): `shurai` (admin), `ayse` (moderatör), `ahmet` (üye).

## Route'lar

| Dosya | Adresler |
|---|---|
| `src/rotalar/hesap.ts` | `GET/POST /giris`, `/kayit`, `POST /cikis`, `/sifremi-unuttum`, `GET/POST /sifre-sifirla/:token`, `GET /ayarlar`, `POST /ayarlar/profil`, `/ayarlar/gorunum`, `GET/POST /hesap/sifre`, `GET/POST /hesap/eposta`, `POST /hesap/sil` |
| `src/rotalar/forum.ts` | `/` (`?kategori=&sirala=yeni\|populer\|eniyi`), `/konu/yeni`, `/konu/:id` (`?sirala=eniyi\|yeni`), `POST /konu/:id/cevap`, `POST /oy`, `/profil/:username` (`?sekme=yorumlar`), `/ara?q=&sekme=`, `/siralama?donem=hafta\|ay\|tum`, `GET/POST /sikayet` (alanlar `post_id` ya da `kullanici`) |
| `src/rotalar/iletisim.ts` | `/mesajlar`, `/mesajlar/:kullanici` (GET/POST), `/bildirimler`, `/bildirimler/:id`, `POST /bildirimler/okundu`, `/sohbet` (GET herkese açık, POST üyeye) |
| `src/rotalar/moderasyon.ts` | `GET /moderasyon?durum=`, `POST /moderasyon/:id/sil\|uyar\|reddet\|uzaklastir` (şikâyet id'si; kullanıcı şikâyetinde `sil` yok), `POST /moderasyon/sabitle\|kilitle\|kategori-degistir\|sil\|uzaklastir` (alanlar `post_id`, `topic_id`, kategori için `category_id`) |
| `src/rotalar/yonetim*.ts` | Yönetim paneli, aşağıdaki "Yönetim paneli" bölümüne bak |
| `src/oturum.ts`, `src/yardimci.ts`, `src/sifre.ts` | Oturum (MySQL'de saklanır), ortak yardımcılar (puan, bildirim, rozet, toast), scrypt ile şifre özeti |

Yetki: `girisGerekli()` giriş yoksa `/giris?don=...` adresine yollar; `yetkiliGerekli` moderatör ve admin dışına 403 verir
(GET'te `moderasyon.ejs` "erişimin yok" kutusunu çizer). Uzaklaştırılan kullanıcının oturumu düşer, giremez: ban "aktif" sayılır = `banned_at` dolu VE (`banned_until` boş = kalıcı, ya da henüz geçmemiş);
`banliSql()` (yardimci.ts) bu koşulu üretir, süresi dolan ban `oturum.ts` ve girişte temizlenir.

## Tablolar (sql/06_etkilesim.sql, sql/07_hesap.sql, sql/08_yonetim.sql)

`post_votes` (PK user_id + post_id, value +1/-1), `notifications` (tur: cevap, oy, rozet, mesaj, moderasyon),
`reports` (durum bekliyor/islendi/reddedildi), oturum tablosu.
`reports` bir mesajı (`post_id`) ya da bir kullanıcıyı (`reported_user_id`) hedefler, ikisi birden dolu olamaz (CHECK).
UNIQUE (post_id, reporter_id) ve UNIQUE (reported_user_id, reporter_id): aynı kişi aynı hedefi iki kez şikâyet edemez.
`password_resets` (sql/07): `token_hash` = rastgele 32 baytlık belirtecin sha256 özeti (düz belirteç saklanmaz), `expires_at` = +1 saat, `used_at`.
sql/08: `users.banned_until`, `users.ban_reason`, `categories.sort_order`, `chat_messages.deleted_at`, `messages.deleted_at`, `site_settings`, `audit_log`, `reports` yeni hedef modeli.
`users`'a `banned_at`, `tema`, `vurgu`, `menu_sagda`, `kompakt`, `az_animasyon`; `topics`'e `pinned_at`, `locked_at` eklendi.
Silme hep yumuşaktır (`deleted_at`): mesaj silinirse satır kalır; konunun ilk mesajı silinirse konu da gizlenir.

## Yönetim paneli (/yonetim)

Giriş şart; üye 403 sayfası görür. Her POST'ta CSRF alanı var (ortak `csrf.ejs`). Her yetkili işlem `audit_log`'a yazılır (`src/denetim.ts`);
hem panel işlemleri hem `/moderasyon` işlemleri.

| Bölüm | Adres | Kim |
|---|---|---|
| Pano (sayılar, çevrimiçi, 30 günlük çubuk grafikler, kategoriler, bekleyen şikâyetler, son işlemler) | `GET /yonetim` | moderatör, admin (son işlemler kutusu yalnızca admin) |
| Kullanıcı listesi (`q, rol, banli, silinmis, sirala, yon, sayfa`) | `GET /yonetim/kullanicilar` | admin |
| Kullanıcı detayı | `GET /yonetim/kullanicilar/:id` | moderatör (e-posta, işlem geçmişi, rozet/şifre/rol blokları gizli) ve admin |
| Ban / ban kaldır (1, 7, 30 gün ya da kalıcı + sebep) | `POST /yonetim/kullanicilar/:id/ban`, `/ban-kaldir` | moderatör (yalnızca "uye" rolündekilere) ve admin |
| Rol, puan (+/- ve sebep), rozet ver/al, hesap kapat (kullanıcı adı yazılarak onay), geçici şifre | `POST /yonetim/kullanicilar/:id/rol`, `/puan`, `/rozet-ver`, `/rozet-al`, `/hesap-kapat`, `/sifre-sifirla` | yalnızca admin |
| Konu/mesaj/sohbet listesi (`tur, q, yazar, kategori, durum, sayfa`) + toplu işlem (sil, geri al, sabitle, kilitle, taşı) | `GET /yonetim/icerik`, `POST /yonetim/icerik/toplu` | moderatör, admin |
| Kategoriler (ad, açıklama, sıra; konusu olan silinmez, "taşı" ile boşaltılır), rütbeler (0 puanlık taban rütbe silinmez), rozet tanımları (kodda adı geçenler silinmez/yeniden adlandırılmaz) + elle rozet verme | `/yonetim/icerik/kategoriler`, `/rutbeler`, `/rozetler` (+ `POST .../:id/duzenle`, `/sil`, `/tasi`, `/ver`) | moderatör, admin (kolayca daraltılabilir: `sadeceAdmin` ekle) |
| Şikâyetler: durum/tür/sebep filtresi, aynı hedefe gelenler gruplu, eylemler: içeriği sil, uyar, banla (süreli), reddet | `GET /yonetim/sikayetler`, `POST /yonetim/sikayetler/islem` | moderatör, admin |
| Site ayarları (kayıt açık/kapalı, duyuru şeridi, yasaklı ifadeler) | `GET/POST /yonetim/ayarlar` | yalnızca admin |
| İşlem kaydı (`eylem, aktor, hedef_tur, hedef_id, bas, son, q, sayfa`) | `GET /yonetim/islem-kaydi` | yalnızca admin |

Kurallar (`src/islemler.ts` `islemHatasi`): kimse kendi hesabında ban/rol/puan/hesap kapatma yapamaz; son (silinmemiş, banlı olmayan) yönetici banlanamaz,
düşürülemez, kapatılamaz; moderatör yalnızca "uye" rolündeki kullanıcılara ve yönetici olmayanların içeriğine dokunur (toplu işlemde yönetici içeriği atlanır).
Dosyalar: `yonetim.ts` (kapı, pano, ayarlar, işlem kaydı), `yonetim-kullanici.ts`, `yonetim-icerik.ts`, `yonetim-sikayet.ts`, `yonetim-ortak.ts`;
ortak mantık `src/islemler.ts` (ban, silme/geri alma), `src/sikayet.ts` (şikâyet hedefi önizleme + eylemler, `/moderasyon` ile paylaşılır),
`src/ayarlar.ts` (ayar önbelleği, yasaklı ifade, duyuru kapatma). Şablonlar `views/yonetim/`, stil `public/css/yonetim.css`.

Site ayarları: `site_settings` bellekte önbelleklenir (kayıtta silinir, 60 sn sonra da eskir). Kayıt kapalıyken `/kayit` formu yerine bilgi çıkar ve POST 403 verir.
Duyuru şeridi `sade` olmayan bütün sayfalarda görünür, oturumda kapatılır (`duyuru_surum` değişince yeniden çıkar).
Yasaklı ifade: küçük harfe `toLocaleLowerCase("tr")` ile çevrilip metnin içinde aranır (başlık, içerik, cevap, sohbet, özel mesaj); eşleşirse alan hatası ya da toast.

## Şikâyet modeli (sql/08)

`reports.hedef_tur`: `konu_mesaji` (post_id), `kullanici` (reported_user_id), `sohbet_mesaji` (chat_message_id), `ozel_mesaj` (message_id);
CHECK tam olarak ilgili sütunun dolu olmasını ister. Grup/oda sohbeti gelince: enum'a değer, yeni FK sütunu, UNIQUE ve CHECK'e bir dal eklenir (sql dosyasında yazılı).
`POST /sikayet` alanları: `post_id | kullanici | sohbet_id | mesaj_id`. Özel mesajı yalnızca alıcı şikâyet edebilir; moderatör yalnızca o mesajı ve çevresini
(öncesinden 3, sonrasından 2 mesaj) görür. Sohbet ve özel mesajlar da yumuşak silinir (`deleted_at`).
Eylemler: sil (silinen mesajın bekleyen şikâyetleri kapanır), uyar (bildirim), banla, reddet.

## Puan kuralı

Konu açmak +5, cevap yazmak +2, mesajına gelen artı oy +1 (eksi oy -1; oy geri alınınca fark düzeltilir).
Puan sıfırın altına inmez. Kendi mesajına oy verilmez. Rütbe, `ranks` tablosunda puanın geçtiği en yüksek eşiktir.
`/siralama` hafta ve ay görünümleri aynı kuralı yalnızca o dönemin olaylarına uygular.

## Bilinen eksikler

- Avatar ve banner yükleme yok: avatar/profil efekti sistemiyle birlikte yapılacak; ayarlar sayfasında bu alanlar kapalı.
- Şifre sıfırlama e-postası gitmiyor (SMTP yok): bağlantı sunucu konsoluna yazılıyor (`src/rotalar/hesap.ts`, "TODO: SMTP").
- Yönetim: özel mesajlar panelde gezilmez, yalnızca şikâyet bağlamında görünür (gizlilik gereği bilerek).
- Ayar önbelleği ve hız sınırı sayaçları sunucu belleğinde: tek sunucu için yeterli, sunucu yeniden başlayınca sayaçlar sıfırlanır.
- Son admin koruması (`digerAdminVar`) kodda var ama gerçek veride denenmedi.

## Güvenlik notları

- Oturum sürümü (`users.oturum_surumu`, `sql/09_guvenlik.sql`): şifre değişince, sıfırlanınca ya da yönetici geçici şifre verince
  sayı 1 artar ve o hesabın başka cihazlardaki oturumları düşer. Uzaklaştırma ve hesap kapatma zaten her istekte kontrol ediliyor.
- Hız sınırı (`src/hiz-siniri.ts`): girişte IP başına 20, hesap başına 5 yanlış deneme / 15 dk; şifremi unuttum IP başına 5 / 15 dk;
  kayıt IP başına 5 hesap / 60 dk. Aşılınca 429 ve "x dakika sonra tekrar dene".
- CSRF belirteci yalnızca şablon formu çizerken üretilir (`res.locals.csrf` toString'li nesne). Formsuz sayfaları gezen misafire
  oturum açılmaz; misafirin oy düğmeleri form değil, giriş bağlantısıdır.
- Kendi mesajını düzenleme/silme: `GET/POST /mesaj/:id/duzenle`, `POST /mesaj/:id/sil` (`src/rotalar/mesaj.ts`). İlk mesaj düzenlenince
  başlık da düzenlenir, silinince konu silinir. Silmede yazarken kazanılan puan (+5 / +2) geri alınır. Kilitli konuda düzenleme yok.

Çevrimiçi listesi eksik değil: sohbetteki liste `users.last_seen_at` (her istekte en fazla dakikada bir güncellenir) ile çalışıyor.

## Dosyalar

| Dosya | Görev |
|---|---|
| `public/css/quadran.css` | Tek stil dosyası. En üstte tasarım değerleri (CSS değişkenleri), altında parçalar ve sayfalar |
| `views/partials/bas.ejs`, `son.ejs` | Sayfanın başı (`<head>`) ve sonu |
| `views/partials/ust-cubuk.ejs` | Üst çubuk. `kullanici` varsa üye, yoksa misafir görünümü |
| `views/partials/gonderi-karti.ejs` | Akış ve profildeki konu kartı |
| `views/partials/oy.ejs`, `yorum.ejs`, `ikon.ejs`, `kontur.ejs` | Oy düğmeleri, yorum, ikon seti, süs deseni |
| `views/konular.ejs` | Akış (`/`) |
| `views/konu.ejs` | Konu sayfası |
| `views/giris.ejs`, `kayit.ejs` | Giriş ve kayıt |
| `views/konu-yeni.ejs` | Konu açma formu |
| `views/profil.ejs`, `ayarlar.ejs`, `404.ejs` | Profil, ayarlar, bulunamadı |
| `src/server.ts` | Ara katmanlar, route dosyalarının bağlanması, `/onizleme`, 404 ve hata yakalayıcı |
| `src/onizleme.ts` | Örnek veriyle önizleme. Gerçek sayfalar bitince silinecek |

Her şablonun en üstündeki yorum, o şablonun beklediği verileri alan alan listeler.

## Tema, vurgu ve görünüm ayarları

`<html data-tema="koyu|acik|sistem" data-vurgu="safir|zumrut|kehribar|ametist|yakut" data-menu="sol|sag" [data-kompakt] [data-az-animasyon]>`.
Değerler `res.locals.tema`, `vurgu`, `menuYonu`, `kompakt`, `azAnimasyon` üzerinden gelir (yoksa koyu + safir).
`sistem`: sunucu tarayıcının tercihini bilemez, bu yüzden `data-tema="sistem"` olduğu gibi yazılır; `quadran.css`'in en sonunda
`@media (prefers-color-scheme: light)` içinde açık temanın değişkenleri (vurgu birleşimleri dahil) bu seçiciye verilir. Koyu tercihte `:root` geçerli kalır.
`data-kompakt`: `.gonderi .ozet` gizlenir, kart dolgusu daralır. `data-az-animasyon`: bütün geçiş ve animasyonlar kapanır.

## CSRF

`src/oturum.ts` içindeki `csrfKoru`: oturumda rastgele bir belirteç tutulur (`req.session.csrf`), şablonlarda `locals.csrf` olarak okunur
(ilk okunduğunda üretilir: tembel, böylece formsuz sayfalarda misafire oturum açılmaz). Her POST formunda
`<input type="hidden" name="_csrf" value="<%= locals.csrf %>">` bulunmalı; yeni form eklerken unutma.
Eksik ya da yanlışsa yanıt 403 olur, toast yazılır ve küçük bir sayfa kullanıcıyı geldiği sayfaya geri yollar.

## Bütün şablonlarda bulunması gerekenler

- `app.locals.zaman(tarih)`: "2 saat önce" yazan yardımcı (`server.ts` içinde).
- `res.locals.kullanici`: giriş yapan kullanıcı ya da `null` (`oturum.ts` doldurur).

## Kurallar (projenin kendi kararları)

- SQL elle yazılır, ORM eklenmez. Kullanıcıdan gelen her değer sorguya `?` yer tutucusuyla verilir, asla metin birleştirmeyle değil.
- Şablonlarda kullanıcı içeriği `<%= %>` ile basılır (HTML'den kaçırılır). `<%- %>` yalnızca `include` ve ikonlar için kullanılır.
- Yeni araç ya da paket eklemeden önce proje sahibine sorulur.
- Proje sahibi SQL'i ve route'ları kendisi yazıp anlamak istiyor: bu kısımları onun yerine sessizce yazma, adım adım ve açıklayarak ilerle.

## Katmanlar

- Ortak katmanlar `views/partials/`: kenar-menu (tablet, 801–1180px), alt-menu (mobil, ≤800px), arama-penceresi (Ctrl+K),
  bildirim-paneli, avatar-menusu, moderasyon-menusu, sikayet-penceresi, bildirim-cubuklari. Stil `public/css/katmanlar.css`,
  davranış `public/js/quadran.js` (JS olmadan da bağlantı/form olarak çalışır). Sayfa stilleri `public/css/sayfalar.css`.
- Önizleme (örnek veri): `/onizleme/katmanlar`, `/onizleme/mesajlar`, `/onizleme/bildirimler`, `/onizleme/ara?q=selinux`,
  `/onizleme/siralama`, `/onizleme/sohbet`, `/onizleme/moderasyon`. Parametreler: `?misafir=1`, `?bos=1`, `?tema=acik&vurgu=zumrut`, `?menu=sag`.
- Moderatör düğmesi `kullanici.rol` "moderator" veya "admin" ise görünür.
- Kilitli konuda cevap formu yerine not gösterilir, sabitli konular akışta "Sabit" etiketiyle en üstte durur.

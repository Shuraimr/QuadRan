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
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/10_panel.sql         # puan kuralları ayarı + 'duyuru' bildirim türü (tekrar çalıştırmak zararsız)
node --env-file=.env src/server.ts
```

Deneme kullanıcıları (şifre hepsinde `test1234`): `shurai` (admin), `ayse` (moderatör), `ahmet` (üye).

## Route'lar

| Dosya | Adresler |
|---|---|
| `src/rotalar/hesap.ts` | `GET/POST /giris`, `/kayit`, `POST /cikis`, `/sifremi-unuttum`, `GET/POST /sifre-sifirla/:token`, `GET /ayarlar`, `POST /ayarlar/profil`, `/ayarlar/gorunum`, `GET/POST /hesap/sifre`, `GET/POST /hesap/eposta`, `POST /hesap/sil` |
| `src/rotalar/forum.ts` | `/` (`?kategori=&sirala=yeni\|populer\|eniyi`), `/konu/yeni`, `/konu/:id` (`?sirala=eniyi\|yeni`), `POST /konu/:id/cevap`, `POST /oy`, `/profil/:username` (`?sekme=yorumlar`), `/ara?q=&sekme=`, `/siralama?donem=hafta\|ay\|tum`, `GET/POST /sikayet` (alanlar `post_id` ya da `kullanici`) |
| `src/rotalar/iletisim.ts` | `/mesajlar`, `/mesajlar/:kullanici` (GET/POST), `/bildirimler`, `/bildirimler/:id`, `POST /bildirimler/okundu`, `/sohbet` (GET herkese açık, POST üyeye) |
| `src/rotalar/moderasyon.ts` | `GET /moderasyon` (301 → `/yonetim/sikayetler`), `POST /moderasyon/:id/sil\|uyar\|reddet\|uzaklastir` (şikâyet id'si; kullanıcı şikâyetinde `sil` yok), `POST /moderasyon/sabitle\|kilitle\|kategori-degistir\|sil\|uzaklastir` (alanlar `post_id`, `topic_id`, kategori için `category_id`) |
| `src/rotalar/yonetim*.ts` | Yönetim paneli, aşağıdaki "Yönetim paneli" bölümüne bak |
| `src/oturum.ts`, `src/yardimci.ts`, `src/sifre.ts` | Oturum (MySQL'de saklanır), ortak yardımcılar (puan, bildirim, rozet, toast), scrypt ile şifre özeti |

Yetki: `girisGerekli()` giriş yoksa `/giris?don=...` adresine yollar; `yetkiliGerekli` moderatör ve admin dışına 403 verir
(GET'te `moderasyon.ejs` "erişimin yok" kutusunu çizer). Uzaklaştırılan kullanıcının oturumu düşer, giremez: ban "aktif" sayılır = `banned_at` dolu VE (`banned_until` boş = kalıcı, ya da henüz geçmemiş);
`banliSql()` (yardimci.ts) bu koşulu üretir, süresi dolan ban `oturum.ts` ve girişte temizlenir.

## Tablolar (sql/06_etkilesim.sql, sql/07_hesap.sql, sql/08_yonetim.sql)

`post_votes` (PK user_id + post_id, value +1/-1), `notifications` (tur: cevap, oy, rozet, mesaj, moderasyon, duyuru),
`reports` (durum bekliyor/islendi/reddedildi), oturum tablosu.
`reports` bir mesajı (`post_id`) ya da bir kullanıcıyı (`reported_user_id`) hedefler, ikisi birden dolu olamaz (CHECK).
UNIQUE (post_id, reporter_id) ve UNIQUE (reported_user_id, reporter_id): aynı kişi aynı hedefi iki kez şikâyet edemez.
`password_resets` (sql/07): `token_hash` = rastgele 32 baytlık belirtecin sha256 özeti (düz belirteç saklanmaz), `expires_at` = +1 saat, `used_at`.
sql/08: `users.banned_until`, `users.ban_reason`, `categories.sort_order`, `chat_messages.deleted_at`, `messages.deleted_at`, `site_settings`, `audit_log`, `reports` yeni hedef modeli.
`users`'a `banned_at`, `tema`, `vurgu`, `menu_sagda`, `kompakt`, `az_animasyon`; `topics`'e `pinned_at`, `locked_at` eklendi.
Silme hep yumuşaktır (`deleted_at`): mesaj silinirse satır kalır; konunun ilk mesajı silinirse konu da gizlenir.

## Yönetim paneli (/yonetim)

Giriş şart; üye 403 sayfası görür. Her POST'ta CSRF alanı var (ortak `csrf.ejs`). Her yetkili işlem `audit_log`'a yazılır (`src/denetim.ts`);
hem panel işlemleri hem `/moderasyon` işlemleri. Kenar menü rolün erişemediği öğeleri HİÇ çizmez (`menuKur`, `yonetim-ortak.ts`); asıl koruma route'larda (`sadeceAdmin`).

### Bilgi mimarisi (kenar menü) ve adresler

| Grup | Öğe | Adres | Kim |
|---|---|---|---|
| (başta) | Bakış: "İlgilenmen gerekenler" kartları (bekleyen şikâyet, 24 saatte dolacak uzaklaştırma, son 24 saatte açılan hesap), topluluk sayıları, 30 günlük grafikler | `/yonetim` | moderatör, admin |
| Moderasyon | Şikâyetler (ana/ayrıntı; `durum, tur, sebep, id, sayfa`; bekleyen sayısı rozeti) | `/yonetim/sikayetler`, `POST .../islem` | ikisi de tam |
| | Yaptırımlar (`filtre=aktif\|yakinda\|dolan\|hepsi`; son uyarılar; kullanıcı adıyla uzaklaştır) | `/yonetim/yaptirimlar`, `POST .../ban` | moderatör yalnızca "uye" rolündekileri banlar/kaldırır, admin tam |
| | Otomatik filtre (yasaklı ifadeler) | `/yonetim/filtre` | moderatör görür, admin düzenler |
| Site bölümleri | Forum: sekmeler Konular · Mesajlar · Kategoriler | `/yonetim/forum`, `/forum/mesajlar`, `/forum/kategoriler`, `POST /yonetim/toplu` | Konular/Mesajlar ikisi de, Kategoriler yalnızca admin |
| | Sohbet (genel sohbet; "Odalar — yakında" sekmesi devre dışı) | `/yonetim/sohbet` | ikisi de |
| | Üyeler (liste; `q, rol, banli, silinmis, kayit=24s, sirala, yon`), Üye kartı, Roller | `/yonetim/uyeler`, `/yonetim/uyeler/:id?sekme=ozet\|icerik\|sikayet\|yaptirim\|islem`, `/yonetim/uyeler/roller` | liste + kart: moderatör (e-posta gizli; yalnızca uyar + ban) ve admin; Roller yalnızca admin |
| | Puan ve ödüller: Puan kuralları · Rütbeler · Rozetler | `/yonetim/puan`, `/puan/rutbeler`, `/puan/rozetler` | yalnızca admin |
| | Oyunlar, Mağaza | (yok) | soluk "yakında" satırları |
| Site | Duyurular: duyuru şeridi + Toplu bildirim (alıcı sayısı onay sayfasında) | `/yonetim/duyurular`, `POST .../bildirim` | yalnızca admin |
| | Kayıt ve erişim (kayıt açık/kapalı) | `/yonetim/kayit-erisim` | yalnızca admin |
| | İşlem kaydı (`eylem, aktor, hedef_tur, hedef_id, bas, son, q, sayfa`) | `/yonetim/islem-kaydi` | admin hepsini, moderatör YALNIZCA kendi işlemlerini görür |
| (üst çubuk) | Panel araması (Ctrl+K): üyeler, konular, `#şikâyet` | `GET /yonetim/ara?q=` | ikisi de |

Üye kartı işlemleri (`POST /yonetim/uyeler/:id/...`): `uyar` (moderasyon bildirimi + kayıt; moderatör+admin), `ban`, `ban-kaldir` (moderatör+admin), `rol`, `puan`,
`rozet-ver`, `rozet-al`, `sifre-sifirla`, `oturumlari-kapat` (`users.oturum_surumu` +1, açık oturumlar düşer), `hesap-kapat` (hepsi yalnızca admin).

Eski adresler 301 ile yenisine gider (GET): `/yonetim/kullanicilar[/:id]` → `/yonetim/uyeler`, `/yonetim/icerik?tur=` → forum / forum/mesajlar / sohbet,
`/yonetim/icerik/kategoriler|rutbeler|rozetler` → yeni yerleri, `/yonetim/ayarlar` → `/yonetim/duyurular`, `/moderasyon` → `/yonetim/sikayetler`.
Sitedeki ⋮ menüsünün `POST /moderasyon/*` adresleri aynen çalışır. Profil sayfasında yetkililere "Yönetimde aç" bağlantısı, avatar menüsündeki "Yönetim" öğesinde bekleyen şikâyet sayısı vardır.

### Yetki matrisi

| | moderatör | admin |
|---|---|---|
| Bakış, Şikâyetler, Forum Konular/Mesajlar, Sohbet | tam | tam |
| Yaptırımlar | yalnızca "uye" rolündekileri ban/kaldır | tam |
| Otomatik filtre | görür | düzenler |
| Forum Kategoriler, Roller, Puan ve ödüller, Duyurular, Kayıt ve erişim | 403 | tam |
| Üyeler liste + kart | görür, uyarır, "uye" rolünü banlar | tam (rol, puan, rozet, geçici şifre, oturumları kapat, hesabı kapat) |
| İşlem kaydı | yalnızca kendi işlemleri | hepsi |

Kurallar (`src/islemler.ts` `islemHatasi`): kimse kendi hesabında ban/rol/puan/hesap kapatma/uyarı yapamaz; son (silinmemiş, banlı olmayan) yönetici banlanamaz,
düşürülemez, kapatılamaz; moderatör yalnızca "uye" rolündeki kullanıcılara ve yönetici olmayanların içeriğine dokunur.

### Tehlikeli işlemler ve sebep

Şikâyet kararı (sil/uyar/uzaklaştır/reddet), toplu silme, hesap kapatma, oturumları kapatma, ban: **sebep zorunlu**; sebep işlem kaydına ve (reddet hariç) kullanıcının bildirimine yazılır.
Kalıcı uzaklaştırma, hesap kapatma, toplu silme, oturumları kapatma ve toplu bildirim önce **onay sayfası** gösterir (`onayIste`, `yonetim-ortak.ts`, `views/yonetim/onay.ejs`):
ilk POST'ta `onay=1` yoksa işlem yapılmaz, form alanları gizli olarak geri gönderilir. Hesap kapatmada ayrıca kullanıcı adı yazılır (`onay_ad`).

### Yaptırım geçmişi

Ayrı tablo yok; `audit_log` kullanılır (`src/yaptirim.ts`). Eylemler: `kullanici.ban`, `kullanici.ban_kaldir`, `kullanici.uyar`, `sikayet.ban`, `sikayet.uyar`.
Kişiye bağlama: kullanıcı sayfasından yapılanlarda `hedef_tur='kullanici'`; şikâyetten yapılanlarda `ayrinti.kullanici_id` (hedef_id şikâyet edilen içeriktir). "Süresi dolan" listesi
`ayrinti.sure` + kayıt zamanından hesaplanır.

### Dosyalar

`yonetim.ts` (kapı, menü, 301'ler, Bakış, arama, işlem kaydı), `yonetim-sikayet.ts` (Şikâyetler, Yaptırımlar), `yonetim-icerik.ts` (Forum, Sohbet, Kategoriler, Rütbeler, Rozetler),
`yonetim-kullanici.ts` (Üyeler, kart, Roller, üye işlemleri), `yonetim-site.ts` (Filtre, Puan kuralları, Duyurular, Kayıt ve erişim), `yonetim-ortak.ts` (menü, onay adımı, sayfalama);
ortak mantık `src/islemler.ts`, `src/sikayet.ts` (şikâyet hedefi önizleme + eylemler), `src/yaptirim.ts`, `src/ayarlar.ts`. Şablonlar `views/yonetim/`, stil `public/css/yonetim.css`
(≥1180px 248px kenar çubuğu, 801–1179px 72px simge şeridi + yan katman, ≤800px üstte kaydırmalı menü; durum renkleri `--d-bekliyor|islendi|reddedildi|ban`, iki temada).

Site ayarları: `site_settings` bellekte önbelleklenir (kayıtta silinir, 60 sn sonra da eskir). Kayıt kapalıyken `/kayit` formu yerine bilgi çıkar ve POST 403 verir.
Duyuru şeridi `sade` olmayan bütün sayfalarda görünür, oturumda kapatılır (`duyuru_surum` değişince yeniden çıkar).
Yasaklı ifade: küçük harfe `toLocaleLowerCase("tr")` ile çevrilip metnin içinde aranır (başlık, içerik, cevap, sohbet, özel mesaj); eşleşirse alan hatası ya da toast.
Toplu bildirim `notifications.tur = 'duyuru'` ile aktif (silinmemiş, banlı olmayan) üyelere ya da tek bir role gider.

## Şikâyet modeli (sql/08)

`reports.hedef_tur`: `konu_mesaji` (post_id), `kullanici` (reported_user_id), `sohbet_mesaji` (chat_message_id), `ozel_mesaj` (message_id);
CHECK tam olarak ilgili sütunun dolu olmasını ister. Grup/oda sohbeti gelince: enum'a değer, yeni FK sütunu, UNIQUE ve CHECK'e bir dal eklenir (sql dosyasında yazılı).
`POST /sikayet` alanları: `post_id | kullanici | sohbet_id | mesaj_id`. Özel mesajı yalnızca alıcı şikâyet edebilir; moderatör yalnızca o mesajı ve çevresini
(öncesinden 3, sonrasından 2 mesaj) görür. Sohbet ve özel mesajlar da yumuşak silinir (`deleted_at`).
Eylemler: sil (silinen mesajın bekleyen şikâyetleri kapanır), uyar (bildirim), banla, reddet.

## Puan kuralı

Konu açmak +5, cevap yazmak +2, mesajına gelen artı oy +1 (eksi oy -1; oy geri alınınca fark düzeltilir) **varsayılanlardır**: değerler `site_settings`'te
(`puan_konu`, `puan_cevap`, `puan_oy`) durur ve `Puan ve ödüller > Puan kuralları` sayfasından değiştirilir (0–1000 tam sayı). Kod `puanKurallari()` (`src/ayarlar.ts`) ile okur:
konu/cevap açma, mesaj silme (geri alma), oy ve `/siralama` hafta/ay sorgusu (üç `?` ile). Değişiklik yalnızca sonraki işlemleri etkiler; var olan puanlar baştan hesaplanmaz.
Puan sıfırın altına inmez. Kendi mesajına oy verilmez. Rütbe, `ranks` tablosunda puanın geçtiği en yüksek eşiktir.

## Arayüz: seçici, hareket ve telefon düzeni (v0.4.0)

- Seçici: `public/js/quadran.js` her `<select>`'i özel açılır listeye çevirir (JS yoksa yerel liste çalışır; `data-yerel` ile kapatılır).
  Gerçek select DOM'da kalır ve forma o gönderilir. Klavye: ↑ ↓ Home End, harfle atlama, Enter, Esc. Zorunlu alan boşsa seçici kırmızı olur.
  Yönetim panelinde yalnızca seçicilerden oluşan süzgeç formları seçince kendiliğinden gönderilir ("Süz" gizlenir).
- Hareket: `public/css/hareket.css` ve `quadran.css`'teki `--sure-*`, `--egri-*`, `--hareket` değişkenleri. "Animasyonları azalt"
  (`<html data-az-animasyon>`) ve işletim sisteminin `prefers-reduced-motion` tercihi hepsini kapatır.
- Yönetim paneli telefonda (≤800px): kenar çubuğu bir popover'dır; üst çubuktaki Menü düğmesi onu soldan kayan çekmece olarak açar.
  Süzgeçler "Süzgeçler" düğmesinin arkasına katlanır; toplu işlem çubuğu satır seçilince ekranın altına sabitlenir;
  tablolar iki sütunlu kartlara dönüşür.
- `/onizleme` sayfaları yalnızca `NODE_ENV` production değilken açıktır (`npm start` yayın modudur).

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

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
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/11_gizlilik.sql       # konum, web sitesi, gizlilik tercihleri, user_blocks (bir kez; ALTER TABLE tekrar çalışmaz)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/12_odalar.sql          # özel odalar: 6 tablo, reports.oda_mesaji, bildirim türü 'oda', oda ayarları (bir kez; ALTER TABLE tekrar çalışmaz)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/13_rutbe.sql           # rütbe sistemi: ranks sütunları + 4 yeni rütbe, points_log (+ geçmiş puanların yedek satırı), users/topics sütunları, 'rutbe' bildirim türü, yeni puan ayarları (bir kez; ALTER TABLE tekrar çalışmaz)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/14_rutbe_duzeltme.sql  # points_log.sebep: baslangic/cozum_geri/davet, geçmiş satırlar baslangic olur (bir kez)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/15_puan_geri_alma.sql    # points_log.sebep: rozet_geri, geri_yukleme (bir kez; ALTER TABLE tekrar çalışmaz)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/16_oy_puan_etkisi.sql    # post_votes.puan_etkisi (bir kez)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/17_puan_tavani.sql    # puan_gunluk_tavan ayarı (bir kez)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/18_profil_premium.sql    # profil/premium sütunları (users: premium_bitis, profil_efekti, avatar_susu, profil_renk_ana/vurgu/gecis, avatar_hareketli, banner_hareketli; bir kez)
docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/19_banner_konum.sql    # users.banner_konum ENUM(ust,orta,alt) DEFAULT orta (bir kez)
node --env-file=.env src/server.ts
```

Deneme kullanıcıları (şifre hepsinde `test1234`): `shurai` (admin), `ayse` (moderatör), `ahmet` (üye).

## Route'lar

| Dosya | Adresler |
|---|---|
| `src/rotalar/hesap.ts` | `GET/POST /giris`, `/kayit`, `POST /cikis`, `/sifremi-unuttum`, `GET/POST /sifre-sifirla/:token`, `GET /ayarlar`, `POST /ayarlar/profil` (kullanıcı adı, hakkında, konum, web sitesi), `/ayarlar/gorunum`, `/ayarlar/gizlilik`, `GET/POST /hesap/sifre`, `GET/POST /hesap/eposta`, `POST /hesap/sil` |
| `src/rotalar/forum.ts` | `/` (`?kategori=&sirala=yeni\|populer\|eniyi`), `/konu/yeni`, `/konu/:id` (`?sirala=eniyi\|yeni`), `POST /konu/:id/cevap`, `POST /oy`, `/profil/:username` (`?sekme=yorumlar`), `/ara?q=&sekme=`, `/siralama?donem=hafta\|ay\|tum`, `/kesfet` (telefon alt menüsünün kapısı: arama, kategori kartları, ilk 5 kullanıcı), `GET/POST /sikayet` (alanlar `post_id`, `kullanici`, `sohbet_id` ya da `mesaj_id`; isteğe bağlı `engelle=1`) |
| `src/rotalar/iletisim.ts` | `/mesajlar`, `GET /mesajlar/yeni?q=` (JS'siz kullanıcı arama), `GET /mesajlar/kisi-ara?q=` (JSON, en fazla 8), `/mesajlar/:kullanici` (GET/POST), `POST /mesajlar/mesaj/:id/sil` (kendi mesajını yumuşak sil), `POST /engel/:kullanici`, `POST /engel/:kullanici/kaldir`, `/bildirimler`, `/bildirimler/:id`, `POST /bildirimler/okundu`, `/sohbet` (GET herkese açık, POST üyeye; üyede sohbet merkezi, `?genel=1` telefonda genel sohbet konuşmasını açar) |
| `src/rotalar/hesap.ts` (profil görünümü) | `POST /ayarlar/avatar`, `/ayarlar/banner` (multipart, alan `dosya`), `POST /ayarlar/avatar/kaldir`, `/ayarlar/banner/kaldir`, `POST /ayarlar/profil-gorunumu` (`efekt`, `sus`, `renk_kullan`, `renk_gecis=duz\|gecis`, `renk_ana`, `renk_vurgu`, `varsayilana_don`) |
| `src/rotalar/premium.ts` | `GET /premium` (yer tutucu: kişinin kendi kartı + "Premium şu an yönetici tarafından veriliyor") |
| `src/rotalar/forum.ts` (kart) | `GET /profil/:ad/kart` (üye kartı penceresi için kısmi HTML) |
| `src/rotalar/rutbe.ts` | `GET /rutbeler` (herkese açık): rütbe listesi + "Puan nasıl kazanılır?" (bölüm "Rütbe sistemi") |
| `src/rotalar/odalar.ts` | Özel odalar, aşağıdaki "Özel odalar" bölümüne bak: `GET /oda/yeni`, `POST /oda`, `GET /oda/:id` (+ `/uyeler\|davet\|baglantilar\|ayarlar\|ayril` yedek pencere adresleri), `POST /oda/:id/mesaj\|sessiz\|ayril\|ayarlar\|sil\|davet\|baglanti`, `POST /oda/:id/mesaj/:mid/sil`, `POST /oda/:id/davet/:did/iptal`, `POST /oda/:id/baglanti/:lid/iptal`, `POST /oda/:id/uye/:uid/yonetici\|sahiplik\|cikar`, `GET /oda/:id/kisi-ara?q=` (JSON), `POST /oda/davet/:did/kabul\|ret`, `GET/POST /oda/katil/:kod` |
| `src/rotalar/moderasyon.ts` | `GET /moderasyon` (301 → `/yonetim/sikayetler`), `POST /moderasyon/:id/sil\|uyar\|reddet\|uzaklastir` (şikâyet id'si; kullanıcı şikâyetinde `sil` yok), `POST /moderasyon/sabitle\|kilitle\|kategori-degistir\|sil\|uzaklastir` (alanlar `post_id`, `topic_id`, kategori için `category_id`) |
| `src/rotalar/yonetim*.ts` | Yönetim paneli, aşağıdaki "Yönetim paneli" bölümüne bak |
| `src/oturum.ts`, `src/yardimci.ts`, `src/sifre.ts` | Oturum (MySQL'de saklanır), ortak yardımcılar (puan, bildirim, rozet, toast), scrypt ile şifre özeti |

Yetki: `girisGerekli()` giriş yoksa `/giris?don=...` adresine yollar; `yetkiliGerekli` moderatör ve admin dışına 403 verir
(GET'te `moderasyon.ejs` "erişimin yok" kutusunu çizer). Uzaklaştırılan kullanıcının oturumu düşer, giremez: ban "aktif" sayılır = `banned_at` dolu VE (`banned_until` boş = kalıcı, ya da henüz geçmemiş);
`banliSql()` (yardimci.ts) bu koşulu üretir, süresi dolan ban `oturum.ts` ve girişte temizlenir.

## Tablolar (sql/06_etkilesim.sql, sql/07_hesap.sql, sql/08_yonetim.sql)

`post_votes` (PK user_id + post_id, value +1/-1, puan_etkisi: bu oyun yazara gerçekte uyguladığı puan, sql/16), `notifications` (tur: cevap, oy, rozet, mesaj, moderasyon, duyuru),
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
| | Sohbet: sekmeler Genel sohbet · Odalar (oda listesi + kapat/aç + oda açma kuralları, mesajlar GÖSTERİLMEZ) | `/yonetim/sohbet`, `/yonetim/sohbet/odalar`, `POST .../odalar/:id/kapat\|ac`, `POST .../odalar/ayar` | ikisi de (kuralları yalnızca admin değiştirir) |
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

`reports.hedef_tur`: `konu_mesaji` (post_id), `kullanici` (reported_user_id), `sohbet_mesaji` (chat_message_id), `ozel_mesaj` (message_id), `oda_mesaji` (room_message_id, sql/12);
CHECK tam olarak ilgili sütunun dolu olmasını ister.
`POST /sikayet` alanları: `post_id | kullanici | sohbet_id | mesaj_id | oda_mesaj_id`. Oda mesajını yalnızca o odanın üyesi şikâyet eder (sistem satırları ve kendi mesajı hariç);
yetkili özel mesajdaki gibi yalnızca o mesajı ve çevresini (öncesinden 3, sonrasından 2) görür, odayı gezemez; "Konu dışı" seçilebilir. Özel mesajı yalnızca alıcı şikâyet edebilir; moderatör yalnızca o mesajı ve çevresini
(öncesinden 3, sonrasından 2 mesaj) görür. Sohbet ve özel mesajlar da yumuşak silinir (`deleted_at`).
Eylemler: sil (silinen mesajın bekleyen şikâyetleri kapanır), uyar (bildirim), banla, reddet.

## Özel odalar (sql/12_odalar.sql)

Davetle girilen grup sohbetleri (konu yok; ad, açıklama, üyeler, mesajlar). Herkese açık ya da şifreli oda YOK. Kod: `src/odalar.ts` (kurallar + sorgular), `src/rotalar/odalar.ts` (route'lar),
`src/rotalar/yonetim-oda.ts` (panel), şablonlar `views/oda.ejs`, `oda-katil.ejs`, `partials/sohbet-liste.ejs`, `oda-pencereleri.ejs`, `oda-ac-penceresi.ejs`, `genel-sohbet.ejs`; stil `sayfalar.css` sonu; betik `quadran.js` sonu.

- Tablolar: `rooms` (`kapatildi_at` = yetkili kapattı, `deleted_at` = sahip sildi), `room_members` (`rol` sahip/yonetici/uye, `sessiz`, `son_okunan_id`; PK room_id+user_id), `room_invites` (durum bekliyor/kabul/ret/iptal; tek bekleyen davet kodda sağlanır),
  `room_links` (`kod` DÜZ METİN + UNIQUE: bağlantı şifre değil davetiye, yöneticiler listede yeniden görüp kopyalayabilsin; süre, kullanım sınırı, `iptal_at`), `room_bans` (çıkarılan 24 saat bağlantıyla dönemez; sütun `bitis`, çünkü `until` MySQL'de ayrılmış kelime),
  `room_messages` (`tur` mesaj/sistem; sistem satırı = "ayse odaya ahmet’i ekledi", `user_id` olayı yapan). `notifications.tur` += `oda`. `site_settings`: `kisi_basi_oda_siniri` (3). (`oda_rutbe_esigi` ayarı sql/13 ile kaldırıldı: oda açma artık rütbenin `oda_ac` ayrıcalığı.)
- Oda açma (`olusturmaDurumu`): rütbenin `oda_ac` ayrıcalığı (admin ve moderatör bu şarttan muaf) VE sahip olunan silinmemiş oda < sınır. Yetmezse `/sohbet` listesinde `partials/kilit.ejs` kilit kartı ("Oda açma <rütbe çipi> rütbesinde açılır · N puan kaldı · Nasıl puan kazanılır?") çıkar, `POST /oda` da reddeder.
- Yetki: üye (oku/yaz, üyeleri gör, sessize al, ayrıl, şikâyet) < yönetici (+ kişi davet et, bağlantı oluştur/iptal, üyeyi çıkar [yalnızca sıradan üyeyi], mesaj sil, ad/açıklama) < sahip (+ yönetici yap/al, sahipliği devret [yeni sahip de oda sınırına tabi], odayı sil, yöneticiyi çıkar). Sahip ayrılamaz.
  Yetkili (admin/moderatör) oda mesajlarını gezemez; kapatılmış odada üyeler okur ama yazamaz, yönetim işlemleri durur (ayrılma ve sessize alma açık).
- Giriş yolları: davet (yönetici kişi arar → bekleyen davet + `oda` bildirimi → davetli sohbet merkezinde Kabul et/Reddet) ve bağlantı `/oda/katil/KOD` (geçerlilik 1 gün/7 gün/süresiz, kullanım sınırı sınırsız/1/5/10/25, en çok 10 etkin bağlantı; durumlar: geçersiz, iptal, süresi dolmuş, sınır dolu, oda kapalı, 24 saat çıkarılma engeli).
  Misafir girişe gider (`don=`). Kabul/katılışta `son_okunan_id` son mesaja ayarlanır (geçmiş okunmamış sayılmaz). Kabul edilen davet çıkarılma engelini kaldırır.
- Engelleme: aramızda engel (iki yönde) olan kişi davet edilemez ve davet aramasında çıkmaz (`engelSql`); odada ben engelledim kişinin mesajı kesikli "Engellediğin kişinin mesajı · Göster" çipi (`<details>`, JS'siz) olur, okunmamış sayısına girmez.
- Yasaklı ifade oda adı/açıklaması/mesajına, hız sınırı (`odaMesaj`, dakikada 20) mesaja uygulanır.
- Arayüz: `/sohbet` = sohbet merkezi (üye): solda "Oda aç" + bekleyen davet kartları + Genel sohbet + ODALARIM (okunmamış sayısı, sessize alınmışta gri), sağda açık konuşma; misafirde eski düzen. Telefonda (≤960px) liste ve konuşma ayrı görünüm (`.mesaj-acik`).
  Oda başlığındaki tek ⋮ menü: Üyeler, Davet et, Davet bağlantıları, Oda ayarları (yöneticiler), Sessize al/Sesi aç, Odadan ayrıl. Her biri `<dialog>`; JS yokken `/oda/:id/<panel>` aynı sayfayı pencere açık (`open`, modal olmadan) çizer, JS modal yapar. Pencerelerdeki formlar `panel` alanıyla aynı pencereye döner.
  Onay soran formlar `data-onay` taşır (kullanıcı içeriği satır içi JS'e girmesin diye `onsubmit` kullanılmaz). Sohbet menüleri (kenar çubuğu, ray, alt menü) sessize alınmamış odada okunmamış mesaj varsa Sohbet üzerinde nokta gösterir (`res.locals.okunmamisOda`, `oturum.ts`).
- Panel (Sohbet > Odalar): liste (ad, sahip, üye ve mesaj SAYISI, oluşturulma, durum), kapat (sebep zorunlu, sahibe bildirim) / yeniden aç, oda açma kuralları formu (admin). İşlem kaydı eylemleri: `oda.kapat`, `oda.ac`, `ayar.oda`.

## Profil seçenekleri, gizlilik ve engelleme (sql/11_gizlilik.sql)

- `users`: `konum VARCHAR(60)`, `web_sitesi VARCHAR(200)` (yalnızca `http://` / `https://`; sunucu `new URL` ile doğrular, profilde `rel="nofollow noopener ugc" target="_blank"` ile çizilir),
  `dm_izni ENUM('herkes','kimse')` (kimler özel mesaj atabilir), `cevrimici_goster BOOLEAN` (kapalıysa sohbetteki çevrimiçi listesinde ve mesajlarda görünmez).
- `user_blocks (blocker_id, blocked_id, created_at)`: PK ikisi birden, FK'ler CASCADE, `CHECK (blocker_id <> blocked_id)`. Engel iki yönlü etkir: ikisi de birbirine yazamaz.
- Kural tek yerde: `src/gizlilik.ts` `mesajDurumu(ben, kisi)` -> `izinli` | `ben_engelledim` | `kapali`. `kapali` = karşı taraf beni engellemiş YA DA `dm_izni = 'kimse'`;
  hangisi olduğu bilerek söylenmez. Sayfa yazı kutusu yerine kart çizer, `POST /mesajlar/:kullanici` aynı kontrolü yapıp reddeder (asıl koruma).
  `cevrimiciSql()` "çevrimiçi" tanımıdır (son 5 dk + `cevrimici_goster`), hem sohbet listesi hem DM üst bilgisi kullanır.
- Özel mesajlar: "Yeni mesaj" düğmesi (JS varsa pencere + `/mesajlar/kisi-ara`, yoksa `/mesajlar/yeni` sayfası; sonuçlar kendini, silinmişleri ve aramızda engel olanları saymaz).
  Her balonda ⋮ menüsü: Kopyala (yalnızca JS), gelen mesajda Şikâyet et, kendi mesajında Sil (`messages.deleted_at`; silinen mesaj kesikli çerçeveli yer tutucu olur:
  gönderene "Bu mesajı sildin", alıcıya "Bu mesaj silindi"; moderatör silmesi de aynı yer tutucuyu gösterir). Üst bilgideki avatar + ad profile giden TEK bağlantıdır;
  altında "Çevrimiçi" ya da rütbe. Üst ⋮ menüsü: `<ad>'i engelle` ve "Kullanıcıyı şikâyet et"; zaten engelliysen "Engeli kaldır" yalnızca yazı kutusunun yerindeki kartta durur (aynı eylem iki yerde çıkmasın).
- Profil: konum + web sitesi meta satırında; ziyaretçide "Mesaj gönder" (yazamıyorsa gizli) ve tek ⋮ menüsü (Engelle / Engeli kaldır, Şikâyet et). Ayarlar'da yeni "Gizlilik" bölümü
  (`#gizlilik`; sol menü, tablet dock'u ve telefon şeridinde `data-bolum-bag`) ve "Engellenenler" listesi.
- `/mesajlar/yeni` adı rota olduğu için `yeni` kullanıcı adı olarak ayrılmıştır (`hesap.ts` `AYRILMIS_AD`).

## Şikâyet sebepleri ve pencere

Sebepler `src/sikayet.ts` `SEBEP_LISTESI`'nde (etiket + açıklama); `reports.sebep`'e ETİKET yazılır (VARCHAR(64) yetti, genişletilmedi). Eski satırlardaki "Hakaret veya nefret söylemi"
olduğu gibi okunur, yalnızca yeni şikâyetler yeni listeyle doğrulanır. Yönetim paneli süzgeci de aynı listeyi kullanır. "Konu dışı" yalnızca konu ve sohbet mesajında seçilebilir
(pencere `data-hedef` ile CSS'ten gizler, `sebepHatasi()` sunucuda da reddeder). "Başka bir sebep" seçilince not zorunludur (JS `required` yapar, sunucu da reddeder, toast).
Pencerede "<ad>'i de engelle" kutusu çıkar: her şikâyet bağlantısı `data-yazar` taşır, işaretliyse şikâyetle birlikte `user_blocks` kaydı da açılır. Pencere kısa ekranda kendi içinde kayar.

## Puan kuralı

Puanlar `site_settings`'te durur ve `Puan ve ödüller > Puan kuralları` sayfasından değiştirilir (0–1000 tam sayı; `puanKurallari()` okur). Varsayılanlar:
konu +5, cevap +2, mesajına gelen artı oy +1 (eksi oy −1; oy geri alınınca fark düzeltilir), günlük ilk ziyaret +1 (`puan_gunluk`), 7 gün üst üste ziyaret +5 (`puan_seri`,
her 7. ardışık günde), cevabı çözüm seçilen yazar +15 (`puan_cozum`), yeni rozet +10 (`puan_rozet`). Değişiklik yalnızca sonraki işlemleri etkiler. Puan sıfırın altına inmez.
Kendi mesajına oy verilmez. Rütbe saklanmaz, `ranks` tablosunda puanın geçtiği en yüksek eşiktir.

## Rütbe sistemi (sql/13_rutbe.sql, sql/14_rutbe_duzeltme.sql, sql/15_puan_geri_alma.sql, sql/16_oy_puan_etkisi.sql, sql/17_puan_tavani.sql)

Figma "07 · Rütbe sistemi". Kod: `src/rutbe.ts` (rütbe önbelleği 30 sn, ayrıcalık kontrolü, kilit bilgisi, `icerikHtml`), `src/yardimci.ts` (`puanEkle`, `rutbeKontrol`, `cozumPuaniGeriAl`, `mesajPuaniniGeriAl/GeriVer`, `rozetVer`),
`src/oturum.ts` (günlük puan + seri + kutlama), `src/rotalar/rutbe.ts`, panel `yonetim-icerik.ts` + `views/yonetim/rutbeler.ejs`, `puan.ejs`.

- **8 rütbe** (`ranks`): Çaylak 0 (filiz, gri) · Gezgin 30 (pusula, yeşil) · Müdavim 100 (ev, camgöbeği) · Katkıcı 250 (el, mavi) · Usta 500 (çekiç, mor) · Uzman 1000 (yıldız, amber) · Efsane 2000 (taç, turuncu) · Duayen 5000 (elmas, pembe).
  Sütunlar: `renk` (gri, yesil, camgobegi, mavi, mor, amber, turuncu, pembe; CSS `--rutbe-<renk>`, koyu/açık/sistem tema ayrı, açık değerler WCAG AA ≥ 4,5), `simge` (`partials/ikon.ejs` adı), ayrıcalıklar `oda_ac`, `baglanti`, `gorsel`, `video`, `imza` (bool) ve `gunluk_oy` (NULL = sınırsız).
  Varsayılan: oda açma + bağlantı Müdavim'den, görsel Katkıcı'dan, imza Usta'dan, video Uzman'dan; günlük oy 20/50/100/200, Usta'dan sınırsız. `gorsel` ve `video` yükleme aşaması için ayrılmış (şimdilik yalnızca saklanır/gösterilir).
- **Rütbe çipi**: `partials/rutbe.ejs` (`rutbeAd` + `rutbeId` verilir; renk/simge `app.locals.rutbeBulId` ile önbellekten NUMARAYLA bulunur). Kullanıcı gösteren her sorgu `rutbeSutunlari(tablo)` ile `rutbe` (ad), `rutbe_id` ve `yazar_rol` sütunlarını alır (`src/yardimci.ts`). Numara önbellekte yoksa konsola uyarı yazılır, önbellek bir kez tazelenir ve sayfa yeniden çizilir (`server.ts` render sarmalayıcısı; "eksik" bayrağı çizim başına AsyncLocalStorage'da tutulur, tazeleme tek paylaşılan Promise'tir: eşzamanlı istekler birbirinin bayrağını tüketmez). Eski `<span class="rozet">` rütbe etiketlerinin hepsi bununla değişti.
- **Ayrıcalık denetimi** (`izinli`, `kilitBilgisi`, `gunlukOyHakki`): admin ve moderatör hepsinden muaf. Oda açma (`olusturmaDurumu`), imza (Ayarlar › Profil, ≤120 karakter, mesajın altında `partials/imza.ejs`; kilitliyse `partials/kilit.ejs`),
  günlük oy (`POST /oy`: oy veren (ve mesaj yazarı) `users` satırları numara sırasıyla `FOR UPDATE` kilitlenir, bugünkü `post_votes.created_at` sayımı bu kilidin İÇİNDE yapılır (eşzamanlı isteklerde hak aşılmaz); oy geri almak serbest; dolunca toast "Bugünkü oy hakkın doldu (N). Usta rütbesinde sınırsız."), bağlantı: kullanıcı içeriği `icerikHtml(metin, yazarRutbeId, yazarRol)` ile çizilir (bağlantı sonundaki `)` / `]` yalnızca adreste eşi yoksa kırpılır: `.../Ankara_(il)` bütün kalır) —
  yazar admin/moderatörse her zaman, değilse rütbesi `baglanti` veriyorsa http(s) adresleri `rel="nofollow noopener ugc" target="_blank"` bağlantı olur, yoksa düz yazı (konu/cevap, genel sohbet, oda, özel mesaj; her durumda HTML kaçırılır).
- **Puan günlüğü** `points_log` (`miktar` uygulanan gerçek fark; `sebep` konu/cevap/oy/gunluk/seri/cozum/cozum_geri/rozet/rozet_geri/duzeltme/silme/geri_yukleme/baslangic/davet; `ilgili_id`): `users.points`'e giden HER değişiklik `puanEkle(userId, miktar, sebep, ilgiliId[, bağlantı])` ile yazılır
  (satır kilitli transaction; toplam her zaman `users.points`'e eşit). Geçmiş puanlar için kullanıcı başına tek `baslangic` satırı (sql/13'te `duzeltme` idi, sql/14 çevirdi), tarihi bilerek 2000-01-01 (kayıt tarihi verilseydi hafta/ay sıralamasında eski puan "bu hafta" görünürdü; geçmiş sayfası sebebe bakar: "Önceki puanların"). `oy` satırı geçmişte işarete göre yazılır (artı = "Mesajına artı oy verildi", eksi = "Eksi oy ya da geri alınan oy"). `davet` sebebi ve `puan_davet` ayarı (5) hazır ama KULLANILMIYOR: davet puanı referans aşamasında (yol haritası 3.4) `puanEkle(..., "davet", ...)` ile bağlanacak.
  `/siralama` hafta/ay = dönem başından beri `points_log` toplamı; "tüm zamanlar" = `users.points`.
- **Silme / geri yükleme puanı** (`mesajPuaniniGeriAl`, `mesajPuaniniGeriVer`; hepsi çağıranın transaction'ında, yazarın `users` satırı önce kilitlenir): mesaj silinince (yetkili silişi `islemler.ts mesajiSil/konuyuSil`, kendi silişi `/mesaj/:id/sil`) yazarın o mesajdan kazandığı puan geri alınır (`silme`). Miktar bugünkü ayardan değil `points_log`'dan hesaplanır:
  açık = (`konu` → konu no / `cevap` → mesaj no) + (`silme` + `geri_yukleme`, mesaj no); açık > 0 ise o kadar düşülür. Aynı mesaj iki kez (eşzamanlı iki yetkili dahil) geri alınamaz. Mesaja gelen oyların puanı kalır. Yetkili silineni GERİ YÜKLERSE (`mesajiGeriAl`, `konuyuGeriAl`) `silme` + `geri_yukleme` toplamı eksiyse o kadar `geri_yukleme` olarak geri verilir (yanlışlıkla silinen kişi kaybetmesin); tekrar geri yüklemek 0 verir, sil → geri al → sil döngüsü her seferinde bir kez alıp bir kez verir.
- **Rozet puanı**: `rozetVer` bu kişiye bu rozet için daha önce HİÇ `rozet` puanı yazılmışsa rozeti yine verir ama puanı vermez (al → yeniden ver döngüsüyle puan kasılmasın). Yönetici "rozet al" (`yonetim-kullanici.ts rozet-al`) rozeti ve açık rozet puanını (`rozet` + `rozet_geri`, o rozet no) TEK transaction'da siler/geri alır (`rozet_geri`).
- **Günlük puan ve seri** (`oturum.ts gunlukPuan`): günün ilk isteğinde koşullu `UPDATE users SET seri_gun, son_gunluk_puan` (affectedRows=1 ise bir kez); dün de geldiyse seri+1, yoksa 1; seri 7'nin katıysa `puan_seri` ayrıca.
- **Çözüm**: `topics.cozum_post_id`; `POST /konu/:id/cozum` (`post_id`; konu sahibi ya da yetkili; aynı cevaba tekrar = kaldır, başkasına = geçir). Yazar ≠ konu sahibiyse `puan_cozum` ('cozum'), kaldırınca/geçirince/cevap silinince `cozum_geri` ile geri alınır. İşlem TEK transaction'dır: `topics` satırı `FOR UPDATE` kilitlenir, `cozumPuaniGeriAl(cevap, konuSahibi, bağlantı)` yalnızca "hâlâ açık" miktarı (SUM('cozum') + SUM('cozum_geri') o cevap için) geri alır, böylece eşzamanlı istekte çift +15 / çift geri alma olmaz. Yetkili (`islemler.ts mesajiSil`) ya da yazar (`/mesaj/:id/sil`) çözüm cevabını silerse `silinenCozumuTemizle` aynı transaction'da işareti kaldırır ve puanı geri alır; silinen mesaj konunun İLK mesajıysa (konu siliniyor) çözüm cevabının açık çözüm puanı da geri alınır ve işaret kalkar. Mesaj/konu sonradan GERİ ALINIRSA çözüm işareti ve çözüm puanı otomatik geri gelmez (puan çoğaltılamasın), konu sahibi yeniden seçer. Aynı cevaba okunmamış "çözüm" bildirimi varken yenisi yazılmaz (işaretle-kaldır spamı).
  Çözüm cevabı ilk mesajın altında sabit, yeşil kenar + "Çözüm" çipi; akış kartında ve konu başlığında "Çözüldü" çipi. Düğme yalnızca konu sahibine (ve yetkiliye) cevabın eylem satırında.
- **Rütbe atlama**: `puanEkle` sonrası `rutbeKontrol` rütbe yükseldiyse `notifications.tur='rutbe'` bildirimi ("Usta oldun! Artık ..."; yönetici/moderatöre yalnızca "Usta oldun!", zaten her ayrıcalıkları var) yazar ve `users.kutlama_rutbe_id` doldurur; `ortakVeriler` bir sonraki GET'te rütbe simgeli kutlama çubuğunu çizer ve alanı temizler
  (oturum yerine veritabanı: oyu alan kişi başka cihazda/çevrimdışı olabilir). Puan düşünce bildirim yok, ayrıcalıklar yeniden hesaplanır.
- **Sayfalar**: profil rütbe kartı (`profil.ejs`; kendi profilinde "Puan geçmişi" → `?sekme=puan`; sayfa başı 100 hareket, `&once=<log id>` ile daha eskiler, "Daha eski →" yalnızca 100'den fazla hareket varsa görünür; admin/moderatör profilinde kilitli "açılacaklar" yerine "Yetkili: bütün ayrıcalıklar açık"), `/rutbeler` (`views/rutbeler.ejs`, `/siralama` başlığından bağlantı), panel Puan ve ödüller › Rütbeler
  (tek tablo, tek "Kaydet": ad, eşik, renk, simge, ayrıcalıklar, günlük oy; "Rütbe ekle" alttaki rütbenin ayrıcalıklarını kopyalar; 0 puanlık taban rütbe silinmez/eşiği değişmez; işlem kaydı `rutbe.duzenle` değişen alanları yazar).

**Revizyon (2026-11-20):**
- Oy puanı (sql/16): yazara uygulanan miktar `hedef (oy × puan_oy, geri alınınca 0) − post_votes.puan_etkisi` olur ve gerçekte uygulanan (0'da kırpılmış olabilir) satıra yazılır. Böylece puanı 0 olan yazara verilen eksi oy sonradan artıya çevrilip geri alınınca fazladan puan kalmaz; `puan_oy` ayarı sonradan değişse de geri alınan miktar verilenle aynıdır.
- Hazır olmayan ayrıcalıklar: `AYRICALIKLAR[].hazir` (görsel/video yükleme `false`). `acilanlar()` bunları `yakinda: true` işaretiyle döndürür; /rutbeler ve profil kartında soluk "· yakında" görünür, rütbe atlama bildirimi/kutlama cümlesine girmez (çağıranlar `!yakinda` süzer). Hiç ayrıcalığı olmayan üst rütbelerde "Profil çerçevesi ve isim rengi · yakında" (profil/premium aşamasına ertelendi). Telefonda /rutbeler başında "← Profil" bağlantısı (≤800px).
- Oy deadlock: `/oy` transaction'ı ER_LOCK_DEADLOCK (1213) alırsa en çok 3 deneme (2 yeniden deneme) yapılır; yine olmazsa 500 yerine "Oy şu an kaydedilemedi" bildirimi. Artı oy bildirimi: aynı yapan + aynı mesaj için okunmamış `oy` bildirimi varsa yenisi yazılmaz (aç/kapa seli olmaz).
- Günlük puan tavanı (sql/17): `site_settings.puan_gunluk_tavan` (varsayılan 40, 0 = sınırsız; panel: Puan ve ödüller). `tavanliPuanEkle` (yardimci.ts) konu/cevap puanını, bugün kazanılan pozitif `konu`+`cevap` toplamına göre tavana kırpar (silme satırları sayılmaz; yetkililer de tabi); içerik yine yayınlanır. Puansız/kırpılmış içeriği silmek `mesajPuaniniGeriAl` kayıttan okuduğu için yalnızca gerçekten verilen kadarını düşürür.
- Profil rütbe kartındaki "Puan geçmişi" bağlantısı kaldırıldı (sekme listesinde zaten var; aynı hedef aynı sayfada iki kez olmasın).
- **Kendi konusuna cevap puan getirmez** (`forum.ts` `/konu/:id/cevap`): `cevap` puanı yalnızca `konu.user_id !== k.id` ise yazılır (konuyu silince kendi cevap puanları kalıp puan kasılmasın). "Yardımsever" rozeti ve bildirim davranışı aynı; `mesajPuaniniGeriAl` puanı kayıttan okuduğu için puansız cevapta bir şey geri almaz.
- **Hız sınırı** `cevapYazma` (`src/hiz-siniri.ts`, dakikada 6, kullanıcı başına, konu açma + cevap ORTAK sayaç): aşılınca cevapta uyarı + yönlendirme, konu açmada 429 + form hatası. Admin/moderatör muaf (oda mesajındaki `odaMesaj` ise herkese uygulanır). Sayaç bellekte, sunucu kapanınca sıfırlanır.
- **Eşzamanlı silme/geri alma** (`islemler.ts` `mesajiSil/mesajiGeriAl/konuyuSil/konuyuGeriAl`, `rotalar/mesaj.ts` kendi silişi): "silinmemiş/silinmiş mi" denetimi transaction içinde `FOR UPDATE` ile yeniden yapılır. Kilit sırası: konu → mesaj → users. Kaybeden istek `null`/`false` döner; çağıranlar (moderasyon, yönetim, şikâyet) o durumda bildirim ve işlem kaydı yazmaz. `konuyuSil` ilk mesaj zaten silinmişse yalnızca konu hâlâ açıksa `true` döner.
- **`/oy`**: konusu silinmiş mesaja oy verilemez (`topics.deleted_at` denetimi).
- **Profil**: "Puan geçmişi" sekmesi kendi profilinde bütün sekmelerde listelenir; sayfalamada `once` varken "Bu sayfada 100 hareket gösteriliyor." yazar.
- **Puan ayarlama** (`yonetim-kullanici.ts`): işlem kaydındaki önceki/sonraki puan `puanEkle`'nin döndürdüğü `{eski, yeni}`'den gelir.


## Profil görünümü, yükleme ve premium (sql/18_profil_premium.sql)

Figma "10 · Premium: isim stili ve profil arka planı" ve "11 · Premium: profil efektleri ve renk". Kod: `src/yukleme.ts`, `src/premium.ts`, `src/profil-gorunum.ts`, `src/rotalar/premium.ts`, `public/css/efektler.css`, `public/js/quadran.js` sonu,
şablonlar `partials/avatar.ejs`, `avatar-sus.ejs`, `profil-efekt.ejs`, `profil-karti.ejs`, `profil-gorunumu-bolumu.ejs`, `views/premium.ejs`.

- **Sütunlar** (`users`): `premium_bitis` (NULL/geçmiş = ücretsiz; "süresiz" = `9999-12-31 23:59:59`), `profil_efekti` (cadilar, melek, seytan, kar, sakura, atesbocegi, ejderha), `avatar_susu` (cadi_sapkasi, hale_kanat, boynuz_kuyruk, bere, kiraz, fener, ejderha), `profil_renk_ana`, `profil_renk_vurgu` (`#rrggbb`), `profil_renk_gecis` (0 düz = varsayılan, 1 banner'da ana→vurgu geçişi), `avatar_hareketli`, `banner_hareketli`. `avatar_url`/`banner_url` sql/01'den beri vardı.
- **Premium kuralı** tek yerde: `premiumMu(k)` (`src/premium.ts`). **Admin (kurucu) premium şartından muaftır** (kullanıcı kararı 2026-11-20); moderatör muaf değil. SQL tarafında tek ifade `premiumSql(tablo)` (`src/yardimci.ts`): `premium_bitis > NOW() OR rol = admin`: `rutbeSutunlari()` artık `avatar_url` + `avatar_susu` da döndürür (süs premium değilse NULL), `profilGorunumSutunlari()` banner/efekt/renk/süs'ü premium'a bağlı verir. Premium biten kişinin seçimleri silinmez, görünmez olur; yenilenirse geri gelir. (Not: biten premium'un daha önce yüklediği hareketli WebP dosyası yerinde kalır ve oynamaya devam eder.)
- **Premium'a bağlı olanlar**: efekt, süs, renkler (düz/geçiş dahil), hareketli avatar/banner. Avatar/banner yükleme herkese açık. Ücretsiz kişi her şeyi önizleyebilir ama `POST /ayarlar/profil-gorunumu` seçim kaydını reddeder (yalnızca temizleyebilir); düğme "Premium ile kaydet" olur ve `/premium`'a gider.
- **Panel**: `/yonetim/uyeler/:id` › Hesap grubunda "Premium" (yalnızca admin): `POST /yonetim/uyeler/:id/premium` (`sure` = 1 / 3 / 12 / suresiz / kaldir; süre bugünden başlar). İşlem kaydı `kullanici.premium_ver` / `kullanici.premium_kaldir`. Ödeme yok.
- **Yükleme altyapısı** (`src/yukleme.ts`, ileride sohbet/oda/DM görsel ve videosu da buradan geçecek): giriş şart → multer memoryStorage (8 MB, yalnızca jpeg/png/webp/gif MIME) → CSRF multer'dan SONRA doğrulanır → hız sınırı `dosyaYukleme` (10 dk'da 10) → sharp ile gerçek içerik doğrulaması (açamazsa reddedilir, en çok 300 kare, 40 MP) → her zaman WebP'ye yeniden kodlama (q90, effort 5). Avatar 256×256, banner **1800×818 (2,2:1, telefon oranı)**; ikisi de önce kırpılır (aşağıdaki "Kırp ve konumla"), kırpma yoksa ortadan `cover`. Girdi hareketliyse ve kişi premium ise hareketli WebP (`*_hareketli = 1`), değilse ilk kare durağan + toast "Hareketli avatar/banner premium üyelerde oynar; ilk kare kaydedildi.". Dosyalar `yuklemeler/<uuid>.webp` (gitignore'da), `/yuklemeler` statik, 30 gün immutable + `X-Content-Type-Options: nosniff`. Eski dosya yenisi yüklenince, "Kaldır"da, hesap silinince/kapatılınca diskten silinir (`dosyaSil` yalnızca `/yuklemeler/<uuid>.webp` biçimini siler).
- **Kırp ve konumla** (Figma 11: 40:4 Görseller satırı, 40:29 masaüstü pencere, 40:70 telefon alttan sayfa): Ayarlar › Profil görünümü'nde her satırda önizleme · ad/bilgi · "Değiştir" (görünmez `input.gorunmez` taşıyan `<label>`; klavyeyle odaklanır) + "Kaldır". JS varsa dosya seçilince yükleme yapılmaz, `#kirp-pencere` (`<dialog>`, ≤800px'te alttan sayfa) açılır: sürükleme (pointer events, dokunmatik dahil), kaydırıcı, fare tekerleği, iki parmak, ok tuşları (+/− yakınlaştırır); görsel alanı her zaman doldurur. Avatar: kare alan + yuvarlatılmış kare maske, önizleme Profil 64 / Kart 44 / Mesaj 28. Banner: 2,2:1 alan, kesikli "Tablet" (3:1) ve "Masaüstü" (3,7:1) şeritleri, 3×3 ızgara, "Geniş ekranda yasla" Üst/Orta/Alt, önizleme Telefon/Tablet/Masaüstü. "Kaydet" `fetch` ile `Accept: application/json` göndererek POST eder (başarıda `{tamam:true}` → sayfa yenilenir, toast sunucudan; hata `{hata}` → pencerede gösterilir). JS yokken/pencere açılamazsa form eskisi gibi gönderilir ("Yükle" düğmesi `.js` yokken görünür), sunucu ortadan kırpar.
  - **Kırpma parametreleri** (multipart alanları): `kirp_x`, `kirp_y`, `kirp_g`, `kirp_y2` = KAYNAK görselin doğal piksel koordinatlarında sol-üst köşe ve boyut (tamsayı, en çok 5 hane); banner için ayrıca `konum` = `ust|orta|alt`. Sunucu doğrulaması (`kirpmaGecerli`, `src/yukleme.ts`): x,y ≥ 0; g,y2 ≥ 64; x+g ≤ genişlik, y+y2 ≤ yükseklik (hareketli görselde kare yüksekliği `pageHeight`; EXIF yönü 5–8'de en/boy yer değiştirir); avatar |g−y2| ≤ 1; banner g/y2 = 2,2 ±%2. Geçersiz ya da eksik kırpma HATA DEĞİL: eski davranışa (ortadan `cover`) düşülür. Geçersiz `konum` reddedilir (400 / toast). `extract` sonra `resize`; hareketli GIF'te sharp `extract`'ı her kareye ayrı uygular (denendi).
  - **`banner_konum`** (sql/19): tablet/masaüstü bannerı 2,2:1 görselden üst/alt keser; hangi şeridin kalacağı burada. `profilGorunumSutunlari()` döndürür; şablonlarda `data-konum="ust|orta|alt"` (`.profil-ust .banner`, `.pk-banner`, Ayarlar önizlemesi) ve CSS `object-position`. Banner yeniden yüklenince `konum` alanıyla (yoksa `orta`), "Kaldır"da `orta`'ya döner.
- **Multipart ve CSRF**: `express.urlencoded` multipart gövdeyi çözmez. `oturum.ts` `csrfKoru` yalnızca `COKLU_PARCALI_ADRESLER` (`/ayarlar/avatar`, `/ayarlar/banner`) için kontrolü multer'dan sonraya erteler (`yuklemeKatmani` içindeki `csrfDogrula`); başka adrese multipart POST gövdesiz kalır ve 403 alır. Koruma kapatılmadı, yalnızca doğrulama zamanı değişti.
- **Arayüz**: Ayarlar › "Profil görünümü" (`#profil-gorunumu`): gruplar Görseller · Renk (kendi renklerimi kullan, Düz/Geçiş, ana/vurgu: `<input type=color>` + HEX; JS varsa özel seçici popover'ı: doygunluk×parlaklık, ton, HEX, EyeDropper, rastgele, son kullandıkların [localStorage]; telefonda alttan sayfa) · Efekt · Avatar süsü. Sağda (telefonda üstte) canlı önizleme = kişinin kendi kartı (`quadran.js` seçimlere göre öznitelik/değişken günceller). Efekt/süs seçici kutucuklarında küçük canlı önizleme (üzerine gelince/seçilince oynar).
- **Kart bileşeni** (`partials/profil-karti.ejs`): sitenin kart dili (`--yuzey-1`, 16px, `--kat-1`; popover'da `--kat-2`). Ana renk banner'ı (resim yoksa) ve avatar halkasını, vurgu rengi üst çizgiyi ve bağlantıları boyar; geçiş yalnızca isteyende ve yalnızca banner'da. Efekt iki katman: arka (banner içinde) ve ön (bütün kartın üstünde, yarı saydam, `pointer-events:none`). Efektler CSS `@keyframes` (yalnızca transform/opacity/filter), 3,6 sn, faz = negatif `animation-delay`, konumlar container query birimleriyle (`cqw`/`cqh`) kartın boyutuna oranlanır; `[data-az-animasyon]` ve `prefers-reduced-motion` altında animasyon kapanır, parçacıklar durağan görünür. Veri: `src/profil-gorunum.ts` (parçacık listeleri, SVG'ler, süs konumları).
- **Avatar süsü**: büyük boyutta (kart, profil, hesap menüsü) oynar; listelerde küçük ve hareketsiz, üzerine gelince bir kez oynar. Üst çubuktaki avatarda gösterilmez (sağ kenarda yatay taşma yapıyordu).
- **Ejderha (süs + efekt, Figma 12)**: ayrıntılı illüstrasyon olduğu için SVG değil, şeffaf görsel: `public/img/susler/ejderha.webp` (560px; Figma'nın görsel üretme aracıyla üretildi, siyah zemini şeffaflaştırıldı). `SVG.ejderha_halka` / `ejderha_golge` içinde `<img>` olarak durur. Süs `don: true` → `.av-sus-oge.don`: avatarın 2,05 katı halka, büyük boyutta 12 sn'de bir tur döner, listelerde üzerine gelince 4 sn'de bir tur; ≤48px avatarda 1,5 kata iner ve avatar yanına pay alır (yanındaki isim halkanın altında kalmaz). Profil başlığı, üye kartı ve konu sayfası halkaya yer açar (`efektler.css` "Ejderha halkası"). Efekt: banner'da soluk büyük ejderha + kıvrımlı bulutlar + altın kıvılcımlar.
- **Avatar her yerde**: `partials/avatar.ejs` (resim varsa `<img>`, yoksa harf). Hareketli avatar listelerde de oynar; `data-az-animasyon` açıkken WebP durdurulamaz (CSS animasyonu değil, görsel) — bilinen sınır.
- **Üye kartı penceresi**: konu kartı, yorum ve genel sohbette yazar adı/avatarı `data-uye-karti` taşır; JS varsa `GET /profil/:ad/kart` kısmi HTML'i popover'da açar (Esc/dışarı tıklama kapatır, telefonda ekran ortası), JS yoksa bağlantı profile gider.
- **Gradyan kuralı**: sitenin hiçbir yerinde gradyan yok; tek istisnalar kişinin isteğe bağlı "Geçiş" seçimi (yalnızca profil bannerı) ve renk seçicinin işlevsel doygunluk/ton yüzeyleri.

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

## Gezinme modeli (hangi hedef nerede)

Kural: bir ekran genişliğinde aynı hedef kalıcı arayüzde (üst çubuk, kenar menü, alt menü, hesap menüsü) iki kez bulunmaz.
Sayfa içeriği doğal bağlantı verebilir (konunun kategori çipi gibi). Ana bölümler masaüstü/tablette en çok 1, telefonda Akış/Sohbet 1, Kategoriler/Sıralama 2 dokunuş (Keşfet üzerinden). Kişisel hedefler her yerde en çok 2.

| Hedef | Masaüstü (>1180px) | Tablet (801–1180px) | Telefon (≤800px) |
|---|---|---|---|
| Akış `/` | kenar çubuğu | simge rayı | alt menü |
| Kategoriler | kenar çubuğu (+ altında kategori listesi) | rayda Kategoriler (`/kategoriler`) | alt menü Keşfet > kart; akışta yatay çipler (içerik) |
| Sohbet | kenar çubuğu | raylı | alt menü |
| Sıralama | kenar çubuğu | raylı | Keşfet > "Tümünü gör" |
| Keşfet `/kesfet` | yalnızca adresle | yalnızca adresle | alt menü |
| Konu aç | üst çubuk | rayda kalem (FAB) | alt menü (üyeler) |
| Ara | üst çubuk (Ctrl K) | üst çubuk | Keşfet'teki arama kutusu |
| Bildirimler | üst çubukta zil (panel) | üst çubukta zil | üst çubukta zil (panel tam genişliğe yakın) |
| Mesajlar | hesap menüsü | hesap menüsü | üst çubuk simgesi |
| Profil | hesap menüsü | hesap menüsü | alt menü Profil > hesap menüsü |
| Ayarlar | kenar çubuğu altı | rayın altı | hesap menüsü |
| Yönetim (yetkili) / Çıkış | hesap menüsü | hesap menüsü | hesap menüsü (alt menü Profil'den) |

Kod: `views/partials/kenar-menu.ejs` tek parçadır; 801–1180px'te 88px simge rayı, 1181px+ 248px etiketli sol çubuk olarak görünür
(`katmanlar.css`; `data-menu="sag"` sağa alır). Kategori listesi `res.locals.menuKategoriler` (`src/oturum.ts`, 30 sn bellek önbelleği).
Telefonda alt menü ve üst çubuğun CSS ile gizlenen parçaları "Tekrarı önleme" bloğundadır. Akıştaki sol kategori sütunu (`.akis-kategoriler`) yalnızca telefonda çip olarak görünür.

## Bilinen eksikler

- Avatar/banner yükleme var (bölüm "Profil görünümü"); henüz yok: sohbet/oda/DM görsel ve video yükleme, premium unvan/isim stili/profil arka planı, ödeme.
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
| `src/rutbe.ts`, `views/partials/rutbe.ejs`, `kilit.ejs`, `imza.ejs`, `views/rutbeler.ejs` | Rütbe sistemi (bölüm "Rütbe sistemi") |

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

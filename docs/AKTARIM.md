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
node --env-file=.env src/server.ts
```

Deneme kullanıcıları (şifre hepsinde `test1234`): `shurai` (admin), `ayse` (moderatör), `ahmet` (üye).

## Route'lar

| Dosya | Adresler |
|---|---|
| `src/rotalar/hesap.ts` | `GET/POST /giris`, `/kayit`, `POST /cikis`, `/sifremi-unuttum` (e-posta gitmez), `GET /ayarlar`, `POST /ayarlar/profil`, `/ayarlar/gorunum`, `/hesap/sil` |
| `src/rotalar/forum.ts` | `/` (`?kategori=&sirala=yeni\|populer\|eniyi`), `/konu/yeni`, `/konu/:id` (`?sirala=eniyi\|yeni`), `POST /konu/:id/cevap`, `POST /oy`, `/profil/:username`, `/ara?q=&sekme=`, `/siralama?donem=hafta\|ay\|tum`, `GET/POST /sikayet` |
| `src/rotalar/iletisim.ts` | `/mesajlar`, `/mesajlar/:kullanici` (GET/POST), `/bildirimler`, `/bildirimler/:id`, `POST /bildirimler/okundu`, `/sohbet` (GET herkese açık, POST üyeye) |
| `src/rotalar/moderasyon.ts` | `GET /moderasyon?durum=`, `POST /moderasyon/:id/sil\|uyar\|reddet` (şikâyet id'si), `POST /moderasyon/sabitle\|kilitle\|kategori-degistir\|sil\|uzaklastir` (alanlar `post_id`, `topic_id`) |
| `src/oturum.ts`, `src/yardimci.ts`, `src/sifre.ts` | Oturum (MySQL'de saklanır), ortak yardımcılar (puan, bildirim, rozet, toast), scrypt ile şifre özeti |

Yetki: `girisGerekli()` giriş yoksa `/giris?don=...` adresine yollar; `yetkiliGerekli` moderatör ve admin dışına 403 verir
(GET'te `moderasyon.ejs` "erişimin yok" kutusunu çizer). Uzaklaştırılan kullanıcının (`users.banned_at`) oturumu düşer, giremez.

## Tablolar (sql/06_etkilesim.sql)

`post_votes` (PK user_id + post_id, value +1/-1), `notifications` (tur: cevap, oy, rozet, mesaj, moderasyon),
`reports` (UNIQUE post_id + reporter_id; durum bekliyor/islendi/reddedildi), oturum tablosu.
`users`'a `banned_at`, `tema`, `vurgu`, `menu_sagda`, `kompakt`, `az_animasyon`; `topics`'e `pinned_at`, `locked_at` eklendi.
Silme hep yumuşaktır (`deleted_at`): mesaj silinirse satır kalır; konunun ilk mesajı silinirse konu da gizlenir.

## Puan kuralı

Konu açmak +5, cevap yazmak +2, mesajına gelen artı oy +1 (eksi oy -1; oy geri alınınca fark düzeltilir).
Puan sıfırın altına inmez. Kendi mesajına oy verilmez. Rütbe, `ranks` tablosunda puanın geçtiği en yüksek eşiktir.
`/siralama` hafta ve ay görünümleri aynı kuralı yalnızca o dönemin olaylarına uygular.

## Bilinen eksikler

- Avatar ve banner yükleme yok (çok parçalı form çözümleyici paketi gerekir); ayarlar sayfasında bu alanlar kapalı.
- Şifre sıfırlama e-postası gitmiyor (SMTP yok). `/hesap/eposta` ve `/hesap/sifre` sayfaları yazılmadı.
- "Sistem" teması CSS'te yok (şimdilik koyu). `kompakt` ve `az_animasyon` kaydediliyor ama CSS'te karşılığı yok.
- Profildeki "Yorumlar" sekmesi boş; kullanıcı şikâyeti yok (yalnızca mesaj şikâyeti).
- CSRF belirteci yok; tek koruma oturum çerezinin `sameSite=lax` olması.
- Moderasyon menüsünde "Kategoriyi değiştir" yalnızca "henüz yok" der.
- Çevrimiçi listesi için tablo yok.

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

## Tema ve vurgu rengi

`<html data-tema="koyu|acik" data-vurgu="safir|zumrut|kehribar|ametist|yakut">`.
Değerler `res.locals.tema` ve `res.locals.vurgu` üzerinden gelir (yoksa koyu + safir).
"sistem" seçeneği henüz uygulanmadı: `prefers-color-scheme` ile ayrıca ele alınmalı.

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

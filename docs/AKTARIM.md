# QuadRan arayüz paketi: aktarım notları

Bu paket, Figma'daki "Kristal Tasarım" sayfasının düz CSS + EJS karşılığıdır.
Hedef proje: Node 22 (TypeScript dosyalarını doğrudan çalıştırır), Express 5, mysql2 (ORM yok, saf SQL), EJS, MySQL 8.4.

## Durum (dürüst özet)

- Dosyalar gerçek bir sunucuda **çalıştırılıp görülmedi**. Yapılan kontrol: `node --check` ile `src/*.ts` sözdizimi ve
  EJS şablonlarının JavaScript'e çevrilip derlenmesi (çalıştırılmadan). Görsel hatalar ve yanlış sütun adları çıkabilir.
- Yalnızca `/` (akış) gerçek veritabanına bağlı. Diğer sayfalar şimdilik `/onizleme/...` altında **örnek veriyle** görünür.
- Sorgulardaki sütun adları şemanın diyagramından alındı. "Unknown column" hatası çıkarsa `sql/` klasöründeki gerçek adlarla düzeltilmeli.

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
| `src/server.ts` | `/` sayfası, statik dosyalar, `/onizleme`, 404 |
| `src/onizleme.ts` | Örnek veriyle önizleme. Gerçek sayfalar bitince silinecek |

Her şablonun en üstündeki yorum, o şablonun beklediği verileri alan alan listeler.

## Tema ve vurgu rengi

`<html data-tema="koyu|acik" data-vurgu="safir|zumrut|kehribar|ametist|yakut">`.
Değerler `res.locals.tema` ve `res.locals.vurgu` üzerinden gelir (yoksa koyu + safir).
"sistem" seçeneği henüz uygulanmadı: `prefers-color-scheme` ile ayrıca ele alınmalı.

## Bütün şablonlarda bulunması gerekenler

- `app.locals.zaman(tarih)`: "2 saat önce" yazan yardımcı (`server.ts` içinde hazır).
- `res.locals.kullanici`: giriş yapan kullanıcı `{ username }` ya da `null`. Oturum sistemi yazılınca bir ara katmanda doldurulmalı.

## Yapılacaklar (sırayla)

1. `sql/` dosyalarındaki gerçek sütun adlarıyla `server.ts` sorgularını doğrula.
2. `GET /konu/:id` → `konu.ejs`. Bulunamazsa 404.
3. Kayıt ve giriş: şifre hash'leme, oturum, `res.locals.kullanici`, "giriş zorunlu" ara katmanı (`?don=` ile geri dönüş).
4. `GET/POST /konu/yeni`, `POST /konu/:id/cevap`. Form gövdesi için `express.urlencoded({ extended: false })`.
5. `post_votes` tablosu (PK: user_id + post_id, value +1/-1) ve `POST /oy`. Sonra kartlardaki `skor` ve `benim_oyum` gerçek olur.
6. `GET /profil/:username` → `profil.ejs`, `GET/POST /ayarlar...` → `ayarlar.ejs` (dosya yükleme için ayrı bir paket gerekir).
7. `users` tablosuna `tema`, `vurgu`, `menu_sagda`, `kompakt` sütunları.

## Kurallar (projenin kendi kararları)

- SQL elle yazılır, ORM eklenmez. Kullanıcıdan gelen her değer sorguya `?` yer tutucusuyla verilir, asla metin birleştirmeyle değil.
- Şablonlarda kullanıcı içeriği `<%= %>` ile basılır (HTML'den kaçırılır). `<%- %>` yalnızca `include` ve ikonlar için kullanılır.
- Yeni araç ya da paket eklemeden önce proje sahibine sorulur.
- Proje sahibi SQL'i ve route'ları kendisi yazıp anlamak istiyor: bu kısımları onun yerine sessizce yazma, adım adım ve açıklayarak ilerle.

## Henüz şablonu olmayanlar

Arama penceresi (Ctrl+K), bildirimler, moderasyon menüsü, şikâyet penceresi, özel mesajlar, şifre sıfırlama,
mobil alt menü ve tablet kenar menüsü. Tasarımları Figma'da "Katmanlar ve durumlar" panosunda duruyor.
Şablonlardaki bu adreslere giden bağlantılar (`/sikayet`, `/mesaj/...`, `/bildirimler`, `/sifremi-unuttum`) şimdilik 404 verir.

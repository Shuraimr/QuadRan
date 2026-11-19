# QuadRan — Claude için proje rehberi

Türkçe forum sitesi: konular, oy, rütbe/rozet, genel sohbet, özel mesaj, bildirim, şikâyet ve gelişmiş yönetim paneli.
Ayrıntılı route / tablo / yetki listesi: `docs/AKTARIM.md` (önce oraya bak, değişince güncelle). Kullanıcı tanıtımı: `README.md`.

## Teknoloji ve çalıştırma

- Node.js 22, TypeScript'i **doğrudan** çalıştırır (type stripping): `enum`, `namespace`, parametre özellikleri YOK; importlar `.ts` uzantılı.
- Express 5 · EJS · mysql2 (ORM yok, **saf SQL**) · MySQL 8.4 (Docker, konteyner `quadran-db`) · Adminer :8080
- Düz CSS (`public/css`) ve tek bağımlılıksız betik (`public/js/quadran.js`). Derleme adımı yok.
- `npm run dev` → :3000 (`--watch`; kullanıcının kendi sunucusu genelde açıktır, **kapatma**). `npm start` = yayın modu (`/onizleme` kapalı).
- Test için kendi kopyanı aç: `PORT=30xx node --env-file=.env src/server.ts` (server.ts PORT okur), işin bitince kapat. Yalnızca kendi açtığın süreçleri öldür.
- Tip kontrolü: `npx tsc --noEmit --allowImportingTsExtensions --module nodenext --target esnext --skipLibCheck --strict false src/*.ts src/rotalar/*.ts`
- SQL çalıştır: `docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < dosya.sql`
  (tek sorgu: `docker exec quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran -e "..."'`)

## Yapı

```
src/server.ts        ara katmanlar + router'lar (sıra: static, urlencoded, oturum, csrfKoru, ortakVeriler, router'lar, 404, hata)
src/oturum.ts        express-session (MySQL deposu), CSRF (res.locals.csrf), her sayfada ortak veriler (kullanici, tema, bildirimler...)
src/yardimci.ts      rutbeSql, skorSql, puanEkle, bildirimGonder, rozetVer, bildir (toast), girisGerekli, yetkiliGerekli, sayi, metin
src/ayarlar.ts       site_settings önbelleği (puan kuralları, duyuru, kayıt açık mı, yasaklı kelimeler), yasakliIfade
src/gizlilik.ts      engelleme, mesaj izni, çevrimiçi görünürlüğü
src/islemler.ts      yetkili işlemleri (ban, soft delete/geri al), src/sikayet.ts şikâyet modeli, src/denetim.ts işlem kaydı
src/hiz-siniri.ts    bellek içi hız sınırı, src/sifre.ts scrypt
src/rotalar/         hesap, forum (akış/konu/profil/ara/sıralama/keşfet/şikâyet), mesaj (kendi mesajını düzenle/sil),
                     iletisim (DM, bildirim, sohbet, engel), moderasyon (sitedeki ⋮ menüsü), yonetim-* (/yonetim paneli)
views/partials/      ust-cubuk, kenar-menu (masaüstü sol menü + tablet rayı), alt-menu (telefon), avatar-menusu, bildirim-paneli,
                     sikayet-penceresi, oy, yorum, gonderi-karti, ikon (SVG ikon seti), bas/son
views/yonetim/       panel şablonları (duzen-ust/duzen-alt ortak düzen)
sql/01..12           sırayla uygulanan şema + seed + değişiklikler (Docker ilk kurulumda hepsini çalıştırır)
```

## Kodlama kuralları

- Kod yorumları **Türkçe** ve "neden"i anlatır: proje sahibi öğrenci, kodu okuyup öğreniyor.
- Kullanıcıdan gelen her değer SQL'e **`?` yer tutucusuyla**; metin birleştirme yalnızca koddaki sabit parçalar için.
- Her POST formunda `<input type="hidden" name="_csrf" value="<%= locals.csrf %>">`. Kullanıcı içeriği `<%= %>` ile basılır.
- Yeni tablo/sütun → yeni numaralı `sql/NN_ad.sql` (canlı DB'ye de uygula, AKTARIM.md'ye yaz). Eski SQL dosyalarını değiştirme.
- **Yeni npm paketi eklemeden önce kullanıcıya sor.**
- Sunucu tarafı doğrulama her zaman yapılır (tarayıcıdaki required/pattern atlatılabilir).
- Puanlar `site_settings`'teki puan kurallarından okunur (sabit yazma). Rütbe saklanmaz, puandan hesaplanır. Silme = soft delete (`deleted_at`).

## Arayüz kuralları (kullanıcının açık talepleri)

Bir arayüz işinin tamamı (bilgi mimarisi → Figma → onay → kodlama → ölçerek doğrulama → yayın) için **`quadran-tasarim` skill'ini** kullan (`.claude/skills/quadran-tasarim/`: süreç, standart kontrol listesi, `olcum.js` ölçüm betikleri, `figma.md` yardımcı kod ve tuzaklar).

- **Önce düşün, sonra tasarla, sonra kodla:** yeni ekran/özellik önce Figma'da (bilgi mimarisi → tasarım) çizilir, onaylanınca kodlanır.
- **Arayüz kendini tekrarlamaz:** aynı ekran genişliğinde aynı eylem/hedef kalıcı arayüzde (üst çubuk, sol menü/ray, alt menü, hesap menüsü) iki kez durmaz.
- **Hiçbir şey üst üste binmez:** ekranın altına sabitlenen her çubuk `data-alt-cubuk` taşır; quadran.js yüksekliğini `--alt-yer` olarak ölçer, bildirim çubuğu (toast) onun üstünde durur.
- **Her ölçekte eşit ulaşım** (telefon ≤800, tablet 801–1180, masaüstü >1180):
  | | Telefon | Tablet | Masaüstü |
  |---|---|---|---|
  | Akış, Sohbet | alt menü (1) | sol ray (1) | sol menü (1) |
  | Kategoriler, Sıralama | Keşfet üzerinden (2) | sol ray (1) | sol menü (1) |
  | Konu aç | alt menü | raydaki kalem | üst çubuk |
  | Ara | Keşfet sayfası | üst çubuk | üst çubuk |
  | Bildirimler, Mesajlar | üst çubuk | zil + hesap menüsü | zil + hesap menüsü |
  | Profil, Yönetim, Çıkış | alt menü Profil → hesap menüsü | hesap menüsü | hesap menüsü |
  | Ayarlar | hesap menüsü | sol ray | sol menü |
- Yeni `<select>` yazmak serbest: quadran.js hepsini "seçici"ye çevirir (`data-yerel` ile kapatılır). JS'siz çalışmalı (aşamalı geliştirme).
- Renkler/süreler yalnızca CSS değişkenleriyle (`--zemin`, `--yuzey-1..3`, `--vurgu`, `--ton`, `--sure-*`, `--egri-*`, `--hareket`). Koyu/açık/sistem tema ve "Animasyonları azalt" (`[data-az-animasyon]`) her yeni stilde çalışmalı.
- Telefonda dokunma hedefleri ≥44px, yatay taşma yok. Durum renkleri: bekliyor sarı, işlendi yeşil, reddedildi gri, uzaklaştırıldı kırmızı.

## Doğrulama (bir işi "bitti" saymadan önce)

1. Tip kontrolü + kendi test sunucunda ilgili sayfaların hepsi 200 (curl + çerez kavanozu; giriş için önce `/giris`'ten `_csrf` al).
2. Yerleşik tarayıcıda 375 / 1075 / 1440 genişlikte bak: yatay taşma yok, tekrar yok, toast/çubuk çakışması yok, konsol hatasız.
3. Test verisini temizle, seed durumunu geri getir.
4. Alt ajan kullandıysan raporuna güvenme, sonucu kendin doğrula.

## Test kullanıcıları (seed)

`shurai` (admin), `ayse` (moderatör), `ahmet` (üye) — şifreleri `test1234`. Test sonrası puanlar: shurai 9, ayse 3, ahmet 7; kimse uzaklaştırılmış değil.

## Sürüm ve yayın

- Kullanıcı istediğinde: `main`'e commit (Türkçe mesaj), `git push`, gerekiyorsa `package.json` sürümü + README'deki sürüm satırı + `git tag -a vX.Y.Z` + `gh release create` (Türkçe not, DB güncelleme komutu dahil).
- `.env` asla commit'lenmez. Son sürüm: v0.5.0.

## Yol haritası (kullanıcının belirlediği sıra)

1. ~~Eksikler, admin paneli, mesajlar/gizlilik/şikâyet, gezinme~~ (v0.5.0'a kadar bitti)
2. ~~**Özel odalar**~~ (bitti; sql/12, `src/odalar.ts`, `src/rotalar/odalar.ts`, `yonetim-oda.ts`; ayrıntı docs/AKTARIM.md "Özel odalar") — kullanıcı kararları (2026-11-19):
   - Tür: **grup sohbeti** (oda adı, açıklama, üye listesi, mesajlar; konu/forum değil)
   - Giriş: **davetle** (oda yöneticisi üye davet eder; listede görünmez) ve **bağlantıyla** (davet bağlantısı, süresi dolabilir). Herkese açık ya da şifreli oda YOK.
   - Oluşturma: **belli bir rütbeden sonra** (eşik panelden ayarlanabilir; varsayılan Müdavim / 100 puan). Admin ve moderatör rütbe şartından **muaf** (kullanıcı onayladı); kişi başı oda sınırı herkese uygulanır.
   - Oda mesajı şikâyeti `reports.hedef_tur = 'oda_mesaji'`; panelde Sohbet › Odalar sekmesi. Yeni adresler: `/oda/yeni`, `/oda/:id[/uyeler|davet|baglantilar|ayarlar|ayril]`, `/oda/katil/:kod`, `/yonetim/sohbet/odalar`
3. **Çok oyunculu oyunlar** (panelde "Oyunlar · yakında" yeri hazır)
4. **Avatar ve profil efektleri** — bir kısmı premium, bir kısmı herkese açık (avatar/banner yükleme de burada yapılacak; panelde "Mağaza · yakında")

Bilinen eksikler: gerçek e-posta gönderimi (SMTP yok, sıfırlama bağlantısı konsola yazılır), avatar yükleme.

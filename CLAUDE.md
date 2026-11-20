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
src/yardimci.ts      rutbeSql, skorSql, puanEkle (points_log'a yazar), rutbeKontrol, cozumPuaniGeriAl, bildirimGonder, rozetVer, bildir (toast), girisGerekli, yetkiliGerekli, sayi, metin
src/rutbe.ts         rütbe önbelleği, ayrıcalık denetimi (izinli, kilitBilgisi), icerikHtml (rütbeye göre bağlantı)
src/ayarlar.ts       site_settings önbelleği (puan kuralları, duyuru, kayıt açık mı, yasaklı kelimeler), yasakliIfade
src/gizlilik.ts      engelleme, mesaj izni, çevrimiçi görünürlüğü
src/islemler.ts      yetkili işlemleri (ban, soft delete/geri al), src/sikayet.ts şikâyet modeli, src/denetim.ts işlem kaydı
src/hiz-siniri.ts    bellek içi hız sınırı, src/sifre.ts scrypt
src/yukleme.ts       dosya yükleme (multer + sharp, avatar/banner; ileride sohbet/oda/DM), src/premium.ts premiumMu, src/profil-gorunum.ts efekt/süs verisi
src/rotalar/         hesap, forum (akış/konu/profil/ara/sıralama/keşfet/şikâyet), mesaj (kendi mesajını düzenle/sil),
                     iletisim (DM, bildirim, sohbet, engel), moderasyon (sitedeki ⋮ menüsü), yonetim-* (/yonetim paneli)
views/partials/      avatar (resim+süs), profil-karti, profil-efekt, avatar-sus, profil-gorunumu-bolumu, ust-cubuk, kenar-menu (masaüstü sol menü + tablet rayı), alt-menu (telefon), avatar-menusu, bildirim-paneli,
                     sikayet-penceresi, oy, yorum, gonderi-karti, ikon (SVG ikon seti), bas/son
views/yonetim/       panel şablonları (duzen-ust/duzen-alt ortak düzen)
sql/01..19           sırayla uygulanan şema + seed + değişiklikler (Docker ilk kurulumda hepsini çalıştırır)
```

## Kodlama kuralları

- Kod yorumları **Türkçe** ve "neden"i anlatır: proje sahibi öğrenci, kodu okuyup öğreniyor.
- Kullanıcıdan gelen her değer SQL'e **`?` yer tutucusuyla**; metin birleştirme yalnızca koddaki sabit parçalar için.
- Her POST formunda `<input type="hidden" name="_csrf" value="<%= locals.csrf %>">`. Kullanıcı içeriği `<%= %>` ile basılır.
- Yeni tablo/sütun → yeni numaralı `sql/NN_ad.sql` (canlı DB'ye de uygula, AKTARIM.md'ye yaz). Eski SQL dosyalarını değiştirme.
- **Yeni npm paketi eklemeden önce kullanıcıya sor.**
- Sunucu tarafı doğrulama her zaman yapılır (tarayıcıdaki required/pattern atlatılabilir).
- Puanlar `site_settings`'teki puan kurallarından okunur (sabit yazma). Puan değişikliği YALNIZCA `puanEkle(..., sebep)` ile (points_log). Rütbe saklanmaz, puandan hesaplanır; ayrıcalık denetiminde admin/moderatör muaf. Silme = soft delete (`deleted_at`).

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
5. **Bağımsız eleştiri (zorunlu):** her aşamanın sonunda `elestirmen` alt ajanı (`.claude/agents/elestirmen.md`, ölçütler `.claude/skills/quadran-tasarim/elestiri.md`) işi puanlar. **8.0 altı** → revizyon listesi kullanıcıya olduğu gibi sunulur, kullanıcı onaylarsa uygulanır ve eleştiri tekrarlanır. Eleştirmene kendi savunmanı yazma. Sonuçlar `docs/elestiri-kaydi.md`'ye.

## Test kullanıcıları (seed)

`shurai` (admin), `ayse` (moderatör), `ahmet` (üye) — şifreleri `test1234`. Kimse uzaklaştırılmış olmamalı.

**Günlük ziyaret puanı** (`puan_gunluk`, sql/13) her kullanıcının günde İLK isteğinde puan değiştirir (ve `son_gunluk_puan`/`seri_gun` yazar): test sunucusuna giriş yapmak bile puanı +1 yapar. Seed puanı sabit sayı DEĞİL, **`points_log` toplamıdır** (şu an: shurai 9, ayse 3, ahmet 5). `test` kullanıcısı (kullanıcının kendi hesabı)
seed kullanıcılarına oy verebilir: o oyların puan satırları da seed kullanıcılarına yazılır ve **kullanıcıya aittir**. Bu yüzden temizlik
tarihe göre değil, **testten önce not edilen son satır numarasına** göre yapılır:

```sql
-- testten ÖNCE: başlangıç noktalarını not et
SELECT (SELECT MAX(id) FROM points_log) AS log, (SELECT MAX(id) FROM notifications) AS bildirim,
       (SELECT MAX(id) FROM audit_log) AS kayit, (SELECT MAX(id) FROM posts) AS mesaj, (SELECT MAX(id) FROM topics) AS konu;
-- testten SONRA: yalnızca o numaradan sonra seed kullanıcılarına yazılan puan satırlarını sil (<LOG> = not edilen sayı)
DELETE FROM points_log WHERE id > <LOG> AND user_id IN (SELECT id FROM (SELECT id FROM users WHERE username IN ('shurai','ayse','ahmet')) u);
-- puanı log toplamından yeniden hesapla, günlük giriş durumunu sıfırla
UPDATE users SET points = (SELECT COALESCE(SUM(miktar),0) FROM points_log WHERE user_id = users.id),
       son_gunluk_puan = NULL, seri_gun = 0, kutlama_rutbe_id = NULL
 WHERE username IN ('shurai','ayse','ahmet');
-- kontrol: her kullanıcıda points = log toplamı olmalı (sonuç boş dönmeli)
SELECT id, username, points FROM users WHERE points <> (SELECT COALESCE(SUM(miktar),0) FROM points_log WHERE user_id = users.id);
```

Silmeden önce `SELECT` ile bak: test sırasında kullanıcı :3000'de seed kullanıcılarına oy verdiyse o satırlar da bu aralığa düşer (`test` kullanıcısının `post_votes` satırlarıyla eşleşenleri bırak). Testte oluşturduğun konu/mesaj/oy/rozet satırlarını da ayrıca sil (puan satırı silinince o kayıtların kendisi kalmasın). Rütbe tablosunu (`ranks`) test için değiştirdiysen varsayılana döndür (docs/AKTARIM.md "Rütbe sistemi").

## Sürüm ve yayın

- Kullanıcı istediğinde: `main`'e commit (Türkçe mesaj), `git push`, gerekiyorsa `package.json` sürümü + README'deki sürüm satırı + `git tag -a vX.Y.Z` + `gh release create` (Türkçe not, DB güncelleme komutu dahil).
- `.env` asla commit'lenmez. Son sürüm: v0.6.0.
- Lisans: **AGPL-3.0-or-later** (`LICENSE`). Kullanıcının kararı: ücretli üyelik satılabilir ama proje asla kapalı kaynak olamaz. Yeni bağımlılık eklerken AGPL ile uyumlu lisansı olduğunu kontrol et (MIT, BSD, ISC, Apache-2.0, LGPL uyumlu; kapalı/ticari lisanslı paket ekleme).

## Yol haritası (kullanıcının belirlediği sıra)

1. ~~Eksikler, admin paneli, mesajlar/gizlilik/şikâyet, gezinme~~ (v0.5.0'a kadar bitti)
2. ~~**Özel odalar**~~ (bitti; sql/12, `src/odalar.ts`, `src/rotalar/odalar.ts`, `yonetim-oda.ts`; ayrıntı docs/AKTARIM.md "Özel odalar") — kullanıcı kararları (2026-11-19):
   - Tür: **grup sohbeti** (oda adı, açıklama, üye listesi, mesajlar; konu/forum değil)
   - Giriş: **davetle** (oda yöneticisi üye davet eder; listede görünmez) ve **bağlantıyla** (davet bağlantısı, süresi dolabilir). Herkese açık ya da şifreli oda YOK.
   - Oluşturma: **belli bir rütbeden sonra** (eşik panelden ayarlanabilir; varsayılan Müdavim / 100 puan). Admin ve moderatör rütbe şartından **muaf** (kullanıcı onayladı); kişi başı oda sınırı herkese uygulanır.
   - Oda mesajı şikâyeti `reports.hedef_tur = 'oda_mesaji'`; panelde Sohbet › Odalar sekmesi. Yeni adresler: `/oda/yeni`, `/oda/:id[/uyeler|davet|baglantilar|ayarlar|ayril]`, `/oda/katil/:kod`, `/yonetim/sohbet/odalar`
3. **Rütbe, premium, profil, referans** — kullanıcı kararları (2026-11-19), bu SIRAYLA, her aşama ayrı tasarım + onay + sürüm:
   1. **Rütbe sistemi** (kodlandı, eleştiri 5.0 → 7.7 → 7.4 → 7.7 → 7.0; son revizyon uygulandı, kullanıcı token tasarrufu için eleştiriyi burada BIRAKTI (2026-11-20); kullanıcı kararları 2026-11-20: günlük konu/cevap puanı tavanı var (panelden, varsayılan 40; dolunca içerik yazılır, puan gelmez); Efsane/Duayen ayrıcalıkları (çerçeve, isim rengi) profil/premium aşamasına ertelendi, /rutbeler'de "yakında"; hazır olmayan ayrıcalıklar (görsel/video yükleme) vaat edilmez, "yakında" gösterilir; telefonda /rutbeler üstünde "← Profil"; kullanıcı kararları 2026-11-20: yetkililer bağlantı dahil BÜTÜN ayrıcalıklardan muaf; "davet" puanı referans aşamasına (3.4) ertelendi — `puan_davet` ayarı ve `points_log.sebep = 'davet'` hazır ama KULLANILMIYOR, referans/davet kabulü `puanEkle(..., "davet", ...)` ile bağlanacak; telefonda kartlarda rütbe çipi tam gösterilir; **kişinin kendi konusuna yazdığı cevap puan getirmez** (konu sil → puan kasma döngüsünü kapatır, kullanıcı kararı 2026-11-20); sql/13–16, `src/rutbe.ts`, `src/rotalar/rutbe.ts`; ayrıntı docs/AKTARIM.md "Rütbe sistemi"). İlk kararlar: rütbe ayrıcalıkları (her rütbe bir şey açar: oda açma, imza, profil efekti, günlük oy vb.; panelden rütbe başına ayarlanır),
      rütbe görünümü (simge + renk, ad yanındaki rozet rütbe rengiyle, rütbe atlayınca kutlama bildirimi), daha fazla rütbe ve ilerleme
      (profilde "sonraki rütbede ne açılır"), yeni puan kaynakları (günlük giriş, kabul edilen cevap, davet vb.).
   2. **Premium üyelik + profil efektleri**: Ücretsiz / Premium seviyeleri; gerçek ödeme YOK, panelden elle verilir (ödeme sonra bağlanacak).
      Efektler (çerçeve, isim rengi, banner efekti): bir kısmı herkese, bir kısmı rütbeyle, bir kısmı premiumla açılır. Panelde "Mağaza · yakında" yeri.
      **Kullanıcı düzeltmesi (2026-11-20) — premium "renkli AI slop" OLMAYACAK:** gradyan, parlak altın/pembe, kendini öven reklam dili yok;
      sitenin sade token'larıyla (vurgu/ton) çizilir. Premium'un verdikleri: **hareketli profil banner'ı**, **profil animasyonları**,
      **ekstra az kısıtlama** (daha yüksek sınırlar), **profil efektleri**, **profil çerçevesi** ve **unvan (title)**. Premium'da geçen
      **her ay yeni bir unvan açılır** (sadakat unvanları; kişi açtıkları arasından birini seçer). **Premium tanıtımı = kişiselleştirilmiş
      örnek profil**: /premium, kullanıcının KENDİ profilini premium özellikler uygulanmış hâliyle gösterir (renkli reklam sayfası değil).
      **İPTAL / YENİDEN TASARLANACAK (2026-11-20):** Figma "08 · Premium (sade)" tasarımı kullanıcı tarafından reddedildi ("bu çöp değil, Discord vari
      profil efektleri ve animasyonları istiyordum"). İstenen: Discord benzeri **hareketli profil efektleri** (profil kartının üzerinde oynayan
      kaplama animasyonları) ve **avatar süsleri** (avatarın çevresinde hareketli dekorasyonlar), hareketli banner. Sade çizgi çerçeveler ve
      noktalı desenler İSTENMİYOR. Kullanıcı "şimdilik boşver" dedi: premium şimdilik beklemede, sırası gelince bu yönle baştan tasarlanacak.
      **Şimdilik verilecek premium (kullanıcı, 2026-11-20):** "daha şekilli isim yazısı" (isim yazı stilleri: yazı tipi, renk/renk geçişi,
      isteğe bağlı ince ışıltı animasyonu) ve "profil arka planını seçebilme" (profil sayfasının arka planı: hazır seçenekler; yükleme profil
      aşamasıyla). Discord vari hareketli profil efektleri + avatar süsleri daha sonra ayrı tasarlanacak.
      **Yeni yön (kullanıcı, 2026-11-20):** Figma'da Discord benzeri **profil penceresi animasyonları** tasarlanıyor; tema serbest
      (cadılar bayramı, melek, şeytan vb.; başka yerlerden fikir alınabilir). **Kristal temalı efekt YAPILMAYACAK** (kullanıcının kendi
      fikri, saklı). Ayrıca Discord benzeri **profil rengi seçimi** (premium): hazır/standart paletle KISITLANMAZ, kullanıcı istediği
      rengi kendisi seçebilir (renk seçici).
      **Admin (kurucu) premium şartından muaf** (`premiumSql`, kullanıcı kararı 2026-11-20); moderatör muaf değil.
      **Kullanıcı düzeltmesi (2026-11-20):** Figma 11'deki efektler/süsler onaylandı, AMA profil kartı sitenin tasarım dilini
      kullanır (Material 3 benzeri): gradyan YALNIZCA profil kartında ve kullanıcı "Geçiş"i seçerse (varsayılan düz, ölçülü;
      sitenin başka yerinde gradyan yok), ama köşe yarıçapı (kart 16px, iç içe küçülür), kapsayıcılar (`--yuzey-*`),
      yükseklik (yalnızca `--kat-1/2`), avatar = yuvarlatılmış kare (daire değil), buton/çip/form ölçüleri mevcut CSS'ten gelir.
   3. **Profil**: avatar ve banner yükleme — **multer + sharp** paketleri onaylandı. Küçültme/sıkıştırma profilde fark edilmemeli
      (yüksek kalite, retina için 2x boyut). Depolama genel tasarlanmalı: ileride sohbet/oda/DM'lerde **fotoğraf ve video yükleme** gelecek.
      Ayrıca profil vitrini ve sekmeler (rozet vitrini, sabitlenmiş konu, etkinlik), **takip sistemi** (takip/takipçi, takip edilenlerin konuları akışta).
   4. **Referanslı odalar** — kefil modeli: oda ayarı "katılmak için N referans gerekir" (1–3); odanın sıradan üyeleri bir kişiye referans verir,
      N'e ulaşınca kişi katılır. **Kefil sorumluluğu ayrı**: referans verilen kişi ciddi bir ceza (ban) alırsa, yetkili o kişinin kefillerini
      **duruma göre** cezalandırabilir ya da cezalandırmayabilir (otomatik değil; ban ekranında kefiller listelenir ve her biri için karar verilir).
4. **Çok oyunculu oyunlar** (panelde "Oyunlar · yakında" yeri hazır) — gerçek zamanlı iletişim gerektirir (WebSocket paketi için önce sor)

Bilinen eksikler / küçük işler: gerçek e-posta gönderimi (SMTP yok, sıfırlama bağlantısı konsola yazılır); sohbet, oda ve DM'ler
canlı değil (sayfa yenileyince güncellenir); sitedeki ⋮ menüsünden yapılan eski moderasyon işlemleri sebep istemiyor; moderatörün sildiği
özel mesaj gönderene "Bu mesajı sildin" görünüyor (ayırmak için sütun gerek); son admin koruması gerçek veride denenmedi; "Kopyala"nın
gerçek panoya yazması kullanıcı tarayıcısında doğrulanmadı; telefonda oda başlığındaki bilgi satırı iki satıra kayıyor.

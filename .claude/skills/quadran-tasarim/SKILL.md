---
name: quadran-tasarim
description: QuadRan'da yeni bir ekran, özellik ya da arayüz değişikliği yapılırken izlenecek tasarım süreci (bilgi mimarisi → Figma → onay → kodlama → ölçerek doğrulama → yayın) ve projenin arayüz standartları. Kullanıcı yeni bir sayfa/özellik/menü/bileşen istediğinde, "tasarla", "Figma'da çiz", "arayüzü düzelt/geliştir", "mobilde/tablette bozuk", "standartlarımıza uydur" dediğinde ya da bir arayüz işini bitirmeden önce kullan.
---

# QuadRan tasarım süreci

Bu süreç kullanıcıyla birlikte oturtuldu. Kısaltma: kullanıcı "facia", "kendini taklit ediyor", "üst üste biniyor" gibi tepkileri tam da bu adımlar atlandığında verdi.
Önce `CLAUDE.md` (proje kuralları) ve varsa `CLAUDE.local.md` (Figma dosyası, bileşen kimlikleri) okunur. Kullanıcıya her zaman **Türkçe** yazılır.

## 0. Kapsamı netleştir (gerekiyorsa sor)

- Kararı kullanıcıya ait olan, tahminle verilemeyecek seçimler (özelliğin türü, kim erişir, kim oluşturur, premium mu) **AskUserQuestion** ile sorulur: 2–4 seçenek, önerilen ilk sırada "(Önerilen)".
- Cevaplar hemen `CLAUDE.md`'deki yol haritası / ilgili bölüme yazılır (sonraki oturumlar bilsin).

## 1. Düşün: bilgi mimarisi (ekran çizmeden önce)

Genel şablonla değil, **sitenin kendi bölümlerinden ve veritabanındaki verilerden** yola çıkılır. Kullanıcı genel bir menü önerisini "ihtiyaçlarımıza ve site yapısına göre tekrar tasarla" diyerek reddetmişti.

Çıkarılacaklar:
1. **Kim, ne için gelir?** Roller (misafir, üye, moderatör, admin, oda sahibi…) ve her birinin en sık yaptığı iş.
2. **Veri → ihtiyaç tablosu:** her tablo/varlık için kullanıcının ve yetkilinin onunla ne yapması gerektiği.
3. **Nerede durur?** Her eylemin her ekran ölçeğindeki (telefon ≤800, tablet 801–1180, masaüstü >1180) **tek** yeri. Yeni bir menü öğesi eklemeden önce mevcut bir bölümün içine sığıp sığmadığına bak (örn. odalar → Sohbet'in içi).
4. **Erişim yolları:** bir şeye nereden ulaşılır (menü, ⋮ menüsü, bağlantı, arama). Her yol tek bir merkeze çıkmalı (örn. üye için üye kartı).
5. **Kurallar ve uç durumlar:** yetki matrisi, engelleme/gizlilik etkileşimi, boş / yükleniyor / hata / yetkisiz / kilitli hâller, geri alınamayan işlemler.

Bu düşünce Figma'da yeni bir sayfanın ilk panosu olarak çizilir ("NN · Konu" sayfası, "bilgi mimarisi" panosu).

## 2. Tasarla: Figma

- Dosya ve bileşen kimlikleri `CLAUDE.local.md`'de. Her yeni iş **yeni sayfa** (`06 · …`, `07 · …`).
- `use_figma` öncesi `figma-use` ve `figma-generate-design` skill'leri okunur; `create_session` ile oturum açılır.
- Renkler **yalnızca değişkenlere bağlı** (Renk koleksiyonu, Koyu/Açık modları); mevcut bileşenlerin örnekleri kullanılır (Buton, Durum çipi, Menü öğesi, Metrik kartı, Seçici, ikonlar).
- En az: masaüstü ekranı + telefon ekranı; gerekiyorsa tablet, pencereler (dialog), açık menü hâlleri, boş/kilitli hâller. Gerekirse açık tema kopyası (`setExplicitVariableModeForCollection`).
- Her ekrandan sonra ekran görüntüsü alınır ve kontrol edilir. Bilinen tuzaklar ve yardımcı kod: [figma.md](figma.md).

## 3. Onay al

- Kullanıcıya Türkçe, kısa bir özet: ne çizildi, hangi kararlar verildi (özellikle "tekrar yok" kuralı yüzünden çıkarılan/taşınan öğeler), Figma bağlantısı.
- Soru `wrap_up`'ın kutusunda tek karar olarak sorulur ("Bu tasarımla kodlatayım mı?" → "Evet, kodla" / "Değişiklik var"). **Onay gelmeden kodlamaya başlanmaz.**

## 4. Kodla

- Büyük işler alt ajana verilir (`general-purpose`, `model: sonnet`, arka planda). Brif kısa tutulur çünkü genel kurallar `CLAUDE.md`'de: brifte tasarımın kendisi (ölçüler, metinler, durumlar), kullanıcı kararları, yetki kuralları, test listesi ve "seed durumunu geri getir" yer alır.
- Aynı dosyalara dokunan iki iş aynı anda yürütülmez (örn. menü stilleri, quadran.js, üst çubuk). Biri bitince diğeri başlar.
- Küçük düzeltmeler doğrudan yapılır.

## 5. Ölçerek doğrula (raporlara güvenme)

Alt ajan "sorun yok" dese bile her biri **kendin** çalıştırılır. Betikler: [olcum.js](olcum.js) (yerleşik tarayıcıda `javascript_tool` ile, oturum açık bir sayfada).

1. Tip kontrolü + ilgili bütün sayfalar 200 (curl + çerez; CLAUDE.md komutları).
2. **Ulaşılabilirlik tablosu** (`ulasilabilirlik`): her hedef × her ölçek; hedef değerler CLAUDE.md'deki tabloda.
3. **Tekrar sayımı** (aynı betik): kalıcı arayüzde (üst çubuk, sol menü/ray, alt menü, hesap menüsü) aynı hedef 2+ kez → 0 olmalı.
4. **Yatay taşma** (`tasma`): 375 / 1075 / 1440'ta 0. Taşma varsa `kok-sebep` ile zinciri bul (genelde sütun tanımı olmayan grid → `grid-template-columns: minmax(0,1fr)`).
5. **Çakışma** (`cakisma`): sahte bildirim çubuğu + bütün sabit öğeler; görünen kutular üst üste binmemeli. Alttaki çubuklar `data-alt-cubuk` taşımalı.
6. **Çubuk arkasında kalan içerik** (`cubuk-arkasi`): sayfa dibine **anında** kaydırılıp (yumuşak kaydırma kapatılarak) ölçülür.
7. Gözle bak: tasarımla karşılaştır (masaüstü + telefon ekran görüntüsü), konsol hatası yok, açık tema, "Animasyonları azalt".
8. Yanlış alarmları ayıkla (gizli gerçek `<select>`'ler, gizli radio/checkbox, kategori alt satırları) ve bunu kullanıcıya söyle.

Bulunan her hata düzeltilir, ölçüm tekrarlanır. Sonuç kullanıcıya **önce/sonra tablosu** ile gösterilir.

## 6. Yayın (yalnızca istendiğinde)

Commit (Türkçe mesaj) → push → gerekiyorsa `package.json` sürümü + README sürüm satırı + `git tag -a vX.Y.Z` + `gh release create` (Türkçe not, değişiklik tablosu, varsa `sql/NN` uygulama komutu). Kullanıcı istemeden commit/push yapılmaz.

## Arayüz standartları (kontrol listesi)

- [ ] **Kendini tekrarlamaz:** aynı ölçekte aynı eylem kalıcı arayüzde bir kez. Menüde ⋮ ile başlıkta aynı bağlantı olmaz (örn. ad zaten profile gidiyorsa menüde "Profili gör" yok).
- [ ] **Üst üste binmez:** sabit alt çubuklar `data-alt-cubuk`; toast `--alt-yer`'in üstünde; popover/dialog içerikleri ekrana sığar, gerekirse kendi içinde kayar (`max-height: calc(100dvh - 32px)`).
- [ ] **Eşit ulaşım:** ana bölümler masaüstü/tablette 1, telefonda en fazla 2 dokunuş; kişisel işler her yerde en fazla 2.
- [ ] **Her ölçek ayrı düşünülür:** telefon (alt menü, liste/ayrıntı ayrı ekran, 44px dokunma), tablet (88px ray, ayar dock'u gibi alt yüzen çözümler, liste+ayrıntı yan yana 960px üstü), masaüstü (248px sol menü, üç sütun).
- [ ] **Aşamalı geliştirme:** JS kapalıyken bağlantı/form olarak çalışır; `<select>`'ler seçiciye, `<dialog>`/popover yerel.
- [ ] **Token'lar:** renk, süre, eğri yalnızca CSS değişkeni; koyu/açık/sistem tema ve `[data-az-animasyon]` bozulmaz.
- [ ] **Hâller:** boş, filtreyle sonuç yok, kilitli (neden + ne kadar kaldı), engellenmiş, yetkisiz, hata — hepsi tasarlanmış.
- [ ] **Tehlikeli işlemler:** onay + zorunlu sebep, işlem kaydına düşer, geri alınabilirlik yazılır.
- [ ] **Durum renkleri:** bekliyor sarı, işlendi yeşil, reddedildi gri, uzaklaştırıldı kırmızı.
- [ ] **Hareket:** kısa (120/200/320 ms), açılırken `--egri-cikis`, kapanırken `--egri-giris`; azaltılmış harekette kapanır.

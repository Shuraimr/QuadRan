# Figma: yardımcı kod ve bilinen tuzaklar

Dosya anahtarı ve bileşen kimlikleri `CLAUDE.local.md`'de. Her `use_figma` çağrısı ayrı çalışır: yardımcıları her çağrının başında yeniden tanımla, sayfaya `await figma.setCurrentPageAsync(page)` ile bir kez geç.

## Başlangıç bloğu

```js
const page = figma.createPage(); page.name = "07 · Yeni konu";        // ya da: await figma.getNodeByIdAsync("SAYFA_ID")
await figma.setCurrentPageAsync(page);
const fonts = await figma.listAvailableFontsAsync();
const has = (f, s) => fonts.some(x => x.fontName.family === f && x.fontName.style === s);
const H = has("Space Grotesk", "Bold") ? { family: "Space Grotesk", style: "Bold" } : { family: "Inter", style: "Bold" };
const R = { family: "Inter", style: "Regular" }, M = { family: "Inter", style: "Medium" }, SB = { family: "Inter", style: "Semi Bold" };
await Promise.all([H, R, M, SB].map(f => figma.loadFontAsync(f)));
const vars = await figma.variables.getLocalVariablesAsync("COLOR"); const V = Object.fromEntries(vars.map(v => [v.name, v]));
// Renk her zaman değişkene bağlı: tema (Koyu/Açık) değişince ekran da değişir
const P = ad => [figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", V[ad])];
function T(txt, font, size, renk, w) { const t = figma.createText(); t.fontName = font; t.fontSize = size; t.characters = txt; t.fills = P(renk);
  if (w) { t.textAutoResize = "HEIGHT"; t.resize(w, t.height); } return t; }
function AL(dir, props = {}) { const f = figma.createAutoLayout(dir, props); f.fills = []; return f; }
// Boşluk/itici: boş auto-layout çerçeve varsayılan 100px olur → 1px'e sabitle
const bosluk = dir => { const s = AL(dir); s.resize(1, 1); s.primaryAxisSizingMode = "FIXED"; s.counterAxisSizingMode = "FIXED"; return s; };
const butonSet = await figma.getNodeByIdAsync("3:109");
const vari = (set, ad) => set.children.find(c => c.name === ad);
const prop = (i, b) => Object.keys(i.componentProperties).find(k => k.startsWith(b));
const buton = (tur, etiket) => { const i = vari(butonSet, "Tür=" + tur).createInstance(); i.setProperties({ [prop(i, "Etiket")]: etiket }); return i; };
// Tür: Birincil | Tonal | Çerçeveli | Tehlikeli
```

Renk değişkenleri: `zemin, yuzey-1, yuzey-2, yuzey-3, kenar, kenar-ince, yazi, yazi-2, vurgu, vurgu-ustu, ton, ton-ustu, durum/{bekliyor,islendi,reddedildi,uzaklastirildi}` ve her durumun `-zemin` karşılığı.

## Tuzaklar (hepsi bu projede yaşandı)

| Belirti | Sebep | Çözüm |
|---|---|---|
| Satırlar/kartlar beklenmedik derecede uzun | İçi boş auto-layout çerçeve (itici) varsayılan 100px yükseklik alır | `bosluk()` kullan ya da sonradan `resize(w, 1)` |
| Çerçeve ince bir çizgiye çöktü | `resize(w, 10)` ana ekseni FIXED yaptı | Ardından `primaryAxisSizingMode = "AUTO"` |
| Bileşen kümesi içeriği kesiyor | `combineAsVariants` sonrası küme sabit boyutlu | Kümede `primaryAxisSizingMode = counterAxisSizingMode = "AUTO"` |
| "Cannot move node… inside of an instance" | Örneğin (instance) içine öğe eklenemez | Değişecek parçayı **INSTANCE_SWAP** özelliği yap (Menü öğesi › İkon gibi) |
| "cannot read property Symbol.iterator of null" | Dizide `null` ayırıcıyı `for (const [a,b] of …)` ile parçalamak | Ayırıcıyı `"ayirici"` dizgesi yap, döngüde önce kontrol et |
| Metin yazılamıyor | Font yüklenmedi | Yukarıdaki `loadFontAsync`; stil adı "Semi Bold" (boşluklu) |
| Hata sonrası yarım kalmış olabilir mi? | Hata veren betik geri alınır | `figma.root.children` ile sayfaları listele, sonra tekrar çalıştır |
| Ekran görüntüsünde menüler görünmüyor | Mutlak konumlu öğe çerçeve sınırı dışında / çerçeve kırpıyor | `x/y`'yi ekran çerçevesinin içinde hesapla |

## Kontrol

Her ekranı kurduktan sonra `await cerceve.screenshot({ scale: 0.45 })` ile bak. Metin taşması, çöken çerçeve, yanlış renk (değişkene bağlanmamış) ve tekrar eden eylem ara. Düzeltme hedefli yapılır, ekran baştan kurulmaz.

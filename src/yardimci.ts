// Route dosyalarının ortak kullandığı küçük yardımcılar.
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.ts";
import { rutbeler, rutbeBul, acilanlar, yetkiliMi } from "./rutbe.ts";
import { puanKurallari } from "./ayarlar.ts";

// ---------------------------------------------------------------------------
// Rütbe: ranks tablosunda puanı geçilen en yüksek eşik.
// Birçok sorguda aynı alt sorgu gerektiği için metin olarak üretiyoruz.
// Parametre bir TABLO ADI (kullanıcıdan gelmez), bu yüzden metin birleştirmek burada güvenli.
//   rutbeSql("users")  ->  (SELECT ranks.name ... WHERE ranks.min_points <= users.points ...)
// ---------------------------------------------------------------------------
export const rutbeSql = (tablo: string) =>
  `(SELECT ranks.name FROM ranks WHERE ranks.min_points <= ${tablo}.points ORDER BY ranks.min_points DESC LIMIT 1)`;
// Aynı rütbenin NUMARASI. Çip rengi/simgesi ve ayrıcalıklar ada göre aranırsa, rütbe panelden yeniden adlandırıldığında
// önbellekteki eski adla eşleşmez ve çip sessizce griye düşer; numara ise değişmez, bu yüzden her yerde numarayla çözülür.
export const rutbeIdSql = (tablo: string) =>
  `(SELECT ranks.id FROM ranks WHERE ranks.min_points <= ${tablo}.points ORDER BY ranks.min_points DESC LIMIT 1)`;
// Bir kullanıcının rolü (admin / moderator / uye)
export const rolSql = (tablo: string) => `(SELECT roles.name FROM roles WHERE roles.id = ${tablo}.role_id)`;
// Kullanıcı gösteren her sorgu bu üç sütunu birlikte alır: rutbe (ad), rutbe_id (çip/ayrıcalık çözümü) ve yazar_rol
// (yönetici/moderatör muafiyeti: bağlantı, imza). Şablonlar: include("rutbe", { rutbeAd: x.rutbe, rutbeId: x.rutbe_id }),
// icerikHtml(metin, x.rutbe_id, x.yazar_rol).
export const rutbeSutunlari = (tablo: string) =>
  `${rutbeSql(tablo)} AS rutbe, ${rutbeIdSql(tablo)} AS rutbe_id, ${rolSql(tablo)} AS yazar_rol, ${avatarSutunlari(tablo)}`;

// Premium ayrıcalıkları açık mı (SQL ifadesi): süresi geçmemiş premium_bitis YA DA admin rolü.
// Kullanıcı kararı (2026-11-20): kurucu/admin premium özelliklerini panelden kendine premium vermeden kullanabilir.
// Moderatör muaf değil. Kural tek yerde dursun diye bütün sorgular bu ifadeyi kullanır (premium.ts › premiumMu SQL sonucunu okur).
export const premiumSql = (tablo: string) =>
  `(${tablo}.premium_bitis > NOW() OR ${tablo}.role_id = (SELECT id FROM roles WHERE name = 'admin'))`;

// Avatar resmi her yerde görünsün diye (partials/avatar.ejs) kullanıcı gösteren her sorgu avatar_url + avatar_susu alır.
// Ayrı bir yardımcı yazmak yerine rutbeSutunlari'na eklendi: o zaten her kullanıcı sorgusunda var, tek yerden değişir.
// Süs YALNIZCA premium üyede gelir (sql/18): premium bitince seçim silinmez ama görünmez (yenilenirse geri gelir).
export const avatarSutunlari = (tablo: string) =>
  `${tablo}.avatar_url AS avatar_url, IF(${premiumSql(tablo)}, ${tablo}.avatar_susu, NULL) AS avatar_susu`;

// Profil kartı/üst bölümü için tam görünüm sütunları (banner, efekt, renkler). Premium'a bağlı olanlar premium değilse NULL gelir.
export const profilGorunumSutunlari = (tablo: string) =>
  `${tablo}.avatar_url AS avatar_url, ${tablo}.banner_url AS banner_url, ${tablo}.banner_konum AS banner_konum, (${premiumSql(tablo)}) AS premium_aktif,
   IF(${premiumSql(tablo)}, ${tablo}.avatar_susu, NULL) AS avatar_susu,
   IF(${premiumSql(tablo)}, ${tablo}.profil_efekti, NULL) AS profil_efekti,
   IF(${premiumSql(tablo)}, ${tablo}.profil_renk_ana, NULL) AS profil_renk_ana,
   IF(${premiumSql(tablo)}, ${tablo}.profil_renk_vurgu, NULL) AS profil_renk_vurgu,
   IF(${premiumSql(tablo)}, ${tablo}.profil_renk_gecis, 0) AS profil_renk_gecis`;

// Bir mesajın oy toplamı (skor)
export const skorSql = (postTablosu: string) =>
  `(SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes WHERE post_votes.post_id = ${postTablosu}.id)`;

// ---------------------------------------------------------------------------
// Puan: users.points'e giden HER değişiklik buradan geçer ve points_log'a bir satır yazar (sql/13).
// Değerler kodda sabit değil: site_settings'ten gelir (src/ayarlar.ts > puanKurallari).
// Puan 0'ın altına inmez; log'a yazılan miktar UYGULANAN gerçek farktır (istenen değil), böylece bir kullanıcının
// log toplamı her zaman users.points'e eşit kalır.
//   sebep: konu | cevap | oy | gunluk | seri | cozum | rozet | duzeltme | silme  (silme = geri alınan kazanç)
//          | baslangic (puan geçmişinden önceki toplam) | cozum_geri (geri alınan çözüm puanı) | davet (henüz kullanılmıyor)
//          | rozet_geri (geri alınan rozet puanı) | geri_yukleme (silinen mesaj geri gelince geri verilen puan)
//   ilgiliId: konu -> konu no, cevap/oy/cozum/cozum_geri/silme/geri_yukleme -> mesaj no, rozet/rozet_geri -> rozet no
//   baglanti: çağıran bir transaction içindeyse onun bağlantısı. O durumda rütbe atlama kontrolü çağırana kalır
//   (bildirim eklemek users satırının kilidini bekleyebilir): commit'ten sonra rutbeKontrol(userId, eski, yeni) çağır.
// ---------------------------------------------------------------------------
// "davet": referans aşamasında (CLAUDE.md yol haritası 3.4) bağlanacak; şimdilik hiçbir yerden çağrılmaz.
export type PuanSebebi = "konu" | "cevap" | "oy" | "gunluk" | "seri" | "cozum" | "rozet" | "duzeltme" | "silme" | "baslangic" | "cozum_geri" | "davet" | "rozet_geri" | "geri_yukleme";

export async function puanEkle(
  userId: number, miktar: number, sebep: PuanSebebi, ilgiliId: number | null = null,
  baglanti?: { query: Function }
): Promise<{ eski: number; yeni: number }> {
  // Bağlantı verilmediyse kendi küçük transaction'ımızı açarız: okuma + güncelleme + log birlikte yazılır
  // (satır kilitli olduğu için iki eşzamanlı istek birbirinin puanını ezmez).
  const kendi = !baglanti;
  const bag: any = baglanti ?? (await pool.getConnection());
  try {
    if (kendi) await bag.beginTransaction();
    const [[satir]]: any = await bag.query("SELECT points FROM users WHERE id = ? FOR UPDATE", [userId]);
    if (!satir) { if (kendi) await bag.rollback(); return { eski: 0, yeni: 0 }; }
    const eski = Number(satir.points);
    const yeni = Math.max(0, eski + miktar);
    if (yeni !== eski) {
      await bag.query("UPDATE users SET points = ? WHERE id = ?", [yeni, userId]);
      await bag.query("INSERT INTO points_log (user_id, miktar, sebep, ilgili_id) VALUES (?, ?, ?, ?)", [userId, yeni - eski, sebep, ilgiliId]);
    }
    if (kendi) await bag.commit();
    if (kendi && yeni !== eski) await rutbeKontrol(userId, eski, yeni);
    return { eski, yeni };
  } catch (hata) {
    if (kendi) await bag.rollback();
    throw hata;
  } finally {
    if (kendi) bag.release();
  }
}

// Konu açma / cevap yazma puanı, günlük tavanla (site_settings.puan_gunluk_tavan; 0 = sınırsız). Neden: konu açıp silmek
// ya da çok kısa cevap yığmak puan kasmanın en kolay yoludur; silince puan geri alınsa da arada rütbe/oy hakkı kazanılır.
// Bugün kazanılan = bugünkü pozitif 'konu' + 'cevap' satırları ('silme' eksi satırları HESABA KATILMAZ: silerek tavan
// açılıp yeniden kasılmasın). Verilecek miktar kalan hakka kırpılır (örn. tavan 6: 5 + 5 → 5 ve 1); hak bittiyse puan hiç yazılmaz,
// içerik yine de yayınlanır (çağıran taraf bunu zaten ayrı yapar). Okuma + yazma tek transaction'da, kullanıcı satırı kilitliyken:
// aynı kişinin eşzamanlı iki isteği aynı "kalan"ı görüp tavanı aşamasın. Yetkililer de aynı kurala tabidir.
export async function tavanliPuanEkle(userId: number, miktar: number, sebep: "konu" | "cevap", ilgiliId: number) {
  const tavan = (await puanKurallari()).gunlukTavan;
  if (tavan === 0) return puanEkle(userId, miktar, sebep, ilgiliId);
  const bag = await pool.getConnection();
  try {
    await bag.beginTransaction();
    await bag.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    const [[bugun]]: any = await bag.query(
      "SELECT COALESCE(SUM(miktar), 0) AS n FROM points_log WHERE user_id = ? AND sebep IN ('konu', 'cevap') AND miktar > 0 AND created_at >= CURDATE()",
      [userId]);
    const verilecek = Math.min(miktar, Math.max(0, tavan - Number(bugun.n)));
    const p = await puanEkle(userId, verilecek, sebep, ilgiliId, bag); // 0 ise puanEkle hiçbir şey yazmaz
    await bag.commit();
    if (p.yeni !== p.eski) await rutbeKontrol(userId, p.eski, p.yeni);
    return p;
  } catch (hata) {
    await bag.rollback();
    throw hata;
  } finally {
    bag.release();
  }
}

// Çözüm işareti kalkarken (ya da çözüm cevabı silinirken) yazara verilen çözüm puanını geri alır.
// Geri alınacak miktar "hâlâ açık" olandır: bu cevap için verilen 'cozum' toplamı eksi daha önce geri alınanlar ('cozum_geri').
// Böylece aynı çözüm iki kez geri alınamaz (eşzamanlı istek ya da silme + işaret kaldırma birlikte olsa bile); verilen
// miktar o günkü ayara göre olduğundan geri alırken de günlükten okunur (ayar sonradan değişmiş olabilir).
// baglanti: çağıranın transaction bağlantısı (satır kilitleri onun içinde alınır); dönen değer rütbe kontrolü için eski/yeni puan.
export async function cozumPuaniGeriAl(
  cevap: { id: number; user_id: number }, konuSahibi: number, baglanti: { query: Function }
): Promise<{ eski: number; yeni: number } | null> {
  if (cevap.user_id === konuSahibi) return null; // kendi cevabında zaten puan verilmemişti
  const [[acik]]: any = await baglanti.query(
    `SELECT COALESCE(SUM(miktar), 0) AS n FROM points_log
      WHERE user_id = ? AND ilgili_id = ? AND sebep IN ('cozum', 'cozum_geri')`, [cevap.user_id, cevap.id]);
  const kalan = Number(acik.n);
  if (kalan <= 0) return null;
  return await puanEkle(cevap.user_id, -kalan, "cozum_geri", cevap.id, baglanti);
}

// Silinen mesaj konunun ÇÖZÜMÜYLE ilgiliyse çözüm işareti kalkar (topics.cozum_post_id = NULL) ve açık çözüm puanı geri alınır.
// İki durum var:
//   1) silinen mesaj çözüm cevabının kendisi, 2) silinen mesaj konunun İLK mesajı (konu siliniyor): konu gidince
//   çözüm cevabına verilen puan da geçerliliğini yitirir; yoksa cevap yazarı silinmiş bir konudan puan taşırdı.
// Çağıranın transaction'ı içinde çalışır (önce konu satırı kilitlenir, sonra puanlar; /konu/:id/cozum ile aynı sıra).
// Dönen liste rütbe kontrolü için (commit'ten sonra rutbeKontrol); geri alınacak puan yoksa boş.
// NOT: mesaj ya da konu sonradan GERİ ALINIRSA çözüm işareti ve çözüm puanı otomatik geri GELMEZ; konu sahibi isterse
// cevabı yeniden çözüm seçer (puan o zaman yeniden verilir). Böylece "sil → geri al" ile puan çoğaltılamaz.
export async function silinenCozumuTemizle(
  baglanti: { query: Function }, mesaj: { id: number; user_id: number; topic_id: number; ilk_mi?: boolean }
): Promise<{ kisi: number; eski: number; yeni: number }[]> {
  const [[konu]]: any = await baglanti.query("SELECT user_id, cozum_post_id FROM topics WHERE id = ? FOR UPDATE", [mesaj.topic_id]);
  if (!konu || !konu.cozum_post_id) return [];
  if (!mesaj.ilk_mi && konu.cozum_post_id !== mesaj.id) return []; // başka bir cevap silindi, çözüm etkilenmez
  // Çözüm cevabının yazarı: silinen mesajın kendisi ya da (konu siliniyorsa) çözüm olarak işaretli cevap
  let cevap = { id: mesaj.id, user_id: mesaj.user_id };
  if (konu.cozum_post_id !== mesaj.id) {
    const [[c]]: any = await baglanti.query("SELECT id, user_id FROM posts WHERE id = ?", [konu.cozum_post_id]);
    if (!c) { await baglanti.query("UPDATE topics SET cozum_post_id = NULL WHERE id = ?", [mesaj.topic_id]); return []; }
    cevap = c;
  }
  const geri = await cozumPuaniGeriAl(cevap, konu.user_id, baglanti);
  await baglanti.query("UPDATE topics SET cozum_post_id = NULL WHERE id = ?", [mesaj.topic_id]);
  return geri ? [{ kisi: cevap.user_id, ...geri }] : [];
}

// ---------------------------------------------------------------------------
// Mesaj silinince yazarın o mesajdan kazandığı puan geri alınır (yetkili silişi de, kendi silişi de aynı yoldan geçer).
// Miktar bugünkü ayardan DEĞİL, points_log'daki kayıttan hesaplanır ("hâlâ açık" kazanç): ayar sonradan değişmiş olabilir,
// puan 0'da kırpılmış olabilir ve aynı mesaj iki kez geri alınmamalı (iki yetkili aynı anda silse bile).
//   açık = bu mesajın kazancı ('konu' → konu no, 'cevap' → mesaj no)
//        + bu mesaj için daha önce yazılan 'silme' ve 'geri_yukleme' satırları (silme eksi, geri_yukleme artı).
// Mesaja gelen oyların puanı kalır: onlar başkalarının verdiği puanlardı.
// Çağıranın transaction'ı içinde çalışır; önce yazarın users satırı kilitlenir ki toplam okunurken başka bir istek araya girmesin.
// Dönen değer rütbe kontrolü için (düşüşte rutbeKontrol bir şey yapmaz ama simetri için dönüyor); geri alınacak puan yoksa null.
// ---------------------------------------------------------------------------
export async function mesajPuaniniGeriAl(
  baglanti: { query: Function }, mesaj: { id: number; user_id: number; topic_id: number; ilk_mi: boolean }
): Promise<{ kisi: number; eski: number; yeni: number } | null> {
  await baglanti.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [mesaj.user_id]);
  const [[acik]]: any = await baglanti.query(
    `SELECT COALESCE(SUM(miktar), 0) AS n FROM points_log
      WHERE user_id = ? AND ((sebep = ? AND ilgili_id = ?) OR (sebep IN ('silme', 'geri_yukleme') AND ilgili_id = ?))`,
    [mesaj.user_id, mesaj.ilk_mi ? "konu" : "cevap", mesaj.ilk_mi ? mesaj.topic_id : mesaj.id, mesaj.id]);
  const kalan = Number(acik.n);
  if (kalan <= 0) return null;
  const p = await puanEkle(mesaj.user_id, -kalan, "silme", mesaj.id, baglanti);
  return { kisi: mesaj.user_id, ...p };
}

// Simetriği: yetkili silinen mesajı GERİ GETİRİNCE yazara geri alınan puan geri verilir (yetkili yanlışlıkla sildiyse
// kişi kaybetmesin). Geri verilecek miktar = bu mesaj için yazılmış 'silme' + 'geri_yukleme' toplamının eksisi; toplam
// 0 ya da artıysa (zaten geri verilmiş / hiç geri alınmamış) bir şey yapılmaz, böylece sil → geri al → geri al puan çoğaltmaz.
export async function mesajPuaniniGeriVer(
  baglanti: { query: Function }, mesaj: { id: number; user_id: number }
): Promise<{ kisi: number; eski: number; yeni: number } | null> {
  await baglanti.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [mesaj.user_id]);
  const [[acik]]: any = await baglanti.query(
    `SELECT COALESCE(SUM(miktar), 0) AS n FROM points_log
      WHERE user_id = ? AND sebep IN ('silme', 'geri_yukleme') AND ilgili_id = ?`, [mesaj.user_id, mesaj.id]);
  const toplam = Number(acik.n);
  if (toplam >= 0) return null;
  const p = await puanEkle(mesaj.user_id, -toplam, "geri_yukleme", mesaj.id, baglanti);
  return { kisi: mesaj.user_id, ...p };
}

// Rütbe ATLANDIYSA (puan düştüyse hiçbir şey olmaz, ayrıcalıklar yalnızca yeniden hesaplanır): "rutbe" bildirimi
// gönderir ve users.kutlama_rutbe_id'yi doldurur; ortakVeriler bir sonraki sayfada kutlama bildirim çubuğunu çizer.
export async function rutbeKontrol(userId: number, eskiPuan: number, yeniPuan: number) {
  await rutbeler(); // önbellek taze olsun
  const eski = rutbeBul(eskiPuan), yeni = rutbeBul(yeniPuan);
  if (!eski || !yeni || yeni.min_points <= eski.min_points) return;
  // Yönetici/moderatör zaten bütün ayrıcalıklara sahip (izinli() onları muaf sayar): "Artık ... yapabilirsin" demek yanıltıcı olur,
  // yalnızca rütbe adı söylenir.
  const [[rol]]: any = await pool.query(
    "SELECT roles.name AS ad FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = ?", [userId]);
  const acilan = yetkiliMi(rol?.ad) ? [] : acilanlar(eski, yeni).filter((a) => !a.yakinda).map((a) => a.cumle);
  await bildirimGonder({
    alan: userId, yapan: null, tur: "rutbe",
    metin: `${yeni.name} oldun!${acilan.length ? " Artık " + acilan.join(", ") + "." : ""}`,
    link: "/rutbeler",
  });
  await pool.query("UPDATE users SET kutlama_rutbe_id = ? WHERE id = ?", [yeni.id, userId]);
}

// ---------------------------------------------------------------------------
// Bildirim oluştur. Kişi kendi kendine bildirim almaz.
// ---------------------------------------------------------------------------
type BildirimTuru = "cevap" | "oy" | "rozet" | "mesaj" | "moderasyon" | "duyuru" | "oda" | "rutbe" | "takip";

export async function bildirimGonder(b: { alan: number; yapan: number | null; tur: BildirimTuru; metin: string; link: string }) {
  if (b.yapan !== null && b.alan === b.yapan) return;
  await pool.query(
    "INSERT INTO notifications (user_id, actor_id, tur, metin, link) VALUES (?, ?, ?, ?, ?)",
    [b.alan, b.yapan, b.tur, b.metin.slice(0, 300), b.link]
  );
}

// Rozet ver: daha önce almışsa INSERT IGNORE hiçbir şey yapmaz (PRIMARY KEY user_id + badge_id).
export async function rozetVer(userId: number, rozetAdi: string) {
  const [sonuc]: any = await pool.query(
    "INSERT IGNORE INTO user_badges (user_id, badge_id) SELECT ?, id FROM badges WHERE name = ?",
    [userId, rozetAdi]
  );
  if (sonuc.affectedRows > 0) {
    // Yeni rozet puan getirir (panelden ayarlanır, puan_rozet); ilgili_id = rozetin numarası
    const [[rozet]]: any = await pool.query("SELECT id FROM badges WHERE name = ?", [rozetAdi]);
    // Bu kişiye bu rozet için daha önce HİÇ 'rozet' puanı yazıldıysa (rozet sonradan geri alınmış olsa bile) rozet yine
    // verilir ama puan verilmez: yoksa yönetici "rozeti al → yeniden ver" döngüsüyle ya da kullanıcı kazan-kaybet
    // tekrarıyla puan kasabilirdi. Rozet geri alınınca puan zaten 'rozet_geri' ile düşer.
    const [[onceki]]: any = rozet
      ? await pool.query("SELECT COUNT(*) AS n FROM points_log WHERE user_id = ? AND sebep = 'rozet' AND ilgili_id = ?", [userId, rozet.id])
      : [[{ n: 1 }]];
    if (!Number(onceki.n)) await puanEkle(userId, (await puanKurallari()).rozet, "rozet", rozet?.id ?? null);
    await bildirimGonder({ alan: userId, yapan: null, tur: "rozet", metin: `“${rozetAdi}” rozetini kazandın.`, link: "/profil/" + (await kullaniciAdi(userId)) });
  }
}

async function kullaniciAdi(id: number): Promise<string> {
  const [satirlar]: any = await pool.query("SELECT username FROM users WHERE id = ?", [id]);
  return satirlar[0]?.username ?? "";
}

// Mesajlarda alıntı için: uzun metni kısaltır
export const kisalt = (metin: string, uzunluk = 60) =>
  metin.length > uzunluk ? metin.slice(0, uzunluk - 1).trimEnd() + "…" : metin;

// ---------------------------------------------------------------------------
// Bildirim çubuğu (toast): bir sonraki sayfada bir kez gösterilir ("flash" mesaj).
// Oturumda saklanır, oturum.ts sayfayı çizerken alıp siler.
// ---------------------------------------------------------------------------
export function bildir(req: Request, tur: "basari" | "hata", metin: string, eylem?: { metin: string; link: string }) {
  req.session.bildirim = { tur, metin, eylem };
}

// ---------------------------------------------------------------------------
// Açık yönlendirme (open redirect) koruması:
// ?don=https://kotu-site.com verilirse girişten sonra oraya GİTMEMELİYİZ.
// Yalnızca "/" ile başlayan ama "//" ile başlamayan (başka alan adına gitmeyen) adresleri kabul et.
// ---------------------------------------------------------------------------
export function yerelAdres(adres: unknown, varsayilan = "/"): string {
  return typeof adres === "string" && adres.startsWith("/") && !adres.startsWith("//") && !adres.includes("\\")
    ? adres
    : varsayilan;
}

// Formdan/adresten gelen id'yi pozitif tam sayıya çevir; olmuyorsa null
export function sayi(deger: unknown): number | null {
  const n = Number(deger);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Formdan gelen metin: yoksa boş string, varsa baş/son boşluk kırpılmış
export const metin = (deger: unknown) => (typeof deger === "string" ? deger.trim() : "");

// ---------------------------------------------------------------------------
// Giriş zorunlu ara katmanı.
//   GET isteklerinde: /giris?don=<şu anki adres> ile girişe gönderir, girişten sonra geri döner.
//   POST isteklerinde: geldiği sayfaya dönmek için Referer başlığını kullanır.
// ---------------------------------------------------------------------------
export function girisGerekli(not = "Bu işlem için giriş yapman gerekiyor.") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (res.locals.kullanici) return next();
    const don = req.method === "GET" ? req.originalUrl : yerelAdres(refererYolu(req));
    req.session.girisNotu = not;
    res.redirect("/giris?don=" + encodeURIComponent(don));
  };
}

// Moderatör ve admin dışındakiler için 403
export function yetkiliGerekli(req: Request, res: Response, next: NextFunction) {
  if (["admin", "moderator"].includes(res.locals.kullanici?.rol)) return next();
  res.status(403);
  if (req.method === "GET") return next(); // moderasyon.ejs "erişimin yok" kutusunu kendisi çizer
  bildir(req, "hata", "Bu işlem için yetkin yok.");
  res.redirect(geriAdres(req));
}

// POST'tan sonra geldiği sayfaya dön (Referer aynı sitedense), yoksa varsayılan
export function geriAdres(req: Request, varsayilan = "/") {
  return yerelAdres(refererYolu(req), varsayilan);
}

function refererYolu(req: Request): string | undefined {
  const referer = req.get("referer");
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    if (url.host !== req.get("host")) return undefined; // başka siteden gelmiş
    return url.pathname + url.search + url.hash;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Aktif ban: banned_at dolu VE (banned_until boş = kalıcı, ya da henüz geçmemiş).
// "banned_at IS NOT NULL" tek başına yetmez: süreli ban bittiğinde satır bir süre dolu kalabilir.
// Zamanı JavaScript'te değil SQL'de (NOW()) karşılaştırıyoruz: tek saat kaynağı veritabanı olsun.
// Parametre bir TABLO ADI (kullanıcıdan gelmez), bu yüzden metin birleştirmek güvenli.
// ---------------------------------------------------------------------------
export const banliSql = (tablo: string) =>
  `(${tablo}.banned_at IS NOT NULL AND (${tablo}.banned_until IS NULL OR ${tablo}.banned_until > NOW()))`;

// LIKE içinde % ve _ özel karakterdir; kullanıcı yazarsa harfi harfine aransın diye önlerine \ koyarız.
export const likeKac = (s: string) => "%" + s.replace(/[\\%_]/g, "\\$&") + "%";

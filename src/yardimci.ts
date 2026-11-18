// Route dosyalarının ortak kullandığı küçük yardımcılar.
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.ts";

// ---------------------------------------------------------------------------
// Rütbe: ranks tablosunda puanı geçilen en yüksek eşik.
// Birçok sorguda aynı alt sorgu gerektiği için metin olarak üretiyoruz.
// Parametre bir TABLO ADI (kullanıcıdan gelmez), bu yüzden metin birleştirmek burada güvenli.
//   rutbeSql("users")  ->  (SELECT ranks.name ... WHERE ranks.min_points <= users.points ...)
// ---------------------------------------------------------------------------
export const rutbeSql = (tablo: string) =>
  `(SELECT ranks.name FROM ranks WHERE ranks.min_points <= ${tablo}.points ORDER BY ranks.min_points DESC LIMIT 1)`;

// Bir mesajın oy toplamı (skor)
export const skorSql = (postTablosu: string) =>
  `(SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes WHERE post_votes.post_id = ${postTablosu}.id)`;

// ---------------------------------------------------------------------------
// Puan kuralı (sql/06_etkilesim.sql'deki baştan hesaplama ile aynı):
//   konu açmak +5, cevap yazmak +2, mesajına gelen oy +1 / -1
// points UNSIGNED olduğu için önce SIGNED'a çevirip GREATEST ile sıfırın altına inmesini engelliyoruz.
// ---------------------------------------------------------------------------
export const PUAN = { konu: 5, cevap: 2 };

export async function puanEkle(userId: number, miktar: number) {
  if (miktar === 0) return;
  await pool.query(
    "UPDATE users SET points = GREATEST(0, CAST(points AS SIGNED) + ?) WHERE id = ?",
    [miktar, userId]
  );
}

// ---------------------------------------------------------------------------
// Bildirim oluştur. Kişi kendi kendine bildirim almaz.
// ---------------------------------------------------------------------------
type BildirimTuru = "cevap" | "oy" | "rozet" | "mesaj" | "moderasyon";

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

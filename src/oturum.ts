// Oturum (session) ve her sayfada gereken ortak veriler.
//
// Nasıl çalışır?
//  1. Giriş yapınca req.session.userId = <kullanıcı id> yazarız.
//  2. express-session tarayıcıya yalnızca rastgele bir oturum kimliği içeren çerez (cookie) gönderir.
//     Asıl veri (userId vb.) veritabanındaki "sessions" tablosunda durur (express-mysql-session).
//     Böylece sunucu yeniden başlasa da kimse oturumdan düşmez.
//  3. Her istekte aşağıdaki "ortakVeriler" ara katmanı userId'den kullanıcıyı okur ve
//     res.locals.kullanici'ye koyar. Şablonlar locals.kullanici ile üye/misafir ayrımı yapar.
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.ts";
import { rutbeSql } from "./yardimci.ts";

// req.session içinde hangi alanların olduğunu TypeScript'e anlatıyoruz
declare module "express-session" {
  interface SessionData {
    userId: number;
    bildirim: { tur: "basari" | "hata"; metin: string; eylem?: { metin: string; link: string } };
    girisNotu: string;
  }
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET .env dosyasında yok. .env.example'a bak.");
}

const MySQLStore = MySQLStoreFactory(session as any);
const depo = new MySQLStore(
  {
    createDatabaseTable: true, // sql/06'da zaten oluşturduk; yoksa paket oluşturur
    clearExpired: true,        // süresi dolan oturumları 15 dakikada bir siler
    expiration: 30 * 24 * 60 * 60 * 1000,
    endConnectionOnClose: false, // havuz (pool) bizim; paket kapatmasın
  },
  pool as any
);

export const oturum = session({
  name: "quadran.sid",
  secret: process.env.SESSION_SECRET, // çerezi imzalar: kimlik elle değiştirilirse sunucu fark eder
  store: depo,
  resave: false,             // değişmeyen oturumu her istekte yeniden yazma
  saveUninitialized: false,  // misafirlere boşuna oturum açma (veritabanı şişmesin)
  cookie: {
    httpOnly: true,  // JavaScript (document.cookie) çereze erişemez: XSS ile çalınamaz
    sameSite: "lax", // başka sitelerden gelen POST isteklerine çerez eklenmez: CSRF'e karşı temel koruma
    secure: false,   // HTTPS'e geçince true yapılmalı
    // maxAge burada yok: "Beni hatırla" seçilirse girişte 30 gün olarak ayarlanır,
    // seçilmezse tarayıcı kapanınca çerez silinir.
  },
});

// ---------------------------------------------------------------------------
// Her istekte çalışır: kullanıcıyı, tercihlerini ve üst çubuk verilerini hazırlar.
// ---------------------------------------------------------------------------
export async function ortakVeriler(req: Request, res: Response, next: NextFunction) {
  res.locals.kullanici = null;
  res.locals.tema = "koyu";
  res.locals.vurgu = "safir";
  res.locals.menuYonu = "sol";
  res.locals.adres = req.path; // menülerde aktif öğe için

  // Flash bildirim: bir kez gösterilip silinir
  if (req.session.bildirim) {
    res.locals.bildirim = req.session.bildirim;
    delete req.session.bildirim;
  }

  const userId = req.session.userId;
  if (!userId) return next();

  const [satirlar]: any = await pool.query(
    `SELECT users.id, users.username, users.points, users.tema, users.vurgu, users.menu_sagda,
            users.kompakt, users.az_animasyon, users.last_seen_at, users.banned_at, users.deleted_at,
            roles.name AS rol,
            ${rutbeSql("users")} AS rutbe
       FROM users
       JOIN roles ON roles.id = users.role_id
      WHERE users.id = ?`,
    [userId]
  );
  const k = satirlar[0];

  // Hesap silinmiş ya da uzaklaştırılmışsa oturumu kapat
  if (!k || k.deleted_at || k.banned_at) {
    delete req.session.userId;
    return next();
  }

  res.locals.kullanici = k;
  // "sistem" teması CSS'te henüz yok (prefers-color-scheme gerekiyor), şimdilik koyu gösterilir
  res.locals.tema = k.tema === "acik" ? "acik" : "koyu";
  res.locals.vurgu = k.vurgu;
  res.locals.menuYonu = k.menu_sagda ? "sag" : "sol";

  // Üst çubuk: okunmamış sayıları ve zil panelindeki son 5 bildirim
  const [[sayilar]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL) AS bildirim,
            (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND read_at IS NULL) AS mesaj`,
    [k.id, k.id]
  );
  res.locals.okunmamisBildirim = Number(sayilar.bildirim);
  res.locals.okunmamisMesaj = Number(sayilar.mesaj);

  const [sonBildirimler]: any = await pool.query(
    `SELECT notifications.id, notifications.metin, notifications.created_at, notifications.read_at,
            users.username AS kisi
       FROM notifications
       LEFT JOIN users ON users.id = notifications.actor_id
      WHERE notifications.user_id = ?
      ORDER BY notifications.created_at DESC, notifications.id DESC
      LIMIT 5`,
    [k.id]
  );
  // bildirim-paneli.ejs'in beklediği biçime çevir.
  // Bağlantı /bildirimler/<id> üzerinden gider: orada okundu işaretlenip asıl adrese yönlendirilir.
  res.locals.bildirimler = sonBildirimler.map((n: any) => ({
    avatar_harf: n.kisi ? n.kisi[0] : "Q",
    metin: n.metin,
    zaman: n.created_at,
    okunmadi: !n.read_at,
    link: "/bildirimler/" + n.id,
  }));

  // Çevrimiçi listesi için "son görülme". Her istekte yazmamak için dakikada en fazla bir kez.
  if (!k.last_seen_at || Date.now() - new Date(k.last_seen_at).getTime() > 60_000) {
    await pool.query("UPDATE users SET last_seen_at = NOW() WHERE id = ?", [k.id]);
  }

  next();
}

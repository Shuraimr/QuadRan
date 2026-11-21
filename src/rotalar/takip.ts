// Takip sistemi (sql/20_takip.sql): takip et / bırak ve takipçi–takip edilen listeleri.
import express from "express";
import { pool } from "../db.ts";
import { HizSiniri } from "../hiz-siniri.ts";
import { rutbeSutunlari, bildirimGonder, bildir, girisGerekli, sayi } from "../yardimci.ts";

export const takip = express.Router();

// Takip/bırak: kişi başı dakikada en çok 30 işlem. Sürekli takip–bırak yapıp karşı tarafa
// bildirim yağdırmayı (spam) yavaşlatır; normal kullanımı etkilemez. say() yalnızca doğrulama geçince çağrılır.
const takipHizi = new HizSiniri(30, 1);

// Hedef kullanıcıyı bul ve işlemin yapılıp yapılamayacağını denetle.
// Dönüş: hedef satırı; null = bulunamadı (404); undefined = yanıt zaten verildi (hata toast'u + yönlendirme).
async function hedefiBul(req: express.Request, res: express.Response) {
  const ben = res.locals.kullanici;
  const [satirlar]: any = await pool.query("SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL", [req.params.kullanici]);
  const hedef = satirlar[0];
  if (!hedef) return null;
  const profil = "/profil/" + encodeURIComponent(hedef.username);
  if (hedef.id === ben.id) {
    bildir(req, "hata", "Kendini takip edemezsin.");
    res.redirect(profil);
    return undefined;
  }
  // Aralarında HERHANGİ bir yönde engel varsa takip yok; kimin engellediğini söylemiyoruz (src/gizlilik.ts ile aynı gerekçe).
  const [[e]]: any = await pool.query(
    "SELECT COUNT(*) AS n FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
    [ben.id, hedef.id, hedef.id, ben.id]
  );
  if (Number(e.n) > 0) {
    bildir(req, "hata", "Bu kişiyi takip edemezsin.");
    res.redirect(profil);
    return undefined;
  }
  const kalan = takipHizi.kalanDakika(String(ben.id));
  if (kalan > 0) {
    bildir(req, "hata", "Çok hızlı işlem yapıyorsun, biraz sonra tekrar dene.");
    res.redirect(profil);
    return undefined;
  }
  takipHizi.say(String(ben.id));
  return hedef;
}

takip.post("/takip/:kullanici", girisGerekli(), async (req, res, next) => {
  const hedef = await hedefiBul(req, res);
  if (hedef === undefined) return;
  if (!hedef) return next();
  const ben = res.locals.kullanici;
  // INSERT IGNORE: zaten takipteyse hata vermez, affectedRows 0 olur. Bildirimi yalnızca GERÇEKTEN yeni takipte
  // gönderiyoruz; yoksa art arda istek göndererek karşı tarafın bildirimlerini doldurmak mümkün olurdu.
  const [sonuc]: any = await pool.query("INSERT IGNORE INTO user_follows (follower_id, followed_id) VALUES (?, ?)", [ben.id, hedef.id]);
  if (sonuc.affectedRows === 1) {
    await bildirimGonder({
      alan: hedef.id, yapan: ben.id, tur: "takip",
      metin: `${ben.username} seni takip etmeye başladı`,
      link: "/profil/" + encodeURIComponent(ben.username),
    });
  }
  bildir(req, "basari", `${hedef.username} takip ediliyor`);
  res.redirect("/profil/" + encodeURIComponent(hedef.username));
});

takip.post("/takip/:kullanici/birak", girisGerekli(), async (req, res, next) => {
  const hedef = await hedefiBul(req, res);
  if (hedef === undefined) return;
  if (!hedef) return next();
  await pool.query("DELETE FROM user_follows WHERE follower_id = ? AND followed_id = ?", [res.locals.kullanici.id, hedef.id]);
  bildir(req, "basari", `${hedef.username} artık takip edilmiyor`);
  res.redirect("/profil/" + encodeURIComponent(hedef.username));
});

// Listeler: "takipciler" = bu kişiyi takip edenler, "takip-edilenler" = bu kişinin takip ettikleri.
// İkisi aynı sorguyu kullanır; yalnızca hangi sütunun "bu kişi", hangisinin "listelenen kişi" olduğu değişir.
// Sütun adları koddaki sabitlerdir (kullanıcı girdisi değil), bu yüzden SQL'e birleştirmek güvenli.
const SAYFA_BOYUTU = 50;

async function liste(req: express.Request, res: express.Response, next: express.NextFunction, tur: "takipciler" | "takip-edilenler") {
  const [[profil]]: any = await pool.query("SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL", [req.params.username]);
  if (!profil) return next();
  const benim = tur === "takipciler" ? "followed_id" : "follower_id";
  const listelenen = tur === "takipciler" ? "follower_id" : "followed_id";
  const sayfa = Math.max(1, sayi(req.query.sayfa) ?? 1);

  const [[toplamlar]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM user_follows f JOIN users u ON u.id = f.follower_id AND u.deleted_at IS NULL WHERE f.followed_id = ?) AS takipciler,
            (SELECT COUNT(*) FROM user_follows f JOIN users u ON u.id = f.followed_id AND u.deleted_at IS NULL WHERE f.follower_id = ?) AS takip_edilenler`,
    [profil.id, profil.id]
  );
  const toplam = Number(toplamlar[tur === "takipciler" ? "takipciler" : "takip_edilenler"]);

  const [kisiler]: any = await pool.query(
    `SELECT users.username, users.points, ${rutbeSutunlari("users")}
       FROM user_follows f
       JOIN users ON users.id = f.${listelenen} AND users.deleted_at IS NULL
      WHERE f.${benim} = ?
      ORDER BY f.created_at DESC, users.id DESC
      LIMIT ? OFFSET ?`,
    [profil.id, SAYFA_BOYUTU, (sayfa - 1) * SAYFA_BOYUTU]
  );
  res.render("takip-listesi", {
    profil, tur, kisiler, sayfa, sayfaSayisi: Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU)),
    takipciSayisi: Number(toplamlar.takipciler), takipSayisi: Number(toplamlar.takip_edilenler),
  });
}

takip.get("/profil/:username/takipciler", (req, res, next) => liste(req, res, next, "takipciler"));
takip.get("/profil/:username/takip-edilenler", (req, res, next) => liste(req, res, next, "takip-edilenler"));

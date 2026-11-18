// Yönetim paneli: Kullanıcılar (liste yalnızca admin; detay sayfasını moderatör de açabilir ama
// orada yalnızca ban/ban kaldırma yapabilir, rol/puan/rozet/şifre/hesap kapatma yalnızca admin).
import express from "express";
import { randomInt } from "node:crypto";
import { pool } from "../db.ts";
import { sifreHashle } from "../sifre.ts";
import {
  bildir, sayi, metin, geriAdres, rutbeSql, banliSql, likeKac, puanEkle, rozetVer, bildirimGonder,
} from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import { kullaniciGetir, islemHatasi, banla, banKaldir, BAN_SURELERI } from "../islemler.ts";
import { sadeceAdmin, sayfala, secim } from "./yonetim-ortak.ts";

export const yonetimKullanici = express.Router();

const ROLLER = ["hepsi", "admin", "moderator", "uye"] as const;
const SIRALAR: Record<string, string> = {
  id: "users.id", kullanici: "users.username", rol: "roles.name", puan: "users.points",
  kayit: "users.created_at", gorulme: "users.last_seen_at",
};

// ---------------------------------------------------------------------------
// Liste: /yonetim/kullanicilar?q=&rol=&banli=&silinmis=&sirala=&yon=&sayfa=
// WHERE parçaları koddaki sabit metinlerdir; kullanıcıdan gelen değerler hep parametre dizisine (?) girer.
// ORDER BY için sütun adı kullanıcıdan alınmaz: SIRALAR tablosundan seçilir (izin listesi).
// ---------------------------------------------------------------------------
yonetimKullanici.get("/yonetim/kullanicilar", sadeceAdmin, async (req, res) => {
  const q = metin(req.query.q).slice(0, 64);
  const rol = secim(req.query.rol, ROLLER, "hepsi");
  const banli = secim(req.query.banli, ["hepsi", "evet", "hayir"] as const, "hepsi");
  const silinmis = secim(req.query.silinmis, ["gizle", "goster", "sadece"] as const, "gizle");
  const sirala = secim(req.query.sirala, Object.keys(SIRALAR) as readonly string[], "id");
  const yon = secim(req.query.yon, ["asc", "desc"] as const, "desc");

  const kosullar: string[] = ["1 = 1"];
  const p: unknown[] = [];
  if (q) { kosullar.push("(users.username LIKE ? OR users.email LIKE ?)"); p.push(likeKac(q), likeKac(q)); }
  if (rol !== "hepsi") { kosullar.push("roles.name = ?"); p.push(rol); }
  if (banli === "evet") kosullar.push(banliSql("users"));
  if (banli === "hayir") kosullar.push(`NOT ${banliSql("users")}`);
  if (silinmis === "gizle") kosullar.push("users.deleted_at IS NULL");
  if (silinmis === "sadece") kosullar.push("users.deleted_at IS NOT NULL");
  const nerede = kosullar.join(" AND ");

  const [[{ n }]]: any = await pool.query(`SELECT COUNT(*) AS n FROM users JOIN roles ON roles.id = users.role_id WHERE ${nerede}`, p);
  const sf = sayfala(req, Number(n));
  const [kullanicilar]: any = await pool.query(
    `SELECT users.id, users.username, users.email, users.points, users.created_at, users.last_seen_at, users.deleted_at,
            users.banned_until, ${banliSql("users")} AS banli, roles.name AS rol, ${rutbeSql("users")} AS rutbe
       FROM users JOIN roles ON roles.id = users.role_id
      WHERE ${nerede}
      ORDER BY ${SIRALAR[sirala]} ${yon === "asc" ? "ASC" : "DESC"}, users.id DESC
      LIMIT ? OFFSET ?`,
    [...p, sf.boyut, sf.offset]
  );

  res.render("yonetim/kullanicilar", {
    baslik: "Kullanıcılar", aktif: "kullanicilar", kullanicilar, sf,
    qs: { q, rol, banli, silinmis, sirala, yon }, yol: "/yonetim/kullanicilar",
  });
});

// ---------------------------------------------------------------------------
// Detay: /yonetim/kullanicilar/:id
// ---------------------------------------------------------------------------
yonetimKullanici.get("/yonetim/kullanicilar/:id", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const yapan = res.locals.kullanici;
  const admin = yapan.rol === "admin";

  const [satirlar]: any = await pool.query(
    `SELECT users.id, users.username, users.email, users.bio, users.points, users.created_at, users.last_seen_at, users.deleted_at,
            users.banned_at, users.banned_until, users.ban_reason, ${banliSql("users")} AS banli,
            roles.name AS rol, ${rutbeSql("users")} AS rutbe
       FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = ?`,
    [id]
  );
  const k = satirlar[0];
  if (!k) return next();

  const [[ist]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM topics WHERE user_id = ? AND deleted_at IS NULL) AS konu,
            (SELECT COUNT(*) FROM posts WHERE user_id = ? AND deleted_at IS NULL) AS mesaj,
            (SELECT COUNT(*) FROM chat_messages WHERE user_id = ? AND deleted_at IS NULL) AS sohbet,
            (SELECT COUNT(*) FROM messages WHERE sender_id = ?) AS ozel,
            (SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes JOIN posts ON posts.id = post_votes.post_id WHERE posts.user_id = ?) AS oy,
            (SELECT COUNT(*) FROM reports WHERE reported_user_id = ?
                OR post_id IN (SELECT id FROM posts WHERE user_id = ?)
                OR chat_message_id IN (SELECT id FROM chat_messages WHERE user_id = ?)
                OR message_id IN (SELECT id FROM messages WHERE sender_id = ?)) AS sikayet`,
    [id, id, id, id, id, id, id, id, id]
  );
  for (const s in ist) ist[s] = Number(ist[s]);

  const [konular]: any = await pool.query(
    `SELECT topics.id, topics.title, topics.created_at, topics.deleted_at FROM topics WHERE user_id = ? ORDER BY id DESC LIMIT 10`, [id]);
  const [mesajlar]: any = await pool.query(
    `SELECT posts.id, posts.content, posts.created_at, posts.deleted_at, posts.topic_id FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 10`, [id]);
  const [sohbet]: any = await pool.query(
    `SELECT id, content, created_at, deleted_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 10`, [id]);
  // Hakkındaki şikâyetler: kullanıcının kendisi, konu mesajları, sohbet ve özel mesajları (özel mesajın İÇERİĞİ gösterilmez)
  const [sikayetler]: any = await pool.query(
    `SELECT reports.id, reports.hedef_tur, reports.sebep, reports.durum, reports.created_at, bildiren.username AS bildiren
       FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id
      WHERE reports.reported_user_id = ?
         OR reports.post_id IN (SELECT id FROM posts WHERE user_id = ?)
         OR reports.chat_message_id IN (SELECT id FROM chat_messages WHERE user_id = ?)
         OR reports.message_id IN (SELECT id FROM messages WHERE sender_id = ?)
      ORDER BY reports.id DESC LIMIT 10`,
    [id, id, id, id]
  );

  // Yalnızca admin: işlem geçmişi, rozetler, rol listesi
  let gecmis: any[] = [], rozetler: any[] = [], tumRozetler: any[] = [], roller: any[] = [];
  if (admin) {
    [gecmis] = (await pool.query(
      `SELECT audit_log.id, audit_log.eylem, audit_log.ayrinti, audit_log.created_at, users.username AS aktor
         FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
        WHERE audit_log.hedef_tur = 'kullanici' AND audit_log.hedef_id = ? ORDER BY audit_log.id DESC LIMIT 15`, [id])) as any;
    [rozetler] = (await pool.query(
      `SELECT badges.id, badges.name FROM user_badges JOIN badges ON badges.id = user_badges.badge_id WHERE user_badges.user_id = ? ORDER BY user_badges.earned_at`, [id])) as any;
    [tumRozetler] = (await pool.query("SELECT id, name FROM badges ORDER BY name")) as any;
    [roller] = (await pool.query("SELECT name FROM roles ORDER BY id")) as any;
  }

  // Bu yetkili bu kullanıcıya ban uygulayabilir mi? (kendisi, yönetici ve moderatörler için moderatör yapamaz)
  const hedef = await kullaniciGetir(id);
  const banHatasi = await islemHatasi(yapan, hedef, true);
  const islemEngeli = await islemHatasi(yapan, hedef); // son yönetici kuralı olmadan (ban kaldırma, rol vb. için)

  res.render("yonetim/kullanici", {
    baslik: k.username, aktif: "kullanicilar", k, ist, konular, mesajlar, sohbet, sikayetler, gecmis, rozetler, tumRozetler, roller,
    banHatasi, islemEngeli, sureler: BAN_SURELERI,
  });
});

// ---------------------------------------------------------------------------
// İşlemler. Hepsi POST + CSRF (ara katman). Sonuç toast olarak gösterilip detay sayfasına dönülür.
// ---------------------------------------------------------------------------
const detay = (id: number) => `/yonetim/kullanicilar/${id}`;

// Rol değiştir (yalnızca admin)
yonetimKullanici.post("/yonetim/kullanicilar/:id/rol", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const yeniRol = metin(req.body.rol);
  const hedef = await kullaniciGetir(id);
  const [roller]: any = await pool.query("SELECT id FROM roles WHERE name = ?", [yeniRol]);
  let hata = !roller[0] ? "Geçersiz rol." : null;
  hata ??= await islemHatasi(res.locals.kullanici, hedef, yeniRol !== "admin"); // admin düşürülüyorsa son yönetici korunur
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesabın rolü değiştirilemez.";
  if (!hata && hedef!.rol === yeniRol) hata = "Kullanıcı zaten bu rolde.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(detay(id)); }

  await pool.query("UPDATE users SET role_id = ? WHERE id = ?", [roller[0].id, id]);
  await denetim(req, res, "kullanici.rol", "kullanici", id, { eski: hedef!.rol, yeni: yeniRol });
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: `Rolün değiştirildi: ${yeniRol}`, link: "/profil/" + hedef!.username });
  bildir(req, "basari", `${hedef!.username} artık ${yeniRol}.`);
  res.redirect(detay(id));
});

// Puan ayarla (yalnızca admin): +/- fark ve zorunlu sebep
yonetimKullanici.post("/yonetim/kullanicilar/:id/puan", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const fark = Number(metin(req.body.fark));
  const sebep = metin(req.body.sebep);
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef);
  if (!hata && (!Number.isInteger(fark) || fark === 0 || Math.abs(fark) > 100000)) hata = "Puan farkı 0 olmayan, en fazla 100.000 büyüklüğünde bir tam sayı olmalı.";
  if (!hata && (sebep.length < 3 || sebep.length > 200)) hata = "Sebep 3 ile 200 karakter arasında olmalı.";
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesabın puanı değiştirilemez.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(detay(id)); }

  const [[once]]: any = await pool.query("SELECT points FROM users WHERE id = ?", [id]);
  await puanEkle(id, fark); // puan sıfırın altına inmez
  const [[sonra]]: any = await pool.query("SELECT points FROM users WHERE id = ?", [id]);
  await denetim(req, res, "kullanici.puan", "kullanici", id, { fark, sebep, onceki: once.points, sonraki: sonra.points });
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: `Puanın yönetici tarafından ${fark > 0 ? "+" : ""}${fark} değiştirildi: ${sebep}`, link: "/profil/" + hedef!.username });
  bildir(req, "basari", `Puan ${once.points} → ${sonra.points} oldu.`);
  res.redirect(detay(id));
});

// Ban (admin ve moderatör; moderatör yalnızca "uye" rolündekini banlar, kurallar islemler.ts'te)
yonetimKullanici.post("/yonetim/kullanicilar/:id/ban", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const sebep = metin(req.body.sebep);
  const sonuc = await banla(res.locals.kullanici, id, metin(req.body.sure), sebep);
  if (sonuc.hata) { bildir(req, "hata", sonuc.hata); return res.redirect(detay(id)); }
  await denetim(req, res, "kullanici.ban", "kullanici", id, { sure: sonuc.etiket, sebep, kaynak: "kullanıcı sayfası" });
  bildir(req, "basari", `${sonuc.hedef!.username} uzaklaştırıldı (${sonuc.etiket}).`);
  res.redirect(detay(id));
});

yonetimKullanici.post("/yonetim/kullanicilar/:id/ban-kaldir", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const sonuc = await banKaldir(res.locals.kullanici, id);
  if (sonuc.hata) { bildir(req, "hata", sonuc.hata); return res.redirect(detay(id)); }
  await denetim(req, res, "kullanici.ban_kaldir", "kullanici", id, { kaynak: "kullanıcı sayfası" });
  bildir(req, "basari", `${sonuc.hedef!.username} için uzaklaştırma kaldırıldı.`);
  res.redirect(detay(id));
});

// Rozet ver / al (yalnızca admin)
yonetimKullanici.post("/yonetim/kullanicilar/:id/rozet-ver", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const hedef = await kullaniciGetir(id);
  const [rozetler]: any = await pool.query("SELECT id, name FROM badges WHERE id = ?", [sayi(req.body.badge_id)]);
  const hata = !hedef ? "Kullanıcı bulunamadı." : hedef.silindi ? "Kapatılmış hesaba rozet verilemez." : !rozetler[0] ? "Rozet bulunamadı." : null;
  if (hata) { bildir(req, "hata", hata); return res.redirect(detay(id)); }
  const [var_]: any = await pool.query("SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?", [id, rozetler[0].id]);
  if (var_[0]) { bildir(req, "hata", "Kullanıcı bu rozete zaten sahip."); return res.redirect(detay(id)); }
  await rozetVer(id, rozetler[0].name); // bildirimi de gönderir
  await denetim(req, res, "kullanici.rozet_ver", "kullanici", id, { rozet: rozetler[0].name });
  bildir(req, "basari", `“${rozetler[0].name}” rozeti verildi.`);
  res.redirect(detay(id));
});

yonetimKullanici.post("/yonetim/kullanicilar/:id/rozet-al", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [rozetler]: any = await pool.query("SELECT id, name FROM badges WHERE id = ?", [sayi(req.body.badge_id)]);
  if (!rozetler[0]) { bildir(req, "hata", "Rozet bulunamadı."); return res.redirect(detay(id)); }
  const [sonuc]: any = await pool.query("DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?", [id, rozetler[0].id]);
  if (!sonuc.affectedRows) { bildir(req, "hata", "Kullanıcıda bu rozet yok."); return res.redirect(detay(id)); }
  await denetim(req, res, "kullanici.rozet_al", "kullanici", id, { rozet: rozetler[0].name });
  bildir(req, "basari", `“${rozetler[0].name}” rozeti geri alındı.`);
  res.redirect(detay(id));
});

// Hesabı kapat (yalnızca admin): /hesap/sil ile aynı yumuşak silme. Kullanıcı adını yazarak onaylanır.
yonetimKullanici.post("/yonetim/kullanicilar/:id/hesap-kapat", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef, true);
  if (!hata && hedef!.silindi) hata = "Hesap zaten kapatılmış.";
  if (!hata && metin(req.body.onay) !== hedef!.username) hata = "Onay için kullanıcı adını tam olarak yazmalısın.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(detay(id)); }

  // Kullanıcı adı ve e-posta değişir ki aynısı tekrar kayıt olabilsin (hesap/sil ile aynı kural)
  await pool.query(
    `UPDATE users SET deleted_at = NOW(), username = CONCAT('silinmis_', id), email = CONCAT('silinmis_', id, '@quadran.invalid'),
            bio = NULL, avatar_url = NULL, banner_url = NULL, password_hash = '' WHERE id = ?`,
    [id]
  );
  await denetim(req, res, "kullanici.hesap_kapat", "kullanici", id, { eski_ad: hedef!.username });
  bildir(req, "basari", `${hedef!.username} hesabı kapatıldı.`);
  res.redirect(detay(id));
});

// Şifreyi sıfırla (yalnızca admin): rastgele geçici şifre üretilir ve BİR KEZ gösterilir.
// Şifre ne veritabanına düz yazılır, ne işlem kaydına, ne de oturuma; yalnızca bu yanıtın gövdesinde görünür.
const ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // 0/O, 1/l/I gibi karışanlar yok
yonetimKullanici.post("/yonetim/kullanicilar/:id/sifre-sifirla", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef);
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesabın şifresi sıfırlanamaz.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(detay(id)); }

  let gecici = "";
  for (let i = 0; i < 12; i++) gecici += ALFABE[randomInt(ALFABE.length)]; // randomInt: güvenli rastgele (Math.random değil)
  // oturum_surumu + 1: kullanıcının açık oturumları düşer, geçici şifreyle yeniden girmesi gerekir
  await pool.query("UPDATE users SET password_hash = ?, oturum_surumu = oturum_surumu + 1 WHERE id = ?", [await sifreHashle(gecici), id]);
  // Bekleyen "şifremi unuttum" bağlantıları da ölür
  await pool.query("UPDATE password_resets SET used_at = COALESCE(used_at, NOW()) WHERE user_id = ?", [id]);
  await denetim(req, res, "kullanici.sifre_sifirla", "kullanici", id, { kullanici: hedef!.username });
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: "Şifren yönetici tarafından sıfırlandı. Giriş yaptıktan sonra şifreni değiştir.", link: "/hesap/sifre" });

  res.set("Cache-Control", "no-store"); // tarayıcı/ara önbellek geçici şifreyi saklamasın
  res.render("yonetim/gecici-sifre", { baslik: "Geçici şifre", aktif: "kullanicilar", k: hedef, gecici });
});

// İletişim: özel mesajlar, bildirimler, genel sohbet.
import express from "express";
import { pool } from "../db.ts";
import { rutbeSql, bildirimGonder, bildir, kisalt, girisGerekli, sayi, metin } from "../yardimci.ts";

export const iletisim = express.Router();

// ---------------------------------------------------------------------------
// Özel mesajlar
//   /mesajlar              konuşma listesi
//   /mesajlar/:kullanici   listede o konuşma açık
//
// Konuşma listesi: messages tablosunda her satırın "karşı taraf"ı, ben gönderdiysem alıcı,
// bana geldiyse gönderendir. CASE ile karşı tarafı bulup ona göre grupluyoruz.
// ---------------------------------------------------------------------------
async function konusmalar(benId: number, q: string) {
  const [satirlar]: any = await pool.query(
    `SELECT users.username AS kullanici, ${rutbeSql("users")} AS rutbe,
            son.content AS son_mesaj, son.created_at AS son_zaman, son.sender_id = ? AS son_benden,
            k.okunmamis
       FROM (
         SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS karsi_id,
                MAX(id) AS son_id,
                SUM(receiver_id = ? AND read_at IS NULL) AS okunmamis
           FROM messages
          WHERE sender_id = ? OR receiver_id = ?
          GROUP BY karsi_id
       ) AS k
       JOIN messages AS son ON son.id = k.son_id
       JOIN users ON users.id = k.karsi_id
      WHERE users.username LIKE ?
      ORDER BY son.id DESC`,
    [benId, benId, benId, benId, benId, "%" + q.replace(/[\\%_]/g, "\\$&") + "%"]
  );
  for (const s of satirlar) {
    s.okunmamis = Number(s.okunmamis);
    s.son_benden = !!s.son_benden;
    s.son_mesaj = kisalt(s.son_mesaj, 80);
  }
  return satirlar;
}

async function mesajlarSayfasi(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ben = res.locals.kullanici;
  const q = metin(req.query.q).slice(0, 32);
  let acik = null;

  if (req.params.kullanici) {
    const [kisiler]: any = await pool.query(
      `SELECT users.id, users.username, ${rutbeSql("users")} AS rutbe FROM users WHERE username = ? AND deleted_at IS NULL`,
      [req.params.kullanici]
    );
    const kisi = kisiler[0];
    if (!kisi) return next();
    if (kisi.id === ben.id) return res.redirect("/mesajlar");

    // Konuşmayı açınca bana gelen okunmamış mesajlar okundu olur (karşı taraf "Görüldü" görür)
    await pool.query(
      "UPDATE messages SET read_at = NOW() WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL",
      [kisi.id, ben.id]
    );
    // Az önce okunanlar üst çubuktaki sayıdan da düşsün
    const [[kalan]]: any = await pool.query("SELECT COUNT(*) AS n FROM messages WHERE receiver_id = ? AND read_at IS NULL", [ben.id]);
    res.locals.okunmamisMesaj = Number(kalan.n);

    const [mesajlar]: any = await pool.query(
      `SELECT id, content, created_at, read_at, sender_id = ? AS benim
         FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY id DESC LIMIT 200`,
      [ben.id, ben.id, kisi.id, kisi.id, ben.id]
    );
    // Son 200 mesajı yeniden eskiye aldık; şablon eskiden yeniye istiyor
    mesajlar.reverse();
    for (const m of mesajlar) m.benim = !!m.benim;
    acik = { kullanici: kisi.username, rutbe: kisi.rutbe, mesajlar };
  }

  res.render("mesajlar", { q, konusmalar: await konusmalar(ben.id, q), acik, aktifMenu: "mesajlar" });
}

iletisim.get("/mesajlar", girisGerekli("Mesajların için giriş yapman gerekiyor."), mesajlarSayfasi);
iletisim.get("/mesajlar/:kullanici", girisGerekli("Mesaj göndermek için giriş yapman gerekiyor."), mesajlarSayfasi);

iletisim.post("/mesajlar/:kullanici", girisGerekli("Mesaj göndermek için giriş yapman gerekiyor."), async (req, res, next) => {
  const ben = res.locals.kullanici;
  const content = metin(req.body.content);
  const [kisiler]: any = await pool.query("SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL", [req.params.kullanici]);
  const kisi = kisiler[0];
  if (!kisi) return next();
  const adres = "/mesajlar/" + encodeURIComponent(kisi.username);

  if (kisi.id === ben.id) return res.redirect("/mesajlar");
  if (!content || content.length > 2000) {
    bildir(req, "hata", content ? "Mesaj en fazla 2000 karakter olabilir." : "Mesaj boş olamaz.");
    return res.redirect(adres);
  }

  const [sonuc]: any = await pool.query("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)", [ben.id, kisi.id, content]);
  await bildirimGonder({
    alan: kisi.id, yapan: ben.id, tur: "mesaj",
    metin: `${ben.username} sana özel mesaj gönderdi`,
    link: "/mesajlar/" + encodeURIComponent(ben.username),
  });
  res.redirect(`${adres}#m-${sonuc.insertId}`);
});

// ---------------------------------------------------------------------------
// Bildirimler
// ---------------------------------------------------------------------------
iletisim.get("/bildirimler", girisGerekli("Bildirimlerin için giriş yapman gerekiyor."), async (req, res) => {
  const ben = res.locals.kullanici;
  const filtre = req.query.filtre === "okunmamis" ? "okunmamis" : "hepsi";
  const [satirlar]: any = await pool.query(
    `SELECT notifications.id, notifications.tur, notifications.metin, notifications.created_at, notifications.read_at,
            users.username AS kisi
       FROM notifications
       LEFT JOIN users ON users.id = notifications.actor_id
      WHERE notifications.user_id = ? ${filtre === "okunmamis" ? "AND notifications.read_at IS NULL" : ""}
      ORDER BY notifications.created_at DESC, notifications.id DESC
      LIMIT 100`,
    [ben.id]
  );
  // Bu sayfa da "bildirimler" adını kullanıyor; üst çubuktaki zil paneli de aynı adı okur.
  // İkisinin de alanlarını koyuyoruz ki panel bu sayfada da düzgün çizilsin.
  const bildirimler = satirlar.map((n: any) => ({
    ...n,
    link: "/bildirimler/" + n.id,
    avatar_harf: n.kisi ? n.kisi[0] : "Q",
    zaman: n.created_at,
    okunmadi: !n.read_at,
  }));
  res.render("bildirimler", { filtre, bildirimler, okunmamis_sayisi: res.locals.okunmamisBildirim, aktifMenu: "bildirimler" });
});

// Bir bildirime tıklanınca: okundu yap, asıl adrese git
iletisim.get("/bildirimler/:id", girisGerekli(), async (req, res, next) => {
  const id = sayi(req.params.id);
  const [satirlar]: any = id
    ? await pool.query("SELECT link FROM notifications WHERE id = ? AND user_id = ?", [id, res.locals.kullanici.id])
    : [[]];
  if (!satirlar[0]) return next();
  await pool.query("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ?", [id]);
  res.redirect(satirlar[0].link);
});

iletisim.post("/bildirimler/okundu", girisGerekli(), async (req, res) => {
  await pool.query("UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL", [res.locals.kullanici.id]);
  bildir(req, "basari", "Bütün bildirimler okundu sayıldı");
  res.redirect("/bildirimler");
});

// ---------------------------------------------------------------------------
// Genel sohbet (canlı değil: sayfa yenilenince yeni mesajlar görünür)
// ---------------------------------------------------------------------------
async function sohbetVerisi() {
  const [mesajlar]: any = await pool.query(
    `SELECT * FROM (
       SELECT chat_messages.id, chat_messages.content, chat_messages.created_at,
              users.username AS yazar, ${rutbeSql("users")} AS rutbe
         FROM chat_messages JOIN users ON users.id = chat_messages.user_id
        ORDER BY chat_messages.id DESC LIMIT 50
     ) AS son ORDER BY id`
  );
  // Son 5 dakikada herhangi bir sayfa açanlar (oturum.ts last_seen_at'i günceller)
  const [cevrimici] = await pool.query(
    `SELECT username FROM users
      WHERE deleted_at IS NULL AND last_seen_at >= NOW() - INTERVAL 5 MINUTE
      ORDER BY username`
  );
  return { mesajlar, cevrimici };
}

iletisim.get("/sohbet", async (req, res) => {
  res.render("sohbet", { ...(await sohbetVerisi()), aktifMenu: "sohbet" });
});

iletisim.post("/sohbet", girisGerekli("Sohbete yazmak için giriş yapman gerekiyor."), async (req, res) => {
  const content = metin(req.body.content);
  if (!content || content.length > 500) {
    return res.status(400).render("sohbet", {
      ...(await sohbetVerisi()),
      hata: content ? "Mesaj en fazla 500 karakter olabilir." : "Mesaj boş olamaz.",
      aktifMenu: "sohbet",
    });
  }
  const [sonuc]: any = await pool.query("INSERT INTO chat_messages (user_id, content) VALUES (?, ?)", [res.locals.kullanici.id, content]);
  res.redirect("/sohbet#s-" + sonuc.insertId);
});

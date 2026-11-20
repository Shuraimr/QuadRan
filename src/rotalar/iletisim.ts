// İletişim: özel mesajlar, bildirimler, genel sohbet.
import express from "express";
import { pool } from "../db.ts";
import { yasakliIfade } from "../ayarlar.ts";
import { rutbeSutunlari, bildirimGonder, bildir, kisalt, girisGerekli, sayi, metin, likeKac, geriAdres } from "../yardimci.ts";
import { mesajDurumu, cevrimiciSql } from "../gizlilik.ts";
import { hubVerisi } from "../odalar.ts";

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
    `SELECT users.username AS kullanici, ${rutbeSutunlari("users")},
            IF(son.deleted_at IS NULL, son.content, 'Mesaj kaldırıldı') AS son_mesaj, son.created_at AS son_zaman, son.sender_id = ? AS son_benden,
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
      `SELECT users.id, users.username, ${rutbeSutunlari("users")}, ${cevrimiciSql("users")} AS cevrimici
         FROM users WHERE username = ? AND deleted_at IS NULL`,
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
      `SELECT id, IF(deleted_at IS NULL, content, '') AS content,
              created_at, read_at, sender_id = ? AS benim, deleted_at IS NOT NULL AS silindi
         FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY id DESC LIMIT 200`,
      [ben.id, ben.id, kisi.id, kisi.id, ben.id]
    );
    // Son 200 mesajı yeniden eskiye aldık; şablon eskiden yeniye istiyor
    mesajlar.reverse();
    for (const m of mesajlar) { m.benim = !!m.benim; m.silindi = !!m.silindi; }
    // durum: yazı kutusu mu, engel/izin kartı mı (mesajDurumu, src/gizlilik.ts)
    acik = { kullanici: kisi.username, rutbe: kisi.rutbe, rutbe_id: kisi.rutbe_id, yazar_rol: kisi.yazar_rol, cevrimici: !!kisi.cevrimici, durum: await mesajDurumu(ben.id, kisi.id), mesajlar };
  }

  res.render("mesajlar", { q, konusmalar: await konusmalar(ben.id, q), acik, aktifMenu: "mesajlar" });
}

// Yeni mesaj için kullanıcı ara: kendim, silinmiş hesaplar ve aramızda engel olan (iki yönde de) kişiler çıkmaz.
async function kisiAra(benId: number, q: string) {
  if (!q) return [];
  const [satirlar]: any = await pool.query(
    `SELECT users.username, ${rutbeSutunlari("users")} FROM users
      WHERE users.username LIKE ? AND users.deleted_at IS NULL AND users.id <> ?
        AND NOT EXISTS (SELECT 1 FROM user_blocks b
                         WHERE (b.blocker_id = ? AND b.blocked_id = users.id) OR (b.blocker_id = users.id AND b.blocked_id = ?))
      ORDER BY users.username LIMIT 8`,
    [likeKac(q), benId, benId, benId]
  );
  return satirlar as { username: string; rutbe: string | null }[];
}

// JS'in kullandığı JSON ucu. NOT: "yeni" geçerli bir kullanıcı adı biçimidir ama /mesajlar/yeni bu sayfaya gider;
// bu yüzden hesap.ts "yeni"yi ayrılmış ad sayar ("kisi-ara" tire içerdiği için zaten kullanıcı adı olamaz).
iletisim.get("/mesajlar/kisi-ara", girisGerekli("Mesaj göndermek için giriş yapman gerekiyor."), async (req, res) => {
  res.json(await kisiAra(res.locals.kullanici.id, metin(req.query.q).slice(0, 32)));
});

// JS yokken aynı arama bir sayfa olarak açılır (mesajlar.ejs "yeni" bayrağı)
iletisim.get("/mesajlar/yeni", girisGerekli("Mesaj göndermek için giriş yapman gerekiyor."), async (req, res) => {
  const ben = res.locals.kullanici;
  const aramaQ = metin(req.query.q).slice(0, 32);
  res.render("mesajlar", { q: "", konusmalar: await konusmalar(ben.id, ""), acik: null, yeni: true, aramaQ, sonuclar: await kisiAra(ben.id, aramaQ), aktifMenu: "mesajlar" });
});

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

  // Engel / özel mesaj izni: sayfa yazı kutusunu zaten gizler ama asıl koruma burası (form elle de gönderilebilir).
  // Hangi sebep olduğunu söylemiyoruz (bkz. src/gizlilik.ts).
  const durum = await mesajDurumu(ben.id, kisi.id);
  if (durum !== "izinli") {
    bildir(req, "hata", durum === "ben_engelledim" ? "Engellediğin birine mesaj gönderemezsin. Önce engeli kaldır." : "Bu kişiye şu an mesaj gönderemezsin.");
    return res.redirect(adres);
  }

  const yasak = await yasakliIfade(content);
  if (yasak) {
    bildir(req, "hata", `Mesajında yasaklı bir ifade var: “${yasak}”.`);
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

// Kendi mesajını sil: yumuşak silme (deleted_at). Başkasının mesajına dokunamaz: sorgu sender_id = ben şartını arar.
// Satır kalır, böylece konuşmada "Bu mesaj silindi" yer tutucusu görünür ve şikâyet kaydı bozulmaz.
iletisim.post("/mesajlar/mesaj/:id/sil", girisGerekli(), async (req, res, next) => {
  const ben = res.locals.kullanici;
  const id = sayi(req.params.id);
  const [satirlar]: any = id
    ? await pool.query(
        `SELECT messages.id, users.username AS karsi FROM messages JOIN users ON users.id = messages.receiver_id
          WHERE messages.id = ? AND messages.sender_id = ?`, [id, ben.id])
    : [[]];
  const m = satirlar[0];
  if (!m) return next(); // yok ya da başkasının: 404 (varlığını da söylemiyoruz)
  await pool.query("UPDATE messages SET deleted_at = COALESCE(deleted_at, NOW()) WHERE id = ?", [m.id]);
  bildir(req, "basari", "Mesajın silindi");
  res.redirect("/mesajlar/" + encodeURIComponent(m.karsi));
});

// Engelle / engeli kaldır. Adres kullanıcı adıyla; geldiği sayfaya (profil, mesajlar, ayarlar) döner.
async function engelHedefi(req: express.Request, res: express.Response) {
  const [satirlar]: any = await pool.query("SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL", [req.params.kullanici]);
  const hedef = satirlar[0];
  if (!hedef) return null;
  if (hedef.id === res.locals.kullanici.id) {
    bildir(req, "hata", "Kendini engelleyemezsin.");
    res.redirect(geriAdres(req, "/mesajlar"));
    return undefined;
  }
  return hedef;
}

iletisim.post("/engel/:kullanici", girisGerekli(), async (req, res, next) => {
  const hedef = await engelHedefi(req, res);
  if (hedef === undefined) return;
  if (!hedef) return next();
  await pool.query("INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)", [res.locals.kullanici.id, hedef.id]);
  bildir(req, "basari", `${hedef.username} engellendi`);
  res.redirect(geriAdres(req, "/mesajlar"));
});

iletisim.post("/engel/:kullanici/kaldir", girisGerekli(), async (req, res, next) => {
  const hedef = await engelHedefi(req, res);
  if (hedef === undefined) return;
  if (!hedef) return next();
  await pool.query("DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?", [res.locals.kullanici.id, hedef.id]);
  bildir(req, "basari", `${hedef.username} için engel kaldırıldı`);
  res.redirect(geriAdres(req, "/mesajlar"));
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
              users.username AS yazar, ${rutbeSutunlari("users")}
         FROM chat_messages JOIN users ON users.id = chat_messages.user_id
        WHERE chat_messages.deleted_at IS NULL
        ORDER BY chat_messages.id DESC LIMIT 50
     ) AS son ORDER BY id`
  );
  // Son 5 dakikada herhangi bir sayfa açanlar (oturum.ts last_seen_at'i günceller)
  const [cevrimici] = await pool.query(
    `SELECT username FROM users
      WHERE deleted_at IS NULL AND ${cevrimiciSql("users")}
      ORDER BY username`
  );
  return { mesajlar, cevrimici };
}

// Sohbet merkezi: üyeler için solda liste (genel sohbet + davetler + odalarım), sağda açık sohbet (burada genel sohbet).
// Misafirler yalnızca genel sohbeti okur (eski düzen). Hem /sohbet hem /oda/yeni (JS'siz "Oda aç" sayfası) bunu çizer.
// genelAcik: telefonda liste ve konuşma ayrı görünümdür; ?genel=1 konuşmayı açar (hata durumunda da açık kalır).
export async function sohbetSayfasi(req: express.Request, res: express.Response, ekstra: Record<string, unknown> = {}) {
  const ben = res.locals.kullanici;
  res.render("sohbet", {
    ...(await sohbetVerisi()),
    hub: ben ? await hubVerisi(ben) : null,
    genelAcik: !!req.query.genel,
    aktifOda: 0, panelAcik: "", aktifMenu: "sohbet",
    ...ekstra,
  });
}

iletisim.get("/sohbet", async (req, res) => {
  await sohbetSayfasi(req, res);
});

iletisim.post("/sohbet", girisGerekli("Sohbete yazmak için giriş yapman gerekiyor."), async (req, res) => {
  const content = metin(req.body.content);
  if (!content || content.length > 500) {
    res.status(400);
    return sohbetSayfasi(req, res, { hata: content ? "Mesaj en fazla 500 karakter olabilir." : "Mesaj boş olamaz.", genelAcik: true });
  }
  const yasak = await yasakliIfade(content);
  if (yasak) {
    res.status(400);
    return sohbetSayfasi(req, res, { hata: `Mesajında yasaklı bir ifade var: “${yasak}”.`, genelAcik: true });
  }
  const [sonuc]: any = await pool.query("INSERT INTO chat_messages (user_id, content) VALUES (?, ?)", [res.locals.kullanici.id, content]);
  res.redirect("/sohbet?genel=1#s-" + sonuc.insertId);
});

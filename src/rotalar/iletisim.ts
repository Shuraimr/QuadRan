// Communication: direct messages, notifications, general chat.
// İletişim: özel mesajlar, bildirimler, genel sohbet.
import express from "express";
import { pool } from "../db.ts";
import { yasakliIfade } from "../ayarlar.ts";
import { rutbeSutunlari, bildirimGonder, bildir, kisalt, girisGerekli, sayi, metin, likeKac, geriAdres } from "../yardimci.ts";
import { mesajDurumu, cevrimiciSql, takipleriSil } from "../gizlilik.ts";
import { hubVerisi } from "../odalar.ts";

export const iletisim = express.Router();

// ---------------------------------------------------------------------------
// Direct messages
//   /mesajlar              conversation list
//   /mesajlar/:kullanici   that conversation is open in the list
//
// Conversation list: for each row in the messages table the "other party" is the recipient if I sent it,
// and the sender if it came to me. We find the other party with CASE and group by it.
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

    // Opening the conversation marks unread messages sent to me as read (the other party sees "Görüldü" / Seen)
    // Konuşmayı açınca bana gelen okunmamış mesajlar okundu olur (karşı taraf "Görüldü" görür)
    await pool.query(
      "UPDATE messages SET read_at = NOW() WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL",
      [kisi.id, ben.id]
    );
    // Messages just read should also drop out of the count in the top bar
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
    // We fetched the last 200 messages newest to oldest; the template wants oldest to newest
    // Son 200 mesajı yeniden eskiye aldık; şablon eskiden yeniye istiyor
    mesajlar.reverse();
    for (const m of mesajlar) { m.benim = !!m.benim; m.silindi = !!m.silindi; }
    // durum: text box or block/permission card (mesajDurumu, src/gizlilik.ts)
    // durum: yazı kutusu mu, engel/izin kartı mı (mesajDurumu, src/gizlilik.ts)
    // avatar_url/avatar_susu are sent too: the other party's profile photo in the header (it used to show only the initial)
    // avatar_url/avatar_susu da gider: başlıkta karşı tarafın profil fotoğrafı (eskiden yalnızca baş harf çıkıyordu)
    acik = { kullanici: kisi.username, avatar_url: kisi.avatar_url, avatar_susu: kisi.avatar_susu, rutbe: kisi.rutbe, rutbe_id: kisi.rutbe_id, yazar_rol: kisi.yazar_rol, cevrimici: !!kisi.cevrimici, durum: await mesajDurumu(ben.id, kisi.id), mesajlar };
  }

  res.render("mesajlar", { q, konusmalar: await konusmalar(ben.id, q), acik, aktifMenu: "sohbet" });
}

// Search users for a new message: myself, deleted accounts and people with a block between us (in either direction) do not appear.
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

// The JSON endpoint used by JS. NOTE: "yeni" is a valid username format but /mesajlar/yeni goes to this page;
// so hesap.ts treats "yeni" as a reserved name ("kisi-ara" contains a hyphen so it cannot be a username anyway).
// JS'in kullandığı JSON ucu. NOT: "yeni" geçerli bir kullanıcı adı biçimidir ama /mesajlar/yeni bu sayfaya gider;
// bu yüzden hesap.ts "yeni"yi ayrılmış ad sayar ("kisi-ara" tire içerdiği için zaten kullanıcı adı olamaz).
iletisim.get("/mesajlar/kisi-ara", girisGerekli("Mesaj göndermek için giriş yapman gerekiyor."), async (req, res) => {
  res.json(await kisiAra(res.locals.kullanici.id, metin(req.query.q).slice(0, 32)));
});

// Without JS the same search opens as a page (the "yeni" flag in mesajlar.ejs)
// JS yokken aynı arama bir sayfa olarak açılır (mesajlar.ejs "yeni" bayrağı)
iletisim.get("/mesajlar/yeni", girisGerekli("Mesaj göndermek için giriş yapman gerekiyor."), async (req, res) => {
  const ben = res.locals.kullanici;
  const aramaQ = metin(req.query.q).slice(0, 32);
  res.render("mesajlar", { q: "", konusmalar: await konusmalar(ben.id, ""), acik: null, yeni: true, aramaQ, sonuclar: await kisiAra(ben.id, aramaQ), aktifMenu: "sohbet" });
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

  // Block / direct message permission: the page already hides the text box but this is the real protection (the form can also be submitted by hand).
  // We do not say which reason it is (see src/gizlilik.ts).
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

// Delete your own message: soft delete (deleted_at). You cannot touch someone else's message: the query requires sender_id = me.
// The row stays, so a "This message was deleted" placeholder shows in the conversation and the report record is not broken.
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
  if (!m) return next(); // does not exist or is someone else's: 404 (we do not reveal its existence either) · yok ya da başkasının: 404 (varlığını da söylemiyoruz)
  await pool.query("UPDATE messages SET deleted_at = COALESCE(deleted_at, NOW()) WHERE id = ?", [m.id]);
  bildir(req, "basari", "Mesajın silindi");
  res.redirect("/mesajlar/" + encodeURIComponent(m.karsi));
});

// Block / unblock. The address uses the username; it returns to the page it came from (profile, messages, settings).
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
  await takipleriSil(res.locals.kullanici.id, hedef.id); // a block also ends following (src/gizlilik.ts) · engel takibi de bitirir (src/gizlilik.ts)
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
// Notifications
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
  // This page also uses the name "bildirimler"; the bell panel in the top bar reads the same name.
  // We set the fields for both so that the panel renders correctly on this page too.
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

// When a notification is clicked: mark it read, go to the real address
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
// General chat (not live: new messages appear when the page is refreshed)
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
  // People who opened any page in the last 5 minutes (oturum.ts updates last_seen_at)
  // Son 5 dakikada herhangi bir sayfa açanlar (oturum.ts last_seen_at'i günceller)
  const [cevrimici] = await pool.query(
    `SELECT username FROM users
      WHERE deleted_at IS NULL AND ${cevrimiciSql("users")}
      ORDER BY username`
  );
  return { mesajlar, cevrimici };
}

// Chat hub: for members a list on the left (general chat + invitations + my rooms), the open chat on the right (here, general chat).
// Guests only read the general chat (the old layout). Both /sohbet and /oda/yeni (the no-JS "Create room" page) render this.
// genelAcik: on phones the list and the conversation are separate views; ?genel=1 opens the conversation (it also stays open on an error).
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
    // List filter: All (general + rooms + DMs, by last message) | Rooms. The DM tab is the /mesajlar page.
    // Liste filtresi: Hepsi (genel + odalar + DM, son mesaja göre) | Odalar. DM sekmesi /mesajlar sayfasıdır.
    sohbetFiltre: req.query.f === "oda" ? "oda" : "hepsi",
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

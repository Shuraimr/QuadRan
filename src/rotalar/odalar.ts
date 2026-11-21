// Private rooms: group chats entered only by invitation or an invite link (sql/12_odalar.sql).
//
//   GET  /oda/yeni                       "Open a room" (a page without JS; with JS it is a dialog on /sohbet)
//   POST /oda                            create a room
//   GET  /oda/:id                        open the room (members only; non-members get 404, the room's existence is not revealed)
//   GET  /oda/:id/uyeler|davet|baglantilar|ayarlar|ayril   same room page with the matching dialog open (fallback without JS)
//   POST /oda/:id/mesaj, /mesaj/:mid/sil, /sessiz, /ayril, /ayarlar, /sil
//   POST /oda/:id/davet, /davet/:did/iptal     invite a person / withdraw a pending invite (admins)
//   POST /oda/davet/:did/kabul|ret             the invitee's answer
//   GET/POST /oda/katil/:kod             join via link
//   POST /oda/:id/uye/:uid/yonetici|sahiplik|cikar   member actions
//   GET  /oda/:id/kisi-ara?q=            search people to invite (JSON)
//
// Permissions: member (read/write, mute, leave, report) < room admin (+ invite, links, remove, delete messages, name/description) < owner
// (+ promote admins, transfer ownership, delete the room). Site staff (admin/moderator) cannot browse room messages; they only
// see the report context and can close and reopen the room (yonetim-oda.ts).
// Özel odalar: yalnızca davetle ya da davet bağlantısıyla girilen grup sohbetleri (sql/12_odalar.sql).
//
//   GET  /oda/yeni                       "Oda aç" (JS yokken sayfa; JS varsa /sohbet'te pencere)
//   POST /oda                            oda oluştur
//   GET  /oda/:id                        odayı aç (yalnızca üyeler; üye değilsen 404, odanın varlığı da söylenmez)
//   GET  /oda/:id/uyeler|davet|baglantilar|ayarlar|ayril   aynı oda sayfası, ilgili pencere açık (JS yokken yedek yol)
//   POST /oda/:id/mesaj, /mesaj/:mid/sil, /sessiz, /ayril, /ayarlar, /sil
//   POST /oda/:id/davet, /davet/:did/iptal     kişi davet et / bekleyen daveti geri al (yöneticiler)
//   POST /oda/davet/:did/kabul|ret             davet edilenin cevabı
//   POST /oda/:id/baglanti, /baglanti/:lid/iptal   davet bağlantısı oluştur / iptal et
//   GET/POST /oda/katil/:kod             bağlantıyla katıl
//   POST /oda/:id/uye/:uid/yonetici|sahiplik|cikar   üye işlemleri
//   GET  /oda/:id/kisi-ara?q=            davet için kişi ara (JSON)
//
// Yetki: üye (oku/yaz, sessize al, ayrıl, şikâyet) < yönetici (+ davet, bağlantı, çıkarma, mesaj silme, ad/açıklama) < sahip
// (+ yönetici yapma, sahipliği devretme, odayı silme). Yetkililer (admin/moderatör) oda mesajlarını gezemez; yalnızca
// şikâyet bağlamını görür ve odayı kapatıp açabilir (yonetim-oda.ts).
import express from "express";
import { pool } from "../db.ts";
import { yasakliIfade } from "../ayarlar.ts";
import { bildir, bildirimGonder, girisGerekli, metin, sayi, kisalt } from "../yardimci.ts";
import { belirtme } from "../gizlilik.ts";
import { odaMesaj } from "../hiz-siniri.ts";
import {
  yonetir, kodUret, kodDuzelt, olusturmaDurumu, sistemMesaji, uyelik, odaDetayi, davetAra, engelSql, okunmamisOdaVar, hubVerisi,
} from "../odalar.ts";
import { kalanSure } from "./yonetim-ortak.ts";
import { sohbetSayfasi } from "./iletisim.ts";

export const odalar = express.Router();

const PANELLER = ["uyeler", "davet", "baglantilar", "ayarlar", "ayril"] as const;
type Uyelik = NonNullable<Awaited<ReturnType<typeof uyelik>>>;

// After a form submitted from a dialog, return to that same dialog (so consecutive removals/invites are easy)
// Form pencereden gönderildiyse işlemden sonra aynı pencereye dön (art arda çıkarma/davet kolay olsun)
function odaGeri(req: express.Request, odaId: number) {
  const p = metin(req.body?.panel);
  return (PANELLER as readonly string[]).includes(p) ? `/oda/${odaId}/${p}` : `/oda/${odaId}`;
}

// ---------------------------------------------------------------------------
// Gate: on /oda/:id/... addresses the room id must be valid and I must be a member; otherwise 404.
// Kapı: /oda/:id/... adreslerinde oda numarası geçerli ve ben üyeyim; değilsem 404.
// ---------------------------------------------------------------------------
async function uyeGerekli(req: express.Request, res: express.Response, next: express.NextFunction) {
  const id = sayi(req.params.id);
  const oda = id ? await uyelik(id, res.locals.kullanici.id) : null;
  if (!oda) return next("route");
  res.locals.oda = oda;
  next();
}
// Management actions: must be room admin/owner and the room must not be closed by staff
// Yönetim işlemleri: yönetici/sahip olmalı ve oda yetkililerce kapatılmamış olmalı
function yoneticiGerekli(req: express.Request, res: express.Response, next: express.NextFunction) {
  const oda: Uyelik = res.locals.oda;
  if (!yonetir(oda.rol)) { bildir(req, "hata", "Bu işlem için oda yöneticisi olmalısın."); return res.redirect(`/oda/${oda.id}`); }
  if (oda.kapali) { bildir(req, "hata", "Bu oda yöneticiler tarafından kapatıldı."); return res.redirect(`/oda/${oda.id}`); }
  next();
}
function sahipGerekli(req: express.Request, res: express.Response, next: express.NextFunction) {
  const oda: Uyelik = res.locals.oda;
  if (oda.rol !== "sahip") { bildir(req, "hata", "Bu işlemi yalnızca odanın sahibi yapabilir."); return res.redirect(`/oda/${oda.id}`); }
  if (oda.kapali) { bildir(req, "hata", "Bu oda yöneticiler tarafından kapatıldı."); return res.redirect(`/oda/${oda.id}`); }
  next();
}

const giris = girisGerekli("Odalar için giriş yapman gerekiyor.");

// ---------------------------------------------------------------------------
// Open a room
// Oda aç
// ---------------------------------------------------------------------------
odalar.get("/oda/yeni", giris, async (req, res) => {
  const durum = await olusturmaDurumu(res.locals.kullanici);
  if (!durum.izinli) {
    // The rule is also written on the lock card in /sohbet; this is a short explanation for people who arrive by direct URL
    // Kural /sohbet'teki kilit kartında da yazıyor; doğrudan adresle gelene kısa açıklama
    bildir(req, "hata", !durum.rutbeYeter ? `Oda açmak için ${durum.kilit.rutbe?.name ?? "yeterli rütbe"} olmalısın · ${durum.kilit.kalan} puan kaldı.` : `En çok ${durum.sinir} oda açabilirsin.`);
    return res.redirect("/sohbet");
  }
  await sohbetSayfasi(req, res, { panelAcik: "yeni" });
});

odalar.post("/oda", giris, async (req, res) => {
  const ben = res.locals.kullanici;
  const ad = metin(req.body.ad).replace(/\s+/g, " ");
  const aciklama = metin(req.body.aciklama);
  const durum = await olusturmaDurumu(ben);
  const hata = !durum.rutbeYeter ? `Oda açmak için ${durum.kilit.rutbe?.name ?? "yeterli rütbe"} olmalısın.`
    : durum.sinirDolu ? `En çok ${durum.sinir} oda açabilirsin. Yeni bir oda için birini sil ya da sahipliğini devret.`
    : ad.length < 3 || ad.length > 60 ? "Oda adı 3 ile 60 karakter arasında olmalı."
    : aciklama.length > 280 ? "Açıklama en fazla 280 karakter olabilir." : "";
  if (hata) { bildir(req, "hata", hata); return res.redirect("/sohbet"); }
  const yasak = await yasakliIfade(ad, aciklama);
  if (yasak) { bildir(req, "hata", `Oda adında ya da açıklamasında yasaklı bir ifade var: “${yasak}”.`); return res.redirect("/oda/yeni"); }

  // Room + owner membership + opening row must be written together: if it stops halfway we would be left with an ownerless room
  // Oda + sahip üyeliği + açılış satırı birlikte yazılmalı: yarım kalırsa sahipsiz oda kalır
  const bag = await pool.getConnection();
  let odaId = 0;
  try {
    await bag.beginTransaction();
    const [r]: any = await bag.query("INSERT INTO rooms (ad, aciklama, sahip_id) VALUES (?, ?, ?)", [ad, aciklama || null, ben.id]);
    odaId = r.insertId;
    const [m]: any = await bag.query("INSERT INTO room_messages (room_id, user_id, tur, content) VALUES (?, ?, 'sistem', ?)", [odaId, ben.id, `${ben.username} odayı oluşturdu`]);
    await bag.query("INSERT INTO room_members (room_id, user_id, rol, son_okunan_id) VALUES (?, ?, 'sahip', ?)", [odaId, ben.id, m.insertId]);
    await bag.commit();
  } catch (e) {
    await bag.rollback();
    throw e;
  } finally {
    bag.release();
  }
  bildir(req, "basari", `“${ad}” odası açıldı. Üye davet edebilirsin.`);
  res.redirect(`/oda/${odaId}`);
});

// ---------------------------------------------------------------------------
// Answering an invite (the invited person)
// Davete cevap (davet edilen kişi)
// ---------------------------------------------------------------------------
async function davetiBul(req: express.Request, res: express.Response) {
  const id = sayi(req.params.did);
  const [[d]]: any = id ? await pool.query(
    `SELECT i.id, i.room_id, i.davet_eden, r.ad, r.kapatildi_at IS NOT NULL AS kapali, eden.username AS eden_ad
       FROM room_invites i JOIN rooms r ON r.id = i.room_id AND r.deleted_at IS NULL JOIN users eden ON eden.id = i.davet_eden
      WHERE i.id = ? AND i.davet_edilen = ? AND i.durum = 'bekliyor'`, [id, res.locals.kullanici.id]) : [[]];
  return d ?? null;
}

odalar.post("/oda/davet/:did/kabul", giris, async (req, res, next) => {
  const ben = res.locals.kullanici;
  const d = await davetiBul(req, res);
  if (!d) { bildir(req, "hata", "Bu davet artık geçerli değil."); return res.redirect("/sohbet"); }
  if (d.kapali) { bildir(req, "hata", "Bu oda yöneticiler tarafından kapatıldı, şu an katılamazsın."); return res.redirect("/sohbet"); }
  // On joining, `son_okunan_id` is set to the current last message so past messages do not count as unread
  // Katılış: geçmiş mesajlar okunmamış sayılmasın diye son_okunan_id şu anki son mesaja ayarlanır
  const [e]: any = await pool.query(
    `INSERT IGNORE INTO room_members (room_id, user_id, rol, son_okunan_id)
     VALUES (?, ?, 'uye', (SELECT COALESCE(MAX(id), 0) FROM room_messages WHERE room_id = ?))`, [d.room_id, ben.id, d.room_id]);
  await pool.query("UPDATE room_invites SET durum = 'kabul' WHERE id = ?", [d.id]);
  // someone returning by invite has the old removal ban lifted
  // davetle dönene eski çıkarma engeli kalkar
  await pool.query("DELETE FROM room_bans WHERE room_id = ? AND user_id = ?", [d.room_id, ben.id]);
  if (e.affectedRows > 0) {
    const mid = await sistemMesaji(d.room_id, ben.id, `${d.eden_ad} odaya ${belirtme(ben.username)} ekledi`);
    await pool.query("UPDATE room_members SET son_okunan_id = ? WHERE room_id = ? AND user_id = ?", [mid, d.room_id, ben.id]);
  }
  bildir(req, "basari", `“${d.ad}” odasına katıldın.`);
  res.redirect(`/oda/${d.room_id}`);
});

odalar.post("/oda/davet/:did/ret", giris, async (req, res) => {
  const d = await davetiBul(req, res);
  if (d) await pool.query("UPDATE room_invites SET durum = 'ret' WHERE id = ?", [d.id]);
  bildir(req, "basari", d ? "Davet reddedildi." : "Bu davet artık geçerli değil.");
  res.redirect("/sohbet");
});

// ---------------------------------------------------------------------------
// Join via invite link: /oda/katil/KOD
// Davet bağlantısıyla katıl: /oda/katil/KOD
// ---------------------------------------------------------------------------
type Hal = "ok" | "yok" | "iptal" | "doldu" | "sinir" | "kapali" | "yasak" | "uye";
async function baglantiDurumu(kodHam: string, benId: number, bag: { query: typeof pool.query } = pool, kilitle = false) {
  const kod = kodDuzelt(kodHam);
  const [[l]]: any = kod ? await bag.query(
    `SELECT l.id, l.room_id, l.son_kullanma, l.kullanim_siniri, l.kullanim, l.iptal_at,
            r.ad, r.aciklama, r.deleted_at AS oda_silindi, r.kapatildi_at IS NOT NULL AS kapali, u.username AS olusturan,
            (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS uye_sayisi,
            (l.son_kullanma IS NOT NULL AND l.son_kullanma <= NOW()) AS suresi_doldu,
            (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND user_id = ?) AS uyeyim,
            (SELECT COUNT(*) FROM room_bans WHERE room_id = r.id AND user_id = ? AND bitis > NOW()) AS yasakli
       FROM room_links l JOIN rooms r ON r.id = l.room_id JOIN users u ON u.id = l.olusturan
      WHERE l.kod = ? ${kilitle ? "FOR UPDATE" : ""}`, [benId, benId, kod]) : [[]];
  let hal: Hal = "ok";
  if (!l || l.oda_silindi) hal = "yok";
  else if (l.uyeyim > 0) hal = "uye";
  else if (l.iptal_at) hal = "iptal";
  else if (l.suresi_doldu) hal = "doldu";
  else if (l.kullanim_siniri !== null && l.kullanim >= l.kullanim_siniri) hal = "sinir";
  else if (l.kapali) hal = "kapali";
  else if (Number(l.yasakli) > 0) hal = "yasak";
  return { hal, l: l ?? null, kod };
}

odalar.get("/oda/katil/:kod", girisGerekli("Odaya katılmak için giriş yapman gerekiyor."), async (req, res) => {
  const { hal, l } = await baglantiDurumu(String(req.params.kod), res.locals.kullanici.id);
  if (hal === "uye") { bildir(req, "basari", "Bu odanın zaten üyesisin."); return res.redirect(`/oda/${l.room_id}`); }
  res.render("oda-katil", {
    baslik: l && hal !== "yok" ? l.ad : "Davet bağlantısı", hal, aktifMenu: "sohbet",
    oda: l ? { ad: l.ad, aciklama: l.aciklama, uye: Number(l.uye_sayisi), olusturan: l.olusturan } : null,
    gecerlilik: l && l.son_kullanma ? `Bağlantı ${kalanSure(l.son_kullanma)} daha geçerli.` : "",
    kod: String(req.params.kod),
  });
});

odalar.post("/oda/katil/:kod", girisGerekli("Odaya katılmak için giriş yapman gerekiyor."), async (req, res) => {
  const ben = res.locals.kullanici;
  // Keep the use count race-free (two people must not take the last slot at once): lock the row and do check + write in one transaction
  // Kullanım sayısı yarışa girmesin (iki kişi son hakkı aynı anda almasın): satırı kilitleyip kontrol + yazma tek işlemde
  const bag = await pool.getConnection();
  let sonuc: Awaited<ReturnType<typeof baglantiDurumu>>;
  try {
    await bag.beginTransaction();
    sonuc = await baglantiDurumu(String(req.params.kod), ben.id, bag as any, true);
    if (sonuc.hal === "ok") {
      await bag.query(
        `INSERT INTO room_members (room_id, user_id, rol, son_okunan_id)
         VALUES (?, ?, 'uye', (SELECT COALESCE(MAX(id), 0) FROM room_messages WHERE room_id = ?))`, [sonuc.l.room_id, ben.id, sonuc.l.room_id]);
      await bag.query("UPDATE room_links SET kullanim = kullanim + 1 WHERE id = ?", [sonuc.l.id]);
    }
    await bag.commit();
  } catch (e) {
    await bag.rollback();
    throw e;
  } finally {
    bag.release();
  }
  if (sonuc.hal === "ok") {
    const mid = await sistemMesaji(sonuc.l.room_id, ben.id, `${ben.username} bağlantıyla odaya katıldı`);
    await pool.query("UPDATE room_members SET son_okunan_id = ? WHERE room_id = ? AND user_id = ?", [mid, sonuc.l.room_id, ben.id]);
    await pool.query("UPDATE room_invites SET durum = 'iptal' WHERE room_id = ? AND davet_edilen = ? AND durum = 'bekliyor'", [sonuc.l.room_id, ben.id]);
    bildir(req, "basari", `“${sonuc.l.ad}” odasına katıldın.`);
    return res.redirect(`/oda/${sonuc.l.room_id}`);
  }
  if (sonuc.hal === "uye") return res.redirect(`/oda/${sonuc.l.room_id}`);
  bildir(req, "hata", "Bu bağlantıyla katılamazsın.");
  res.redirect(`/oda/katil/${encodeURIComponent(String(req.params.kod))}`);
});

// ---------------------------------------------------------------------------
// The room page and the fallback dialog addresses
// Odanın sayfası ve yedek pencere adresleri
// ---------------------------------------------------------------------------
async function odaCiz(req: express.Request, res: express.Response, panel: string, ekstra: Record<string, unknown> = {}) {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const detay = await odaDetayi(oda, ben.id); // marks messages as read · okundu işaretler
  // so the menu dot shows the state after reading
  // menüdeki nokta okuduktan sonraki halini göstersin
  res.locals.okunmamisOda = await okunmamisOdaVar(ben.id);
  res.render("oda", {
    baslik: oda.ad, oda, ...detay, hub: await hubVerisi(ben), panelAcik: panel, aktifMenu: "sohbet", aktifOda: oda.id,
    yonetebilir: yonetir(oda.rol), taban: `${req.protocol}://${req.get("host")}`, kalanSure, aramaQ: "", aramaSonuc: null, ...ekstra,
  });
}

odalar.get("/oda/:id/kisi-ara", giris, uyeGerekli, async (req, res) => {
  const oda: Uyelik = res.locals.oda;
  if (!yonetir(oda.rol) || oda.kapali) return res.json([]);
  res.json(await davetAra(res.locals.kullanici.id, oda.id, metin(req.query.q).slice(0, 32)));
});

odalar.get("/oda/:id", giris, uyeGerekli, (req, res) => odaCiz(req, res, ""));

for (const panel of PANELLER) {
  odalar.get(`/oda/:id/${panel}`, giris, uyeGerekli, async (req, res) => {
    const oda: Uyelik = res.locals.oda;
    const yetkisiz = (["davet", "baglantilar", "ayarlar"].includes(panel) && (!yonetir(oda.rol) || oda.kapali)) || (panel === "ayril" && oda.rol !== "sahip");
    if (yetkisiz) return res.redirect(`/oda/${oda.id}`);
    // Invite search without JS: GET ?q= renders the results on the server
    // JS'siz davet araması: GET ?q= ile sonuçlar sunucuda çizilir
    const aramaQ = panel === "davet" ? metin(req.query.q).slice(0, 32) : "";
    await odaCiz(req, res, panel, { aramaQ, aramaSonuc: panel === "davet" ? await davetAra(res.locals.kullanici.id, oda.id, aramaQ) : null });
  });
}

// ---------------------------------------------------------------------------
// Message
// Mesaj
// ---------------------------------------------------------------------------
odalar.post("/oda/:id/mesaj", giris, uyeGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const content = metin(req.body.content);
  const geri = `/oda/${oda.id}`;
  if (oda.kapali) { bildir(req, "hata", "Bu oda yöneticiler tarafından kapatıldı."); return res.redirect(geri); }
  if (!content || content.length > 2000) { bildir(req, "hata", content ? "Mesaj en fazla 2000 karakter olabilir." : "Mesaj boş olamaz."); return res.redirect(geri); }
  const bekle = odaMesaj.kalanDakika("u" + ben.id);
  if (bekle > 0) { bildir(req, "hata", "Çok hızlı mesaj yazıyorsun. Biraz bekleyip tekrar dene."); return res.redirect(geri); }
  const yasak = await yasakliIfade(content);
  if (yasak) { bildir(req, "hata", `Mesajında yasaklı bir ifade var: “${yasak}”.`); return res.redirect(geri); }
  odaMesaj.say("u" + ben.id);
  const [r]: any = await pool.query("INSERT INTO room_messages (room_id, user_id, content) VALUES (?, ?, ?)", [oda.id, ben.id, content]);
  // A message I wrote myself should not show up as unread to me
  // Kendi yazdığım mesaj bana okunmamış görünmesin
  await pool.query("UPDATE room_members SET son_okunan_id = ? WHERE room_id = ? AND user_id = ?", [r.insertId, oda.id, ben.id]);
  res.redirect(`${geri}#o-${r.insertId}`);
});

// Delete message: my own, or anyone's if I am an admin. Soft delete; reports stay open (so staff can still judge the author).
// Mesaj sil: kendi mesajım ya da yöneticiysem herkesinki. Yumuşak silme; şikâyetler açık kalır (yetkili yazarı yine değerlendirebilsin).
odalar.post("/oda/:id/mesaj/:mid/sil", giris, uyeGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const mid = sayi(req.params.mid);
  const [[m]]: any = mid ? await pool.query("SELECT id, user_id FROM room_messages WHERE id = ? AND room_id = ? AND tur = 'mesaj' AND deleted_at IS NULL", [mid, oda.id]) : [[]];
  if (!m) { bildir(req, "hata", "Mesaj bulunamadı."); return res.redirect(`/oda/${oda.id}`); }
  if (oda.kapali) { bildir(req, "hata", "Bu oda yöneticiler tarafından kapatıldı."); return res.redirect(`/oda/${oda.id}`); }
  if (m.user_id !== ben.id && !yonetir(oda.rol)) { bildir(req, "hata", "Bu mesajı silemezsin."); return res.redirect(`/oda/${oda.id}`); }
  await pool.query("UPDATE room_messages SET deleted_at = NOW() WHERE id = ?", [m.id]);
  bildir(req, "basari", "Mesaj silindi");
  res.redirect(`/oda/${oda.id}`);
});

// ---------------------------------------------------------------------------
// Mute / leave
// Sessize al / ayrıl
// ---------------------------------------------------------------------------
odalar.post("/oda/:id/sessiz", giris, uyeGerekli, async (req, res) => {
  const oda: Uyelik = res.locals.oda;
  const sessiz = req.body.sessiz === "1" ? 1 : 0;
  await pool.query("UPDATE room_members SET sessiz = ? WHERE room_id = ? AND user_id = ?", [sessiz, oda.id, res.locals.kullanici.id]);
  bildir(req, "basari", sessiz ? "Oda sessize alındı" : "Odanın sesi açıldı");
  res.redirect(`/oda/${oda.id}`);
});

odalar.post("/oda/:id/ayril", giris, uyeGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  if (oda.rol === "sahip") {
    bildir(req, "hata", "Odanın sahibisin: ayrılmadan önce sahipliği başka bir üyeye devret ya da odayı sil.");
    return res.redirect(`/oda/${oda.id}/ayril`);
  }
  await pool.query("DELETE FROM room_members WHERE room_id = ? AND user_id = ?", [oda.id, ben.id]);
  await sistemMesaji(oda.id, ben.id, `${ben.username} odadan ayrıldı`);
  bildir(req, "basari", `“${oda.ad}” odasından ayrıldın`);
  res.redirect("/sohbet");
});

// ---------------------------------------------------------------------------
// Room settings (name, description) and deletion
// Oda ayarları (ad, açıklama) ve silme
// ---------------------------------------------------------------------------
odalar.post("/oda/:id/ayarlar", giris, uyeGerekli, yoneticiGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const ad = metin(req.body.ad).replace(/\s+/g, " ");
  const aciklama = metin(req.body.aciklama);
  const geri = odaGeri(req, oda.id);
  const hata = ad.length < 3 || ad.length > 60 ? "Oda adı 3 ile 60 karakter arasında olmalı." : aciklama.length > 280 ? "Açıklama en fazla 280 karakter olabilir." : "";
  if (hata) { bildir(req, "hata", hata); return res.redirect(geri); }
  const yasak = await yasakliIfade(ad, aciklama);
  if (yasak) { bildir(req, "hata", `Oda adında ya da açıklamasında yasaklı bir ifade var: “${yasak}”.`); return res.redirect(geri); }
  await pool.query("UPDATE rooms SET ad = ?, aciklama = ? WHERE id = ?", [ad, aciklama || null, oda.id]);
  if (ad !== oda.ad) await sistemMesaji(oda.id, ben.id, `${ben.username} oda adını “${ad}” yaptı`);
  bildir(req, "basari", "Oda ayarları kaydedildi");
  res.redirect(`/oda/${oda.id}`);
});

odalar.post("/oda/:id/sil", giris, uyeGerekli, sahipGerekli, async (req, res) => {
  const oda: Uyelik = res.locals.oda;
  // confirm() does not work without JS: the server asks for the confirmation checkbox too
  // JS yokken confirm() çalışmaz: sunucu da onay kutusunu ister
  if (req.body.onay !== "1") { bildir(req, "hata", "Odayı silmek için onay kutusunu işaretlemelisin."); return res.redirect(odaGeri(req, oda.id)); }
  await pool.query("UPDATE rooms SET deleted_at = NOW() WHERE id = ?", [oda.id]);
  await pool.query("UPDATE room_invites SET durum = 'iptal' WHERE room_id = ? AND durum = 'bekliyor'", [oda.id]);
  await pool.query("UPDATE room_links SET iptal_at = COALESCE(iptal_at, NOW()) WHERE room_id = ?", [oda.id]);
  bildir(req, "basari", `“${oda.ad}” odası silindi`);
  res.redirect("/sohbet");
});

// ---------------------------------------------------------------------------
// Invite a person (admins)
// Kişi davet et (yöneticiler)
// ---------------------------------------------------------------------------
odalar.post("/oda/:id/davet", giris, uyeGerekli, yoneticiGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const geri = odaGeri(req, oda.id);
  const [[hedef]]: any = await pool.query("SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL", [metin(req.body.kullanici)]);
  if (!hedef) { bildir(req, "hata", "Kullanıcı bulunamadı."); return res.redirect(geri); }
  if (hedef.id === ben.id) { bildir(req, "hata", "Kendini davet edemezsin."); return res.redirect(geri); }
  // A block in either direction prevents the invite (we do not say who blocked whom)
  // Engel iki yönde de davete izin vermez (kimin kimi engellediğini söylemiyoruz)
  const [[e]]: any = await pool.query(`SELECT ${engelSql("?", "?")} AS engel`, [ben.id, hedef.id, hedef.id, ben.id]);
  if (Number(e.engel) > 0) { bildir(req, "hata", "Bu kişiyi davet edemezsin."); return res.redirect(geri); }
  const [[var_]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM room_members WHERE room_id = ? AND user_id = ?) AS uye,
            (SELECT COUNT(*) FROM room_invites WHERE room_id = ? AND davet_edilen = ? AND durum = 'bekliyor') AS bekleyen`, [oda.id, hedef.id, oda.id, hedef.id]);
  if (Number(var_.uye) > 0) { bildir(req, "hata", `${hedef.username} zaten bu odanın üyesi.`); return res.redirect(geri); }
  if (Number(var_.bekleyen) > 0) { bildir(req, "hata", `${hedef.username} için bekleyen bir davet zaten var.`); return res.redirect(geri); }
  await pool.query("INSERT INTO room_invites (room_id, davet_eden, davet_edilen) VALUES (?, ?, ?)", [oda.id, ben.id, hedef.id]);
  await bildirimGonder({ alan: hedef.id, yapan: ben.id, tur: "oda", metin: `${ben.username} seni “${kisalt(oda.ad, 60)}” odasına davet etti`, link: "/sohbet" });
  bildir(req, "basari", `${hedef.username} davet edildi`);
  res.redirect(geri);
});

odalar.post("/oda/:id/davet/:did/iptal", giris, uyeGerekli, yoneticiGerekli, async (req, res) => {
  const oda: Uyelik = res.locals.oda;
  const [s]: any = await pool.query("UPDATE room_invites SET durum = 'iptal' WHERE id = ? AND room_id = ? AND durum = 'bekliyor'", [sayi(req.params.did), oda.id]);
  bildir(req, s.affectedRows ? "basari" : "hata", s.affectedRows ? "Davet geri alındı" : "Bu davet artık geçerli değil.");
  res.redirect(odaGeri(req, oda.id));
});

// ---------------------------------------------------------------------------
// Invite links
// Davet bağlantıları
// ---------------------------------------------------------------------------
const SURELER: Record<string, number | null> = { "1": 1, "7": 7, "0": null }; // days; 0 = no expiry · gün; 0 = süresiz
const SINIRLAR: Record<string, number | null> = { "0": null, "1": 1, "5": 5, "10": 10, "25": 25 };
const ENFAZLA_ETKIN_BAGLANTI = 10;

odalar.post("/oda/:id/baglanti", giris, uyeGerekli, yoneticiGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const geri = odaGeri(req, oda.id);
  const sureAnahtar = metin(req.body.sure) || "7";
  const sinirAnahtar = metin(req.body.sinir) || "0";
  if (!(sureAnahtar in SURELER) || !(sinirAnahtar in SINIRLAR)) { bildir(req, "hata", "Geçerlilik ya da kullanım sınırı geçersiz."); return res.redirect(geri); }
  const [[n]]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM room_links WHERE room_id = ? AND iptal_at IS NULL AND (son_kullanma IS NULL OR son_kullanma > NOW())
        AND (kullanim_siniri IS NULL OR kullanim < kullanim_siniri)`, [oda.id]);
  if (Number(n.n) >= ENFAZLA_ETKIN_BAGLANTI) { bildir(req, "hata", `En çok ${ENFAZLA_ETKIN_BAGLANTI} etkin bağlantı olabilir. Önce birini iptal et.`); return res.redirect(geri); }
  const gun = SURELER[sureAnahtar];
  // If the code collides (very unlikely) the UNIQUE constraint raises an error; retry a few times
  // Kod çakışırsa (çok düşük ihtimal) UNIQUE hata verir; birkaç kez yeniden dene
  for (let deneme = 0; deneme < 5; deneme++) {
    try {
      await pool.query(
        `INSERT INTO room_links (room_id, olusturan, kod, son_kullanma, kullanim_siniri)
         VALUES (?, ?, ?, ${gun === null ? "NULL" : "DATE_ADD(NOW(), INTERVAL ? DAY)"}, ?)`,
        gun === null ? [oda.id, ben.id, kodUret(), SINIRLAR[sinirAnahtar]] : [oda.id, ben.id, kodUret(), gun, SINIRLAR[sinirAnahtar]]
      );
      bildir(req, "basari", "Davet bağlantısı oluşturuldu");
      return res.redirect(geri);
    } catch (e: any) {
      if (e?.code !== "ER_DUP_ENTRY") throw e;
    }
  }
  bildir(req, "hata", "Bağlantı oluşturulamadı, tekrar dene.");
  res.redirect(geri);
});

odalar.post("/oda/:id/baglanti/:lid/iptal", giris, uyeGerekli, yoneticiGerekli, async (req, res) => {
  const oda: Uyelik = res.locals.oda;
  const [s]: any = await pool.query("UPDATE room_links SET iptal_at = NOW() WHERE id = ? AND room_id = ? AND iptal_at IS NULL", [sayi(req.params.lid), oda.id]);
  bildir(req, s.affectedRows ? "basari" : "hata", s.affectedRows ? "Bağlantı iptal edildi" : "Bu bağlantı zaten etkin değil.");
  res.redirect(odaGeri(req, oda.id));
});

// ---------------------------------------------------------------------------
// Member actions: promote / demote admin, transfer ownership, remove from room
// Üye işlemleri: yönetici yap / al, sahipliği devret, odadan çıkar
// ---------------------------------------------------------------------------
async function hedefUye(req: express.Request, res: express.Response) {
  const oda: Uyelik = res.locals.oda;
  const uid = sayi(req.params.uid);
  const [[h]]: any = uid ? await pool.query(
    "SELECT u.id, u.username, m.rol FROM room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = ? AND m.user_id = ?", [oda.id, uid]) : [[]];
  if (!h) { bildir(req, "hata", "Üye bulunamadı."); res.redirect(odaGeri(req, oda.id)); return null; }
  return h as { id: number; username: string; rol: string };
}

odalar.post("/oda/:id/uye/:uid/yonetici", giris, uyeGerekli, sahipGerekli, async (req, res) => {
  const oda: Uyelik = res.locals.oda;
  const h = await hedefUye(req, res); if (!h) return;
  if (h.rol === "sahip") { bildir(req, "hata", "Sahibin rolü değiştirilemez."); return res.redirect(odaGeri(req, oda.id)); }
  const yap = req.body.islem !== "al";
  await pool.query("UPDATE room_members SET rol = ? WHERE room_id = ? AND user_id = ?", [yap ? "yonetici" : "uye", oda.id, h.id]);
  if (yap) await sistemMesaji(oda.id, res.locals.kullanici.id, `${h.username} yönetici yapıldı`);
  bildir(req, "basari", yap ? `${h.username} artık yönetici` : `${h.username} yöneticilikten alındı`);
  res.redirect(odaGeri(req, oda.id));
});

odalar.post("/oda/:id/uye/:uid/sahiplik", giris, uyeGerekli, sahipGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const geri = odaGeri(req, oda.id);
  const h = await hedefUye(req, res); if (!h) return;
  if (h.id === ben.id) { bildir(req, "hata", "Sahipliği kendine devredemezsin."); return res.redirect(geri); }
  // The new owner is also subject to the per-person room limit
  // Yeni sahip de kişi başı oda sınırına tabidir
  const durum = await olusturmaDurumu({ id: h.id, points: 0, rol: "uye" });
  if (durum.sinirDolu) { bildir(req, "hata", `${h.username} zaten en çok oda sayısına (${durum.sinir}) sahip.`); return res.redirect(geri); }
  const bag = await pool.getConnection();
  try {
    await bag.beginTransaction();
    await bag.query("UPDATE room_members SET rol = 'yonetici' WHERE room_id = ? AND user_id = ?", [oda.id, ben.id]);
    await bag.query("UPDATE room_members SET rol = 'sahip' WHERE room_id = ? AND user_id = ?", [oda.id, h.id]);
    await bag.query("UPDATE rooms SET sahip_id = ? WHERE id = ?", [h.id, oda.id]);
    await bag.commit();
  } catch (e) { await bag.rollback(); throw e; } finally { bag.release(); }
  await sistemMesaji(oda.id, ben.id, `${ben.username}, sahipliği ${h.username} kullanıcısına devretti`);
  await bildirimGonder({ alan: h.id, yapan: ben.id, tur: "oda", metin: `“${kisalt(oda.ad, 60)}” odasının sahibi oldun`, link: `/oda/${oda.id}` });
  bildir(req, "basari", `Oda sahipliği ${h.username} kullanıcısına devredildi`);
  res.redirect(geri);
});

odalar.post("/oda/:id/uye/:uid/cikar", giris, uyeGerekli, yoneticiGerekli, async (req, res) => {
  const ben = res.locals.kullanici;
  const oda: Uyelik = res.locals.oda;
  const geri = odaGeri(req, oda.id);
  const h = await hedefUye(req, res); if (!h) return;
  if (h.id === ben.id) { bildir(req, "hata", "Kendini çıkaramazsın; odadan ayrılabilirsin."); return res.redirect(geri); }
  // Nobody can remove the owner; an admin can remove only ordinary members, only the owner can remove an admin
  // Sahip kimse tarafından çıkarılamaz; yönetici yalnızca sıradan üyeyi çıkarır, yöneticiyi yalnızca sahip çıkarır
  if (h.rol === "sahip" || (h.rol === "yonetici" && oda.rol !== "sahip")) { bildir(req, "hata", "Bu üyeyi çıkarma yetkin yok."); return res.redirect(geri); }
  await pool.query("DELETE FROM room_members WHERE room_id = ? AND user_id = ?", [oda.id, h.id]);
  // Cannot come back via a link for 24 hours (can come back via an invite: accepting lifts the ban)
  // 24 saat bağlantıyla geri dönemesin (davetle dönebilir: kabulde engel kalkar)
  await pool.query(
    "INSERT INTO room_bans (room_id, user_id, bitis) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR)) ON DUPLICATE KEY UPDATE bitis = VALUES(bitis)", [oda.id, h.id]);
  await sistemMesaji(oda.id, ben.id, `${ben.username}, ${belirtme(h.username)} odadan çıkardı`);
  await bildirimGonder({ alan: h.id, yapan: null, tur: "oda", metin: `“${kisalt(oda.ad, 60)}” odasından çıkarıldın`, link: "/sohbet" });
  bildir(req, "basari", `${h.username} odadan çıkarıldı`);
  res.redirect(geri);
});

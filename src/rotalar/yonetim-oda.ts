// Admin panel: Chat > Rooms tab (private rooms, sql/12_odalar.sql).
//   GET  /yonetim/sohbet/odalar                       room list + room creation rules (moderator + admin; only the admin changes the rules)
//   POST /yonetim/sohbet/odalar/ayar                  kisi_basi_oda_siniri (admin only; the rank that may create rooms: Points and rewards > Ranks)
//   POST /yonetim/sohbet/odalar/:id/kapat|ac          close the room (members can read but not write) / reopen it
// 
// PRIVACY: a room belongs only to its members. This page NEVER shows the rooms' messages, only counts (members, messages).
// Staff only sees the content of a room if a message in that room is reported, and then only as much as the report's context (src/sikayet.ts).
// Every action is written to the audit log (audit_log).
// Yönetim paneli: Sohbet > Odalar sekmesi (özel odalar, sql/12_odalar.sql).
//   GET  /yonetim/sohbet/odalar                       oda listesi + oda açma kuralları (moderatör + admin; kuralları yalnızca admin değiştirir)
//   POST /yonetim/sohbet/odalar/ayar                  kisi_basi_oda_siniri (yalnızca admin; oda açabilen rütbe: Puan ve ödüller > Rütbeler)
//   POST /yonetim/sohbet/odalar/:id/kapat|ac          odayı kapat (üyeler okur ama yazamaz) / yeniden aç
//
// GİZLİLİK: oda yalnızca üyelerinindir. Bu sayfa odaların mesajlarını HİÇ göstermez, yalnızca sayıları (üye, mesaj).
// Yetkili bir odanın içeriğini ancak o odadaki bir mesaj şikâyet edilirse, şikâyetin bağlamı kadarını görür (src/sikayet.ts).
// Her işlem işlem kaydına (audit_log) yazılır.
import express from "express";
import { pool } from "../db.ts";
import { bildir, bildirimGonder, metin, sayi, likeKac, kisalt } from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import { ayarlar, ayarYaz, ayarOnbellekTemizle, ODA_SINIR_ENFAZLA } from "../ayarlar.ts";
import { sayfala, secim, sadeceAdmin } from "./yonetim-ortak.ts";

export const yonetimOda = express.Router();

const LISTE = "/yonetim/sohbet/odalar";

yonetimOda.get(LISTE, async (req, res) => {
  const q = metin(req.query.q).slice(0, 60);
  const durum = secim(req.query.durum, ["hepsi", "acik", "kapali"] as const, "hepsi");
  const kosullar = ["r.deleted_at IS NULL"];
  const p: unknown[] = [];
  if (q) { kosullar.push("(r.ad LIKE ? OR u.username LIKE ?)"); p.push(likeKac(q), likeKac(q)); }
  if (durum === "acik") kosullar.push("r.kapatildi_at IS NULL");
  if (durum === "kapali") kosullar.push("r.kapatildi_at IS NOT NULL");
  const nerede = kosullar.join(" AND ");
  const [[{ n }]]: any = await pool.query(`SELECT COUNT(*) AS n FROM rooms r JOIN users u ON u.id = r.sahip_id WHERE ${nerede}`, p);
  const sf = sayfala(req, Number(n), 20);
  const [satirlar]: any = await pool.query(
    `SELECT r.id, r.ad, r.created_at, r.kapatildi_at, u.id AS sahip_id, u.username AS sahip,
            (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS uye,
            (SELECT COUNT(*) FROM room_messages WHERE room_id = r.id AND tur = 'mesaj' AND deleted_at IS NULL) AS mesaj
       FROM rooms r JOIN users u ON u.id = r.sahip_id
      WHERE ${nerede} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...p, sf.boyut, sf.offset]
  );
  for (const s of satirlar) { s.uye = Number(s.uye); s.mesaj = Number(s.mesaj); }
  const a = await ayarlar();
  res.render("yonetim/odalar", {
    baslik: "Sohbet", aktif: "sohbet", satirlar, sf, qs: { q, durum }, yol: LISTE, filtreli: !!q || durum !== "hepsi",
    oda: a.oda, sinirEnfazla: ODA_SINIR_ENFAZLA, duzenleyebilir: res.locals.kullanici.rol === "admin",
  });
});

yonetimOda.post(LISTE + "/ayar", sadeceAdmin, async (req, res) => {
  const k = res.locals.kullanici;
  const sinir = Number(metin(req.body.sinir));
  if (!Number.isInteger(sinir) || sinir < 1 || sinir > ODA_SINIR_ENFAZLA) {
    bildir(req, "hata", `Oda sınırı 1–${ODA_SINIR_ENFAZLA} arasında tam sayı olmalı.`);
    return res.redirect(LISTE);
  }
  const eski = (await ayarlar()).oda;
  await ayarYaz("kisi_basi_oda_siniri", String(sinir), k.id);
  ayarOnbellekTemizle();
  await denetim(req, res, "ayar.oda", "ayar", null, { kisi_siniri: [eski.kisiSiniri, sinir] });
  bildir(req, "basari", "Oda ayarları kaydedildi.");
  res.redirect(LISTE);
});

async function odaIslemi(req: express.Request, res: express.Response, kapat: boolean) {
  const k = res.locals.kullanici;
  const id = sayi(req.params.id);
  const geri = LISTE;
  const [[o]]: any = id ? await pool.query("SELECT id, ad, sahip_id, kapatildi_at FROM rooms WHERE id = ? AND deleted_at IS NULL", [id]) : [[]];
  if (!o) { bildir(req, "hata", "Oda bulunamadı."); return res.redirect(geri); }
  const sebep = metin(req.body.sebep);
  // Closing affects the members: a reason is required (it goes to the record and to the owner). A reason is optional when reopening.
  // Kapatmak üyeleri etkiler: sebep zorunlu (kayda ve sahibe gider). Yeniden açmada sebep isteğe bağlı.
  if (kapat && (sebep.length < 3 || sebep.length > 255)) { bildir(req, "hata", "Odayı kapatmak için 3 ile 255 karakter arasında bir sebep yazmalısın."); return res.redirect(geri); }
  if (kapat === !!o.kapatildi_at) { bildir(req, "hata", kapat ? "Oda zaten kapalı." : "Oda zaten açık."); return res.redirect(geri); }
  await pool.query("UPDATE rooms SET kapatildi_at = " + (kapat ? "NOW()" : "NULL") + " WHERE id = ?", [o.id]);
  await denetim(req, res, kapat ? "oda.kapat" : "oda.ac", "oda", o.id, { oda: o.ad, ...(sebep ? { sebep } : {}) });
  await bildirimGonder({
    alan: o.sahip_id, yapan: null, tur: "moderasyon",
    metin: kapat ? `“${kisalt(o.ad, 50)}” odan moderatörler tarafından kapatıldı. Sebep: ${sebep}` : `“${kisalt(o.ad, 50)}” odan yeniden açıldı.`,
    link: `/oda/${o.id}`,
  });
  bildir(req, "basari", kapat ? `“${o.ad}” kapatıldı` : `“${o.ad}” yeniden açıldı`);
  res.redirect(geri);
}
yonetimOda.post(LISTE + "/:id/kapat", (req, res) => odaIslemi(req, res, true));
yonetimOda.post(LISTE + "/:id/ac", (req, res) => odaIslemi(req, res, false));

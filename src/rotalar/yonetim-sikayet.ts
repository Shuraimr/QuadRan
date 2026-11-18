// Yönetim paneli: Şikâyetler. /moderasyon'dan farkı: durum, hedef türü ve sebebe göre filtre,
// aynı hedefe gelen şikâyetlerin tek satırda GRUPLANMASI, ban süresi seçimi.
import express from "express";
import { pool } from "../db.ts";
import { bildir, metin, sayi, geriAdres } from "../yardimci.ts";
import { HEDEF_SUTUN, BAN_SURELERI } from "../islemler.ts";
import { hedefOnizleme, sikayetIslemi, TURLER, TUR_ETIKET, SEBEPLER } from "../sikayet.ts";
import { sayfala, secim } from "./yonetim-ortak.ts";

export const yonetimSikayet = express.Router();

const DURUMLAR = ["bekliyor", "islendi", "reddedildi", "hepsi"] as const;
// Hedef kimliği: dört sütundan hangisi doluysa o (reports.hedef_tur ile uyumlu, CHECK garanti eder)
const HEDEF_ID = "COALESCE(reports.post_id, reports.reported_user_id, reports.chat_message_id, reports.message_id)";

yonetimSikayet.get("/yonetim/sikayetler", async (req, res) => {
  const durum = secim(req.query.durum, DURUMLAR, "bekliyor");
  const tur = secim(req.query.tur, ["hepsi", ...TURLER] as const, "hepsi");
  const sebep = secim(req.query.sebep, ["hepsi", ...SEBEPLER] as const, "hepsi");

  const kosullar: string[] = ["1 = 1"];
  const p: unknown[] = [];
  if (durum !== "hepsi") { kosullar.push("reports.durum = ?"); p.push(durum); }
  if (tur !== "hepsi") { kosullar.push("reports.hedef_tur = ?"); p.push(tur); }
  if (sebep !== "hepsi") { kosullar.push("reports.sebep = ?"); p.push(sebep); }
  const nerede = kosullar.join(" AND ");

  const [[{ n }]]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM (SELECT 1 FROM reports WHERE ${nerede.replaceAll("reports.", "")} GROUP BY hedef_tur, ${HEDEF_ID.replaceAll("reports.", "")}) AS g`, p);
  const sf = sayfala(req, Number(n), 15);

  // GRUPLAMA: aynı hedefe gelen şikâyetler tek satır. Önce bekleyeni olanlar, sonra en yeniler.
  const [gruplar]: any = await pool.query(
    `SELECT reports.hedef_tur AS tur, ${HEDEF_ID} AS hedef_id, COUNT(*) AS adet, SUM(reports.durum = 'bekliyor') AS bekleyen,
            MAX(reports.created_at) AS son
       FROM reports WHERE ${nerede}
      GROUP BY reports.hedef_tur, ${HEDEF_ID}
      ORDER BY bekleyen > 0 DESC, son DESC
      LIMIT ? OFFSET ?`,
    [...p, sf.boyut, sf.offset]
  );

  for (const g of gruplar) {
    g.adet = Number(g.adet); g.bekleyen = Number(g.bekleyen);
    g.hedef = await hedefOnizleme(g.tur, g.hedef_id);
    // Grubun tek tek şikâyetleri (aynı durum filtresiyle). HEDEF_SUTUN koddaki sabit tablodan gelir.
    [g.sikayetler] = (await pool.query(
      `SELECT reports.id, reports.sebep, reports.aciklama, reports.durum, reports.created_at, bildiren.username AS bildiren,
              isleyen.username AS isleyen
         FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id LEFT JOIN users isleyen ON isleyen.id = reports.handled_by
        WHERE reports.${HEDEF_SUTUN[g.tur]} = ? AND ${nerede}
        ORDER BY reports.id DESC`,
      [g.hedef_id, ...p]
    )) as any;
  }

  res.render("yonetim/sikayetler", {
    baslik: "Şikâyetler", aktif: "sikayetler", gruplar, sf, turEtiket: TUR_ETIKET, turler: TURLER, sebepler: SEBEPLER, sureler: BAN_SURELERI,
    qs: { durum, tur, sebep }, yol: "/yonetim/sikayetler",
  });
});

// Grup işlemi: POST /yonetim/sikayetler/islem  alanlar: tur, hedef_id, eylem, sure, sebep
yonetimSikayet.post("/yonetim/sikayetler/islem", async (req, res) => {
  const eylem = secim(req.body.eylem, ["sil", "uyar", "banla", "reddet"] as const, "reddet");
  const gecerli = ["sil", "uyar", "banla", "reddet"].includes(req.body.eylem);
  const tur = metin(req.body.tur);
  const hedefId = sayi(req.body.hedef_id);
  if (!gecerli || !hedefId || !TURLER.includes(tur)) {
    bildir(req, "hata", "Geçersiz işlem.");
    return res.redirect(geriAdres(req, "/yonetim/sikayetler"));
  }
  const sonuc = await sikayetIslemi(req, res, res.locals.kullanici, eylem, tur, hedefId, {
    sure: metin(req.body.sure), sebep: metin(req.body.sebep),
  });
  bildir(req, sonuc.ok ? "basari" : "hata", sonuc.mesaj);
  res.redirect(geriAdres(req, "/yonetim/sikayetler"));
});

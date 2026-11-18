// Yönetim paneli (/yonetim): Pano, Kullanıcılar, İçerik, Şikâyetler, Site ayarları, İşlem kaydı.
//
// Yetki matrisi:
//   üye        -> hepsi 403
//   moderatör  -> Pano, İçerik (konu/mesaj/sohbet, kategori, rütbe, rozet), Şikâyetler, kullanıcı DETAY sayfasında ban/ban kaldırma
//   admin      -> her şey (Kullanıcılar listesi ve rol/puan/rozet/şifre/hesap kapatma, Site ayarları, İşlem kaydı)
// İki kapı: aşağıdaki use() "moderatör ya da admin mi?" diye bakar; sadeceAdmin (yonetim-ortak.ts) daha dar kapıdır.
import express from "express";
import { pool } from "../db.ts";
import { girisGerekli, rutbeSql, banliSql, bildir, metin, likeKac } from "../yardimci.ts";
import { denetim, EYLEM_ETIKETLERI } from "../denetim.ts";
import { ayarlar, ayarYaz, ayarOnbellekTemizle, kelimeListesi } from "../ayarlar.ts";
import { hedefOnizleme, TUR_ETIKET } from "../sikayet.ts";
import { sadeceAdmin, sayfala, secim, tarihFiltresi } from "./yonetim-ortak.ts";
import { yonetimKullanici } from "./yonetim-kullanici.ts";
import { yonetimIcerik } from "./yonetim-icerik.ts";
import { yonetimSikayet } from "./yonetim-sikayet.ts";

export const yonetim = express.Router();

yonetim.use("/yonetim", girisGerekli("Yönetim paneli için giriş yapman gerekiyor."), async (req, res, next) => {
  if (!["admin", "moderator"].includes(res.locals.kullanici?.rol)) return res.status(403).render("yonetim/yasak", {});
  // Şablon yardımcıları ve kenar çubuğundaki bekleyen şikâyet sayısı
  const [[s]]: any = await pool.query("SELECT COUNT(*) AS n FROM reports WHERE durum = 'bekliyor'");
  res.locals.bekleyenSikayet = Number(s.n);
  // yUrl("/yonetim/icerik", {tur:"konu", q:""}, {sayfa: 2}) -> "/yonetim/icerik?tur=konu&sayfa=2" (boş değerler atılır)
  res.locals.yUrl = (yol: string, qs: Record<string, unknown>, ek: Record<string, unknown> = {}) => {
    const girdi = Object.entries({ ...qs, ...ek }).filter(([, v]) => v !== "" && v !== null && v !== undefined && v !== "hepsi");
    return yol + (girdi.length ? "?" + new URLSearchParams(girdi.map(([a, b]) => [a, String(b)])).toString() : "");
  };
  res.locals.eylemEtiketleri = EYLEM_ETIKETLERI;
  next();
});

yonetim.use(yonetimKullanici);
yonetim.use(yonetimIcerik);
yonetim.use(yonetimSikayet);

// ---------------------------------------------------------------------------
// Pano
// ---------------------------------------------------------------------------
const yerelTarih = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Son 30 günün günlük sayısı (kayıt olmayan günler 0). tablo koddaki sabit bir ad.
async function gunluk(tablo: "users" | "topics" | "posts", silinmisHaric: boolean) {
  const [satirlar]: any = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS gun, COUNT(*) AS n FROM ${tablo}
      WHERE created_at >= CURDATE() - INTERVAL 29 DAY ${silinmisHaric ? "AND deleted_at IS NULL" : ""} GROUP BY gun`
  );
  const harita = new Map<string, number>(satirlar.map((s: any) => [s.gun, Number(s.n)]));
  const veri = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const gun = yerelTarih(d);
    veri.push({ gun, n: harita.get(gun) ?? 0 });
  }
  return { veri, toplam: veri.reduce((a, b) => a + b.n, 0), en: Math.max(1, ...veri.map((v) => v.n)) };
}

yonetim.get("/yonetim", async (req, res) => {
  const admin = res.locals.kullanici.rol === "admin";
  const [[t]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS kullanici,
            (SELECT COUNT(*) FROM topics WHERE deleted_at IS NULL) AS konu,
            (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS mesaj,
            (SELECT COUNT(*) FROM chat_messages WHERE deleted_at IS NULL) AS sohbet,
            (SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL) AS ozel,
            (SELECT COUNT(*) FROM reports WHERE durum = 'bekliyor') AS sikayet,
            (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND ${banliSql("users")}) AS banli`
  );
  for (const k in t) t[k] = Number(t[k]);
  const [cevrimici]: any = await pool.query(
    "SELECT username FROM users WHERE deleted_at IS NULL AND last_seen_at >= NOW() - INTERVAL 5 MINUTE ORDER BY username");
  const [kategoriler]: any = await pool.query(
    `SELECT categories.id, categories.name, COUNT(topics.id) AS konu,
            (SELECT COUNT(*) FROM posts JOIN topics t2 ON t2.id = posts.topic_id WHERE t2.category_id = categories.id AND posts.deleted_at IS NULL) AS mesaj
       FROM categories LEFT JOIN topics ON topics.category_id = categories.id AND topics.deleted_at IS NULL
      GROUP BY categories.id ORDER BY konu DESC, categories.name LIMIT 5`
  );
  for (const c of kategoriler) { c.konu = Number(c.konu); c.mesaj = Number(c.mesaj); }

  const [bekleyenler]: any = await pool.query(
    `SELECT reports.id, reports.hedef_tur, reports.sebep, reports.created_at, bildiren.username AS bildiren,
            ${"COALESCE(reports.post_id, reports.reported_user_id, reports.chat_message_id, reports.message_id)"} AS hedef_id
       FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id
      WHERE reports.durum = 'bekliyor' ORDER BY reports.id DESC LIMIT 5`
  );
  for (const b of bekleyenler) b.hedef = await hedefOnizleme(b.hedef_tur, b.hedef_id);

  const [sonIslemler]: any = admin ? (await pool.query(
    `SELECT audit_log.id, audit_log.eylem, audit_log.hedef_tur, audit_log.hedef_id, audit_log.created_at, users.username AS aktor
       FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id ORDER BY audit_log.id DESC LIMIT 8`)) : [[]];

  res.render("yonetim/pano", {
    baslik: "Pano", aktif: "pano", t, cevrimici, kategoriler, bekleyenler, sonIslemler, turEtiket: TUR_ETIKET,
    grafikler: {
      yeniKullanici: await gunluk("users", true),
      yeniKonu: await gunluk("topics", true),
      yeniMesaj: await gunluk("posts", true),
    },
  });
});

// ---------------------------------------------------------------------------
// Site ayarları (admin)
// ---------------------------------------------------------------------------
yonetim.get("/yonetim/ayarlar", sadeceAdmin, async (req, res) => {
  const a = await ayarlar();
  res.render("yonetim/ayarlar", { baslik: "Site ayarları", aktif: "ayarlar", a, yasakliMetin: a.yasakli.join("\n") });
});

yonetim.post("/yonetim/ayarlar", sadeceAdmin, async (req, res) => {
  const k = res.locals.kullanici;
  const eski = await ayarlar();
  const kayitAcik = !!req.body.kayit_acik; // işaretsiz checkbox hiç gönderilmez
  const duyuru = metin(req.body.duyuru);
  const duyuruTur = req.body.duyuru_tur === "uyari" ? "uyari" : "info";
  const yasakli = kelimeListesi(typeof req.body.yasakli_kelimeler === "string" ? req.body.yasakli_kelimeler : "");

  let hata = "";
  if (duyuru.length > 500) hata = "Duyuru en fazla 500 karakter olabilir.";
  else if (yasakli.length > 300) hata = "En fazla 300 yasaklı ifade tanımlanabilir.";
  else if (yasakli.some((y) => y.length > 60)) hata = "Her yasaklı ifade en fazla 60 karakter olabilir.";
  if (hata) { bildir(req, "hata", hata); return res.redirect("/yonetim/ayarlar"); }

  await ayarYaz("kayit_acik", kayitAcik ? "1" : "0", k.id);
  // Duyuru metni ya da türü değiştiyse yeni sürüm: kapatmış olanlar yeni duyuruyu yine görsün
  if (duyuru !== eski.duyuru || duyuruTur !== eski.duyuruTur) await ayarYaz("duyuru_surum", String(Date.now()), k.id);
  await ayarYaz("duyuru", duyuru, k.id);
  await ayarYaz("duyuru_tur", duyuruTur, k.id);
  await ayarYaz("yasakli_kelimeler", yasakli.join("\n"), k.id);
  ayarOnbellekTemizle(); // bellekteki kopya hemen yenilensin

  await denetim(req, res, "ayar.kaydet", "ayar", null, {
    kayit_acik: [eski.kayitAcik, kayitAcik],
    duyuru: duyuru !== eski.duyuru || duyuruTur !== eski.duyuruTur ? [eski.duyuru.slice(0, 80), duyuru.slice(0, 80)] : "ayni",
    yasakli_sayisi: [eski.yasakli.length, yasakli.length],
  });
  bildir(req, "basari", "Ayarlar kaydedildi.");
  res.redirect("/yonetim/ayarlar");
});

// ---------------------------------------------------------------------------
// İşlem kaydı (admin): /yonetim/islem-kaydi?eylem=&aktor=&hedef_tur=&hedef_id=&bas=&son=&q=&sayfa=
// ---------------------------------------------------------------------------
yonetim.get("/yonetim/islem-kaydi", sadeceAdmin, async (req, res) => {
  const eylem = metin(req.query.eylem).slice(0, 64);
  const aktor = metin(req.query.aktor).slice(0, 32);
  const hedefTur = metin(req.query.hedef_tur).slice(0, 32);
  const hedefId = metin(req.query.hedef_id).replace(/\D/g, "").slice(0, 10);
  const bas = tarihFiltresi(req.query.bas);
  const son = tarihFiltresi(req.query.son);
  const q = metin(req.query.q).slice(0, 100);

  const kosullar: string[] = ["1 = 1"];
  const p: unknown[] = [];
  if (eylem) { kosullar.push("audit_log.eylem = ?"); p.push(eylem); }
  if (aktor) { kosullar.push("users.username LIKE ?"); p.push(likeKac(aktor)); }
  if (hedefTur) { kosullar.push("audit_log.hedef_tur = ?"); p.push(hedefTur); }
  if (hedefId) { kosullar.push("audit_log.hedef_id = ?"); p.push(Number(hedefId)); }
  if (bas) { kosullar.push("audit_log.created_at >= ?"); p.push(bas); }
  if (son) { kosullar.push("audit_log.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); p.push(son); }
  if (q) { kosullar.push("CAST(audit_log.ayrinti AS CHAR) LIKE ?"); p.push(likeKac(q)); }
  const nerede = kosullar.join(" AND ");

  const govde = "FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id";
  const [[{ n }]]: any = await pool.query(`SELECT COUNT(*) AS n ${govde} WHERE ${nerede}`, p);
  const sf = sayfala(req, Number(n), 50);
  const [kayitlar]: any = await pool.query(
    `SELECT audit_log.id, audit_log.eylem, audit_log.hedef_tur, audit_log.hedef_id, audit_log.ayrinti, audit_log.ip, audit_log.created_at,
            users.username AS aktor ${govde} WHERE ${nerede} ORDER BY audit_log.id DESC LIMIT ? OFFSET ?`,
    [...p, sf.boyut, sf.offset]
  );
  const [eylemler]: any = await pool.query("SELECT DISTINCT eylem FROM audit_log ORDER BY eylem");
  const [turler]: any = await pool.query("SELECT DISTINCT hedef_tur FROM audit_log WHERE hedef_tur IS NOT NULL ORDER BY hedef_tur");

  res.render("yonetim/islem-kaydi", {
    baslik: "İşlem kaydı", aktif: "islem-kaydi", kayitlar, sf, eylemler: eylemler.map((e: any) => e.eylem), turler: turler.map((t: any) => t.hedef_tur),
    qs: { eylem, aktor, hedef_tur: hedefTur, hedef_id: hedefId, bas, son, q }, yol: "/yonetim/islem-kaydi",
  });
});

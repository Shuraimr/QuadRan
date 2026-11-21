// Admin panel: Moderation group (Reports, Sanctions). The automatic filter is in yonetim-site.ts.
//
// Reports: a single queue, five target types (konu_mesaji, kullanici, sohbet_mesaji, ozel_mesaj, oda_mesaji).
// The screen is "master/detail": on the left a list that groups reports on the same target, on the right the detail of the selected report (?id=).
// Difference from /moderasyon: filters, grouping, mandatory reason, the author's past sanctions.
// Yönetim paneli: Moderasyon grubu (Şikâyetler, Yaptırımlar). Otomatik filtre yonetim-site.ts'te.
//
// Şikâyetler: tek kuyruk, beş hedef türü (konu_mesaji, kullanici, sohbet_mesaji, ozel_mesaj, oda_mesaji).
// Ekran "ana/ayrıntı" (master/detail): solda aynı hedefe gelenlerin gruplandığı liste, sağda seçili şikâyetin (?id=) ayrıntısı.
// /moderasyon'dan farkı: filtre, gruplama, zorunlu sebep, yazarın geçmiş yaptırımları.
import express from "express";
import { pool } from "../db.ts";
import { bildir, metin, sayi, geriAdres, banliSql } from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import { HEDEF_SUTUN, BAN_SURELERI, banla, kullaniciGetir } from "../islemler.ts";
import { hedefOnizleme, sikayetIslemi, TURLER, TUR_ETIKET, SEBEPLER } from "../sikayet.ts";
import { yaptirimGecmisi, yaptirimSayilari, banBitisi, BAN_EYLEMLERI, UYARI_EYLEMLERI } from "../yaptirim.ts";
import { sayfala, secim, onayIste } from "./yonetim-ortak.ts";

export const yonetimSikayet = express.Router();

const DURUMLAR = ["bekliyor", "islendi", "reddedildi", "hepsi"] as const;
// Target id: whichever of the five columns is filled (consistent with reports.hedef_tur, guaranteed by a CHECK)
// Hedef kimliği: beş sütundan hangisi doluysa o (reports.hedef_tur ile uyumlu, CHECK garanti eder)
const HEDEF_ID = "COALESCE(reports.post_id, reports.reported_user_id, reports.chat_message_id, reports.message_id, reports.room_message_id)";

yonetimSikayet.get("/yonetim/sikayetler", async (req, res) => {
  const yapan = res.locals.kullanici;
  const secili = sayi(req.query.id);
  // If reached directly with ?id= (search result, notification link) that report may not be pending: the list opens with "all"
  // Doğrudan ?id= ile gelindiyse (arama sonucu, bildirim bağlantısı) o şikâyet bekliyor olmayabilir: liste "hepsi" ile açılır
  const durum = secim(req.query.durum, DURUMLAR, secili ? "hepsi" : "bekliyor");
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

  // GROUPING: reports on the same target form one row. Ones with pending reports first, then the newest.
  // GRUPLAMA: aynı hedefe gelen şikâyetler tek satır. Önce bekleyeni olanlar, sonra en yeniler.
  // rid: the id of the group's newest report; the row link becomes ?id=rid.
  // rid: grubun en yeni şikâyetinin numarası; satır bağlantısı ?id=rid olur.
  const [gruplar]: any = await pool.query(
    `SELECT reports.hedef_tur AS tur, ${HEDEF_ID} AS hedef_id, COUNT(*) AS adet, SUM(reports.durum = 'bekliyor') AS bekleyen,
            SUM(reports.durum = 'islendi') AS islenen, MAX(reports.created_at) AS son, MAX(reports.id) AS rid
       FROM reports WHERE ${nerede}
      GROUP BY reports.hedef_tur, ${HEDEF_ID}
      ORDER BY bekleyen > 0 DESC, son DESC
      LIMIT ? OFFSET ?`,
    [...p, sf.boyut, sf.offset]
  );

  // Selected report (independent of the list filter: its detail opens even if it doesn't match the filter)
  // Seçili şikâyet (liste süzgecinden bağımsız: süzgece uymasa da ayrıntısı açılır)
  let sikayet: any = null;
  if (secili) {
    [[sikayet]] = (await pool.query(
      `SELECT reports.id, reports.hedef_tur AS tur, ${HEDEF_ID} AS hedef_id, reports.sebep, reports.aciklama, reports.durum, reports.created_at,
              reports.handled_at, bildiren.username AS bildiren, bildiren.id AS bildiren_id, isleyen.username AS isleyen
         FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id LEFT JOIN users isleyen ON isleyen.id = reports.handled_by
        WHERE reports.id = ?`, [secili])) as any;
  }

  for (const g of gruplar) {
    g.adet = Number(g.adet); g.bekleyen = Number(g.bekleyen); g.islenen = Number(g.islenen);
    g.durum = g.bekleyen > 0 ? "bekliyor" : g.islenen > 0 ? "islendi" : "reddedildi";
    g.hedef = await hedefOnizleme(g.tur, g.hedef_id);
    g.aktif = !!sikayet && sikayet.tur === g.tur && Number(sikayet.hedef_id) === Number(g.hedef_id);
  }

  let detay: any = null;
  if (sikayet) {
    const h = await hedefOnizleme(sikayet.tur, sikayet.hedef_id);
    // The OTHER reports on the same target (in every status)
    // Aynı hedefe gelen DİĞER şikâyetler (her durumda)
    const [digerleri]: any = await pool.query(
      `SELECT reports.id, reports.sebep, reports.aciklama, reports.durum, reports.created_at, bildiren.username AS bildiren, isleyen.username AS isleyen
         FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id LEFT JOIN users isleyen ON isleyen.id = reports.handled_by
        WHERE reports.${HEDEF_SUTUN[sikayet.tur]} = ? AND reports.id <> ? ORDER BY reports.id DESC`,
      [sikayet.hedef_id, sikayet.id]);
    detay = { h, digerleri, gecmis: [], sayilar: { uyari: 0, ban: 0 }, bekleyenVar: false, kisitli: false };
    if (h) {
      detay.gecmis = await yaptirimGecmisi(h.yazarId, undefined, 8);
      detay.sayilar = await yaptirimSayilari(h.yazarId);
      const [[b]]: any = await pool.query(`SELECT COUNT(*) AS n FROM reports WHERE ${HEDEF_SUTUN[sikayet.tur]} = ? AND durum = 'bekliyor'`, [sikayet.hedef_id]);
      detay.bekleyenVar = Number(b.n) > 0;
      // A moderator cannot act on a report about an admin's content: an explanation is shown instead of the buttons
      // Moderatör, yöneticinin içeriğiyle ilgili şikâyette işlem yapamaz: düğmeler yerine açıklama çıkar
      detay.kisitli = yapan.rol !== "admin" && h.yazarRol === "admin";
    }
  }

  res.render("yonetim/sikayetler", {
    baslik: "Şikâyetler", aktif: "sikayetler", gruplar, sf, turEtiket: TUR_ETIKET, turler: TURLER, sebepler: SEBEPLER, sureler: BAN_SURELERI,
    qs: { durum, tur, sebep }, yol: "/yonetim/sikayetler", secili, sikayet, detay,
    filtreli: durum !== "bekliyor" || tur !== "hepsi" || sebep !== "hepsi",
  });
});

// Action: POST /yonetim/sikayetler/islem  fields: rid (report no), tur, hedef_id, eylem (sil|uyar|banla|reddet), sure, sebep (REQUIRED)
// All pending reports on the same target close together (sikayetIslemi).
// İşlem: POST /yonetim/sikayetler/islem  alanlar: rid (şikâyet no), tur, hedef_id, eylem (sil|uyar|banla|reddet), sure, sebep (ZORUNLU)
// Aynı hedefe gelen bekleyen bütün şikâyetler birlikte kapanır (sikayetIslemi).
yonetimSikayet.post("/yonetim/sikayetler/islem", async (req, res) => {
  const geri = geriAdres(req, "/yonetim/sikayetler");
  const eylem = metin(req.body.eylem);
  const tur = metin(req.body.tur);
  const hedefId = sayi(req.body.hedef_id);
  const sebep = metin(req.body.sebep);
  const sure = metin(req.body.sure) || "kalici";
  if (!["sil", "uyar", "banla", "reddet"].includes(eylem) || !hedefId || !TURLER.includes(tur)) {
    bildir(req, "hata", "Geçersiz işlem.");
    return res.redirect(geri);
  }
  if (sebep.length < 3 || sebep.length > 255) {
    bildir(req, "hata", "İşlem için 3 ile 255 karakter arasında bir sebep yazmalısın.");
    return res.redirect(geri);
  }
  // A permanent suspension is hard to undo: a confirmation page comes first
  // Kalıcı uzaklaştırma geri alınması zor bir karardır: önce onay sayfası
  if (eylem === "banla" && sure === "kalici" &&
      onayIste(req, res, { baslik: "Kalıcı uzaklaştırma", metin: `Bu şikâyetin yazarı kalıcı olarak uzaklaştırılacak ve oturumu kapanacak. Sebep: “${sebep}”. Onaylıyor musun?`, buton: "Evet, kalıcı uzaklaştır", iptal: geri, aktif: "sikayetler" })) return;

  const sonuc = await sikayetIslemi(req, res, res.locals.kullanici, eylem as "sil" | "uyar" | "banla" | "reddet", tur, hedefId, {
    sure, sebep, sikayetId: sayi(req.body.rid) ?? undefined,
  });
  bildir(req, sonuc.ok ? "basari" : "hata", sonuc.mesaj);
  res.redirect(geri);
});

// ---------------------------------------------------------------------------
// Sanctions: /yonetim/yaptirimlar?filtre=aktif|yakinda|dolan|hepsi
//   aktif   : accounts currently suspended (who, until when, reason, who did it) + a remove button
//   dolan   : expired bans; read from the audit log (the user row is cleared when a ban ends, so there is no other source)
//   yakinda : bans expiring within 24 hours (the link of the warning card on the Overview page)
// Below, the latest warnings ('uyar' actions in the audit log).
// Yaptırımlar: /yonetim/yaptirimlar?filtre=aktif|yakinda|dolan|hepsi
//   aktif   : şu an uzaklaştırılmış hesaplar (kim, ne zamana kadar, sebep, kim yaptı) + kaldırma düğmesi
//   dolan   : süresi dolmuş banlar; işlem kaydından okunur (ban bitince kullanıcı satırı temizlendiği için başka kaynak yok)
//   yakinda : 24 saat içinde dolacak banlar (Bakış sayfasındaki uyarı kartının bağlantısı)
// Altta son uyarılar (işlem kaydındaki 'uyar' eylemleri).
// ---------------------------------------------------------------------------
yonetimSikayet.get("/yonetim/yaptirimlar", async (req, res) => {
  const filtre = secim(req.query.filtre, ["aktif", "yakinda", "dolan", "hepsi"] as const, "aktif");
  const satirlar: any[] = [];

  if (filtre !== "dolan") {
    const [banlilar]: any = await pool.query(
      `SELECT users.id, users.username, users.banned_at, users.banned_until, users.ban_reason, roles.name AS rol
         FROM users JOIN roles ON roles.id = users.role_id
        WHERE users.deleted_at IS NULL AND ${banliSql("users")}
          ${filtre === "yakinda" ? "AND users.banned_until IS NOT NULL AND users.banned_until <= NOW() + INTERVAL 24 HOUR" : ""}
        ORDER BY users.banned_until IS NULL, users.banned_until, users.id`
    );
    for (const b of banlilar) {
      // "Who did it": not kept on the user row; read from the latest ban event in the audit log
      // "Kim yaptı": kullanıcı satırında tutulmaz, işlem kaydındaki en son ban olayından okunur
      const [[son]]: any = await pool.query(
        `SELECT users.username AS aktor FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
          WHERE audit_log.eylem IN (?) AND ((audit_log.hedef_tur = 'kullanici' AND audit_log.hedef_id = ?) OR JSON_EXTRACT(audit_log.ayrinti, '$.kullanici_id') = ?)
          ORDER BY audit_log.id DESC LIMIT 1`, [BAN_EYLEMLERI, b.id, b.id]);
      satirlar.push({ durum: "aktif", id: b.id, username: b.username, rol: b.rol, baslangic: b.banned_at, bitis: b.banned_until, sebep: b.ban_reason, yapan: son?.aktor ?? null });
    }
  }

  if (filtre === "dolan" || filtre === "hepsi") {
    // Look at each person's LAST ban/unban event: if there is no unban after the ban and the end date has passed, it is "expired"
    // Kişi başına SON ban/ban-kaldırma olayına bakılır: ban'dan sonra kaldırma yoksa ve bitiş geçmişse "süresi doldu"
    const [olaylar]: any = await pool.query(
      `SELECT audit_log.id, audit_log.eylem, audit_log.hedef_tur, audit_log.hedef_id, audit_log.ayrinti, audit_log.created_at, users.username AS aktor
         FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
        WHERE audit_log.eylem IN (?) ORDER BY audit_log.id DESC LIMIT 500`, [[...BAN_EYLEMLERI, "kullanici.ban_kaldir"]]);
    const goruldu = new Set<number>();
    const aktifler = new Set(satirlar.map((s) => s.id));
    for (const o of olaylar) {
      const ay = typeof o.ayrinti === "string" ? JSON.parse(o.ayrinti) : o.ayrinti ?? {};
      const kisiId = o.hedef_tur === "kullanici" ? o.hedef_id : Number(ay.kullanici_id) || null;
      if (!kisiId || goruldu.has(kisiId)) continue;
      goruldu.add(kisiId);
      if (o.eylem === "kullanici.ban_kaldir" || aktifler.has(kisiId)) continue;
      const bitis = banBitisi(o.created_at, ay.sure);
      // permanent or still running (already in the active list)
      // kalıcı ya da hâlâ sürüyor (aktif listede zaten)
      if (!bitis || bitis.getTime() > Date.now()) continue;
      const kisi = await kullaniciGetir(kisiId);
      if (!kisi || kisi.silindi) continue;
      satirlar.push({ durum: "dolan", id: kisiId, username: kisi.username, rol: kisi.rol, baslangic: o.created_at, bitis, sebep: ay.sebep ?? null, yapan: o.aktor });
    }
  }

  const [uyarilar]: any = await pool.query(
    `SELECT audit_log.id, audit_log.eylem, audit_log.ayrinti, audit_log.created_at, users.username AS aktor
       FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
      WHERE audit_log.eylem IN (?) ORDER BY audit_log.id DESC LIMIT 20`, [UYARI_EYLEMLERI]);
  for (const u of uyarilar) u.ayrinti = typeof u.ayrinti === "string" ? JSON.parse(u.ayrinti) : u.ayrinti ?? {};

  res.render("yonetim/yaptirimlar", {
    baslik: "Yaptırımlar", aktif: "yaptirimlar", filtre, satirlar, uyarilar, sureler: BAN_SURELERI,
    qs: { filtre }, yol: "/yonetim/yaptirimlar",
  });
});

// Suspend by username (a moderator may only suspend those with the "uye" role, rule in islemler.ts > islemHatasi)
// Kullanıcı adıyla uzaklaştır (moderatör yalnızca "uye" rolündekini, kural islemler.ts > islemHatasi)
yonetimSikayet.post("/yonetim/yaptirimlar/ban", async (req, res) => {
  const geri = "/yonetim/yaptirimlar";
  const ad = metin(req.body.kullanici);
  const sebep = metin(req.body.sebep);
  const sure = metin(req.body.sure);
  const [satirlar]: any = await pool.query("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL", [ad]);
  if (!satirlar[0]) { bildir(req, "hata", "Bu adda bir kullanıcı yok."); return res.redirect(geri); }
  if (sebep.length < 3) { bildir(req, "hata", "Uzaklaştırma sebebini yazmalısın (en az 3 karakter)."); return res.redirect(geri); }
  if (sure === "kalici" &&
      onayIste(req, res, { baslik: "Kalıcı uzaklaştırma", metin: `${ad} kalıcı olarak uzaklaştırılacak ve oturumu kapanacak. Sebep: “${sebep}”. Onaylıyor musun?`, buton: "Evet, kalıcı uzaklaştır", iptal: geri, aktif: "yaptirimlar" })) return;
  const sonuc = await banla(res.locals.kullanici, satirlar[0].id, sure, sebep);
  if (sonuc.hata) { bildir(req, "hata", sonuc.hata); return res.redirect(geri); }
  await denetim(req, res, "kullanici.ban", "kullanici", satirlar[0].id, { yazar: ad, kullanici_id: satirlar[0].id, sure: sonuc.etiket, sebep, kaynak: "yaptırımlar sayfası" });
  bildir(req, "basari", `${ad} uzaklaştırıldı (${sonuc.etiket}).`);
  res.redirect(geri);
});

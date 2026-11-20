// Yönetim paneli: site ayarları. Eskiden tek bir "Site ayarları" sayfasıydı; artık işe göre ayrıldı:
//   Otomatik filtre   /yonetim/filtre           moderatör görür, admin düzenler
//   Puan kuralları    /yonetim/puan             yalnızca admin (Rütbeler ve Rozetler sekmeleri yonetim-icerik.ts'te)
//   Duyurular         /yonetim/duyurular        yalnızca admin: duyuru şeridi + toplu bildirim
//   Kayıt ve erişim   /yonetim/kayit-erisim     yalnızca admin
// Ayarlar site_settings tablosunda, bellekte önbelleklenir (src/ayarlar.ts).
import express from "express";
import { pool } from "../db.ts";
import { metin, bildir, yerelAdres, banliSql } from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import { ayarlar, ayarYaz, ayarOnbellekTemizle, kelimeListesi, PUAN_ENFAZLA, TAVAN_ENFAZLA } from "../ayarlar.ts";
import { sadeceAdmin, onayIste } from "./yonetim-ortak.ts";

export const yonetimSite = express.Router();

// ---------------------------------------------------------------------------
// Otomatik filtre: yasaklı ifadeler
// ---------------------------------------------------------------------------
yonetimSite.get("/yonetim/filtre", async (req, res) => {
  const a = await ayarlar();
  // Moderatör listeyi görür ama değiştiremez: şablon alanı salt okunur çizer, POST'u da sunucu reddeder
  res.render("yonetim/filtre", { baslik: "Otomatik filtre", aktif: "filtre", a, yasakliMetin: a.yasakli.join("\n"), duzenleyebilir: res.locals.kullanici.rol === "admin" });
});

yonetimSite.post("/yonetim/filtre", sadeceAdmin, async (req, res) => {
  const k = res.locals.kullanici;
  const eski = await ayarlar();
  const yasakli = kelimeListesi(typeof req.body.yasakli_kelimeler === "string" ? req.body.yasakli_kelimeler : "");
  let hata = "";
  if (yasakli.length > 300) hata = "En fazla 300 yasaklı ifade tanımlanabilir.";
  else if (yasakli.some((y) => y.length > 60)) hata = "Her yasaklı ifade en fazla 60 karakter olabilir.";
  if (hata) { bildir(req, "hata", hata); return res.redirect("/yonetim/filtre"); }
  await ayarYaz("yasakli_kelimeler", yasakli.join("\n"), k.id);
  ayarOnbellekTemizle();
  await denetim(req, res, "ayar.filtre", "ayar", null, { yasakli_sayisi: [eski.yasakli.length, yasakli.length] });
  bildir(req, "basari", "Yasaklı ifade listesi kaydedildi.");
  res.redirect("/yonetim/filtre");
});

// ---------------------------------------------------------------------------
// Puan ve ödüller > Puan kuralları (admin). Rütbeler ve Rozetler sekmeleri yonetim-icerik.ts'te.
// ---------------------------------------------------------------------------
yonetimSite.use("/yonetim/puan", sadeceAdmin);

yonetimSite.get("/yonetim/puan", async (req, res) => {
  const a = await ayarlar();
  res.render("yonetim/puan", { baslik: "Puan ve ödüller", aktif: "puan", puan: a.puan, enfazla: PUAN_ENFAZLA, tavanEnfazla: TAVAN_ENFAZLA });
});

yonetimSite.post("/yonetim/puan", async (req, res) => {
  const k = res.locals.kullanici;
  const yeni: Record<string, number> = {};
  const ALANLAR = [
    ["konu", "Konu açma"], ["cevap", "Cevap yazma"], ["oy", "Alınan artı oy"],
    ["gunluk", "Günlük ilk ziyaret"], ["seri", "7 günlük seri"], ["cozum", "Çözüm seçilen cevap"], ["rozet", "Yeni rozet"],
  ] as const;
  for (const [alan, ad] of ALANLAR) {
    const ham = metin(req.body[alan]);
    const n = Number(ham);
    if (ham === "" || !Number.isInteger(n) || n < 0 || n > PUAN_ENFAZLA) {
      bildir(req, "hata", `${ad} puanı 0 ile ${PUAN_ENFAZLA} arasında tam bir sayı olmalı.`);
      return res.redirect("/yonetim/puan");
    }
    yeni[alan] = n;
  }
  // Günlük konu/cevap puanı tavanı (0 = sınırsız): kuralların geri kalanından ayrı, kendi üst sınırı var
  const tavanHam = metin(req.body.gunluk_tavan);
  const tavan = Number(tavanHam);
  if (tavanHam === "" || !Number.isInteger(tavan) || tavan < 0 || tavan > TAVAN_ENFAZLA) {
    bildir(req, "hata", `Günlük puan tavanı 0 ile ${TAVAN_ENFAZLA} arasında tam bir sayı olmalı (0 = sınırsız).`);
    return res.redirect("/yonetim/puan");
  }
  yeni.gunlukTavan = tavan;
  const eski = (await ayarlar()).puan;
  await ayarYaz("puan_gunluk_tavan", String(tavan), k.id);
  await ayarYaz("puan_konu", String(yeni.konu), k.id);
  await ayarYaz("puan_cevap", String(yeni.cevap), k.id);
  await ayarYaz("puan_oy", String(yeni.oy), k.id);
  for (const [alan] of ALANLAR.slice(3)) await ayarYaz("puan_" + alan, String(yeni[alan]), k.id);
  ayarOnbellekTemizle();
  await denetim(req, res, "ayar.puan", "ayar", null, { eski, yeni });
  bildir(req, "basari", "Puan kuralları kaydedildi. Yalnızca bundan sonraki işlemler yeni değerle puan getirir; var olan puanlar değişmez.");
  res.redirect("/yonetim/puan");
});

// ---------------------------------------------------------------------------
// Duyurular (admin): duyuru şeridi + toplu bildirim
// ---------------------------------------------------------------------------
yonetimSite.use("/yonetim/duyurular", sadeceAdmin);

yonetimSite.get("/yonetim/duyurular", async (req, res) => {
  const a = await ayarlar();
  res.render("yonetim/duyurular", { baslik: "Duyurular", aktif: "duyurular", a });
});

yonetimSite.post("/yonetim/duyurular", async (req, res) => {
  const k = res.locals.kullanici;
  const eski = await ayarlar();
  const duyuru = metin(req.body.duyuru);
  const duyuruTur = req.body.duyuru_tur === "uyari" ? "uyari" : "info";
  if (duyuru.length > 500) { bildir(req, "hata", "Duyuru en fazla 500 karakter olabilir."); return res.redirect("/yonetim/duyurular"); }
  // Duyuru metni ya da türü değiştiyse yeni sürüm: kapatmış olanlar yeni duyuruyu yine görsün
  if (duyuru !== eski.duyuru || duyuruTur !== eski.duyuruTur) await ayarYaz("duyuru_surum", String(Date.now()), k.id);
  await ayarYaz("duyuru", duyuru, k.id);
  await ayarYaz("duyuru_tur", duyuruTur, k.id);
  ayarOnbellekTemizle();
  await denetim(req, res, "ayar.duyuru", "ayar", null, { duyuru: [eski.duyuru.slice(0, 80), duyuru.slice(0, 80)], tur: duyuruTur });
  bildir(req, "basari", "Duyuru kaydedildi.");
  res.redirect("/yonetim/duyurular");
});

// Toplu bildirim: aktif (kapatılmamış, uzaklaştırılmamış) üyelere ya da tek bir role. Gönderilmeden önce onay sayfasında alıcı sayısı gösterilir.
const ROL_ETIKET: Record<string, string> = { hepsi: "bütün aktif üyeler", uye: "üye rolündekiler", moderator: "moderatörler", admin: "yöneticiler" };

yonetimSite.post("/yonetim/duyurular/bildirim", async (req, res) => {
  const k = res.locals.kullanici;
  const hedef = metin(req.body.hedef) in ROL_ETIKET ? metin(req.body.hedef) : "";
  const metni = metin(req.body.metin);
  const linkHam = metin(req.body.link);
  const link = linkHam ? yerelAdres(linkHam, "") : "/";
  let hata = "";
  if (!hedef) hata = "Alıcı grubunu seç.";
  else if (metni.length < 3 || metni.length > 300) hata = "Bildirim metni 3 ile 300 karakter arasında olmalı.";
  else if (linkHam && !link) hata = "Bağlantı sitenin içinden bir adres olmalı (örn. /konu/5).";
  if (hata) { bildir(req, "hata", hata); return res.redirect("/yonetim/duyurular"); }

  // Alıcılar: silinmemiş ve şu an uzaklaştırılmamış hesaplar (+ isteğe bağlı rol)
  const rolKosulu = hedef === "hepsi" ? "" : "AND roles.name = ?";
  const rolParam = hedef === "hepsi" ? [] : [hedef];
  const [[{ n }]]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM users JOIN roles ON roles.id = users.role_id WHERE users.deleted_at IS NULL AND NOT ${banliSql("users")} ${rolKosulu}`, rolParam);
  const adet = Number(n);
  if (!adet) { bildir(req, "hata", "Bu gruba giren aktif üye yok."); return res.redirect("/yonetim/duyurular"); }

  if (onayIste(req, res, { baslik: "Toplu bildirim", metin: `“${metni}” bildirimi ${adet} kişiye (${ROL_ETIKET[hedef]}) gönderilecek. Gönderilen bildirim geri alınamaz. Onaylıyor musun?`, buton: `Evet, ${adet} kişiye gönder`, iptal: "/yonetim/duyurular", aktif: "duyurular" })) return;

  // INSERT ... SELECT: tek sorguda herkese; metin ve bağlantı ? ile bağlanır
  await pool.query(
    `INSERT INTO notifications (user_id, actor_id, tur, metin, link)
       SELECT users.id, NULL, 'duyuru', ?, ? FROM users JOIN roles ON roles.id = users.role_id
        WHERE users.deleted_at IS NULL AND NOT ${banliSql("users")} ${rolKosulu}`,
    [metni, link, ...rolParam]
  );
  await denetim(req, res, "bildirim.toplu", "bildirim", null, { hedef, adet, metin: metni, link });
  bildir(req, "basari", `Bildirim ${adet} kişiye gönderildi.`);
  res.redirect("/yonetim/duyurular");
});

// ---------------------------------------------------------------------------
// Kayıt ve erişim (admin): kayıtlar açık mı
// ---------------------------------------------------------------------------
yonetimSite.use("/yonetim/kayit-erisim", sadeceAdmin);

yonetimSite.get("/yonetim/kayit-erisim", async (req, res) => {
  const a = await ayarlar();
  res.render("yonetim/kayit-erisim", { baslik: "Kayıt ve erişim", aktif: "kayit-erisim", a });
});

yonetimSite.post("/yonetim/kayit-erisim", async (req, res) => {
  const eski = await ayarlar();
  const kayitAcik = !!req.body.kayit_acik; // işaretsiz checkbox hiç gönderilmez
  await ayarYaz("kayit_acik", kayitAcik ? "1" : "0", res.locals.kullanici.id);
  ayarOnbellekTemizle();
  await denetim(req, res, "ayar.kayit", "ayar", null, { kayit_acik: [eski.kayitAcik, kayitAcik] });
  bildir(req, "basari", kayitAcik ? "Yeni kayıtlara açıldı." : "Yeni kayıtlar kapatıldı.");
  res.redirect("/yonetim/kayit-erisim");
});

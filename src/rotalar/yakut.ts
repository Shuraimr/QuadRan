// Yakut: /yakut (cüzdan + mağaza), /yakut/hareketler (tam defter), unvan satın alma/seçme.
// Bakiye değişimi YALNIZCA src/yakut.ts › yakutEkle/unvanAl'dan geçer. Süs, efekt ve öne çıkarma ürünleri şimdilik "Yakında":
// hazır olmayan özellik vaat edilmez (CLAUDE.md), bu yüzden satın alma rotası yalnızca unvan için var.
import express from "express";
import { pool } from "../db.ts";
import { girisGerekli, bildir, geriAdres, sayi } from "../yardimci.ts";
import { rutbeler, rutbeBul, sonrakiRutbe } from "../rutbe.ts";
import { premiumMu } from "../premium.ts";
import { ayarlar } from "../ayarlar.ts";
import { unvanAl, SEBEP_ETIKETLERI, yakutYaz } from "../yakut.ts";
import { yakutHarcama } from "../hiz-siniri.ts";
import { SUS_ADLARI, EFEKT_ADLARI, EFEKT_RENKLERI } from "../profil-gorunum.ts";

export const yakutRotasi = express.Router();

const KATEGORILER = [
  { id: "tumu", ad: "Tümü" }, { id: "unvanlar", ad: "Unvanlar" }, { id: "susler", ad: "Avatar süsleri" },
  { id: "efektler", ad: "Profil efektleri" }, { id: "one-cikarma", ad: "Öne çıkarma" },
] as const;

const giris = girisGerekli("Yakut için giriş yapman gerekiyor.");

yakutRotasi.get("/yakut", giris, async (req, res) => {
  const k = res.locals.kullanici;
  const kat = KATEGORILER.find((x) => x.id === req.query.k)?.id ?? "tumu";
  const kural = (await ayarlar()).yakut;

  const [unvanlar]: any = await pool.query(
    `SELECT unvanlar.id, unvanlar.ad, unvanlar.fiyat,
            EXISTS(SELECT 1 FROM kullanici_unvanlari WHERE kullanici_unvanlari.user_id = ? AND kullanici_unvanlari.unvan_id = unvanlar.id) AS sahip
       FROM unvanlar WHERE unvanlar.aktif = 1 ORDER BY unvanlar.sira, unvanlar.id`, [k.id]);
  const [[kisi]]: any = await pool.query("SELECT seri_gun, unvan_id FROM users WHERE id = ?", [k.id]);
  // "Bu ay": ayın ilk gününden bu yana kazanılan ve harcanan (gün sınırı veritabanının saatinden)
  const [[ay]]: any = await pool.query(
    `SELECT COALESCE(SUM(IF(miktar > 0, miktar, 0)), 0) AS kazanilan, COALESCE(SUM(IF(miktar < 0, -miktar, 0)), 0) AS harcanan
       FROM yakut_log WHERE user_id = ? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`, [k.id]);
  const [son]: any = await pool.query(
    "SELECT miktar, sebep, aciklama, created_at FROM yakut_log WHERE user_id = ? ORDER BY id DESC LIMIT 3", [k.id]);

  // Seri: bugünkü ziyaret çoktan sayıldı (oturum.ts). Döngü 7 gün: dolu simge sayısı = döngüdeki gün; yarın 7'nin katıysa büyük ödül.
  const seriGun = Number(kisi.seri_gun);
  const dongu = seriGun > 0 ? ((seriGun - 1) % 7) + 1 : 0;
  const yarin = (seriGun + 1) % 7 === 0 ? kural.seriYedinci : kural.seriGunluk;

  // Aylık harçlık: sonraki ayın 1'i (tr-TR), rütbe + premium
  const puan = Number(k.points);
  const rutbe = rutbeBul(puan);
  const premium = premiumMu(k);
  // Sonraki ayın 1'i: gün sınırıyla aynı saat kaynağı (veritabanı), Node saatine bağlı değil
  const [[sa]]: any = await pool.query("SELECT DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, '%Y-%m-01') AS t");
  const sonrakiAy = new Date(sa.t + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  const sonraki = sonrakiRutbe(puan);
  const liste = await rutbeler();
  const aylar = liste.map((r) => r.aylik_yakut);

  res.render("yakut", {
    baslik: "Yakut", aktifMenu: "yakut", kat, kategoriler: KATEGORILER, unvanlar, seciliUnvan: kisi.unvan_id ? Number(kisi.unvan_id) : null,
    susler: SUS_ADLARI, efektler: EFEKT_ADLARI, efektRenkleri: EFEKT_RENKLERI,
    cuzdan: { kazanilan: Number(ay.kazanilan), harcanan: Number(ay.harcanan), seriGun, dongu, yarin, son, sebepler: SEBEP_ETIKETLERI,
      harclik: (rutbe?.aylik_yakut ?? 0) + (premium ? kural.premiumAylik : 0), harclikTarih: sonrakiAy, premium,
      sonraki: sonraki ? { ad: sonraki.name, aylik: sonraki.aylik_yakut, kalan: sonraki.min_points - puan } : null },
    kazan: { enAz: Math.min(...aylar), enCok: Math.max(...aylar), seriGunluk: kural.seriGunluk, seriYedinci: kural.seriYedinci, premiumAylik: kural.premiumAylik },
    yakutYaz,
  });
});

// Tam defter: filtre (Tümü/Kazanılan/Harcanan) + sayfalama (30)
const SAYFA = 30;
yakutRotasi.get("/yakut/hareketler", giris, async (req, res) => {
  const k = res.locals.kullanici;
  const f = ["kazanilan", "harcanan"].includes(String(req.query.f)) ? String(req.query.f) : "tumu";
  const kosul = f === "kazanilan" ? "AND miktar > 0" : f === "harcanan" ? "AND miktar < 0" : "";
  const [[{ n }]]: any = await pool.query(`SELECT COUNT(*) AS n FROM yakut_log WHERE user_id = ? ${kosul}`, [k.id]);
  const toplam = Number(n), sayfaSayisi = Math.max(1, Math.ceil(toplam / SAYFA));
  const sayfa = Math.min(sayi(req.query.sayfa) ?? 1, sayfaSayisi);
  const [hareketler]: any = await pool.query(
    `SELECT miktar, sebep, aciklama, created_at FROM yakut_log WHERE user_id = ? ${kosul} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [k.id, SAYFA, (sayfa - 1) * SAYFA]);
  res.render("yakut-hareketler", { baslik: "Yakut hareketleri", aktifMenu: "yakut", f, hareketler, sayfa, sayfaSayisi, toplam, sebepler: SEBEP_ETIKETLERI, yakutYaz });
});

// Hız sınırı: yalnızca doğrulanmış (CSRF'ten geçmiş) POST'larda çalışır; sınır aşılırsa işlem yapılmaz
function sinirAsildi(req: express.Request, res: express.Response) {
  const anahtar = String(res.locals.kullanici.id);
  const dk = yakutHarcama.kalanDakika(anahtar);
  if (dk) { bildir(req, "hata", `Çok hızlı işlem yaptın. ${dk} dakika sonra tekrar dene.`); res.redirect(geriAdres(req, "/yakut")); return true; }
  yakutHarcama.say(anahtar);
  return false;
}

yakutRotasi.post("/yakut/unvan/:id/al", giris, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  if (sinirAsildi(req, res)) return;
  const s = await unvanAl(res.locals.kullanici.id, id);
  if (s.durum === "yok") bildir(req, "hata", "Bu unvan bulunamadı.");
  else if (s.durum === "zaten") bildir(req, "hata", `“${s.unvan!.ad}” unvanı zaten senin.`);
  else if (s.durum === "yetersiz") bildir(req, "hata", `Yakutun yetmiyor: ${yakutYaz(s.eksik!)} yakut eksik.`);
  else bildir(req, "basari", `“${s.unvan!.ad}” unvanı senin oldu. Kullan düğmesiyle adının yanına koyabilirsin.`);
  res.redirect(geriAdres(req, "/yakut"));
});

// Sahip olunan unvanı seç. Sahiplik sunucuda doğrulanır (formdaki gizli alan değil, kullanici_unvanlari satırı).
yakutRotasi.post("/yakut/unvan/:id/kullan", giris, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  if (sinirAsildi(req, res)) return;
  const k = res.locals.kullanici;
  const [[var_]]: any = await pool.query(
    `SELECT unvanlar.ad FROM kullanici_unvanlari JOIN unvanlar ON unvanlar.id = kullanici_unvanlari.unvan_id
      WHERE kullanici_unvanlari.user_id = ? AND kullanici_unvanlari.unvan_id = ? AND unvanlar.aktif = 1`, [k.id, id]);
  if (!var_) { bildir(req, "hata", "Bu unvana sahip değilsin."); return res.redirect(geriAdres(req, "/yakut")); }
  await pool.query("UPDATE users SET unvan_id = ? WHERE id = ?", [id, k.id]);
  bildir(req, "basari", `“${var_.ad}” unvanı artık adının yanında görünüyor.`);
  res.redirect(geriAdres(req, "/yakut"));
});

yakutRotasi.post("/yakut/unvan/kaldir", giris, async (req, res) => {
  if (sinirAsildi(req, res)) return;
  await pool.query("UPDATE users SET unvan_id = NULL WHERE id = ?", [res.locals.kullanici.id]);
  bildir(req, "basari", "Unvanın kaldırıldı. İstediğin zaman yeniden seçebilirsin.");
  res.redirect(geriAdres(req, "/yakut"));
});

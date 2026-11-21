// Moderasyon: konu/mesaj üzerindeki moderasyon menüsü (sitedeki ⋮) ve eski şikâyet işlem adresleri (POST /moderasyon/:id/...).
// Şikâyet kuyruğunun kendisi /yonetim/sikayetler sayfasına taşındı.
// Buradaki her şey yalnızca moderator ve admin içindir (yetkiliGerekli).
//
// Her işlem "işlem kaydı"na (audit_log) da yazılır: kim, neyi, ne zaman yaptı.
import express from "express";
import { pool } from "../db.ts";
import { bildir, girisGerekli, yetkiliGerekli, geriAdres, sayi } from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import { mesajiSil } from "../islemler.ts";
import { hedefOnizleme, sikayetIslemi } from "../sikayet.ts";

export const moderasyon = express.Router();

// Eski şikâyet kuyruğu sayfası artık yönetim panelinde (/yonetim/sikayetler). Yer imleri bozulmasın diye 301.
// Kapılardan ÖNCE tanımlı: misafir de önce yeni adrese gider, orada girişe yönlendirilir. ?durum= korunur.
moderasyon.get("/moderasyon", (req, res) => {
  const durum = typeof req.query.durum === "string" && ["bekliyor", "islendi", "reddedildi", "hepsi"].includes(req.query.durum) ? req.query.durum : "";
  res.redirect(301, "/yonetim/sikayetler" + (durum ? "?durum=" + durum : ""));
});

// Her route'tan önce iki kapı: önce giriş, sonra yetki.
// Sıra önemli: giriş yapmamış biri 403 görmesin, girişe gitsin.
moderasyon.use("/moderasyon", girisGerekli("Moderasyon için giriş yapman gerekiyor."), yetkiliGerekli);

// ---------------------------------------------------------------------------
// Kuyruktaki şikâyet işlemleri: adreste ŞİKÂYET id'si var
// ---------------------------------------------------------------------------
const KUYRUK = "/yonetim/sikayetler";

async function sikayetiBul(id: number | null) {
  if (!id) return null;
  const [satirlar]: any = await pool.query(
    `SELECT id, hedef_tur, COALESCE(post_id, reported_user_id, chat_message_id, message_id, room_message_id) AS hedef_id FROM reports WHERE id = ?`,
    [id]
  );
  return satirlar[0] ?? null;
}

// sil / uyar / uzaklastir aynı kalıp: şikâyeti bul, ortak işlemi çalıştır, sonucu toast olarak göster
function kuyrukRotasi(yol: string, eylem: "sil" | "uyar" | "banla") {
  moderasyon.post(`/moderasyon/:id/${yol}`, async (req, res) => {
    const s = await sikayetiBul(sayi(req.params.id));
    if (!s) { bildir(req, "hata", "Şikâyet bulunamadı."); return res.redirect(geriAdres(req, KUYRUK)); }
    const sonuc = await sikayetIslemi(req, res, res.locals.kullanici, eylem, s.hedef_tur, s.hedef_id, {
      sikayetId: s.id, sure: "kalici", sebep: "Moderasyon kuyruğundan uzaklaştırıldı",
    });
    bildir(req, sonuc.ok ? "basari" : "hata", sonuc.mesaj);
    res.redirect(geriAdres(req, KUYRUK));
  });
}
kuyrukRotasi("sil", "sil");
kuyrukRotasi("uyar", "uyar");
kuyrukRotasi("uzaklastir", "banla");

moderasyon.post("/moderasyon/:id/reddet", async (req, res) => {
  const k = res.locals.kullanici;
  const s = await sikayetiBul(sayi(req.params.id));
  if (!s) { bildir(req, "hata", "Şikâyet bulunamadı."); return res.redirect(geriAdres(req, KUYRUK)); }

  // Moderatör, yöneticiyi ilgilendiren şikâyeti kapatamaz
  const o = await hedefOnizleme(s.hedef_tur, s.hedef_id);
  if (k.rol !== "admin" && o?.yazarRol === "admin") {
    bildir(req, "hata", "Yöneticiler hakkındaki şikâyetleri yalnızca yöneticiler işler.");
    return res.redirect(geriAdres(req, KUYRUK));
  }

  // Reddet yalnızca bu şikâyeti kapatır; aynı hedefe gelen diğerleri ayrı değerlendirilir.
  await pool.query("UPDATE reports SET durum = 'reddedildi', handled_by = ?, handled_at = NOW() WHERE id = ? AND durum = 'bekliyor'", [k.id, s.id]);
  await denetim(req, res, "sikayet.reddet", s.hedef_tur, s.hedef_id, { sikayet: s.id, adet: 1 });
  bildir(req, "basari", "Şikâyet reddedildi.");
  res.redirect(geriAdres(req, KUYRUK));
});

// ---------------------------------------------------------------------------
// Konu/mesaj menüsü (partials/moderasyon-menusu): form alanları post_id ve topic_id
// ---------------------------------------------------------------------------

// Konuyu bul: topic_id yoksa ya da boşsa (yorum.ejs bazen boş yollar) mesajdan türet.
async function hedefiBul(req: express.Request) {
  let topicId = sayi(req.body.topic_id);
  const postId = sayi(req.body.post_id);
  if (!topicId && postId) {
    const [p]: any = await pool.query("SELECT topic_id FROM posts WHERE id = ?", [postId]);
    topicId = p[0]?.topic_id ?? null;
  }
  return { topicId, postId };
}

// Moderatör, yöneticinin konusuna/mesajına dokunamaz (yönetici yazarsa true döner = engelle).
async function yoneticiyeAitMi(yapanRol: string, tur: "konu" | "mesaj", id: number | null): Promise<boolean> {
  if (yapanRol === "admin" || !id) return false;
  const [s]: any = await pool.query(
    `SELECT roles.name AS rol FROM ${tur === "konu" ? "topics" : "posts"} t
       JOIN users ON users.id = t.user_id JOIN roles ON roles.id = users.role_id WHERE t.id = ?`,
    [id]
  );
  return s[0]?.rol === "admin";
}

// sabitle ve kilitle aynı işi yapar: sütun doluysa boşalt, boşsa şimdiki zamanı yaz (aç/kapa).
// Sütun adı koddan gelir, kullanıcıdan değil; bu yüzden metin birleştirmek güvenli.
function anahtarRotasi(yol: string, sutun: "pinned_at" | "locked_at", acik: string, kapali: string, eylemAcik: string, eylemKapali: string) {
  moderasyon.post("/moderasyon/" + yol, async (req, res) => {
    const { topicId } = await hedefiBul(req);
    const geri = geriAdres(req, "/");
    if (!topicId) { bildir(req, "hata", "Konu bulunamadı."); return res.redirect(geri); }
    if (await yoneticiyeAitMi(res.locals.kullanici.rol, "konu", topicId)) {
      bildir(req, "hata", "Yöneticilerin konularına yalnızca yöneticiler dokunabilir.");
      return res.redirect(geri);
    }

    const [sonuc]: any = await pool.query(
      `UPDATE topics SET ${sutun} = IF(${sutun} IS NULL, NOW(), NULL) WHERE id = ? AND deleted_at IS NULL`,
      [topicId]
    );
    if (!sonuc.affectedRows) { bildir(req, "hata", "Konu bulunamadı."); return res.redirect(geri); }

    const [[konu]]: any = await pool.query(`SELECT ${sutun} AS deger FROM topics WHERE id = ?`, [topicId]);
    await denetim(req, res, konu.deger ? eylemAcik : eylemKapali, "konu", topicId, { kaynak: "moderasyon menüsü" });
    bildir(req, "basari", konu.deger ? acik : kapali);
    res.redirect(geri);
  });
}
anahtarRotasi("sabitle", "pinned_at", "Konu sabitlendi.", "Konunun sabiti kaldırıldı.", "konu.sabitle", "konu.sabit_kaldir");
anahtarRotasi("kilitle", "locked_at", "Konu kilitlendi.", "Konunun kilidi açıldı.", "konu.kilitle", "konu.kilit_ac");

// Kategoriyi değiştir: menüdeki açılır listeden seçilen kategoriye taşır.
// Kategori id'si gelen veridir; gerçekten var mı diye veritabanından kontrol ediyoruz.
moderasyon.post("/moderasyon/kategori-degistir", async (req, res) => {
  const { topicId } = await hedefiBul(req);
  const kategoriId = sayi(req.body.category_id);
  const geri = geriAdres(req, "/");
  if (!topicId || !kategoriId) { bildir(req, "hata", "Konu ya da kategori seçilmedi."); return res.redirect(geri); }
  if (await yoneticiyeAitMi(res.locals.kullanici.rol, "konu", topicId)) {
    bildir(req, "hata", "Yöneticilerin konularına yalnızca yöneticiler dokunabilir.");
    return res.redirect(geri);
  }

  const [kategoriler]: any = await pool.query("SELECT name FROM categories WHERE id = ?", [kategoriId]);
  if (!kategoriler[0]) { bildir(req, "hata", "Kategori bulunamadı."); return res.redirect(geri); }

  const [sonuc]: any = await pool.query("UPDATE topics SET category_id = ? WHERE id = ? AND deleted_at IS NULL", [kategoriId, topicId]);
  if (!sonuc.affectedRows) { bildir(req, "hata", "Konu bulunamadı."); return res.redirect(geri); }
  await denetim(req, res, "konu.tasi", "konu", topicId, { kategori: kategoriler[0].name, kaynak: "moderasyon menüsü" });
  bildir(req, "basari", `Konu “${kategoriler[0].name}” kategorisine taşındı.`);
  res.redirect(geri);
});

// +18 işareti (sql/23): yorumun BÜTÜN ekleri birlikte işaretlenir / işareti kaldırılır (ekler tablosunda satır başına var, ama arayüzde yorum tek birim).
// Yetkili kaldırınca yazarın kendi işareti de gider (yetkili kararı üstündür); yetkili işaretlediğinde nsfw_kim = 'yetkili' olur ve
// yazar bunu geri alamaz (yazarın düzenleme yolu zaten yok; ekler düzenlenemez).
moderasyon.post("/moderasyon/nsfw", async (req, res) => {
  const { postId, topicId } = await hedefiBul(req);
  const geri = geriAdres(req, topicId ? `/konu/${topicId}` : "/");
  if (!postId) { bildir(req, "hata", "Mesaj bulunamadı."); return res.redirect(geri); }
  const [[durum]]: any = await pool.query(
    "SELECT COUNT(*) AS adet, COALESCE(MAX(nsfw), 0) AS nsfw FROM ekler JOIN posts ON posts.id = ekler.post_id WHERE ekler.post_id = ? AND posts.deleted_at IS NULL", [postId]
  );
  if (!Number(durum.adet)) { bildir(req, "hata", "Bu mesajda ek yok."); return res.redirect(geri); }
  const yeni = Number(durum.nsfw) ? 0 : 1;
  await pool.query("UPDATE ekler SET nsfw = ?, nsfw_kim = ? WHERE post_id = ?", [yeni, yeni ? "yetkili" : null, postId]);
  await denetim(req, res, yeni ? "icerik.nsfw" : "icerik.nsfw_kaldir", "konu_mesaji", postId, { konu: topicId, kaynak: "moderasyon menüsü" });
  bildir(req, "basari", yeni ? "Ekler +18 olarak işaretlendi." : "+18 işareti kaldırıldı.");
  res.redirect(geri + (geri.includes("#") ? "" : `#mesaj-${postId}`));
});

moderasyon.post("/moderasyon/sil", async (req, res) => {
  const k = res.locals.kullanici;
  const { postId } = await hedefiBul(req);
  if (await yoneticiyeAitMi(k.rol, "mesaj", postId)) {
    bildir(req, "hata", "Yöneticilerin mesajlarını yalnızca yöneticiler silebilir.");
    return res.redirect(geriAdres(req, "/"));
  }
  const silinen = postId ? await mesajiSil(postId, k.id) : null;
  if (!silinen) {
    bildir(req, "hata", "Mesaj bulunamadı ya da zaten silinmiş.");
    return res.redirect(geriAdres(req, "/"));
  }
  await denetim(req, res, "icerik.sil", "konu_mesaji", postId, { konu: silinen.topic_id, konu_silindi: !!silinen.ilk_mi, kaynak: "moderasyon menüsü" });
  bildir(req, "basari", silinen.ilk_mi ? "Konu silindi." : "Mesaj silindi.");
  // Konu silindiyse konu sayfası artık 404 verir; akışa dön
  res.redirect(silinen.ilk_mi ? "/" : geriAdres(req, `/konu/${silinen.topic_id}`));
});

// Mesaj menüsündeki "Uzaklaştır…" artık bir form değil: üye kartının Yaptırımlar sekmesine gider
// (/yonetim/uyeler/:id?sekme=yaptirim). Orada süre + zorunlu sebep sorulur, kaldırma ve geçmiş de aynı yerde.

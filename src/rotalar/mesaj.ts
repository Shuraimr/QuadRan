// Kişinin KENDİ mesajını düzenlemesi ve silmesi.
//   GET/POST /mesaj/:id/duzenle   (konunun ilk mesajıysa başlık da düzenlenir)
//   POST     /mesaj/:id/sil
// Moderatör silmesi ayrı (src/islemler.ts mesajiSil): o, sahibine "kaldırıldı" bildirimi gönderir
// ve şikâyetleri kapatır. Kişi kendi mesajını silince ikisi de gereksiz.
import express from "express";
import { pool } from "../db.ts";
import { puanEkle, bildir, girisGerekli, sayi, metin } from "../yardimci.ts";
import { yasakliIfade, puanKurallari } from "../ayarlar.ts";

export const mesaj = express.Router();

// Mesajı, konusunu ve "ilk mesaj mı" bilgisini getir. Yalnızca sahibi ve silinmemişse döner.
async function kendiMesajim(id: number | null, userId: number) {
  if (!id) return null;
  const [satirlar]: any = await pool.query(
    `SELECT posts.id, posts.content, posts.topic_id, posts.user_id,
            topics.title, topics.locked_at,
            posts.id = (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id) AS ilk_mi
       FROM posts JOIN topics ON topics.id = posts.topic_id
      WHERE posts.id = ? AND posts.user_id = ? AND posts.deleted_at IS NULL AND topics.deleted_at IS NULL`,
    [id, userId]
  );
  const m = satirlar[0];
  if (m) m.ilk_mi = !!m.ilk_mi;
  return m ?? null;
}

mesaj.get("/mesaj/:id/duzenle", girisGerekli("Mesajını düzenlemek için giriş yapman gerekiyor."), async (req, res, next) => {
  const m = await kendiMesajim(sayi(req.params.id), res.locals.kullanici.id);
  if (!m) return next(); // başkasının mesajı ya da yok: 404 (varlığını da ele vermiyoruz)
  if (m.locked_at) {
    bildir(req, "hata", "Bu konu kilitli, mesajlar düzenlenemez.");
    return res.redirect(`/konu/${m.topic_id}`);
  }
  res.render("mesaj-duzenle", { m, degerler: { title: m.title, content: m.content } });
});

mesaj.post("/mesaj/:id/duzenle", girisGerekli("Mesajını düzenlemek için giriş yapman gerekiyor."), async (req, res, next) => {
  const m = await kendiMesajim(sayi(req.params.id), res.locals.kullanici.id);
  if (!m) return next();
  if (m.locked_at) {
    bildir(req, "hata", "Bu konu kilitli, mesajlar düzenlenemez.");
    return res.redirect(`/konu/${m.topic_id}`);
  }

  const degerler = { title: m.ilk_mi ? metin(req.body.title) : m.title, content: metin(req.body.content) };
  const hatalar: Record<string, string> = {};
  if (m.ilk_mi && (degerler.title.length < 5 || degerler.title.length > 120)) hatalar.title = "Başlık 5 ile 120 karakter arasında olmalı";
  if (!degerler.content) hatalar.content = "İçerik boş olamaz";
  else if (degerler.content.length > 10000) hatalar.content = "İçerik en fazla 10.000 karakter olabilir";
  // Yasaklı kelime kontrolü düzenlemede de yapılmalı; yoksa önce temiz yazıp sonra değiştirerek atlatılırdı
  const yasak = await yasakliIfade(m.ilk_mi ? degerler.title : "", degerler.content);
  if (yasak) hatalar.content = `Metinde yasaklı bir ifade var: “${yasak}”.`;

  if (Object.keys(hatalar).length) return res.status(400).render("mesaj-duzenle", { m, degerler, hatalar });

  // updated_at sütunu "ON UPDATE CURRENT_TIMESTAMP": içerik değişince kendisi dolar, konu sayfası "düzenlendi" yazar
  await pool.query("UPDATE posts SET content = ? WHERE id = ?", [degerler.content, m.id]);
  if (m.ilk_mi) await pool.query("UPDATE topics SET title = ? WHERE id = ?", [degerler.title, m.topic_id]);
  bildir(req, "basari", "Mesajın güncellendi");
  res.redirect(`/konu/${m.topic_id}#mesaj-${m.id}`);
});

mesaj.post("/mesaj/:id/sil", girisGerekli("Mesajını silmek için giriş yapman gerekiyor."), async (req, res, next) => {
  const k = res.locals.kullanici;
  const m = await kendiMesajim(sayi(req.params.id), k.id);
  if (!m) return next();

  // İlk mesajı silmek = konuyu silmek. İkisi birlikte olmalı (transaction).
  const baglanti = await pool.getConnection();
  try {
    await baglanti.beginTransaction();
    await baglanti.query("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [m.id]);
    if (m.ilk_mi) await baglanti.query("UPDATE topics SET deleted_at = NOW() WHERE id = ?", [m.topic_id]);
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }

  // Yazarken kazanılan puan geri alınır; yoksa yaz-sil-yaz ile puan kasılabilirdi.
  // (Mesaja gelen oyların puanı kalır: onlar başkalarının verdiği oylardı.)
  const puan = await puanKurallari();
  await puanEkle(k.id, -(m.ilk_mi ? puan.konu : puan.cevap));

  bildir(req, "basari", m.ilk_mi ? "Konun silindi" : "Mesajın silindi");
  res.redirect(m.ilk_mi ? "/" : `/konu/${m.topic_id}`);
});

// A person editing and deleting their OWN message.
//   GET/POST /mesaj/:id/duzenle   (if it is the topic's first message, the title is edited too)
//   POST     /mesaj/:id/sil
// A moderator's deletion is separate (src/islemler.ts mesajiSil): it sends the owner a "removed" notification
// and closes the reports. When a person deletes their own message both are unnecessary.
// Kişinin KENDİ mesajını düzenlemesi ve silmesi.
//   GET/POST /mesaj/:id/duzenle   (konunun ilk mesajıysa başlık da düzenlenir)
//   POST     /mesaj/:id/sil
// Moderatör silmesi ayrı (src/islemler.ts mesajiSil): o, sahibine "kaldırıldı" bildirimi gönderir
// ve şikâyetleri kapatır. Kişi kendi mesajını silince ikisi de gereksiz.
import express from "express";
import { pool } from "../db.ts";
import { silinenCozumuTemizle, mesajPuaniniGeriAl, rutbeKontrol, bildir, girisGerekli, sayi, metin } from "../yardimci.ts";
import { yasakliIfade } from "../ayarlar.ts";

export const mesaj = express.Router();

// Fetch the message, its topic and the "is it the first message" info. Returns only if the caller owns it and it isn't deleted.
// Mesajı, konusunu ve "ilk mesaj mı" bilgisini getir. Yalnızca sahibi ve silinmemişse döner.
async function kendiMesajim(id: number | null, userId: number) {
  if (!id) return null;
  const [satirlar]: any = await pool.query(
    `SELECT posts.id, posts.content, posts.topic_id, posts.user_id,
            topics.title, topics.locked_at,
            posts.id = (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id) AS ilk_mi,
            (SELECT COUNT(*) FROM ekler WHERE ekler.post_id = posts.id) AS ek_sayisi
       FROM posts JOIN topics ON topics.id = posts.topic_id
      WHERE posts.id = ? AND posts.user_id = ? AND posts.deleted_at IS NULL AND topics.deleted_at IS NULL`,
    [id, userId]
  );
  const m = satirlar[0];
  if (m) { m.ilk_mi = !!m.ilk_mi; m.ek_sayisi = Number(m.ek_sayisi); }
  return m ?? null;
}

mesaj.get("/mesaj/:id/duzenle", girisGerekli("Mesajını düzenlemek için giriş yapman gerekiyor."), async (req, res, next) => {
  const m = await kendiMesajim(sayi(req.params.id), res.locals.kullanici.id);
  // someone else's message or none: 404 (we don't reveal its existence either)
  // başkasının mesajı ya da yok: 404 (varlığını da ele vermiyoruz)
  if (!m) return next();
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
  // The text of a reply made only of attachments may be empty (attachments can't be edited for now, sql/23)
  // Yalnızca ekten oluşan cevabın metni boş olabilir (ekler şimdilik düzenlenemez, sql/23)
  if (!degerler.content && !m.ek_sayisi) hatalar.content = "İçerik boş olamaz";
  else if (degerler.content.length > 10000) hatalar.content = "İçerik en fazla 10.000 karakter olabilir";
  // The banned-word check must also run on edit; otherwise one could write clean text first and then bypass it by editing
  // Yasaklı kelime kontrolü düzenlemede de yapılmalı; yoksa önce temiz yazıp sonra değiştirerek atlatılırdı
  const yasak = await yasakliIfade(m.ilk_mi ? degerler.title : "", degerler.content);
  if (yasak) hatalar.content = `Metinde yasaklı bir ifade var: “${yasak}”.`;

  if (Object.keys(hatalar).length) return res.status(400).render("mesaj-duzenle", { m, degerler, hatalar });

  // The updated_at column is "ON UPDATE CURRENT_TIMESTAMP": it fills itself when the content changes, and the topic page shows "edited"
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

  // Deleting the first message = deleting the topic. Both must happen together (transaction).
  // If the deleted reply was the topic's solution (or, when the topic itself is deleted, the solution reply), the marker is removed and the awarded solution points are
  // rolled back too; the points the author earned from this message are also rolled back (all in the same transaction, so nothing is left half-done).
  // İlk mesajı silmek = konuyu silmek. İkisi birlikte olmalı (transaction).
  // Silinen cevap konunun çözümüyse (ya da konunun kendisi silinirse çözüm cevabı için) işaret kalkar ve açık çözüm puanı da
  // geri alınır; yazarın bu mesajdan kazandığı puan da geri alınır (hepsi aynı transaction; yarım kalmasın).
  const baglanti = await pool.getConnection();
  let puanlar: { kisi: number; eski: number; yeni: number }[] = [];
  try {
    await baglanti.beginTransaction();
    // The lock order is the same as islemler.ts mesajiSil (topic → message → users). The not-yet-deleted check is
    // redone inside the lock: on a double click / concurrent request the second request sees the already-deleted message and writes nothing.
    // Kilit sırası islemler.ts mesajiSil ile aynı (konu → mesaj → users). Silinmemiş mi denetimi kilidin içinde yeniden
    // yapılır: çift tıklama / eşzamanlı istekte ikinci istek zaten silinmiş mesajı görür ve hiçbir şey yazmaz.
    await baglanti.query("SELECT id FROM topics WHERE id = ? FOR UPDATE", [m.topic_id]);
    const [[hala]]: any = await baglanti.query("SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [m.id]);
    if (!hala) { await baglanti.rollback(); bildir(req, "hata", "Mesaj zaten silinmiş."); return res.redirect(m.ilk_mi ? "/" : `/konu/${m.topic_id}`); }
    puanlar = await silinenCozumuTemizle(baglanti, m); // topic lock first · konu kilidi önce
    const kayip = await mesajPuaniniGeriAl(baglanti, m);
    if (kayip) puanlar.push(kayip);
    await baglanti.query("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [m.id]);
    if (m.ilk_mi) await baglanti.query("UPDATE topics SET deleted_at = NOW() WHERE id = ?", [m.topic_id]);
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }

  // The points earned when writing were rolled back above (the amount comes from the points_log record, not today's setting); otherwise
  // points could be farmed by write-delete-write. (Points from votes on the message stay: those were votes given by others.)
  // Yazarken kazanılan puan yukarıda geri alındı (miktar o günkü ayardan değil points_log kaydından gelir); yoksa
  // yaz-sil-yaz ile puan kasılabilirdi. (Mesaja gelen oyların puanı kalır: onlar başkalarının verdiği oylardı.)
  for (const p of puanlar) await rutbeKontrol(p.kisi, p.eski, p.yeni);

  bildir(req, "basari", m.ilk_mi ? "Konun silindi" : "Mesajın silindi");
  res.redirect(m.ilk_mi ? "/" : `/konu/${m.topic_id}`);
});

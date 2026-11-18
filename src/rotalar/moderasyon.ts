// Moderasyon: şikâyet kuyruğu (/moderasyon) ve konu/mesaj üzerindeki moderasyon menüsü.
// Buradaki her şey yalnızca moderator ve admin içindir (yetkiliGerekli).
import express from "express";
import { pool } from "../db.ts";
import { rutbeSql, bildirimGonder, bildir, kisalt, girisGerekli, yetkiliGerekli, geriAdres, sayi } from "../yardimci.ts";

export const moderasyon = express.Router();

// Her route'tan önce iki kapı: önce giriş, sonra yetki.
// Sıra önemli: giriş yapmamış biri 403 görmesin, girişe gitsin.
moderasyon.use("/moderasyon", girisGerekli("Moderasyon için giriş yapman gerekiyor."), yetkiliGerekli);

// ---------------------------------------------------------------------------
// Şikâyet kuyruğu: /moderasyon?durum=bekliyor|islendi|reddedildi|hepsi
// ---------------------------------------------------------------------------
const DURUMLAR = ["bekliyor", "islendi", "reddedildi", "hepsi"];

moderasyon.get("/moderasyon", async (req, res) => {
  const durum = DURUMLAR.includes(req.query.durum as string) ? (req.query.durum as string) : "bekliyor";

  // Yetkisiz kişi için yetkiliGerekli 403 verip buraya geçirir; şablon "erişimin yok" kutusunu çizer.
  // Veri çekmeye gerek yok, çekmemek de listeyi sızdırmamak için daha güvenli.
  if (res.statusCode === 403) return res.render("moderasyon", { durum });

  const [[ozet]]: any = await pool.query(
    `SELECT COALESCE(SUM(durum = 'bekliyor'), 0) AS bekleyen,
            COALESCE(SUM(durum <> 'bekliyor' AND handled_at >= CURDATE()), 0) AS bugun_islenen,
            COUNT(*) AS toplam
       FROM reports`
  );
  for (const s in ozet) ozet[s] = Number(ozet[s]);

  // Durum filtresi sabit listeden seçildiği için ? ile bağlıyoruz, "hepsi" ise koşulu etkisiz yapıyoruz.
  const [satirlar]: any = await pool.query(
    `SELECT reports.id, reports.durum, reports.sebep, reports.aciklama, reports.created_at,
            bildiren.username AS bildiren,
            (SELECT COUNT(*) FROM reports r2 WHERE r2.post_id = reports.post_id) AS ayni_post_sayisi,
            posts.id AS post_id, posts.content, posts.created_at AS post_tarihi, posts.deleted_at,
            yazar.username AS yazar, ${rutbeSql("yazar")} AS rutbe,
            topics.id AS konu_id, topics.title AS konu_baslik
       FROM reports
       JOIN users AS bildiren ON bildiren.id = reports.reporter_id
       JOIN posts ON posts.id = reports.post_id
       JOIN users AS yazar ON yazar.id = posts.user_id
       JOIN topics ON topics.id = posts.topic_id
      WHERE (? = 'hepsi' OR reports.durum = ?)
      ORDER BY reports.created_at DESC
      LIMIT 100`,
    [durum, durum]
  );

  // Şablon iç içe nesne bekliyor (s.post.yazar, s.konu.title); düz satırı o şekle çeviriyoruz.
  const sikayetler = satirlar.map((s: any) => ({
    id: s.id, durum: s.durum, sebep: s.sebep, aciklama: s.aciklama, created_at: s.created_at,
    bildiren: s.bildiren, ayni_post_sayisi: Number(s.ayni_post_sayisi),
    post: { id: s.post_id, content: s.content, yazar: s.yazar, rutbe: s.rutbe, created_at: s.post_tarihi, deleted_at: s.deleted_at },
    konu: { id: s.konu_id, title: s.konu_baslik },
  }));

  res.render("moderasyon", { durum, ozet, sikayetler });
});

// ---------------------------------------------------------------------------
// Ortak işler
// ---------------------------------------------------------------------------

// Mesajı yumuşak sil (satır kalır, deleted_at dolar). Konunun ilk mesajıysa konu da silinir.
// Mesajın bekleyen BÜTÜN şikâyetleri tek seferde "işlendi" olur; aynı mesaj için 5 kişi
// şikâyet ettiyse moderatör 5 kez uğraşmasın.
// Dönen değer: silinen mesajın bilgisi, bulunamadıysa null.
async function mesajiSil(postId: number, moderatorId: number) {
  const [satirlar]: any = await pool.query(
    `SELECT posts.id, posts.user_id, posts.topic_id, posts.content,
            posts.id = (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id) AS ilk_mi
       FROM posts WHERE posts.id = ? AND posts.deleted_at IS NULL`,
    [postId]
  );
  const mesaj = satirlar[0];
  if (!mesaj) return null;

  // Üç yazma işlemi birlikte olmalı: yarım kalırsa (mesaj silinmiş ama şikâyet açık) tutarsızlık olur.
  const baglanti = await pool.getConnection();
  try {
    await baglanti.beginTransaction();
    await baglanti.query("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [postId]);
    if (mesaj.ilk_mi) await baglanti.query("UPDATE topics SET deleted_at = NOW() WHERE id = ?", [mesaj.topic_id]);
    await baglanti.query(
      "UPDATE reports SET durum = 'islendi', handled_by = ?, handled_at = NOW() WHERE post_id = ? AND durum = 'bekliyor'",
      [moderatorId, postId]
    );
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }

  // Yapan null: bildirimde moderatörün adı görünmez, "Moderasyon" olarak gelir.
  await bildirimGonder({
    alan: mesaj.user_id, yapan: null, tur: "moderasyon",
    metin: `Mesajın moderatörler tarafından kaldırıldı: “${kisalt(mesaj.content, 50)}”`,
    link: mesaj.ilk_mi ? "/" : `/konu/${mesaj.topic_id}`,
  });
  return mesaj;
}

// ---------------------------------------------------------------------------
// Kuyruktaki şikâyet işlemleri: adreste ŞİKÂYET id'si var
// ---------------------------------------------------------------------------
async function sikayetiBul(id: number | null) {
  if (!id) return null;
  const [satirlar]: any = await pool.query(
    `SELECT reports.id, reports.post_id, reports.durum, posts.user_id AS yazar_id, posts.topic_id, posts.content
       FROM reports JOIN posts ON posts.id = reports.post_id WHERE reports.id = ?`,
    [id]
  );
  return satirlar[0] ?? null;
}

const KUYRUK = "/moderasyon";

moderasyon.post("/moderasyon/:id/sil", async (req, res) => {
  const k = res.locals.kullanici;
  const s = await sikayetiBul(sayi(req.params.id));
  if (!s) { bildir(req, "hata", "Şikâyet bulunamadı."); return res.redirect(geriAdres(req, KUYRUK)); }

  const silinen = await mesajiSil(s.post_id, k.id);
  if (!silinen) {
    // Mesaj zaten silinmişse yalnızca şikâyeti kapat
    await pool.query("UPDATE reports SET durum = 'islendi', handled_by = ?, handled_at = NOW() WHERE post_id = ? AND durum = 'bekliyor'", [k.id, s.post_id]);
  }
  bildir(req, "basari", silinen ? "Mesaj silindi, şikâyetler işlendi." : "Mesaj zaten silinmişti, şikâyet kapatıldı.");
  res.redirect(geriAdres(req, KUYRUK));
});

moderasyon.post("/moderasyon/:id/uyar", async (req, res) => {
  const k = res.locals.kullanici;
  const s = await sikayetiBul(sayi(req.params.id));
  if (!s) { bildir(req, "hata", "Şikâyet bulunamadı."); return res.redirect(geriAdres(req, KUYRUK)); }

  await bildirimGonder({
    alan: s.yazar_id, yapan: null, tur: "moderasyon",
    metin: `Moderatörler mesajın için seni uyardı: “${kisalt(s.content, 50)}”. Lütfen topluluk kurallarına dikkat et.`,
    link: `/konu/${s.topic_id}#mesaj-${s.post_id}`,
  });
  // Aynı mesajın bekleyen bütün şikâyetleri birlikte işlenir
  await pool.query("UPDATE reports SET durum = 'islendi', handled_by = ?, handled_at = NOW() WHERE post_id = ? AND durum = 'bekliyor'", [k.id, s.post_id]);
  bildir(req, "basari", "Yazar uyarıldı, şikâyet işlendi.");
  res.redirect(geriAdres(req, KUYRUK));
});

moderasyon.post("/moderasyon/:id/reddet", async (req, res) => {
  const k = res.locals.kullanici;
  const s = await sikayetiBul(sayi(req.params.id));
  if (!s) { bildir(req, "hata", "Şikâyet bulunamadı."); return res.redirect(geriAdres(req, KUYRUK)); }

  // Reddet yalnızca bu şikâyeti kapatır; aynı mesaja gelen diğerleri ayrı değerlendirilir.
  await pool.query("UPDATE reports SET durum = 'reddedildi', handled_by = ?, handled_at = NOW() WHERE id = ? AND durum = 'bekliyor'", [k.id, s.id]);
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

// sabitle ve kilitle aynı işi yapar: sütun doluysa boşalt, boşsa şimdiki zamanı yaz (aç/kapa).
// Sütun adı koddan gelir, kullanıcıdan değil; bu yüzden metin birleştirmek güvenli.
function anahtarRotasi(yol: string, sutun: "pinned_at" | "locked_at", acik: string, kapali: string) {
  moderasyon.post("/moderasyon/" + yol, async (req, res) => {
    const { topicId } = await hedefiBul(req);
    const geri = geriAdres(req, "/");
    if (!topicId) { bildir(req, "hata", "Konu bulunamadı."); return res.redirect(geri); }

    const [sonuc]: any = await pool.query(
      `UPDATE topics SET ${sutun} = IF(${sutun} IS NULL, NOW(), NULL) WHERE id = ? AND deleted_at IS NULL`,
      [topicId]
    );
    if (!sonuc.affectedRows) { bildir(req, "hata", "Konu bulunamadı."); return res.redirect(geri); }

    const [[konu]]: any = await pool.query(`SELECT ${sutun} AS deger FROM topics WHERE id = ?`, [topicId]);
    bildir(req, "basari", konu.deger ? acik : kapali);
    res.redirect(geri);
  });
}
anahtarRotasi("sabitle", "pinned_at", "Konu sabitlendi.", "Konunun sabiti kaldırıldı.");
anahtarRotasi("kilitle", "locked_at", "Konu kilitlendi.", "Konunun kilidi açıldı.");

moderasyon.post("/moderasyon/kategori-degistir", (req, res) => {
  bildir(req, "hata", "Kategori değiştirme henüz yok.");
  res.redirect(geriAdres(req, "/"));
});

moderasyon.post("/moderasyon/sil", async (req, res) => {
  const k = res.locals.kullanici;
  const { postId } = await hedefiBul(req);
  const silinen = postId ? await mesajiSil(postId, k.id) : null;
  if (!silinen) {
    bildir(req, "hata", "Mesaj bulunamadı ya da zaten silinmiş.");
    return res.redirect(geriAdres(req, "/"));
  }
  bildir(req, "basari", silinen.ilk_mi ? "Konu silindi." : "Mesaj silindi.");
  // Konu silindiyse konu sayfası artık 404 verir; akışa dön
  res.redirect(silinen.ilk_mi ? "/" : geriAdres(req, `/konu/${silinen.topic_id}`));
});

moderasyon.post("/moderasyon/uzaklastir", async (req, res) => {
  const k = res.locals.kullanici;
  const { postId } = await hedefiBul(req);
  const geri = geriAdres(req, "/");
  const [satirlar]: any = postId
    ? await pool.query(
        `SELECT users.id, users.username, roles.name AS rol
           FROM posts JOIN users ON users.id = posts.user_id JOIN roles ON roles.id = users.role_id
          WHERE posts.id = ?`, [postId])
    : [[]];
  const hedef = satirlar[0];

  if (!hedef) { bildir(req, "hata", "Kullanıcı bulunamadı."); return res.redirect(geri); }
  // Kendini ya da yetkili birini uzaklaştırmak yasak: moderatör, admini susturamasın.
  if (hedef.id === k.id) { bildir(req, "hata", "Kendini uzaklaştıramazsın."); return res.redirect(geri); }
  if (["admin", "moderator"].includes(hedef.rol)) {
    bildir(req, "hata", "Yönetici ve moderatörler uzaklaştırılamaz.");
    return res.redirect(geri);
  }

  // banned_at dolu olan kullanıcının oturumu bir sonraki istekte düşer (oturum.ts kontrol eder)
  await pool.query("UPDATE users SET banned_at = COALESCE(banned_at, NOW()) WHERE id = ?", [hedef.id]);
  bildir(req, "basari", `${hedef.username} uzaklaştırıldı.`);
  res.redirect(geri);
});

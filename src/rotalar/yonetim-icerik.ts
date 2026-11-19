// Yönetim paneli: Forum (Konular, Mesajlar, Kategoriler), Sohbet ve Puan ve ödüller'in Rütbeler/Rozetler sekmeleri.
// Konular/Mesajlar/Sohbet: moderatör + admin. Kategoriler ve Puan ve ödüller: yalnızca admin (sadeceAdmin ile kapılı).
import express from "express";
import { pool } from "../db.ts";
import { bildir, sayi, metin, geriAdres, likeKac, rutbeSql, rozetVer } from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import {
  mesajiSil, mesajiGeriAl, konuyuSil, konuyuGeriAl, sohbetMesajiSil, sohbetMesajiGeriAl,
} from "../islemler.ts";
import { sayfala, secim, idListesi, sadeceAdmin, onayIste } from "./yonetim-ortak.ts";

export const yonetimIcerik = express.Router();

const TURLER = ["konu", "mesaj", "sohbet"] as const;
const DURUMLAR = ["aktif", "silinmis", "hepsi"] as const;

// ---------------------------------------------------------------------------
// Liste: /yonetim/icerik?tur=konu|mesaj|sohbet&q=&kategori=&durum=&yazar=&sayfa=
// ---------------------------------------------------------------------------
// Üç liste aynı koddan geçer; yalnızca tablo ve adres değişir.
//   /yonetim/forum (konular) · /yonetim/forum/mesajlar · /yonetim/sohbet
const LISTELER = { konu: "/yonetim/forum", mesaj: "/yonetim/forum/mesajlar", sohbet: "/yonetim/sohbet" } as const;
for (const tur of TURLER) {
  yonetimIcerik.get(LISTELER[tur], (req, res) => icerikListesi(tur, req, res));
}

async function icerikListesi(tur: (typeof TURLER)[number], req: express.Request, res: express.Response) {
  const q = metin(req.query.q).slice(0, 100);
  const yazar = metin(req.query.yazar).slice(0, 32);
  const durum = secim(req.query.durum, DURUMLAR, "aktif");
  const kategori = sayi(req.query.kategori);

  // Tabloya göre sabit parçalar: ad ve sütunlar koddan, kullanıcı değerleri ? ile
  const tablo = tur === "konu" ? "topics" : tur === "mesaj" ? "posts" : "chat_messages";
  const kosullar: string[] = ["1 = 1"];
  const p: unknown[] = [];
  if (durum === "aktif") kosullar.push(`${tablo}.deleted_at IS NULL`);
  if (durum === "silinmis") kosullar.push(`${tablo}.deleted_at IS NOT NULL`);
  if (yazar) { kosullar.push("yazar.username LIKE ?"); p.push(likeKac(yazar)); }
  if (q) {
    kosullar.push(tur === "konu" ? "topics.title LIKE ?" : `${tablo}.content LIKE ?`);
    p.push(likeKac(q));
  }
  if (kategori && tur !== "sohbet") { kosullar.push(tur === "konu" ? "topics.category_id = ?" : "konu.category_id = ?"); p.push(kategori); }
  const nerede = kosullar.join(" AND ");

  let toplamSorgu: string, listeSorgu: string;
  if (tur === "konu") {
    const govde = `FROM topics JOIN users yazar ON yazar.id = topics.user_id JOIN categories ON categories.id = topics.category_id`;
    toplamSorgu = `SELECT COUNT(*) AS n ${govde} WHERE ${nerede}`;
    listeSorgu = `SELECT topics.id, topics.title, topics.created_at, topics.deleted_at, topics.pinned_at, topics.locked_at,
                         categories.name AS kategori, yazar.username AS yazar, yazar.id AS yazar_id,
                         (SELECT COUNT(*) FROM posts WHERE posts.topic_id = topics.id AND posts.deleted_at IS NULL) AS mesaj_sayisi
                    ${govde} WHERE ${nerede} ORDER BY topics.id DESC LIMIT ? OFFSET ?`;
  } else if (tur === "mesaj") {
    const govde = `FROM posts JOIN users yazar ON yazar.id = posts.user_id JOIN topics konu ON konu.id = posts.topic_id`;
    toplamSorgu = `SELECT COUNT(*) AS n ${govde} WHERE ${nerede}`;
    listeSorgu = `SELECT posts.id, posts.content, posts.created_at, posts.deleted_at, posts.topic_id, konu.title AS konu_baslik,
                         yazar.username AS yazar, yazar.id AS yazar_id,
                         posts.id = (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id) AS ilk_mi
                    ${govde} WHERE ${nerede} ORDER BY posts.id DESC LIMIT ? OFFSET ?`;
  } else {
    const govde = `FROM chat_messages JOIN users yazar ON yazar.id = chat_messages.user_id`;
    toplamSorgu = `SELECT COUNT(*) AS n ${govde} WHERE ${nerede}`;
    listeSorgu = `SELECT chat_messages.id, chat_messages.content, chat_messages.created_at, chat_messages.deleted_at,
                         yazar.username AS yazar, yazar.id AS yazar_id
                    ${govde} WHERE ${nerede} ORDER BY chat_messages.id DESC LIMIT ? OFFSET ?`;
  }
  const [[{ n }]]: any = await pool.query(toplamSorgu, p);
  const sf = sayfala(req, Number(n));
  const [satirlar]: any = await pool.query(listeSorgu, [...p, sf.boyut, sf.offset]);
  const [kategoriler] = await pool.query("SELECT id, name FROM categories ORDER BY sort_order, id");

  res.render("yonetim/icerik", {
    baslik: tur === "sohbet" ? "Sohbet" : "Forum", aktif: tur === "sohbet" ? "sohbet" : "forum", tur, satirlar, sf, kategoriler,
    qs: { q, yazar, durum, kategori: kategori ?? "" }, yol: LISTELER[tur],
    filtreli: !!(q || yazar || kategori || durum !== "aktif"),
  });
}

// ---------------------------------------------------------------------------
// Toplu işlem: POST /yonetim/icerik/toplu  alanlar: tur, eylem, id (çoklu), kategori
// Her öğe için ayrı işlem kaydı yazılır. Moderatör, yöneticinin içeriğine dokunamaz (atlanır).
// ---------------------------------------------------------------------------
const EYLEMLER: Record<string, readonly string[]> = {
  konu: ["sil", "geri_al", "sabitle", "sabit_kaldir", "kilitle", "kilit_ac", "tasi"],
  mesaj: ["sil", "geri_al"],
  sohbet: ["sil", "geri_al"],
};

yonetimIcerik.post("/yonetim/toplu", async (req, res) => {
  const k = res.locals.kullanici;
  const tur = secim(req.body.tur, TURLER, "konu");
  const eylem = metin(req.body.eylem);
  const idler = idListesi(req.body.id);
  const sebep = metin(req.body.sebep);
  const geri = geriAdres(req, LISTELER[tur]);

  if (!EYLEMLER[tur].includes(eylem)) { bildir(req, "hata", "Geçerli bir işlem seç."); return res.redirect(geri); }
  if (!idler.length) { bildir(req, "hata", "Hiçbir öğe seçilmedi."); return res.redirect(geri); }

  // Toplu silme tehlikelidir: sebep zorunlu (işlem kaydına ve yazarın bildirimine gider) + onay adımı
  if (eylem === "sil") {
    if (sebep.length < 3 || sebep.length > 200) { bildir(req, "hata", "Silmek için 3 ile 200 karakter arasında bir sebep yazmalısın."); return res.redirect(geri); }
    if (onayIste(req, res, { baslik: "Toplu silme", metin: `${idler.length} öğe silinecek (yazarlara sebep bildirilir). Sebep: “${sebep}”. Onaylıyor musun?`, buton: "Evet, sil", iptal: geri, aktif: tur === "sohbet" ? "sohbet" : "forum" })) return;
  }

  let kategoriAdi = "";
  let kategoriId: number | null = null;
  if (eylem === "tasi") {
    kategoriId = sayi(req.body.kategori);
    const [kat]: any = kategoriId ? await pool.query("SELECT name FROM categories WHERE id = ?", [kategoriId]) : [[]];
    if (!kat[0]) { bildir(req, "hata", "Taşınacak kategoriyi seç."); return res.redirect(geri); }
    kategoriAdi = kat[0].name;
  }

  // Yazarların rolleri: moderatör için yönetici içeriğini ayıklamak gerekir
  const tablo = tur === "konu" ? "topics" : tur === "mesaj" ? "posts" : "chat_messages";
  const [yazarlar]: any = await pool.query(
    `SELECT t.id, roles.name AS rol FROM ${tablo} t JOIN users ON users.id = t.user_id JOIN roles ON roles.id = users.role_id WHERE t.id IN (?)`,
    [idler]
  );
  const rolHaritasi = new Map<number, string>(yazarlar.map((y: any) => [y.id, y.rol]));

  let tamam = 0, atlanan = 0, degismeyen = 0;
  for (const id of idler) {
    const rol = rolHaritasi.get(id);
    if (!rol) { degismeyen++; continue; }
    if (k.rol !== "admin" && rol === "admin") { atlanan++; continue; }

    let basarili = false;
    let kayit = "";
    const hedefTur = tur === "konu" ? "konu" : tur === "mesaj" ? "konu_mesaji" : "sohbet_mesaji";
    let ayrinti: Record<string, unknown> = { toplu: idler.length > 1, ...(eylem === "sil" ? { sebep } : {}) };

    if (eylem === "sil") {
      basarili = tur === "konu" ? await konuyuSil(id, k.id, sebep) : tur === "mesaj" ? !!(await mesajiSil(id, k.id, sebep)) : !!(await sohbetMesajiSil(id, k.id, sebep));
      kayit = "icerik.sil";
    } else if (eylem === "geri_al") {
      basarili = tur === "konu" ? await konuyuGeriAl(id) : tur === "mesaj" ? await mesajiGeriAl(id) : await sohbetMesajiGeriAl(id);
      kayit = "icerik.geri_al";
    } else {
      // Yalnızca konular: sütun adı sabit tablodan, değerler ? ile
      const ISLEM: Record<string, [string, string]> = {
        sabitle: ["pinned_at = NOW()", "konu.sabitle"], sabit_kaldir: ["pinned_at = NULL", "konu.sabit_kaldir"],
        kilitle: ["locked_at = NOW()", "konu.kilitle"], kilit_ac: ["locked_at = NULL", "konu.kilit_ac"],
      };
      if (eylem === "tasi") {
        const [s]: any = await pool.query("UPDATE topics SET category_id = ? WHERE id = ? AND category_id <> ?", [kategoriId, id, kategoriId]);
        basarili = s.affectedRows > 0; kayit = "konu.tasi"; ayrinti = { ...ayrinti, kategori: kategoriAdi };
      } else {
        const sutun = eylem.startsWith("sabit") ? "pinned_at" : "locked_at";
        const acilis = eylem === "sabitle" || eylem === "kilitle";
        const [s]: any = await pool.query(
          `UPDATE topics SET ${ISLEM[eylem][0]} WHERE id = ? AND deleted_at IS NULL AND ${sutun} IS ${acilis ? "NULL" : "NOT NULL"}`, [id]);
        basarili = s.affectedRows > 0; kayit = ISLEM[eylem][1];
      }
    }
    if (basarili) { tamam++; await denetim(req, res, kayit, hedefTur, id, ayrinti); } else degismeyen++;
  }

  const parcalar = [`${tamam} öğe işlendi`];
  if (degismeyen) parcalar.push(`${degismeyen} öğede değişiklik gerekmedi`);
  if (atlanan) parcalar.push(`${atlanan} öğe yönetici içeriği olduğu için atlandı`);
  bildir(req, tamam ? "basari" : "hata", parcalar.join(", ") + ".");
  res.redirect(geri);
});

// ---------------------------------------------------------------------------
// Kategoriler
// ---------------------------------------------------------------------------
const KATEGORILER = "/yonetim/forum/kategoriler";
yonetimIcerik.use(KATEGORILER, sadeceAdmin); // kategori yapısını yalnızca admin değiştirir (GET ve POST)

function kategoriAlanlari(body: any): { hata?: string; ad: string; aciklama: string | null; sira: number } {
  const ad = metin(body.name);
  const aciklama = metin(body.description);
  const sira = Number(metin(body.sort_order) || 0);
  let hata: string | undefined;
  if (ad.length < 2 || ad.length > 64) hata = "Kategori adı 2 ile 64 karakter arasında olmalı.";
  else if (aciklama.length > 255) hata = "Açıklama en fazla 255 karakter olabilir.";
  else if (!Number.isInteger(sira) || Math.abs(sira) > 100000) hata = "Sıra, tam bir sayı olmalı.";
  return { hata, ad, aciklama: aciklama || null, sira };
}

yonetimIcerik.get(KATEGORILER, async (req, res) => {
  const [kategoriler] = await pool.query(
    `SELECT categories.id, categories.name, categories.description, categories.sort_order,
            (SELECT COUNT(*) FROM topics WHERE topics.category_id = categories.id) AS konu_sayisi
       FROM categories ORDER BY categories.sort_order, categories.id`
  );
  res.render("yonetim/kategoriler", { baslik: "Forum", aktif: "forum", kategoriler });
});

yonetimIcerik.post(KATEGORILER, async (req, res) => {
  const a = kategoriAlanlari(req.body);
  if (a.hata) { bildir(req, "hata", a.hata); return res.redirect(KATEGORILER); }
  const [var_]: any = await pool.query("SELECT id FROM categories WHERE name = ?", [a.ad]);
  if (var_[0]) { bildir(req, "hata", "Bu adda bir kategori zaten var."); return res.redirect(KATEGORILER); }
  const [s]: any = await pool.query("INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)", [a.ad, a.aciklama, a.sira]);
  await denetim(req, res, "kategori.ekle", "kategori", s.insertId, { ad: a.ad });
  bildir(req, "basari", `“${a.ad}” kategorisi eklendi.`);
  res.redirect(KATEGORILER);
});

yonetimIcerik.post(KATEGORILER + "/:id/duzenle", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const a = kategoriAlanlari(req.body);
  const [eski]: any = await pool.query("SELECT name, description, sort_order FROM categories WHERE id = ?", [id]);
  if (!eski[0]) return next();
  if (a.hata) { bildir(req, "hata", a.hata); return res.redirect(KATEGORILER); }
  const [var_]: any = await pool.query("SELECT id FROM categories WHERE name = ? AND id <> ?", [a.ad, id]);
  if (var_[0]) { bildir(req, "hata", "Bu adda başka bir kategori zaten var."); return res.redirect(KATEGORILER); }
  await pool.query("UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ?", [a.ad, a.aciklama, a.sira, id]);
  await denetim(req, res, "kategori.duzenle", "kategori", id, { eski: eski[0], yeni: { name: a.ad, description: a.aciklama, sort_order: a.sira } });
  bildir(req, "basari", "Kategori güncellendi.");
  res.redirect(KATEGORILER);
});

// Silme: konusu olan kategori (silinmiş konular dahil: FK RESTRICT) silinmez; önce konular başka kategoriye taşınır.
yonetimIcerik.post(KATEGORILER + "/:id/sil", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [kat]: any = await pool.query("SELECT name, (SELECT COUNT(*) FROM topics WHERE category_id = categories.id) AS konu FROM categories WHERE id = ?", [id]);
  if (!kat[0]) return next();
  if (Number(kat[0].konu) > 0) {
    bildir(req, "hata", `“${kat[0].name}” kategorisinde ${kat[0].konu} konu var, silinemez. Önce konuları başka kategoriye taşı.`);
    return res.redirect(KATEGORILER);
  }
  await pool.query("DELETE FROM categories WHERE id = ?", [id]);
  await denetim(req, res, "kategori.sil", "kategori", id, { ad: kat[0].name });
  bildir(req, "basari", `“${kat[0].name}” kategorisi silindi.`);
  res.redirect(KATEGORILER);
});

// Bir kategorinin bütün konularını (silinmişler dahil) başka kategoriye taşı
yonetimIcerik.post(KATEGORILER + "/:id/tasi", async (req, res, next) => {
  const id = sayi(req.params.id);
  const hedefId = sayi(req.body.hedef);
  if (!id) return next();
  const [kat]: any = await pool.query("SELECT id, name FROM categories WHERE id IN (?, ?)", [id, hedefId ?? 0]);
  const kaynak = kat.find((c: any) => c.id === id), hedef = kat.find((c: any) => c.id === hedefId);
  if (!kaynak) return next();
  if (!hedef || hedefId === id) { bildir(req, "hata", "Farklı bir hedef kategori seç."); return res.redirect(KATEGORILER); }
  const [s]: any = await pool.query("UPDATE topics SET category_id = ? WHERE category_id = ?", [hedefId, id]);
  await denetim(req, res, "kategori.konulari_tasi", "kategori", id, { hedef: hedef.name, adet: s.affectedRows });
  bildir(req, "basari", `${s.affectedRows} konu “${hedef.name}” kategorisine taşındı. Kategoriyi artık silebilirsin.`);
  res.redirect(KATEGORILER);
});

// ---------------------------------------------------------------------------
// Rütbeler: ad + en az puan. min_points = 0 olan "taban" rütbe her zaman kalmalı:
// puanı en düşük kullanıcı bile bir rütbe alsın (rutbeSql en yüksek eşiği seçer, eşik yoksa NULL gelirdi).
// ---------------------------------------------------------------------------
const RUTBELER = "/yonetim/puan/rutbeler";

yonetimIcerik.use("/yonetim/puan/rutbeler", sadeceAdmin);
yonetimIcerik.use("/yonetim/puan/rozetler", sadeceAdmin);

function rutbeAlanlari(body: any) {
  const ad = metin(body.name);
  const ham = metin(body.min_points);
  const puan = Number(ham);
  let hata: string | undefined;
  if (ad.length < 2 || ad.length > 32) hata = "Rütbe adı 2 ile 32 karakter arasında olmalı.";
  else if (ham === "" || !Number.isInteger(puan) || puan < 0 || puan > 10_000_000) hata = "En az puan, 0 ile 10.000.000 arasında tam bir sayı olmalı.";
  return { hata, ad, puan };
}

yonetimIcerik.get(RUTBELER, async (req, res) => {
  const [rutbeler] = await pool.query(
    `SELECT ranks.id, ranks.name, ranks.min_points,
            (SELECT COUNT(*) FROM users WHERE users.deleted_at IS NULL AND ${rutbeSql("users")} = ranks.name) AS kullanici_sayisi
       FROM ranks ORDER BY ranks.min_points`
  );
  res.render("yonetim/rutbeler", { baslik: "Puan ve ödüller", aktif: "puan", rutbeler });
});

yonetimIcerik.post(RUTBELER, async (req, res) => {
  const a = rutbeAlanlari(req.body);
  if (a.hata) { bildir(req, "hata", a.hata); return res.redirect(RUTBELER); }
  const [var_]: any = await pool.query("SELECT name, min_points FROM ranks WHERE name = ? OR min_points = ?", [a.ad, a.puan]);
  if (var_[0]) { bildir(req, "hata", var_[0].name === a.ad ? "Bu adda bir rütbe zaten var." : `${a.puan} puanlık bir rütbe zaten var (${var_[0].name}).`); return res.redirect(RUTBELER); }
  const [s]: any = await pool.query("INSERT INTO ranks (name, min_points) VALUES (?, ?)", [a.ad, a.puan]);
  await denetim(req, res, "rutbe.ekle", "rutbe", s.insertId, { ad: a.ad, min_points: a.puan });
  bildir(req, "basari", `“${a.ad}” rütbesi eklendi.`);
  res.redirect(RUTBELER);
});

yonetimIcerik.post(RUTBELER + "/:id/duzenle", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [eski]: any = await pool.query("SELECT name, min_points FROM ranks WHERE id = ?", [id]);
  if (!eski[0]) return next();
  const a = rutbeAlanlari(req.body);
  let hata = a.hata;
  if (!hata && eski[0].min_points === 0 && a.puan !== 0) hata = "Taban rütbenin (0 puan) eşiği değiştirilemez; adını değiştirebilirsin.";
  if (!hata) {
    const [var_]: any = await pool.query("SELECT name FROM ranks WHERE (name = ? OR min_points = ?) AND id <> ?", [a.ad, a.puan, id]);
    if (var_[0]) hata = "Bu ad ya da puan eşiği başka bir rütbede kullanılıyor.";
  }
  if (hata) { bildir(req, "hata", hata); return res.redirect(RUTBELER); }
  await pool.query("UPDATE ranks SET name = ?, min_points = ? WHERE id = ?", [a.ad, a.puan, id]);
  await denetim(req, res, "rutbe.duzenle", "rutbe", id, { eski: eski[0], yeni: { name: a.ad, min_points: a.puan } });
  bildir(req, "basari", "Rütbe güncellendi.");
  res.redirect(RUTBELER);
});

yonetimIcerik.post(RUTBELER + "/:id/sil", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [eski]: any = await pool.query("SELECT name, min_points FROM ranks WHERE id = ?", [id]);
  if (!eski[0]) return next();
  if (eski[0].min_points === 0) { bildir(req, "hata", "Taban rütbe (0 puan) silinemez."); return res.redirect(RUTBELER); }
  await pool.query("DELETE FROM ranks WHERE id = ?", [id]);
  await denetim(req, res, "rutbe.sil", "rutbe", id, eski[0]);
  bildir(req, "basari", `“${eski[0].name}” rütbesi silindi; o puandakiler bir alt rütbeye düştü.`);
  res.redirect(RUTBELER);
});

// ---------------------------------------------------------------------------
// Rozet tanımları + elle rozet verme.
// Kodun adıyla verdiği rozetler (rozetVer("İlk Konu") gibi) silinemez ve yeniden adlandırılamaz: ad değişirse
// rozet artık hiç verilmez, sessizce bozulur.
// ---------------------------------------------------------------------------
const ROZETLER = "/yonetim/puan/rozetler";
const KODDAKI_ROZETLER = ["Kurucu", "İlk Konu", "Yardımsever"];

function rozetAlanlari(body: any) {
  const ad = metin(body.name);
  const aciklama = metin(body.description);
  let hata: string | undefined;
  if (ad.length < 2 || ad.length > 64) hata = "Rozet adı 2 ile 64 karakter arasında olmalı.";
  else if (aciklama.length < 2 || aciklama.length > 255) hata = "Açıklama 2 ile 255 karakter arasında olmalı.";
  return { hata, ad, aciklama };
}

yonetimIcerik.get(ROZETLER, async (req, res) => {
  const [rozetler] = await pool.query(
    `SELECT badges.id, badges.name, badges.description,
            (SELECT COUNT(*) FROM user_badges WHERE user_badges.badge_id = badges.id) AS sahip_sayisi
       FROM badges ORDER BY badges.name`
  );
  res.render("yonetim/rozetler", { baslik: "Puan ve ödüller", aktif: "puan", rozetler, korunan: KODDAKI_ROZETLER });
});

yonetimIcerik.post(ROZETLER, async (req, res) => {
  const a = rozetAlanlari(req.body);
  if (a.hata) { bildir(req, "hata", a.hata); return res.redirect(ROZETLER); }
  const [var_]: any = await pool.query("SELECT id FROM badges WHERE name = ?", [a.ad]);
  if (var_[0]) { bildir(req, "hata", "Bu adda bir rozet zaten var."); return res.redirect(ROZETLER); }
  const [s]: any = await pool.query("INSERT INTO badges (name, description) VALUES (?, ?)", [a.ad, a.aciklama]);
  await denetim(req, res, "rozet.ekle", "rozet", s.insertId, { ad: a.ad });
  bildir(req, "basari", `“${a.ad}” rozeti eklendi.`);
  res.redirect(ROZETLER);
});

// Elle rozet verme: /ver, "/:id/..." yollarından ÖNCE tanımlı olmalı değil (farklı kalıp) ama okunabilirlik için burada
yonetimIcerik.post(ROZETLER + "/ver", async (req, res) => {
  const adi = metin(req.body.kullanici);
  const [kisi]: any = await pool.query("SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL", [adi]);
  const [rozet]: any = await pool.query("SELECT id, name FROM badges WHERE id = ?", [sayi(req.body.badge_id)]);
  if (!kisi[0]) { bildir(req, "hata", "Bu adda bir kullanıcı yok."); return res.redirect(ROZETLER); }
  if (!rozet[0]) { bildir(req, "hata", "Rozet seç."); return res.redirect(ROZETLER); }
  const [var_]: any = await pool.query("SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?", [kisi[0].id, rozet[0].id]);
  if (var_[0]) { bildir(req, "hata", `${kisi[0].username} bu rozete zaten sahip.`); return res.redirect(ROZETLER); }
  await rozetVer(kisi[0].id, rozet[0].name);
  await denetim(req, res, "kullanici.rozet_ver", "kullanici", kisi[0].id, { rozet: rozet[0].name, kaynak: "rozet sayfası" });
  bildir(req, "basari", `${kisi[0].username} kullanıcısına “${rozet[0].name}” rozeti verildi.`);
  res.redirect(ROZETLER);
});

yonetimIcerik.post(ROZETLER + "/:id/duzenle", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [eski]: any = await pool.query("SELECT name, description FROM badges WHERE id = ?", [id]);
  if (!eski[0]) return next();
  const a = rozetAlanlari(req.body);
  let hata = a.hata;
  if (!hata && KODDAKI_ROZETLER.includes(eski[0].name) && a.ad !== eski[0].name) hata = "Bu rozetin adı kodda kullanılıyor, değiştirilemez (açıklamayı değiştirebilirsin).";
  if (!hata) {
    const [var_]: any = await pool.query("SELECT id FROM badges WHERE name = ? AND id <> ?", [a.ad, id]);
    if (var_[0]) hata = "Bu adda başka bir rozet zaten var.";
  }
  if (hata) { bildir(req, "hata", hata); return res.redirect(ROZETLER); }
  await pool.query("UPDATE badges SET name = ?, description = ? WHERE id = ?", [a.ad, a.aciklama, id]);
  await denetim(req, res, "rozet.duzenle", "rozet", id, { eski: eski[0], yeni: { name: a.ad, description: a.aciklama } });
  bildir(req, "basari", "Rozet güncellendi.");
  res.redirect(ROZETLER);
});

yonetimIcerik.post(ROZETLER + "/:id/sil", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [eski]: any = await pool.query("SELECT name FROM badges WHERE id = ?", [id]);
  if (!eski[0]) return next();
  if (KODDAKI_ROZETLER.includes(eski[0].name)) { bildir(req, "hata", "Bu rozet kodda kullanılıyor, silinemez."); return res.redirect(ROZETLER); }
  // user_badges satırları ON DELETE CASCADE ile birlikte silinir
  await pool.query("DELETE FROM badges WHERE id = ?", [id]);
  await denetim(req, res, "rozet.sil", "rozet", id, { ad: eski[0].name });
  bildir(req, "basari", `“${eski[0].name}” rozeti ve sahiplikleri silindi.`);
  res.redirect(ROZETLER);
});

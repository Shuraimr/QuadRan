// Yönetim paneli: Forum (Konular, Mesajlar, Kategoriler), Sohbet ve Puan ve ödüller'in Rütbeler/Rozetler sekmeleri.
// Konular/Mesajlar/Sohbet: moderatör + admin. Kategoriler ve Puan ve ödüller: yalnızca admin (sadeceAdmin ile kapılı).
import express from "express";
import { pool } from "../db.ts";
import { bildir, sayi, metin, geriAdres, likeKac, rutbeIdSql, rozetVer } from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import { rutbeOnbellekTemizle, RENKLER, SIMGELER, RENK_ADLARI, SIMGE_ADLARI, AYRICALIKLAR } from "../rutbe.ts";
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
// Rütbeler (sql/13): ad, en az puan, renk, simge ve ayrıcalıklar (oda aç, bağlantı, görsel, video, imza, günlük oy).
// min_points = 0 olan "taban" rütbe her zaman kalmalı: puanı en düşük kullanıcı bile bir rütbe alsın
// (rutbeBul en yüksek eşiği seçer, eşik yoksa rütbesiz kalırdı).
// Tablo tek formdur (hepsi birlikte kaydedilir); alan adları <alan>_<rütbe no> (örn. min_points_3, oda_ac_3).
// ---------------------------------------------------------------------------
const RUTBELER = "/yonetim/puan/rutbeler";

yonetimIcerik.use("/yonetim/puan/rutbeler", sadeceAdmin);
yonetimIcerik.use("/yonetim/puan/rozetler", sadeceAdmin);
yonetimIcerik.use("/yonetim/puan/unvanlar", sadeceAdmin);

const BAYRAKLAR = ["oda_ac", "baglanti", "gorsel", "video", "imza"] as const;
const GUNLUK_OY_ENFAZLA = 1_000_000;

function adHatasi(ad: string) {
  return ad.length < 2 || ad.length > 32 ? "Rütbe adı 2 ile 32 karakter arasında olmalı." : undefined;
}
function esikHatasi(ham: string, puan: number) {
  return ham === "" || !Number.isInteger(puan) || puan < 0 || puan > 10_000_000 ? "En az puan, 0 ile 10.000.000 arasında tam bir sayı olmalı." : undefined;
}

yonetimIcerik.get(RUTBELER, async (req, res) => {
  const [rutbeSatirlari]: any = await pool.query(
    `SELECT ranks.id, ranks.name, ranks.min_points, ranks.renk, ranks.simge, ranks.oda_ac, ranks.baglanti, ranks.gorsel,
            ranks.video, ranks.imza, ranks.gunluk_oy, ranks.aylik_yakut,
            (SELECT COUNT(*) FROM users WHERE users.deleted_at IS NULL AND ${rutbeIdSql("users")} = ranks.id) AS kullanici_sayisi
       FROM ranks ORDER BY ranks.min_points`
  );
  res.render("yonetim/rutbeler", {
    baslik: "Puan ve ödüller", aktif: "puan", rutbeler: rutbeSatirlari, renkler: RENKLER, renkAdlari: RENK_ADLARI,
    simgeler: SIMGELER, simgeAdlari: SIMGE_ADLARI, ayricaliklar: AYRICALIKLAR,
  });
});

// Yeni rütbe: ayrıcalıkları, eşiğin hemen altındaki rütbeden kopyalanır (üst rütbe alttakinin hepsini korur, sonra panelde ayarlanır)
yonetimIcerik.post(RUTBELER, async (req, res) => {
  const ad = metin(req.body.name), ham = metin(req.body.min_points), puan = Number(ham);
  // Renk/simge geçersizse sessizce varsayılana düşmeyiz (Kaydet ile aynı davranış): kullanıcı ne seçtiğinin kabul edilmediğini bilmeli
  const renk = req.body.renk, simge = req.body.simge;
  const hata = adHatasi(ad) ?? esikHatasi(ham, puan)
    ?? (!RENKLER.includes(renk) || !SIMGELER.includes(simge) ? "Geçersiz renk ya da simge." : undefined);
  if (hata) { bildir(req, "hata", hata); return res.redirect(RUTBELER); }
  const [var_]: any = await pool.query("SELECT name, min_points FROM ranks WHERE name = ? OR min_points = ?", [ad, puan]);
  if (var_[0]) { bildir(req, "hata", var_[0].name === ad ? "Bu adda bir rütbe zaten var." : `${puan} puanlık bir rütbe zaten var (${var_[0].name}).`); return res.redirect(RUTBELER); }
  const [alt]: any = await pool.query("SELECT oda_ac, baglanti, gorsel, video, imza, gunluk_oy, aylik_yakut FROM ranks WHERE min_points < ? ORDER BY min_points DESC LIMIT 1", [puan]);
  const a = alt[0] ?? { oda_ac: 0, baglanti: 0, gorsel: 0, video: 0, imza: 0, gunluk_oy: 20, aylik_yakut: 40 };
  const [s]: any = await pool.query(
    "INSERT INTO ranks (name, min_points, renk, simge, oda_ac, baglanti, gorsel, video, imza, gunluk_oy, aylik_yakut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [ad, puan, renk, simge, a.oda_ac, a.baglanti, a.gorsel, a.video, a.imza, a.gunluk_oy, a.aylik_yakut]
  );
  rutbeOnbellekTemizle();
  await denetim(req, res, "rutbe.ekle", "rutbe", s.insertId, { ad, min_points: puan, renk, simge });
  bildir(req, "basari", `“${ad}” rütbesi eklendi; ayrıcalıkları bir alttaki rütbeden kopyalandı, tablodan düzenleyebilirsin.`);
  res.redirect(RUTBELER);
});

// Tabloyu kaydet: bütün rütbeler birlikte doğrulanır; tek hata varsa hiçbiri yazılmaz
yonetimIcerik.post(RUTBELER + "/kaydet", async (req, res) => {
  const [eskiler]: any = await pool.query("SELECT id, name, min_points, renk, simge, oda_ac, baglanti, gorsel, video, imza, gunluk_oy, aylik_yakut FROM ranks ORDER BY min_points");
  const yeniler: any[] = [];
  let hata: string | undefined;
  for (const e of eskiler) {
    const ad = metin(req.body["name_" + e.id]);
    const ham = metin(req.body["min_points_" + e.id]);
    const puan = Number(ham);
    const renk = req.body["renk_" + e.id], simge = req.body["simge_" + e.id];
    const oyHam = metin(req.body["gunluk_oy_" + e.id]);
    const oy = oyHam === "" ? null : Number(oyHam); // boş = sınırsız
    hata = hata ?? adHatasi(ad) ?? esikHatasi(ham, puan);
    if (!hata && e.min_points === 0 && puan !== 0) hata = "Taban rütbenin (0 puan) eşiği değiştirilemez; adını değiştirebilirsin.";
    if (!hata && e.min_points !== 0 && puan === 0) hata = "0 puanlık eşik yalnızca taban rütbeye ait.";
    if (!hata && (!RENKLER.includes(renk) || !SIMGELER.includes(simge))) hata = "Geçersiz renk ya da simge.";
    if (!hata && oy !== null && (!Number.isInteger(oy) || oy < 0 || oy > GUNLUK_OY_ENFAZLA)) hata = `Günlük oy 0 ile ${GUNLUK_OY_ENFAZLA} arasında tam sayı olmalı (boş bırakırsan sınırsız).`;
    const yakutHam = metin(req.body["aylik_yakut_" + e.id]), yakutSayi = Number(yakutHam);
    if (!hata && (yakutHam === "" || !Number.isInteger(yakutSayi) || yakutSayi < 0 || yakutSayi > 100_000)) hata = "Aylık yakut 0 ile 100.000 arasında tam sayı olmalı.";
    const yeni: any = { id: e.id, name: ad, min_points: puan, renk, simge, gunluk_oy: oy, aylik_yakut: yakutSayi };
    for (const b of BAYRAKLAR) yeni[b] = req.body[b + "_" + e.id] ? 1 : 0; // işaretli onay kutusu gönderilir, işaretsiz gönderilmez
    yeniler.push(yeni);
  }
  if (!hata) {
    const adlar = new Set(yeniler.map((y) => y.name.toLocaleLowerCase("tr"))), esikler = new Set(yeniler.map((y) => y.min_points));
    if (adlar.size !== yeniler.length) hata = "İki rütbe aynı adı taşıyamaz.";
    else if (esikler.size !== yeniler.length) hata = "İki rütbe aynı puan eşiğini taşıyamaz.";
  }
  if (hata) { bildir(req, "hata", hata); return res.redirect(RUTBELER); }

  const bag = await pool.getConnection();
  try {
    await bag.beginTransaction();
    // İki rütbe adlarını/eşiklerini takas ederse UNIQUE kuralı ara adımda çakışır: önce geçici adlara alınırlar
    for (const y of yeniler) await bag.query("UPDATE ranks SET name = CONCAT('~', id), min_points = 4000000000 + id WHERE id = ?", [y.id]);
    for (const y of yeniler) {
      await bag.query(
        `UPDATE ranks SET name = ?, min_points = ?, renk = ?, simge = ?, oda_ac = ?, baglanti = ?, gorsel = ?, video = ?, imza = ?, gunluk_oy = ?, aylik_yakut = ? WHERE id = ?`,
        [y.name, y.min_points, y.renk, y.simge, y.oda_ac, y.baglanti, y.gorsel, y.video, y.imza, y.gunluk_oy, y.aylik_yakut, y.id]
      );
    }
    await bag.commit();
  } catch (e) {
    await bag.rollback();
    throw e;
  } finally {
    bag.release();
  }
  rutbeOnbellekTemizle();
  // İşlem kaydı: yalnızca değişen rütbeler ve alanlar
  const degisenler: Record<string, unknown> = {};
  for (const y of yeniler) {
    const e = eskiler.find((x: any) => x.id === y.id);
    const fark: Record<string, unknown> = {};
    for (const alan of ["name", "min_points", "renk", "simge", ...BAYRAKLAR, "gunluk_oy", "aylik_yakut"]) {
      const onceki = typeof e[alan] === "boolean" ? Number(e[alan]) : e[alan];
      if (onceki !== y[alan]) fark[alan] = [onceki, y[alan]];
    }
    if (Object.keys(fark).length) degisenler[e.name] = fark;
  }
  // Hiçbir şey değişmediyse işlem kaydına satır yazılmaz (kayıt gürültüsü olmasın)
  if (Object.keys(degisenler).length) await denetim(req, res, "rutbe.duzenle", "rutbe", null, { degisenler });
  bildir(req, "basari", Object.keys(degisenler).length ? "Rütbeler kaydedildi." : "Değişiklik yok.");
  res.redirect(RUTBELER);
});

yonetimIcerik.post(RUTBELER + "/:id/sil", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [eski]: any = await pool.query("SELECT name, min_points FROM ranks WHERE id = ?", [id]);
  if (!eski[0]) return next();
  if (eski[0].min_points === 0) { bildir(req, "hata", "Taban rütbe (0 puan) silinemez."); return res.redirect(RUTBELER); }
  await pool.query("DELETE FROM ranks WHERE id = ?", [id]);
  rutbeOnbellekTemizle();
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

// ---------------------------------------------------------------------------
// Unvan mağazası (sql/22): ekle, ad/fiyat/sıra düzenle, aktif/pasif. SİLME YOK: unvanın sahipleri var (yakut ödemişler);
// kaldırmak istenirse "pasif" yapılır: mağazada görünmez, sahiplerde kalır ama (pasifken) gösterilmez (yardimci.ts › unvanSql).
// ---------------------------------------------------------------------------
const UNVANLAR = "/yonetim/puan/unvanlar";
const UNVAN_FIYAT_ENFAZLA = 100_000;

function unvanAlanlari(body: any) {
  const ad = metin(body.ad);
  const fiyatHam = metin(body.fiyat);
  const fiyat = Number(fiyatHam);
  const siraHam = metin(body.sira);
  const sira = siraHam === "" ? 0 : Number(siraHam);
  let hata: string | undefined;
  if (ad.length < 2 || ad.length > 40) hata = "Unvan adı 2 ile 40 karakter arasında olmalı.";
  else if (fiyatHam === "" || !Number.isInteger(fiyat) || fiyat < 0 || fiyat > UNVAN_FIYAT_ENFAZLA) hata = `Fiyat 0 ile ${UNVAN_FIYAT_ENFAZLA} arasında tam bir sayı olmalı.`;
  else if (!Number.isInteger(sira) || sira < -9999 || sira > 9999) hata = "Sıra −9999 ile 9999 arasında tam bir sayı olmalı.";
  return { hata, ad, fiyat, sira };
}

yonetimIcerik.get(UNVANLAR, async (req, res) => {
  const [unvanlar] = await pool.query(
    `SELECT unvanlar.id, unvanlar.ad, unvanlar.fiyat, unvanlar.aktif, unvanlar.sira,
            (SELECT COUNT(*) FROM kullanici_unvanlari WHERE kullanici_unvanlari.unvan_id = unvanlar.id) AS sahip_sayisi
       FROM unvanlar ORDER BY unvanlar.sira, unvanlar.id`);
  res.render("yonetim/unvanlar", { baslik: "Puan ve ödüller", aktif: "puan", unvanlar });
});

yonetimIcerik.post(UNVANLAR, async (req, res) => {
  const a = unvanAlanlari(req.body);
  if (a.hata) { bildir(req, "hata", a.hata); return res.redirect(UNVANLAR); }
  const [var_]: any = await pool.query("SELECT id FROM unvanlar WHERE ad = ?", [a.ad]);
  if (var_[0]) { bildir(req, "hata", "Bu adda bir unvan zaten var."); return res.redirect(UNVANLAR); }
  const [s]: any = await pool.query("INSERT INTO unvanlar (ad, fiyat, sira) VALUES (?, ?, ?)", [a.ad, a.fiyat, a.sira]);
  await denetim(req, res, "unvan.ekle", "unvan", s.insertId, { ad: a.ad, fiyat: a.fiyat, sira: a.sira });
  bildir(req, "basari", `“${a.ad}” unvanı eklendi.`);
  res.redirect(UNVANLAR);
});

yonetimIcerik.post(UNVANLAR + "/:id/duzenle", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [eski]: any = await pool.query("SELECT ad, fiyat, sira, aktif FROM unvanlar WHERE id = ?", [id]);
  if (!eski[0]) return next();
  const a = unvanAlanlari(req.body);
  let hata = a.hata;
  if (!hata) {
    const [var_]: any = await pool.query("SELECT id FROM unvanlar WHERE ad = ? AND id <> ?", [a.ad, id]);
    if (var_[0]) hata = "Bu adda başka bir unvan zaten var.";
  }
  if (hata) { bildir(req, "hata", hata); return res.redirect(UNVANLAR); }
  // Aktiflik onay kutusundan gelir (işaretli değilse alan hiç gönderilmez); sunucu yalnızca "1"i aktif sayar
  const aktif = req.body.aktif === "1" ? 1 : 0;
  await pool.query("UPDATE unvanlar SET ad = ?, fiyat = ?, sira = ?, aktif = ? WHERE id = ?", [a.ad, a.fiyat, a.sira, aktif, id]);
  await denetim(req, res, "unvan.duzenle", "unvan", id, {
    eski: { ad: eski[0].ad, fiyat: Number(eski[0].fiyat), sira: Number(eski[0].sira), aktif: Number(eski[0].aktif) },
    yeni: { ad: a.ad, fiyat: a.fiyat, sira: a.sira, aktif },
  });
  bildir(req, "basari", "Unvan güncellendi.");
  res.redirect(UNVANLAR);
});

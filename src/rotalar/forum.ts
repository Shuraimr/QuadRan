// Forum: akış (/), konu sayfası, konu açma, cevap, oy, profil, arama, sıralama, şikâyet.
import express from "express";
import { pool } from "../db.ts";
import { yasakliIfade, puanKurallari } from "../ayarlar.ts";
import { SEBEPLER, sebepHatasi } from "../sikayet.ts";
import { engelle, mesajDurumu } from "../gizlilik.ts";
import {
  rutbeSql, skorSql, puanEkle, bildirimGonder, rozetVer, bildir, kisalt,
  girisGerekli, geriAdres, sayi, metin,
} from "../yardimci.ts";

export const forum = express.Router();

// ---------------------------------------------------------------------------
// Konu kartları (partials/gonderi-karti) için ortak sorgu.
// Akış, profil ve arama aynı alanları istediği için tek yerde yazıyoruz.
//
// İç sorgu (t): konuyu, kategorisini, yazarını ve konunun İLK mesajının id'sini bulur.
// Dış sorgu   : ilk mesajın metnini (özet), oy toplamını (skor) ve benim oyumu ekler.
//
// "kosul" ve "siralama" kodun içinden gelen sabit SQL parçalarıdır (kullanıcı girdisi DEĞİL);
// kullanıcıdan gelen değerler her zaman "parametreler" dizisiyle ? yerine konur.
// ---------------------------------------------------------------------------
type KartSecenekleri = { kosul?: string; parametreler?: unknown[]; siralama?: string; limit?: number; benimId?: number | null };

export async function konuKartlari({ kosul = "1 = 1", parametreler = [], siralama = "t.created_at DESC", limit = 50, benimId = null }: KartSecenekleri) {
  const [satirlar]: any = await pool.query(
    `SELECT t.*,
            ilk.content AS ozet,
            ${skorSql("ilk")} AS skor,
            (SELECT value FROM post_votes WHERE post_votes.post_id = ilk.id AND post_votes.user_id = ?) AS benim_oyum,
            (SELECT COUNT(*) FROM posts WHERE posts.topic_id = t.id AND posts.deleted_at IS NULL AND posts.id <> ilk.id) AS yorum_sayisi
       FROM (
         SELECT topics.id, topics.title, topics.created_at, topics.pinned_at, topics.category_id,
                categories.name AS kategori,
                users.username AS yazar,
                ${rutbeSql("users")} AS rutbe,
                (SELECT MIN(posts.id) FROM posts WHERE posts.topic_id = topics.id) AS ilk_post_id
           FROM topics
           JOIN categories ON categories.id = topics.category_id
           JOIN users ON users.id = topics.user_id
          WHERE topics.deleted_at IS NULL AND (${kosul})
       ) AS t
       JOIN posts AS ilk ON ilk.id = t.ilk_post_id
      ORDER BY ${siralama}
      LIMIT ?`,
    [benimId ?? 0, ...parametreler, limit]
  );
  for (const k of satirlar) {
    k.skor = Number(k.skor);
    k.yorum_sayisi = Number(k.yorum_sayisi);
    k.ozet = kisalt(k.ozet, 220);
  }
  return satirlar;
}

// ---------------------------------------------------------------------------
// Akış: /?kategori=2&sirala=yeni|populer|eniyi
// ---------------------------------------------------------------------------
const AKIS_SIRALAMA: Record<string, string> = {
  yeni: "t.created_at DESC",
  populer: "yorum_sayisi DESC, t.created_at DESC",
  eniyi: "skor DESC, t.created_at DESC",
};

forum.get("/", async (req, res) => {
  const kategoriId = sayi(req.query.kategori);
  const sirala = typeof req.query.sirala === "string" && AKIS_SIRALAMA[req.query.sirala] ? req.query.sirala : "yeni";

  const konular = await konuKartlari({
    kosul: kategoriId ? "topics.category_id = ?" : "1 = 1",
    parametreler: kategoriId ? [kategoriId] : [],
    // Sabitlenmiş konular her zaman en üstte (pinned_at IS NULL: sabitliler için 0, diğerleri 1)
    siralama: "t.pinned_at IS NULL, " + AKIS_SIRALAMA[sirala],
    benimId: res.locals.kullanici?.id,
  });

  const [kategoriler] = await pool.query("SELECT id, name FROM categories ORDER BY sort_order, id");

  const [sohbet] = await pool.query(`
    SELECT * FROM (
      SELECT chat_messages.id, chat_messages.content, users.username AS yazar
        FROM chat_messages JOIN users ON users.id = chat_messages.user_id
       WHERE chat_messages.deleted_at IS NULL
       ORDER BY chat_messages.id DESC LIMIT 3
    ) AS son ORDER BY id`);

  const [liderler] = await pool.query(`
    SELECT users.username, users.points, ${rutbeSql("users")} AS rutbe
      FROM users WHERE users.deleted_at IS NULL
     ORDER BY users.points DESC, users.username LIMIT 3`);

  res.render("konular", { konular, kategoriler, sohbet, liderler, kategoriId, sirala, aktifMenu: "akis" });
});

// ---------------------------------------------------------------------------
// Kategoriler: her kategori, konu sayısı ve son konunun tarihiyle
// (Tablet/mobilde akıştaki kategori sütunu gizli; menüdeki "Kategoriler" buraya gelir.)
// LEFT JOIN: hiç konusu olmayan kategoriler de listede kalsın (konu_sayisi 0 olur).
// ---------------------------------------------------------------------------
forum.get("/kategoriler", async (req, res) => {
  const [kategoriler] = await pool.query(
    `SELECT categories.id, categories.name, categories.description,
            COUNT(topics.id) AS konu_sayisi,
            MAX(topics.created_at) AS son_konu
       FROM categories
       LEFT JOIN topics ON topics.category_id = categories.id AND topics.deleted_at IS NULL
      GROUP BY categories.id
      ORDER BY categories.sort_order, categories.id`
  );
  res.render("kategoriler", { kategoriler, aktifMenu: "kategoriler" });
});

// ---------------------------------------------------------------------------
// Konu açma
// (Bu route /konu/:id'den ÖNCE tanımlanmalı; yoksa "yeni" bir id sanılırdı.)
// ---------------------------------------------------------------------------
forum.get("/konu/yeni", girisGerekli("Konu açmak için giriş yapman gerekiyor."), async (req, res) => {
  const [kategoriler] = await pool.query("SELECT id, name FROM categories ORDER BY sort_order, id");
  res.render("konu-yeni", { kategoriler, degerler: { category_id: req.query.kategori }, aktifMenu: "konu-ac" });
});

forum.post("/konu/yeni", girisGerekli("Konu açmak için giriş yapman gerekiyor."), async (req, res) => {
  const k = res.locals.kullanici;
  const degerler = { category_id: sayi(req.body.category_id), title: metin(req.body.title), content: metin(req.body.content) };
  const hatalar: Record<string, string> = {};

  const [kategoriler]: any = await pool.query("SELECT id, name FROM categories ORDER BY sort_order, id");
  if (!kategoriler.some((c: any) => c.id === degerler.category_id)) hatalar.category_id = "Bir kategori seç";
  if (degerler.title.length < 5 || degerler.title.length > 120) hatalar.title = "Başlık 5 ile 120 karakter arasında olmalı";
  if (!degerler.content) hatalar.content = "İçerik boş olamaz";
  if (degerler.content.length > 10000) hatalar.content = "İçerik en fazla 10.000 karakter olabilir";
  // Yasaklı ifade denetimi (yönetim panelinden yönetilir); alan bazında hata verilir
  const yasakBaslik = await yasakliIfade(degerler.title);
  if (yasakBaslik && !hatalar.title) hatalar.title = `Başlıkta yasaklı bir ifade var: “${yasakBaslik}”`;
  const yasakIcerik = await yasakliIfade(degerler.content);
  if (yasakIcerik && !hatalar.content) hatalar.content = `İçerikte yasaklı bir ifade var: “${yasakIcerik}”`;

  if (Object.keys(hatalar).length) {
    return res.status(400).render("konu-yeni", { kategoriler, hatalar, degerler, aktifMenu: "konu-ac" });
  }

  // TRANSACTION: konu ve ilk mesaj birlikte yazılır. Biri başarısız olursa ikisi de geri alınır,
  // böylece "mesajı olmayan konu" gibi yarım veri kalmaz.
  // Transaction tek bir bağlantı üzerinde çalışmalı; bu yüzden havuzdan bir bağlantı ödünç alıyoruz.
  const baglanti = await pool.getConnection();
  let konuId: number;
  try {
    await baglanti.beginTransaction();
    const [konu]: any = await baglanti.query(
      "INSERT INTO topics (category_id, user_id, title) VALUES (?, ?, ?)",
      [degerler.category_id, k.id, degerler.title]
    );
    konuId = konu.insertId;
    await baglanti.query("INSERT INTO posts (topic_id, user_id, content) VALUES (?, ?, ?)", [konuId, k.id, degerler.content]);
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release(); // bağlantıyı havuza geri ver (unutulursa havuz zamanla tükenir)
  }

  await puanEkle(k.id, (await puanKurallari()).konu);
  await rozetVer(k.id, "İlk Konu");
  bildir(req, "basari", "Konun yayınlandı");
  res.redirect("/konu/" + konuId);
});

// ---------------------------------------------------------------------------
// Konu sayfası: /konu/5?sirala=eniyi|yeni
// ---------------------------------------------------------------------------
forum.get("/konu/:id", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next(); // sayı değilse 404'e düşsün

  const [konular]: any = await pool.query(
    `SELECT topics.id, topics.title, topics.created_at, topics.category_id, topics.user_id,
            topics.locked_at, topics.pinned_at,
            categories.name AS kategori,
            users.username AS yazar, users.points AS puan,
            ${rutbeSql("users")} AS rutbe,
            (SELECT COUNT(*) FROM topics t2 WHERE t2.user_id = users.id AND t2.deleted_at IS NULL) AS konu_sayisi
       FROM topics
       JOIN categories ON categories.id = topics.category_id
       JOIN users ON users.id = topics.user_id
      WHERE topics.id = ? AND topics.deleted_at IS NULL`,
    [id]
  );
  const konu = konular[0];
  if (!konu) return next();

  const sirala = req.query.sirala === "yeni" ? "yeni" : "eniyi";
  const [mesajlar]: any = await pool.query(
    `SELECT posts.id, posts.content, posts.created_at, posts.updated_at, posts.deleted_at, posts.user_id,
            users.username AS yazar,
            ${rutbeSql("users")} AS rutbe,
            ${skorSql("posts")} AS skor,
            (SELECT value FROM post_votes WHERE post_votes.post_id = posts.id AND post_votes.user_id = ?) AS benim_oyum
       FROM posts
       JOIN users ON users.id = posts.user_id
      WHERE posts.topic_id = ?
      ORDER BY posts.id`,
    [res.locals.kullanici?.id ?? 0, id]
  );
  for (const m of mesajlar) {
    m.skor = Number(m.skor);
    m.konu_sahibi = m.user_id === konu.user_id;
  }

  // İlk mesaj (konunun metni) her zaman başta kalır; cevaplar seçilen düzene göre sıralanır
  const [ilk, ...cevaplar] = mesajlar;
  if (sirala === "eniyi") cevaplar.sort((a: any, b: any) => b.skor - a.skor || a.id - b.id);
  else cevaplar.sort((a: any, b: any) => b.id - a.id);

  konu.duzenlendi = !!ilk?.updated_at;
  konu.kilitli = !!konu.locked_at;

  const [benzerler] = await pool.query(
    `SELECT topics.id, topics.title,
            (SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes
              WHERE post_votes.post_id = (SELECT MIN(posts.id) FROM posts WHERE posts.topic_id = topics.id)) AS skor
       FROM topics
      WHERE topics.category_id = ? AND topics.id <> ? AND topics.deleted_at IS NULL
      ORDER BY skor DESC, topics.created_at DESC
      LIMIT 5`,
    [konu.category_id, id]
  );

  res.render("konu", { konu, mesajlar: ilk ? [ilk, ...cevaplar] : [], benzerler, sirala });
});

// ---------------------------------------------------------------------------
// Cevap yazma
// ---------------------------------------------------------------------------
forum.post("/konu/:id/cevap", girisGerekli("Cevap yazmak için giriş yapman gerekiyor."), async (req, res, next) => {
  const id = sayi(req.params.id);
  const k = res.locals.kullanici;
  const content = metin(req.body.content);

  const [konular]: any = id
    ? await pool.query("SELECT id, user_id, title, locked_at FROM topics WHERE id = ? AND deleted_at IS NULL", [id])
    : [[]];
  const konu = konular[0];
  if (!konu) return next();

  if (konu.locked_at) {
    bildir(req, "hata", "Bu konu kilitli, yeni cevap yazılamaz.");
    return res.redirect("/konu/" + id);
  }
  if (!content || content.length > 10000) {
    bildir(req, "hata", content ? "Cevap en fazla 10.000 karakter olabilir." : "Cevap boş olamaz.");
    return res.redirect("/konu/" + id + "#cevap");
  }

  const yasak = await yasakliIfade(content);
  if (yasak) {
    bildir(req, "hata", `Cevabında yasaklı bir ifade var: “${yasak}”. Düzenleyip tekrar dene.`);
    return res.redirect("/konu/" + id + "#cevap");
  }

  const [sonuc]: any = await pool.query("INSERT INTO posts (topic_id, user_id, content) VALUES (?, ?, ?)", [id, k.id, content]);
  const mesajId = sonuc.insertId;

  await puanEkle(k.id, (await puanKurallari()).cevap);
  await bildirimGonder({
    alan: konu.user_id, yapan: k.id, tur: "cevap",
    metin: `${k.username} konuna cevap yazdı: “${kisalt(content, 50)}”`,
    link: `/konu/${id}#mesaj-${mesajId}`,
  });
  if (konu.user_id !== k.id) await rozetVer(k.id, "Yardımsever");

  bildir(req, "basari", "Cevabın yayınlandı", { metin: "Görüntüle", link: `/konu/${id}#mesaj-${mesajId}` });
  res.redirect(`/konu/${id}?sirala=yeni#mesaj-${mesajId}`);
});

// ---------------------------------------------------------------------------
// Oy: POST /oy  alanlar: post_id, value (1 ya da -1)
//   Aynı oyu tekrar verirsen oy geri alınır (düğme aç/kapa gibi çalışır).
//   Mesaj sahibinin puanı oy farkı kadar değişir.
// ---------------------------------------------------------------------------
forum.post("/oy", girisGerekli("Oy vermek için giriş yapman gerekiyor."), async (req, res) => {
  const k = res.locals.kullanici;
  const postId = sayi(req.body.post_id);
  const deger = Number(req.body.value);
  const geri = geriAdres(req) + (postId ? `#mesaj-${postId}` : "");

  if (!postId || (deger !== 1 && deger !== -1)) return res.redirect(geri);

  const [mesajlar]: any = await pool.query(
    "SELECT posts.id, posts.user_id, posts.topic_id FROM posts WHERE posts.id = ? AND posts.deleted_at IS NULL",
    [postId]
  );
  const mesaj = mesajlar[0];
  if (!mesaj) {
    bildir(req, "hata", "Bu mesaj artık yok.");
    return res.redirect(geri);
  }
  if (mesaj.user_id === k.id) {
    bildir(req, "hata", "Kendi mesajına oy veremezsin.");
    return res.redirect(geri);
  }

  // Okuma ve yazma aynı transaction'da: iki hızlı tıklama aynı anda gelirse puan iki kez değişmesin.
  // SELECT ... FOR UPDATE o satırı transaction bitene kadar kilitler.
  const oyPuani = (await puanKurallari()).oy; // bir oyun puan değeri (yönetici ayarı)
  const baglanti = await pool.getConnection();
  let fark = 0;
  let yeniArtiOy = false;
  try {
    await baglanti.beginTransaction();
    const [eski]: any = await baglanti.query(
      "SELECT value FROM post_votes WHERE user_id = ? AND post_id = ? FOR UPDATE",
      [k.id, postId]
    );
    const eskiDeger = eski[0]?.value ?? 0;
    if (eskiDeger === deger) {
      await baglanti.query("DELETE FROM post_votes WHERE user_id = ? AND post_id = ?", [k.id, postId]);
      fark = -deger;
    } else {
      await baglanti.query(
        "INSERT INTO post_votes (user_id, post_id, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), created_at = NOW()",
        [k.id, postId, deger]
      );
      fark = deger - eskiDeger;
      yeniArtiOy = eskiDeger === 0 && deger === 1;
    }
    await baglanti.query(
      "UPDATE users SET points = GREATEST(0, CAST(points AS SIGNED) + ?) WHERE id = ?",
      [fark * oyPuani, mesaj.user_id]
    );
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }

  if (yeniArtiOy) {
    await bildirimGonder({
      alan: mesaj.user_id, yapan: k.id, tur: "oy",
      metin: `${k.username} mesajına artı oy verdi`,
      link: `/konu/${mesaj.topic_id}#mesaj-${postId}`,
    });
  }
  res.redirect(geri);
});

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
const ROL_ADLARI: Record<string, string> = { admin: "Yönetici", moderator: "Moderatör", uye: "Üye" };
const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

forum.get("/profil/:username", async (req, res, next) => {
  const [satirlar]: any = await pool.query(
    `SELECT users.id, users.username, users.bio, users.konum, users.web_sitesi, users.avatar_url, users.banner_url, users.created_at, users.points,
            roles.name AS rol,
            ${rutbeSql("users")} AS rutbe,
            (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL) AS konu_sayisi,
            (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id AND posts.deleted_at IS NULL) AS mesaj_sayisi,
            (SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes
               JOIN posts ON posts.id = post_votes.post_id WHERE posts.user_id = users.id) AS alinan_oy
       FROM users
       JOIN roles ON roles.id = users.role_id
      WHERE users.username = ? AND users.deleted_at IS NULL`,
    [req.params.username]
  );
  const profil = satirlar[0];
  if (!profil) return next();
  profil.rol = ROL_ADLARI[profil.rol] ?? profil.rol;
  profil.alinan_oy = Number(profil.alinan_oy);

  const [rutbeler] = await pool.query("SELECT name, min_points FROM ranks ORDER BY min_points");
  const [rozetler] = await pool.query(
    "SELECT badges.name FROM user_badges JOIN badges ON badges.id = user_badges.badge_id WHERE user_badges.user_id = ? ORDER BY user_badges.earned_at",
    [profil.id]
  );
  const sekme = req.query.sekme === "yorumlar" ? "yorumlar" : "konular";
  const konular = sekme === "konular"
    ? await konuKartlari({ kosul: "topics.user_id = ?", parametreler: [profil.id], benimId: res.locals.kullanici?.id })
    : [];

  // Yorumlar sekmesi: kullanıcının CEVAPLARI. Konunun ilk mesajı (konu metni) yorum sayılmaz;
  // o zaten "Konular" sekmesinde kart olarak görünür. Silinmiş mesaj ve silinmiş konu listelenmez.
  let yorumlar: any[] = [];
  if (sekme === "yorumlar") {
    [yorumlar] = (await pool.query(
      `SELECT posts.id, posts.content, posts.created_at, topics.id AS konu_id, topics.title AS konu_baslik
         FROM posts
         JOIN topics ON topics.id = posts.topic_id AND topics.deleted_at IS NULL
        WHERE posts.user_id = ? AND posts.deleted_at IS NULL
          AND posts.id <> (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id)
        ORDER BY posts.created_at DESC, posts.id DESC
        LIMIT 50`,
      [profil.id]
    )) as any;
    for (const y of yorumlar) y.content = kisalt(y.content, 300);
  }

  // Bu haftanın (Pazartesi-Pazar) günlük katkı sayısı = o gün yazdığı mesajlar (konu açılışı da bir mesaj).
  // WEEKDAY(): Pazartesi 0 ... Pazar 6
  const [gunluk]: any = await pool.query(
    `SELECT WEEKDAY(created_at) AS gun, COUNT(*) AS sayi
       FROM posts
      WHERE user_id = ? AND deleted_at IS NULL
        AND created_at >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY
      GROUP BY WEEKDAY(created_at)`,
    [profil.id]
  );
  const bugun = (new Date().getDay() + 6) % 7; // JS: Pazar 0 → bizim düzende 6
  const haftalik = GUNLER.map((gun, i) => ({
    gun,
    sayi: Number(gunluk.find((g: any) => g.gun === i)?.sayi ?? 0),
    bugun: i === bugun,
  }));

  // Ziyaretçi için mesaj/engel durumu: "Mesaj gönder" yalnızca yazabiliyorsa, menüde Engelle ya da Engeli kaldır
  const ben = res.locals.kullanici;
  const durum = ben && ben.id !== profil.id ? await mesajDurumu(ben.id, profil.id) : null;

  res.render("profil", {
    mesajAtabilir: durum === "izinli", engelledim: durum === "ben_engelledim",
    profil, rutbeler, rozetler, konular, haftalik, sekme, yorumlar,
    kendisi: res.locals.kullanici?.id === profil.id,
    aktifMenu: res.locals.kullanici?.id === profil.id ? "profil" : undefined,
  });
});

// ---------------------------------------------------------------------------
// Arama: /ara?q=...&sekme=konular|kullanicilar|kategoriler
// LIKE içinde % ve _ özel karakterdir ("herhangi bir şey" demek); kullanıcı bunları yazarsa
// harfi harfine aransın diye önlerine \ koyuyoruz.
// ---------------------------------------------------------------------------
const likeKac = (s: string) => "%" + s.replace(/[\\%_]/g, "\\$&") + "%";

forum.get("/ara", async (req, res) => {
  const q = metin(req.query.q).slice(0, 100);
  const sekme = ["konular", "kullanicilar", "kategoriler"].includes(req.query.sekme as string) ? (req.query.sekme as string) : "konular";
  if (!q) return res.render("ara", { q, sekme, aktifMenu: "ara" });

  const desen = likeKac(q);
  const konuKosulu = `topics.title LIKE ? OR EXISTS (
      SELECT 1 FROM posts WHERE posts.topic_id = topics.id AND posts.deleted_at IS NULL AND posts.content LIKE ?)`;

  const [[sayilar]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM topics WHERE topics.deleted_at IS NULL AND (${konuKosulu})) AS konular,
            (SELECT COUNT(*) FROM users WHERE users.deleted_at IS NULL AND users.username LIKE ?) AS kullanicilar,
            (SELECT COUNT(*) FROM categories WHERE categories.name LIKE ?) AS kategoriler`,
    [desen, desen, desen, desen]
  );
  for (const s in sayilar) sayilar[s] = Number(sayilar[s]);

  let konular: any[] = [], kullanicilar: any[] = [], kategoriler: any[] = [];
  if (sekme === "konular") {
    konular = await konuKartlari({ kosul: konuKosulu, parametreler: [desen, desen], benimId: res.locals.kullanici?.id });
  } else if (sekme === "kullanicilar") {
    [kullanicilar] = (await pool.query(
      `SELECT users.username, users.points, users.bio, ${rutbeSql("users")} AS rutbe,
              (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL) AS konu_sayisi
         FROM users WHERE users.deleted_at IS NULL AND users.username LIKE ?
        ORDER BY users.points DESC LIMIT 50`,
      [desen]
    )) as any;
  } else {
    [kategoriler] = (await pool.query(
      `SELECT categories.id, categories.name,
              (SELECT COUNT(*) FROM topics WHERE topics.category_id = categories.id AND topics.deleted_at IS NULL) AS konu_sayisi
         FROM categories WHERE categories.name LIKE ? ORDER BY categories.name`,
      [desen]
    )) as any;
  }

  res.render("ara", { q, sekme, sayilar, konular, kullanicilar, kategoriler, aktifMenu: "ara" });
});

// ---------------------------------------------------------------------------
// Sıralama: /siralama?donem=hafta|ay|tum
//   tum  : users.points
//   hafta/ay: aynı puan kuralı yalnızca o dönemdeki olaylara uygulanır (konu +5, cevap +2, alınan oy ±1)
// ---------------------------------------------------------------------------
forum.get("/siralama", async (req, res) => {
  const donem = ["hafta", "ay", "tum"].includes(req.query.donem as string) ? (req.query.donem as string) : "tum";
  // Dönem başlangıcı (SQL ifadesi, sabit metin): bu haftanın Pazartesi'si ya da ayın 1'i
  const baslangic = donem === "hafta" ? "CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY"
                  : donem === "ay"    ? "DATE_FORMAT(CURDATE(), '%Y-%m-01')"
                  : "'1000-01-01'";

  let satirlar: any[];
  if (donem === "tum") {
    [satirlar] = (await pool.query(
      `SELECT users.username, users.points AS puan, ${rutbeSql("users")} AS rutbe,
              (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL) AS konu_sayisi
         FROM users WHERE users.deleted_at IS NULL AND users.points > 0
        ORDER BY users.points DESC, users.username`
    )) as any;
  } else {
    const puan = await puanKurallari();
    // UNION ALL: üç farklı olay türünü tek bir "kim, kaç puan" listesinde alt alta birleştirir,
    // sonra GROUP BY ile kişi başına toplanır.
    [satirlar] = (await pool.query(
      `SELECT users.username, d.puan, ${rutbeSql("users")} AS rutbe,
              (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL
                  AND topics.created_at >= ${baslangic}) AS konu_sayisi
         FROM (
           SELECT user_id, SUM(p) AS puan FROM (
             SELECT user_id, ? AS p FROM topics
              WHERE deleted_at IS NULL AND created_at >= ${baslangic}
             UNION ALL
             SELECT posts.user_id, ? FROM posts
              WHERE posts.deleted_at IS NULL AND posts.created_at >= ${baslangic}
                AND posts.id <> (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id)
             UNION ALL
             SELECT posts.user_id, post_votes.value * ? FROM post_votes
               JOIN posts ON posts.id = post_votes.post_id
              WHERE post_votes.created_at >= ${baslangic}
           ) AS olaylar
           GROUP BY user_id
         ) AS d
         JOIN users ON users.id = d.user_id
        WHERE users.deleted_at IS NULL AND d.puan > 0
        ORDER BY d.puan DESC, users.username`,
      [puan.konu, puan.cevap, puan.oy] // sorgudaki üç ? sırasıyla: konu, cevap, oy puanı
    )) as any;
  }

  const hepsi = satirlar.map((s: any, i: number) => ({ ...s, sira: i + 1, puan: Number(s.puan), konu_sayisi: Number(s.konu_sayisi) }));
  const k = res.locals.kullanici;
  const benim = k
    ? hepsi.find((s) => s.username === k.username) ?? { sira: hepsi.length + 1, username: k.username, rutbe: k.rutbe, puan: 0, konu_sayisi: 0 }
    : null;
  const [rutbeler] = await pool.query("SELECT name, min_points FROM ranks ORDER BY min_points");

  res.render("siralama", { donem, liste: hepsi.slice(0, 50), benim, rutbeler, aktifMenu: "siralama" });
});

// ---------------------------------------------------------------------------
// Şikâyet: bir konu MESAJI, bir KULLANICI, bir SOHBET mesajı ya da (yalnızca alıcı) bir ÖZEL MESAJ şikâyet edilir.
//   POST /sikayet  alanlar: post_id | kullanici (kullanıcı adı) | sohbet_id | mesaj_id, sebep, not, engelle (isteğe bağlı)
//   GET  /sikayet?post_id=7  ya da  ?kullanici=ayse  ya da  ?sohbet_id=3  ya da  ?mesaj_id=5
//        JavaScript kapalıysa pencere yerine bu sayfa açılır
// reports.hedef_tur hangi hedef olduğunu söyler (sql/08_yonetim.sql). Sebepler src/sikayet.ts'te.
// "engelle" işaretliyse şikâyetin yanında yazarı da engelleriz (user_blocks).
// ---------------------------------------------------------------------------

// GET sayfasında "<ad>'i de engelle" kutusu için hedefin yazarının adı (JS'siz yolda pencere data-yazar okuyamaz)
async function hedefYazari(tablo: "posts" | "chat_messages" | "messages", id: number, alici?: number): Promise<string> {
  const sutun = tablo === "messages" ? "sender_id" : "user_id";
  const [satirlar]: any = await pool.query(
    `SELECT users.username FROM ${tablo} JOIN users ON users.id = ${tablo}.${sutun} WHERE ${tablo}.id = ? ${alici ? "AND messages.receiver_id = ?" : ""}`,
    alici ? [id, alici] : [id]
  );
  return satirlar[0]?.username ?? "";
}

forum.get("/sikayet", girisGerekli("Şikâyet etmek için giriş yapman gerekiyor."), async (req, res) => {
  const postId = sayi(req.query.post_id);
  const sohbetId = sayi(req.query.sohbet_id);
  const mesajId = sayi(req.query.mesaj_id);
  const kullanici = metin(req.query.kullanici);
  if (postId) return res.render("sikayet", { post_id: postId, yazar: await hedefYazari("posts", postId) });
  if (sohbetId) return res.render("sikayet", { sohbet_id: sohbetId, yazar: await hedefYazari("chat_messages", sohbetId) });
  if (mesajId) return res.render("sikayet", { mesaj_id: mesajId, yazar: await hedefYazari("messages", mesajId, res.locals.kullanici.id) });
  if (kullanici) return res.render("sikayet", { hedef_kullanici: kullanici, yazar: kullanici });
  bildir(req, "hata", "Şikâyet edilecek öğe seçilmedi.");
  res.redirect(geriAdres(req));
});

// Şikâyet kaydından sonra ortak son adım: istenmişse yazarı engelle, toast göster, geri dön.
// eklendi = INSERT IGNORE'un sonucu (false: aynı şikâyet zaten vardı).
async function sikayetSonu(
  req: express.Request, res: express.Response, eklendi: boolean, yazarId: number, engelleIstendi: boolean, geri: string, hedefAdi: string
) {
  const k = res.locals.kullanici;
  if (engelleIstendi && yazarId !== k.id) await engelle(k.id, yazarId);
  const engelNotu = engelleIstendi && yazarId !== k.id ? " Kullanıcıyı ayrıca engelledin." : "";
  bildir(req, eklendi || engelNotu ? "basari" : "hata",
    eklendi ? "Şikâyetin moderatörlere iletildi. Teşekkürler." + engelNotu
      : engelNotu ? "Bu şikâyeti zaten iletmiştin." + engelNotu : `${hedefAdi} zaten şikâyet etmiştin.`);
  res.redirect(geri);
}

forum.post("/sikayet", girisGerekli("Şikâyet etmek için giriş yapman gerekiyor."), async (req, res) => {
  const k = res.locals.kullanici;
  const postId = sayi(req.body.post_id);
  const sohbetId = sayi(req.body.sohbet_id);
  const mesajId = sayi(req.body.mesaj_id);
  const kullaniciAdi = metin(req.body.kullanici);
  const sebep = SEBEPLER.includes(req.body.sebep) ? req.body.sebep : null;
  const aciklama = metin(req.body.not).slice(0, 1000) || null;
  const engelleIstendi = !!req.body.engelle;

  // Form dört gizli alan gönderir; hangisi doluysa o şikâyet edilir (öncelik: konu mesajı, sohbet, özel mesaj, kullanıcı)
  if (!postId && sohbetId) return sohbetSikayeti(req, res, sohbetId, sebep, aciklama, engelleIstendi);
  if (!postId && mesajId) return ozelMesajSikayeti(req, res, mesajId, sebep, aciklama, engelleIstendi);
  if (!postId && kullaniciAdi) return kullaniciSikayeti(req, res, kullaniciAdi, sebep, aciklama, engelleIstendi);

  const [mesajlar]: any = postId ? await pool.query("SELECT id, user_id, topic_id FROM posts WHERE id = ? AND deleted_at IS NULL", [postId]) : [[]];
  const mesaj = mesajlar[0];
  const geri = mesaj ? `/konu/${mesaj.topic_id}#mesaj-${mesaj.id}` : geriAdres(req);

  const hata = !mesaj ? "Şikâyet edilecek mesaj bulunamadı." : sebepHatasi(sebep, aciklama, "konu_mesaji");
  if (hata) {
    bildir(req, "hata", hata);
    return res.redirect(geri);
  }
  if (mesaj.user_id === k.id) {
    bildir(req, "hata", "Kendi mesajını şikâyet edemezsin.");
    return res.redirect(geri);
  }

  // INSERT IGNORE: aynı kişi aynı mesajı ikinci kez şikâyet ederse UNIQUE kuralı yüzünden eklenmez (hata da vermez)
  const [sonuc]: any = await pool.query(
    "INSERT IGNORE INTO reports (hedef_tur, post_id, reporter_id, sebep, aciklama) VALUES ('konu_mesaji', ?, ?, ?, ?)",
    [postId, k.id, sebep, aciklama]
  );
  await sikayetSonu(req, res, sonuc.affectedRows > 0, mesaj.user_id, engelleIstendi, geri, "Bu mesajı");
});

// Genel sohbet mesajı şikâyeti
async function sohbetSikayeti(req: express.Request, res: express.Response, sohbetId: number, sebep: string | null, aciklama: string | null, engelleIstendi: boolean) {
  const k = res.locals.kullanici;
  const [satirlar]: any = await pool.query("SELECT id, user_id FROM chat_messages WHERE id = ? AND deleted_at IS NULL", [sohbetId]);
  const m = satirlar[0];
  const geri = m ? `/sohbet#s-${m.id}` : "/sohbet";
  const hata = !m ? "Şikâyet edilecek sohbet mesajı bulunamadı." : sebepHatasi(sebep, aciklama, "sohbet_mesaji");
  if (hata) {
    bildir(req, "hata", hata);
    return res.redirect(geri);
  }
  if (m.user_id === k.id) { bildir(req, "hata", "Kendi mesajını şikâyet edemezsin."); return res.redirect(geri); }
  const [sonuc]: any = await pool.query(
    "INSERT IGNORE INTO reports (hedef_tur, chat_message_id, reporter_id, sebep, aciklama) VALUES ('sohbet_mesaji', ?, ?, ?, ?)",
    [sohbetId, k.id, sebep, aciklama]
  );
  await sikayetSonu(req, res, sonuc.affectedRows > 0, m.user_id, engelleIstendi, geri, "Bu mesajı");
}

// Özel mesaj şikâyeti: YALNIZCA mesajın alıcısı şikâyet edebilir (başkası bir konuşmayı göremez, bu yüzden
// mesaj id'sini tahmin ederek de şikâyet açamaz; sorgu receiver_id = ben şartını arar).
async function ozelMesajSikayeti(req: express.Request, res: express.Response, mesajId: number, sebep: string | null, aciklama: string | null, engelleIstendi: boolean) {
  const k = res.locals.kullanici;
  const [satirlar]: any = await pool.query(
    `SELECT messages.id, messages.sender_id, users.username AS gonderen FROM messages JOIN users ON users.id = messages.sender_id
      WHERE messages.id = ? AND messages.receiver_id = ? AND messages.deleted_at IS NULL`,
    [mesajId, k.id]
  );
  const m = satirlar[0];
  const geri = m ? `/mesajlar/${encodeURIComponent(m.gonderen)}#m-${m.id}` : "/mesajlar";
  const hata = !m ? "Şikâyet edilecek mesaj bulunamadı. Yalnızca sana gelen mesajlar şikâyet edilebilir." : sebepHatasi(sebep, aciklama, "ozel_mesaj");
  if (hata) {
    bildir(req, "hata", hata);
    return res.redirect(geri);
  }
  const [sonuc]: any = await pool.query(
    "INSERT IGNORE INTO reports (hedef_tur, message_id, reporter_id, sebep, aciklama) VALUES ('ozel_mesaj', ?, ?, ?, ?)",
    [mesajId, k.id, sebep, aciklama]
  );
  await sikayetSonu(req, res, sonuc.affectedRows > 0, m.sender_id, engelleIstendi, geri, "Bu mesajı");
}

// Profildeki "Şikâyet et": mesaj yerine kullanıcı hedeflenir (reports.reported_user_id)
async function kullaniciSikayeti(req: express.Request, res: express.Response, kullaniciAdi: string, sebep: string | null, aciklama: string | null, engelleIstendi: boolean) {
  const k = res.locals.kullanici;
  const [satirlar]: any = await pool.query("SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL", [kullaniciAdi]);
  const hedef = satirlar[0];
  const geri = hedef ? "/profil/" + hedef.username : geriAdres(req);

  const hata = !hedef ? "Şikâyet edilecek kullanıcı bulunamadı." : sebepHatasi(sebep, aciklama, "kullanici");
  if (hata) {
    bildir(req, "hata", hata);
    return res.redirect(geri);
  }
  if (hedef.id === k.id) {
    bildir(req, "hata", "Kendini şikâyet edemezsin.");
    return res.redirect(geri);
  }
  const [sonuc]: any = await pool.query(
    "INSERT IGNORE INTO reports (hedef_tur, reported_user_id, reporter_id, sebep, aciklama) VALUES ('kullanici', ?, ?, ?, ?)",
    [hedef.id, k.id, sebep, aciklama]
  );
  await sikayetSonu(req, res, sonuc.affectedRows > 0, hedef.id, engelleIstendi, geri, "Bu kullanıcıyı");
}

// Forum: feed (/), topic page, creating a topic, reply, vote, profile, search, ranking, report.
// Forum: akış (/), konu sayfası, konu açma, cevap, oy, profil, arama, sıralama, şikâyet.
import express from "express";
import { pool } from "../db.ts";
import { cevapYazma, ekliCevap, aramaHizi } from "../hiz-siniri.ts";
import { ekliCevapKatmani, ekGirdisi, ekleriIsle, taslakKaydet, type EkDosyasi } from "../ekler.ts";
import { jsonIstiyor, dosyaSil, GorselHatasi } from "../yukleme.ts";
import { premiumMu } from "../premium.ts";
import { yasakliIfade, puanKurallari } from "../ayarlar.ts";
import { SEBEPLER, sebepHatasi } from "../sikayet.ts";
import { engelle, mesajDurumu } from "../gizlilik.ts";
import {
  rutbeSutunlari, avatarSutunlari, profilGorunumSutunlari, skorSql, puanEkle, tavanliPuanEkle, cozumPuaniGeriAl, rutbeKontrol, bildirimGonder, rozetVer, bildir, kisalt,
  girisGerekli, geriAdres, sayi, metin, durumSayfasi,
} from "../yardimci.ts";
import {
  rutbeler, rutbeBul, sonrakiRutbe, acilanlar, gunlukOyHakki, sinirsizOyRutbesi, yetkiliMi, izinli, kilitBilgisi,
} from "../rutbe.ts";

export const forum = express.Router();

// ---------------------------------------------------------------------------
// Shared query for topic cards (partials/gonderi-karti).
// The feed, profile and search all want the same fields, so we write it in one place.
//
// Inner query (t): finds the topic, its category, its author and the id of the topic's FIRST post.
// Outer query    : adds the first post's text (excerpt), the vote total (score) and my own vote.
//
// "kosul" and "siralama" are constant SQL fragments coming from the code (NOT user input);
// values coming from the user are always substituted for ? through the "parametreler" array.
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
                ${rutbeSutunlari("users")},
                (SELECT MIN(posts.id) FROM posts WHERE posts.topic_id = topics.id) AS ilk_post_id,
                EXISTS (SELECT 1 FROM posts WHERE posts.id = topics.cozum_post_id AND posts.deleted_at IS NULL) AS cozuldu
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
    k.cozuldu = !!k.cozuldu;
    k.ozet = kisalt(k.ozet, 220);
  }
  return satirlar;
}

// ---------------------------------------------------------------------------
// Feed: /?kategori=2&sirala=yeni|populer|eniyi
// Akış: /?kategori=2&sirala=yeni|populer|eniyi
// ---------------------------------------------------------------------------
const AKIS_SIRALAMA: Record<string, string> = {
  yeni: "t.created_at DESC",
  populer: "yorum_sayisi DESC, t.created_at DESC",
  eniyi: "skor DESC, t.created_at DESC",
};

forum.get("/", async (req, res) => {
  const kategoriId = sayi(req.query.kategori);
  // The feed has a single row on top: Featured (populer) · New · Following. "Best" was removed from the feed (it is in Discover › Ranking);
  // old ?sirala=eniyi addresses fall back to featured (populer) so they don't break.
  // Akış üstünde tek satır var: Öne çıkan (populer) · Yeni · Takip. "En iyi" akıştan kalktı (Keşfet › Sıralama'da var);
  // eski ?sirala=eniyi adresleri kırılmasın diye öne çıkana (populer) düşer.
  let sirala = typeof req.query.sirala === "string" && AKIS_SIRALAMA[req.query.sirala] ? req.query.sirala : "yeni";
  if (sirala === "eniyi") sirala = "populer";

  // ?akis=takip: only topics from people I follow. If not logged in there is no such choice and the parameter is ignored.
  // ?akis=takip: yalnızca takip ettiklerimin konuları. Giriş yoksa seçim hiç yok, parametre yok sayılır.
  const takipAkisi = req.query.akis === "takip" && !!res.locals.kullanici;
  // The Following tab is "followed people + new order"; there is no separate ordering option
  // Takip sekmesi "takip edilenler + yeni sırası"dır; ayrı bir sıralama seçeneği yok
  if (takipAkisi) sirala = "yeni";
  const kosullar: string[] = [], parametreler: unknown[] = [];
  if (kategoriId) { kosullar.push("topics.category_id = ?"); parametreler.push(kategoriId); }
  if (takipAkisi) { kosullar.push("topics.user_id IN (SELECT followed_id FROM user_follows WHERE follower_id = ?)"); parametreler.push(res.locals.kullanici.id); }
  const konular = await konuKartlari({
    kosul: kosullar.length ? kosullar.join(" AND ") : "1 = 1",
    parametreler,
    // Pinned topics are always at the very top (pinned_at IS NULL: 0 for pinned ones, 1 for the rest)
    // Sabitlenmiş konular her zaman en üstte (pinned_at IS NULL: sabitliler için 0, diğerleri 1)
    siralama: "t.pinned_at IS NULL, " + AKIS_SIRALAMA[sirala],
    benimId: res.locals.kullanici?.id,
  });

  // The category picker (bottom sheet / dropdown) shows the topic count on every row; LEFT JOIN: empty categories are listed too
  // Kategori seçicisi (alttan sayfa / açılır menü) her satırda konu sayısını gösterir; LEFT JOIN: boş kategoriler de listelenir
  const [kategoriler] = await pool.query(
    `SELECT categories.id, categories.name, COUNT(topics.id) AS konu_sayisi
       FROM categories LEFT JOIN topics ON topics.category_id = categories.id AND topics.deleted_at IS NULL
      GROUP BY categories.id ORDER BY categories.sort_order, categories.id`);

  const [sohbet] = await pool.query(`
    SELECT * FROM (
      SELECT chat_messages.id, chat_messages.content, users.username AS yazar, ${avatarSutunlari("users")}
        FROM chat_messages JOIN users ON users.id = chat_messages.user_id
       WHERE chat_messages.deleted_at IS NULL
       ORDER BY chat_messages.id DESC LIMIT 3
    ) AS son ORDER BY id`);

  const [liderler] = await pool.query(`
    SELECT users.username, users.points, ${rutbeSutunlari("users")}
      FROM users WHERE users.deleted_at IS NULL
     ORDER BY users.points DESC, users.username LIMIT 3`);

  // If the following feed is empty there are two separate cases: they follow nobody (send them to Discover) or the people they follow have not opened any topics yet
  // Takip akışı boşsa iki ayrı durum var: hiç kimseyi takip etmiyor (Keşfet'e yönlendir) ya da takip ettikleri henüz konu açmamış
  let takipEdilen = 0;
  if (takipAkisi && konular.length === 0) {
    const [[t]]: any = await pool.query("SELECT COUNT(*) AS n FROM user_follows WHERE follower_id = ?", [res.locals.kullanici.id]);
    takipEdilen = Number(t.n);
  }
  res.render("konular", { konular, kategoriler, sohbet, liderler, kategoriId, sirala, takipAkisi, takipEdilen, aktifMenu: "akis" });
});

// ---------------------------------------------------------------------------
// Categories: each category with its topic count and the date of its latest topic
// (On tablet/mobile the category column in the feed is hidden; the "Categories" item in the menu comes here.)
// LEFT JOIN: categories with no topics stay in the list too (konu_sayisi becomes 0).
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
// Discover: the single door in the phone's bottom menu that opens Categories, Ranking and Search.
// (On desktop/tablet these are in the side menu so they are not added to the menu; they still open by address.)
// Keşfet: telefonun alt menüsünde Kategoriler, Sıralama ve Ara'ya açılan tek kapı.
// (Masaüstü/tablette bunlar kenar menüde olduğu için menüye eklenmez; adresle yine açılır.)
// ---------------------------------------------------------------------------
forum.get("/kesfet", async (req, res) => {
  const [kategoriler] = await pool.query(
    `SELECT categories.id, categories.name, COUNT(topics.id) AS konu_sayisi
       FROM categories
       LEFT JOIN topics ON topics.category_id = categories.id AND topics.deleted_at IS NULL
      GROUP BY categories.id
      ORDER BY categories.sort_order, categories.id`
  );
  const [liderler] = await pool.query(
    `SELECT users.username, users.points FROM users WHERE users.deleted_at IS NULL
      ORDER BY users.points DESC, users.username LIMIT 5`
  );
  res.render("kesfet", { kategoriler, liderler, aktifMenu: "kesfet" });
});

// ---------------------------------------------------------------------------
// Creating a topic
// (This route must be defined BEFORE /konu/:id; otherwise "yeni" would be taken for an id.)
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
  // Banned-phrase check (managed from the admin panel); errors are given per field
  // Yasaklı ifade denetimi (yönetim panelinden yönetilir); alan bazında hata verilir
  const yasakBaslik = await yasakliIfade(degerler.title);
  if (yasakBaslik && !hatalar.title) hatalar.title = `Başlıkta yasaklı bir ifade var: “${yasakBaslik}”`;
  const yasakIcerik = await yasakliIfade(degerler.content);
  if (yasakIcerik && !hatalar.content) hatalar.content = `İçerikte yasaklı bir ifade var: “${yasakIcerik}”`;

  if (Object.keys(hatalar).length) {
    return res.status(400).render("konu-yeni", { kategoriler, hatalar, degerler, aktifMenu: "konu-ac" });
  }

  // TRANSACTION: the topic and its first post are written together. If one fails both are rolled back,
  // so no half-written data like a "topic without a post" is left behind.
  // A transaction must run on a single connection; that is why we borrow one connection from the pool.
  // TRANSACTION: konu ve ilk mesaj birlikte yazılır. Biri başarısız olursa ikisi de geri alınır,
  // böylece "mesajı olmayan konu" gibi yarım veri kalmaz.
  // Transaction tek bir bağlantı üzerinde çalışmalı; bu yüzden havuzdan bir bağlantı ödünç alıyoruz.
  if (!["admin", "moderator"].includes(k.rol) && cevapYazma.kalanDakika("u" + k.id) > 0) {
    hatalar.title = "Çok hızlı yazıyorsun. Biraz bekleyip tekrar dene.";
    return res.status(429).render("konu-yeni", { kategoriler, hatalar, degerler, aktifMenu: "konu-ac" });
  }
  if (!["admin", "moderator"].includes(k.rol)) cevapYazma.say("u" + k.id);

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
    // return the connection to the pool (if forgotten, the pool runs out over time)
    // bağlantıyı havuza geri ver (unutulursa havuz zamanla tükenir)
    baglanti.release();
  }

  await tavanliPuanEkle(k.id, (await puanKurallari()).konu, "konu", konuId); // daily-capped (yardimci.ts) · günlük tavanlı (yardimci.ts)
  await rozetVer(k.id, "İlk Konu");
  bildir(req, "basari", "Konun yayınlandı");
  res.redirect("/konu/" + konuId);
});

// Pin / unpin a topic on the profile (sql/21). Only the topic's owner and a non-deleted topic; everything is checked on the server.
// Konuyu profile sabitle / kaldır (sql/21). Yalnızca konunun sahibi ve silinmemiş konu; her şey sunucuda denetlenir.
async function profilSabitle(req: express.Request, res: express.Response, next: express.NextFunction, sabitle: boolean) {
  const id = sayi(req.params.id);
  if (!id) return next();
  const k = res.locals.kullanici;
  const [[konu]]: any = await pool.query("SELECT id, user_id FROM topics WHERE id = ? AND deleted_at IS NULL", [id]);
  if (!konu) return next();
  if (konu.user_id !== k.id) return durumSayfasi(req, res, 403, { metin: "Bu konu sana ait değil, o yüzden profiline sabitleyemezsin." });
  if (sabitle) {
    await pool.query("UPDATE users SET sabit_konu_id = ? WHERE id = ?", [id, k.id]);
    bildir(req, "basari", "Konu profiline sabitlendi");
  } else {
    // If another topic is pinned, don't touch it: only unpin if this topic is the pinned one
    // Başka bir konu sabitliyse ona dokunma: yalnızca bu konu sabitse kaldır
    await pool.query("UPDATE users SET sabit_konu_id = NULL WHERE id = ? AND sabit_konu_id = ?", [k.id, id]);
    bildir(req, "basari", "Konu profilinden kaldırıldı");
  }
  res.redirect("/konu/" + id);
}
forum.post("/konu/:id/profile-sabitle", girisGerekli(), (req, res, next) => profilSabitle(req, res, next, true));
forum.post("/konu/:id/profilden-kaldir", girisGerekli(), (req, res, next) => profilSabitle(req, res, next, false));

// ---------------------------------------------------------------------------
// Topic page: /konu/5?sirala=eniyi|yeni
// Konu sayfası: /konu/5?sirala=eniyi|yeni
// ---------------------------------------------------------------------------
forum.get("/konu/:id", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next(); // if it is not a number, fall through to 404 · sayı değilse 404'e düşsün

  const [konular]: any = await pool.query(
    `SELECT topics.id, topics.title, topics.created_at, topics.category_id, topics.user_id,
            topics.locked_at, topics.pinned_at, topics.cozum_post_id,
            categories.name AS kategori,
            users.username AS yazar, users.points AS puan, users.imza,
            ${rutbeSutunlari("users")},
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
    `SELECT posts.id, posts.content, posts.created_at, posts.updated_at, posts.deleted_at, posts.user_id, posts.kart_kapali,
            users.username AS yazar, users.imza,
            ${rutbeSutunlari("users")},
            ${skorSql("posts")} AS skor,
            (SELECT value FROM post_votes WHERE post_votes.post_id = posts.id AND post_votes.user_id = ?) AS benim_oyum
       FROM posts
       JOIN users ON users.id = posts.user_id
      WHERE posts.topic_id = ?
      ORDER BY posts.id`,
    [res.locals.kullanici?.id ?? 0, id]
  );
  // Comment attachments (sql/23): attachments of a deleted comment are not fetched (the template already shows "deleted")
  // Yorum ekleri (sql/23): silinmiş yorumun ekleri çekilmez (şablon zaten "silindi" gösterir)
  const ekHaritasi = new Map<number, any[]>();
  const ekIdleri = mesajlar.filter((m: any) => !m.deleted_at).map((m: any) => m.id);
  if (ekIdleri.length) {
    const [ekSatirlari]: any = await pool.query("SELECT id, post_id, tur, adres, genislik, yukseklik, nsfw, nsfw_kim FROM ekler WHERE post_id IN (?) ORDER BY post_id, sira, id", [ekIdleri]);
    for (const e of ekSatirlari) { e.nsfw = !!e.nsfw; (ekHaritasi.get(e.post_id) ?? ekHaritasi.set(e.post_id, []).get(e.post_id)!).push(e); }
  }
  for (const m of mesajlar) {
    m.skor = Number(m.skor);
    m.konu_sahibi = m.user_id === konu.user_id;
    m.ekler = ekHaritasi.get(m.id) ?? [];
  }

  // The first post (the topic's text) always stays at the top; replies are sorted by the chosen order
  // İlk mesaj (konunun metni) her zaman başta kalır; cevaplar seçilen düzene göre sıralanır
  const [ilk, ...cevaplar] = mesajlar;
  if (sirala === "eniyi") cevaplar.sort((a: any, b: any) => b.skor - a.skor || a.id - b.id);
  else cevaplar.sort((a: any, b: any) => b.id - a.id);

  // Solution: the reply marked by the topic owner (if not deleted) is pinned right under the first post, regardless of the ordering
  // Çözüm: konu sahibinin işaretlediği cevap (silinmediyse) ilk mesajın hemen altına sabitlenir, sıralamadan bağımsız
  const cozumIndeks = cevaplar.findIndex((m: any) => m.id === konu.cozum_post_id && !m.deleted_at);
  if (cozumIndeks > 0) cevaplar.unshift(...cevaplar.splice(cozumIndeks, 1));
  if (cozumIndeks >= 0) cevaplar[0].cozum = true;
  konu.cozuldu = cozumIndeks >= 0;
  // The topic owner (or staff) marks the solution; it can be marked in a locked topic too (it is not a new reply, it is an edit)
  // Çözümü konu sahibi (ya da yetkili) işaretler; kilitli konuda da işaretlenebilir (yeni cevap değil, düzenleme)
  const ben = res.locals.kullanici;
  konu.cozumIsaretleyebilir = !!ben && (ben.id === konu.user_id || yetkiliMi(ben.rol));
  // "Pin to my profile / Remove from my profile" in the ⋮ menu is only for the topic's owner; the current state decides which one is shown
  // ⋮ menüsündeki "Profilime sabitle / Profilimden kaldır" yalnızca konunun sahibine; hangisinin görüneceği için mevcut durum
  if (ben && ben.id === konu.user_id) {
    const [[sb]]: any = await pool.query("SELECT sabit_konu_id FROM users WHERE id = ?", [ben.id]);
    konu.profilde_sabit = Number(sb?.sabit_konu_id) === konu.id;
  }

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

  // Reply form: a draft left over from a failed submission with attachments is refilled once; the attachment buttons are either open or a locked card depending on permission
  // Cevap formu: hatalı ekli gönderimden kalan taslak bir kez geri dolar; ek düğmeleri yetkiye göre açık ya da kilitli kart
  let taslak = null;
  if (req.session.cevapTaslagi) {
    if (req.session.cevapTaslagi.konu === id) taslak = req.session.cevapTaslagi;
    delete req.session.cevapTaslagi;
  }
  const ekYetki = ben ? {
    gorsel: kilitBilgisi(ben, "gorsel"), video: kilitBilgisi(ben, "video"),
    baglanti: izinli(ben, "baglanti"),
  } : null;

  res.render("konu", { konu, mesajlar: ilk ? [ilk, ...cevaplar] : [], benzerler, sirala, taslak, ekYetki });
});

// ---------------------------------------------------------------------------
// Writing a reply
// Cevap yazma
// ---------------------------------------------------------------------------
forum.post("/konu/:id/cevap", ...ekliCevapKatmani, async (req, res, next) => {
  const id = sayi(req.params.id);
  const k = res.locals.kullanici;
  const content = metin(req.body.content);
  const girdi = ekGirdisi(req);
  const ekVar = girdi.resimler.length > 0 || !!girdi.video;
  // On error: a client asking for JSON (rubyyard.js XHR) gets the error text and the form is left in place; on the no-JS path the text is refilled from the draft in the session
  // Hatada: JSON isteyen (rubyyard.js XHR) hata metnini alır, formu yerinde bırakır; JS'siz yolda metin oturumdaki taslaktan geri dolar
  const hata = (ileti: string, durum = 400) => {
    if (jsonIstiyor(req)) return res.status(durum).json({ hata: ileti });
    taslakKaydet(req, id ?? 0);
    bildir(req, "hata", ileti);
    return res.redirect("/konu/" + id + "#cevap");
  };

  const [konular]: any = id
    ? await pool.query("SELECT id, user_id, title, locked_at FROM topics WHERE id = ? AND deleted_at IS NULL", [id])
    : [[]];
  const konu = konular[0];
  if (!konu) return next();

  if (konu.locked_at) {
    if (jsonIstiyor(req)) return res.status(400).json({ hata: "Bu konu kilitli, yeni cevap yazılamaz." });
    bildir(req, "hata", "Bu konu kilitli, yeni cevap yazılamaz.");
    return res.redirect("/konu/" + id);
  }
  // With attachments the text may be empty (sharing only a photo is natural); but a reply is never empty of both attachment and text
  // Ek varsa metin boş olabilir (yalnızca fotoğraf paylaşmak doğal); ekle de metinle de boş cevap olmaz
  if ((!content && !ekVar) || content.length > 10000) return hata(content ? "Cevap en fazla 10.000 karakter olabilir." : "Cevap boş olamaz.");
  // Rank privilege (admin/moderator exempt, izinli in src/rutbe.ts): the button is locked in the UI but the server checks too
  // Rütbe ayrıcalığı (admin/moderatör muaf, src/rutbe.ts izinli): arayüzde düğme kilitli ama sunucu da denetler
  if (girdi.resimler.length && !izinli(k, "gorsel")) return hata("Fotoğraf eklemek için rütben yetmiyor.", 403);
  if (girdi.video && !izinli(k, "video")) return hata("Video eklemek için rütben yetmiyor.", 403);

  // Rate limit: staff are exempt. The counter increases after the content validation passes (failed attempts should not use up the allowance).
  // Hız sınırı: yetkililer muaf. Sayaç, içerik doğrulaması geçtikten sonra artar (hatalı denemeler hakkı yemesin).
  const yetkili = ["admin", "moderator"].includes(k.rol);
  if (!yetkili && cevapYazma.kalanDakika("u" + k.id) > 0) return hata("Çok hızlı yazıyorsun. Biraz bekleyip tekrar dene.", 429);
  if (!yetkili && ekVar && ekliCevap.kalanDakika("u" + k.id) > 0) return hata("Çok fazla ekli cevap gönderdin. Biraz bekleyip tekrar dene.", 429);

  const yasak = await yasakliIfade(content);
  if (yasak) return hata(`Cevabında yasaklı bir ifade var: “${yasak}”. Düzenleyip tekrar dene.`);

  // Process the attachments (an invalid file is rejected here, nothing is written)
  // Ekleri işle (geçersiz dosya burada reddedilir, hiçbir şey yazılmaz)
  let ekler: EkDosyasi[] = [];
  if (ekVar) {
    try { ekler = await ekleriIsle(girdi, premiumMu(k)); }
    catch (e) {
      if (e instanceof GorselHatasi) return hata(e.message);
      throw e;
    }
  }

  if (!yetkili) cevapYazma.say("u" + k.id);
  if (!yetkili && ekVar) ekliCevap.say("u" + k.id);
  const kartKapali = req.body.kart_kapali === "1" ? 1 : 0;
  let mesajId: number;
  try {
    const [sonuc]: any = await pool.query("INSERT INTO posts (topic_id, user_id, content, kart_kapali) VALUES (?, ?, ?, ?)", [id, k.id, content, kartKapali]);
    mesajId = sonuc.insertId;
    // +18: if the author ticked the box, ALL attachments of the comment are born flagged (nsfw_kim = author)
    // +18: yazar kutuyu işaretlediyse yorumun bütün ekleri işaretli doğar (nsfw_kim = yazar)
    const nsfw = req.body.nsfw === "1" ? 1 : 0;
    for (let i = 0; i < ekler.length; i++) {
      const e = ekler[i];
      await pool.query(
        "INSERT INTO ekler (post_id, user_id, tur, adres, genislik, yukseklik, boyut, sira, nsfw, nsfw_kim) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [mesajId, k.id, e.tur, e.adres, e.genislik, e.yukseklik, e.boyut, i, nsfw, nsfw ? "yazar" : null]
      );
    }
  } catch (e) {
    // so files are not orphaned on a database error
    // veritabanı hatasında dosyalar yetim kalmasın
    for (const x of ekler) await dosyaSil(x.adres);
    throw e;
  }

  // A reply written to your own topic gives no points: otherwise a person could pile up replies on their own topic to farm points; moreover when the topic is deleted
  // the points of their own replies would remain (the record is not tied to the topic's post). Badge/notification behavior is unchanged.
  // Kendi konusuna yazılan cevap puan getirmez: yoksa kişi kendi konusuna cevap yığıp puan kasabilirdi; üstelik konuyu silince
  // kendi cevaplarının puanı (kayıt konu mesajına bağlı olmadığı için) kalırdı. Rozet/bildirim davranışı değişmedi.
  if (konu.user_id !== k.id) await tavanliPuanEkle(k.id, (await puanKurallari()).cevap, "cevap", mesajId);
  await bildirimGonder({
    alan: konu.user_id, yapan: k.id, tur: "cevap",
    metin: `${k.username} konuna cevap yazdı: “${kisalt(content || (ekler[0]?.tur === "video" ? "Video" : "Fotoğraf"), 50)}”`,
    link: `/konu/${id}#mesaj-${mesajId}`,
  });
  if (konu.user_id !== k.id) await rozetVer(k.id, "Yardımsever");

  const gidilecek = `/konu/${id}?sirala=yeni#mesaj-${mesajId}`;
  bildir(req, "basari", "Cevabın yayınlandı", { metin: "Görüntüle", link: `/konu/${id}#mesaj-${mesajId}` });
  // XHR (submission with a progress bar) does the redirect itself; the toast waits in the session and appears on the target page
  // XHR (ilerleme çubuklu gönderim) yönlendirmeyi kendisi yapar; toast oturumda bekler ve hedef sayfada görünür
  if (jsonIstiyor(req)) return res.json({ yonlendir: gidilecek });
  res.redirect(gidilecek);
});

// ---------------------------------------------------------------------------
// Solution: POST /konu/:id/cozum  field: post_id
//   The topic's owner (or moderator/admin) marks a REPLY as the "solution"; pressing the same reply again removes the mark,
//   pressing another reply moves the solution to that reply (a topic has a single solution). The reply's author gets the solution points (puan_cozum);
//   if the topic owner picks their own reply there are no points (no self-farming). When the mark is removed the points are taken back as 'cozum_geri'.
// Çözüm: POST /konu/:id/cozum  alan: post_id
//   Konunun sahibi (ya da moderatör/admin) bir CEVABI "çözüm" olarak işaretler; aynı cevaba tekrar basınca işaret kalkar,
//   başka bir cevaba basınca çözüm o cevaba geçer (konuda tek çözüm olur). Cevabın yazarı çözüm puanı (puan_cozum) alır;
//   konu sahibi kendi cevabını seçerse puan yok (kendi kendine puan kasılmasın). İşaret kalkınca puan 'cozum_geri' olarak geri alınır.
// ---------------------------------------------------------------------------
forum.post("/konu/:id/cozum", girisGerekli("Çözüm seçmek için giriş yapman gerekiyor."), async (req, res, next) => {
  const id = sayi(req.params.id);
  const k = res.locals.kullanici;
  const postId = sayi(req.body.post_id);
  const [konular]: any = id ? await pool.query("SELECT id, user_id FROM topics WHERE id = ? AND deleted_at IS NULL", [id]) : [[]];
  const konu = konular[0];
  if (!konu) return next();
  if (konu.user_id !== k.id && !yetkiliMi(k.rol)) {
    bildir(req, "hata", "Çözümü yalnızca konunun sahibi seçebilir.");
    return res.redirect("/konu/" + id);
  }
  // Only the non-deleted REPLIES of this topic (the first post, i.e. the topic itself, cannot be the solution)
  // Yalnızca bu konunun silinmemiş CEVAPLARI (ilk mesaj, yani konunun kendisi çözüm olamaz)
  const [cevaplar]: any = postId ? await pool.query(
    `SELECT id, user_id FROM posts WHERE id = ? AND topic_id = ? AND deleted_at IS NULL
        AND id <> (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id)`, [postId, id]) : [[]];
  const cevap = cevaplar[0];
  if (!cevap) {
    bildir(req, "hata", "Çözüm olarak yalnızca bu konunun bir cevabı seçilebilir.");
    return res.redirect("/konu/" + id);
  }

  const kural = await puanKurallari();
  // Decision + taking back points + new points + the mark all in ONE transaction. The topic row is locked with FOR UPDATE: two requests
  // arriving at the same time are processed in order, the second sees the first's result (before, both saw "no solution" and could award +15 twice).
  // Since taking back is done against the "still open points" (cozumPuaniGeriAl), the same solution cannot be taken back twice either.
  // Karar + puan geri alma + yeni puan + işaret TEK transaction'da. Konu satırı FOR UPDATE ile kilitlenir: aynı anda
  // gelen iki istek sırayla işlenir, ikincisi birincinin sonucunu görür (eskiden ikisi de "çözüm yok" görüp iki kez +15 verebilirdi).
  // Geri alma "hâlâ açık puan"a göre yapıldığı için (cozumPuaniGeriAl) aynı çözüm iki kez de geri alınamaz.
  const baglanti = await pool.getConnection();
  const puanlar: { kisi: number; eski: number; yeni: number }[] = [];
  let kaldirildi = false;
  try {
    await baglanti.beginTransaction();
    const [[guncel]]: any = await baglanti.query("SELECT cozum_post_id FROM topics WHERE id = ? FOR UPDATE", [id]);
    if (guncel.cozum_post_id) {
      const [[eski]]: any = await baglanti.query("SELECT id, user_id FROM posts WHERE id = ?", [guncel.cozum_post_id]);
      const geri = eski ? await cozumPuaniGeriAl(eski, konu.user_id, baglanti) : null;
      if (geri) puanlar.push({ kisi: eski.user_id, ...geri });
    }
    if (guncel.cozum_post_id === cevap.id) {
      await baglanti.query("UPDATE topics SET cozum_post_id = NULL WHERE id = ?", [id]);
      kaldirildi = true;
    } else {
      await baglanti.query("UPDATE topics SET cozum_post_id = ? WHERE id = ?", [cevap.id, id]);
      if (cevap.user_id !== konu.user_id) {
        const p = await puanEkle(cevap.user_id, kural.cozum, "cozum", cevap.id, baglanti);
        puanlar.push({ kisi: cevap.user_id, ...p });
      }
    }
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }
  // Rank-up notification and solution notification AFTER the transaction (so the notification row doesn't wait for the users lock)
  // Rütbe atlama bildirimi ve çözüm bildirimi transaction'dan SONRA (bildirim satırı users kilidini beklemesin)
  for (const p of puanlar) await rutbeKontrol(p.kisi, p.eski, p.yeni);
  if (kaldirildi) {
    bildir(req, "basari", "Çözüm işareti kaldırıldı.");
  } else {
    if (cevap.user_id !== konu.user_id) {
      // If an unread "solution" notification already exists for the same reply, don't write a new one: the topic owner must not be able to flood the reply author's
      // inbox by mark-unmark-mark (after reading, a new notification arrives again).
      // Aynı cevap için okunmamış bir "çözüm" bildirimi zaten varsa yenisini yazma: konu sahibi işaretle-kaldır-işaretle
      // yaparak cevap yazarının bildirim kutusunu dolduramasın (okuyunca yeniden bildirim gelir).
      const [[var_]]: any = await pool.query(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND tur = 'cevap' AND link = ? AND read_at IS NULL",
        [cevap.user_id, `/konu/${id}#mesaj-${cevap.id}`]);
      if (!Number(var_.n)) await bildirimGonder({
        alan: cevap.user_id, yapan: k.id, tur: "cevap",
        metin: `${k.username} cevabını çözüm olarak işaretledi`,
        link: `/konu/${id}#mesaj-${cevap.id}`,
      });
    }
    bildir(req, "basari", "Cevap çözüm olarak işaretlendi.");
  }
  res.redirect(`/konu/${id}#mesaj-${cevap.id}`);
});

// Vote: POST /oy  fields: post_id, value (1 or -1)
//   Giving the same vote again takes it back (the button works like a toggle).
//   Points applied to the author = target (vote × puan_oy, 0 when the vote is taken back) − post_votes.puan_etkisi (what has actually been applied so far).
// ---------------------------------------------------------------------------
// Oy: POST /oy  alanlar: post_id, value (1 ya da -1)
//   Aynı oyu tekrar verirsen oy geri alınır (düğme aç/kapa gibi çalışır).
//   Yazara uygulanan puan = hedef (oy × puan_oy, oy geri alınınca 0) − post_votes.puan_etkisi (şimdiye kadar gerçekte uygulanan).
// ---------------------------------------------------------------------------
forum.post("/oy", girisGerekli("Oy vermek için giriş yapman gerekiyor."), async (req, res) => {
  const k = res.locals.kullanici;
  const postId = sayi(req.body.post_id);
  const deger = Number(req.body.value);
  const geri = geriAdres(req) + (postId ? `#mesaj-${postId}` : "");

  if (!postId || (deger !== 1 && deger !== -1)) return res.redirect(geri);

  const [mesajlar]: any = await pool.query(
    // no voting on a message in a deleted topic
    // silinmiş konudaki mesaja oy verilmez
    "SELECT posts.id, posts.user_id, posts.topic_id FROM posts JOIN topics ON topics.id = posts.topic_id WHERE posts.id = ? AND posts.deleted_at IS NULL AND topics.deleted_at IS NULL",
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

  // Read and write in the same transaction: so the points don't change twice if two quick clicks arrive at the same time.
  // SELECT ... FOR UPDATE locks that row until the transaction ends.
  // Okuma ve yazma aynı transaction'da: iki hızlı tıklama aynı anda gelirse puan iki kez değişmesin.
  // SELECT ... FOR UPDATE o satırı transaction bitene kadar kilitler.
  const oyPuani = (await puanKurallari()).oy; // point value of one vote (admin setting) · bir oyun puan değeri (yönetici ayarı)
  let yeniArtiOy = false;
  let puanDegisimi: { eski: number; yeni: number } | null = null;
  let dolduHak: number | null = null; // the allowance count if the daily vote allowance is used up · günlük oy hakkı dolduysa hak sayısı
  // The transaction is in a function: MySQL kills one of two transactions that take locks in opposite order with ER_LOCK_DEADLOCK (1213); then
  // the whole operation can be retried from the start (nothing has been written). The state variables are reset on every attempt.
  // Transaction bir fonksiyonda: MySQL ters sırada kilit alan iki işlemden birini ER_LOCK_DEADLOCK (1213) ile öldürür; o zaman
  // tüm işlem baştan denenebilir (hiçbir şey yazılmamıştır). Her denemede durum değişkenleri sıfırlanır.
  const islem = async () => {
  yeniArtiOy = false; puanDegisimi = null; dolduHak = null;
  const baglanti = await pool.getConnection();
  try {
    await baglanti.beginTransaction();
    // The voter's row is locked: concurrent votes by the same person are processed IN ORDER. The daily allowance count is also done
    // INSIDE this lock (before it was ahead of the transaction; with 1 allowance left, 4 concurrent requests all saw "0 votes" and could cast 4 votes).
    // The message's author (whose points will change) is locked in the SAME query, in id order: so that two people voting on each other's messages at the same time
    // don't take locks in opposite order and wait for each other. Even this order is not a full guarantee (after commit, the FK check of the notification INSERT
    // may lock the users rows in opposite order), so on a deadlock it is retried below.
    // Oy veren kişinin satırı kilitlenir: aynı kişinin eşzamanlı oyları SIRAYLA işlenir. Günlük hak sayımı da bu kilidin
    // İÇİNDE yapılır (eskiden transaction'dan önceydi; hak 1 iken 4 eşzamanlı istek hepsi "0 oy var" görüp 4 oy verebilirdi).
    // Mesajın yazarı da (puanı değişecek) AYNI sorguda, numara sırasıyla kilitlenir: iki kişi birbirinin mesajına aynı anda
    // oy verirse ters sırada kilit alıp birbirini bekleyerek kilitlenmesinler diye. Bu sırayla bile tam garanti yok (commit sonrası bildirim INSERT'inin FK denetimi
    // users satırlarını ters sırada kilitleyebilir), bu yüzden deadlock olursa aşağıda yeniden denenir.
    await baglanti.query("SELECT id FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE", [k.id, mesaj.user_id]);
    const [eski]: any = await baglanti.query(
      "SELECT value, puan_etkisi, created_at >= CURDATE() AS bugun FROM post_votes WHERE user_id = ? AND post_id = ? FOR UPDATE",
      [k.id, postId]
    );
    const eskiDeger = eski[0]?.value ?? 0;
    // the points this vote has ACTUALLY applied to the author so far (sql/16)
    // bu oyun yazara şimdiye kadar GERÇEKTE uyguladığı puan (sql/16)
    const eskiEtki = Number(eski[0]?.puan_etkisi ?? 0);
    // Daily vote allowance (rank privilege; admins/moderators and unlimited ranks are exempt). TAKING BACK a vote is always free;
    // changing a vote already cast today doesn't spend a new allowance either. The count comes from post_votes.created_at:
    // when a vote is cast/changed the row's date is moved to today, when it is taken back the row is deleted and the allowance returns.
    // Günlük oy hakkı (rütbe ayrıcalığı; yönetici/moderatör ve sınırsız rütbeler muaf). Oy GERİ ALMA her zaman serbest;
    // bugün zaten verilmiş bir oyu tekrar değiştirmek de yeni hak harcamaz. Sayım post_votes.created_at'ten gelir:
    // oy verilince/değişince o satırın tarihi bugüne çekilir, geri alınınca satır silinir ve hak geri döner.
    const hak = gunlukOyHakki(k);
    if (hak !== null && eskiDeger !== deger && !eski[0]?.bugun) {
      const [[say]]: any = await baglanti.query(
        "SELECT COUNT(*) AS n FROM post_votes WHERE user_id = ? AND created_at >= CURDATE()", [k.id]);
      if (Number(say.n) >= hak) dolduHak = hak;
    }
    if (dolduHak !== null) {
      await baglanti.rollback(); // nothing was written; the lock is released · hiçbir şey yazılmadı; kilit bırakılır
    } else {
      // Target: the total effect this vote should have on the author's points after it stays (0 if taken back).
      // Applied to the author = target − applied so far. This path was chosen instead of "vote difference × points": when the points are clamped at 0
      // (puanEkle never goes below zero) a negative vote may not have subtracted anything; the difference calculation would then give extra points afterwards.
      // Hedef: bu oy kaldıktan sonra yazarın puanına yapması gereken toplam etki (geri alınırsa 0).
      // Yazara uygulanan = hedef − şimdiye kadar uygulanan. "Oy farkı × puan" yerine bu yol seçildi: puan 0'da kırpıldığında
      // (puanEkle eksiye inmez) eksi oy hiçbir şey düşürmemiş olabilir; fark hesabı o zaman sonradan fazladan puan verirdi.
      let hedef = 0;
      if (eskiDeger === deger) {
        await baglanti.query("DELETE FROM post_votes WHERE user_id = ? AND post_id = ?", [k.id, postId]);
      } else {
        await baglanti.query(
          "INSERT INTO post_votes (user_id, post_id, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), created_at = NOW()",
          [k.id, postId, deger]
        );
        hedef = deger * oyPuani;
        yeniArtiOy = eskiDeger === 0 && deger === 1;
      }
      // The author's points change (including taking back and negative votes); it is written to the points history as 'oy' (vote)
      // Yazarın puanı değişir (geri alma ve eksi oy dahil); puan geçmişine 'oy' olarak yazılır
      let uygulanan = 0;
      if (hedef - eskiEtki !== 0) {
        puanDegisimi = await puanEkle(mesaj.user_id, hedef - eskiEtki, "oy", postId, baglanti);
        // may be less than requested if it was clamped
        // kırpıldıysa istenenden az olabilir
        uygulanan = puanDegisimi.yeni - puanDegisimi.eski;
      }
      // If the vote stays, write the total actually applied to the row: the next change/take-back corrects exactly that much
      // Oy duruyorsa gerçekte uygulanan toplamı satıra yaz: bir sonraki değişiklik/geri alma tam bu kadarını düzeltir
      if (eskiDeger !== deger) {
        await baglanti.query("UPDATE post_votes SET puan_etkisi = ? WHERE user_id = ? AND post_id = ?", [eskiEtki + uygulanan, k.id, postId]);
      }
      await baglanti.commit();
    }
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }
  };
  let basarili = false;
  for (let deneme = 0; deneme < 3 && !basarili; deneme++) {
    try { await islem(); basarili = true; }
    catch (hata: any) { if (hata?.errno !== 1213) throw hata; } // only a deadlock is retried · yalnızca deadlock yeniden denenir
  }
  if (!basarili) {
    bildir(req, "hata", "Oy şu an kaydedilemedi, tekrar dene.");
    return res.redirect(geri);
  }
  if (dolduHak !== null) {
    const sr = sinirsizOyRutbesi();
    bildir(req, "hata", `Bugünkü oy hakkın doldu (${dolduHak}). ${sr ? sr.name + " rütbesinde sınırsız." : "Yarın yeniden oy verebilirsin."}`,
      { metin: "Rütbeler", link: "/rutbeler" });
    return res.redirect(geri);
  }
  // Rank-up notification AFTER the transaction (so the notification row doesn't wait for the users row's lock)
  // Rütbe atlama bildirimi transaction'dan SONRA (bildirim satırı users satırının kilidini beklemesin)
  if (puanDegisimi) await rutbeKontrol(mesaj.user_id, puanDegisimi.eski, puanDegisimi.yeni);

  // So the same person can't toggle the plus on/off and rain notifications: if an unread vote notification for the same actor + same message exists, a new one is not written
  // Aynı kişi artıyı aç/kapa yapıp bildirim yağdırmasın: aynı yapan + aynı mesaj için okunmamış oy bildirimi varsa yenisi yazılmaz
  let tekrar = false;
  if (yeniArtiOy) {
    const [[var_]]: any = await pool.query(
      "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND actor_id = ? AND tur = 'oy' AND link = ? AND read_at IS NULL",
      [mesaj.user_id, k.id, `/konu/${mesaj.topic_id}#mesaj-${postId}`]);
    tekrar = Number(var_.n) > 0;
  }
  if (yeniArtiOy && !tekrar) {
    await bildirimGonder({
      alan: mesaj.user_id, yapan: k.id, tur: "oy",
      metin: `${k.username} mesajına artı oy verdi`,
      link: `/konu/${mesaj.topic_id}#mesaj-${postId}`,
    });
  }
  res.redirect(geri);
});

// ---------------------------------------------------------------------------
// Profile
// Profil
// ---------------------------------------------------------------------------
const ROL_ADLARI: Record<string, string> = { admin: "Yönetici", moderator: "Moderatör", uye: "Üye" };
const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

// Member card window (Figma 38:75): when the author's name is clicked on topic/post cards, rubyyard.js fetches this partial HTML and shows it in a popover.
// Without JS the link goes to /profil/:ad anyway. Only the card is returned, not a page (no layout).
// Üye kartı penceresi (Figma 38:75): konu/mesaj kartlarında yazar adına tıklayınca rubyyard.js bu kısmi HTML'i getirir ve popover'da gösterir.
// JS yoksa bağlantı zaten /profil/:ad'a gider. Sayfa değil yalnızca kart döner (layout yok).
forum.get("/profil/:username/kart", async (req, res) => {
  const [[u]]: any = await pool.query(
    `SELECT users.id, users.username, users.bio, users.created_at, ${rutbeSutunlari("users")}, ${profilGorunumSutunlari("users")}
       FROM users WHERE users.username = ? AND users.deleted_at IS NULL`, [req.params.username]);
  if (!u) return res.status(404).type("text/plain").send("Kullanıcı bulunamadı");
  const ben = res.locals.kullanici;
  // No "Send message" on your own card; guests do get it (clicking goes to login, like on the profile)
  // Kendi kartında "Mesaj gönder" yok; misafirde var (tıklayınca girişe gider, profildeki gibi)
  const durum = ben && ben.id !== u.id ? await mesajDurumu(ben.id, u.id) : null;
  res.set("Cache-Control", "no-store");
  res.render("partials/profil-karti", { u, mesajAtabilir: !ben ? true : durum === "izinli", profiliAc: true });
});

forum.get("/profil/:username", async (req, res, next) => {
  const [satirlar]: any = await pool.query(
    `SELECT users.id, users.username, users.bio, users.konum, users.web_sitesi, users.created_at, users.points, users.sabit_konu_id,
            ${profilGorunumSutunlari("users")}, -- avatar, banner, effect, decoration, colors (NULL for those tied to premium if not premium) · avatar, banner, efekt, süs, renkler (premium'a bağlı olanlar premium değilse NULL)
            roles.name AS rol,
            ${rutbeSutunlari("users")},
            (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL) AS konu_sayisi,
            (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id AND posts.deleted_at IS NULL) AS mesaj_sayisi,
            (SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes
               JOIN posts ON posts.id = post_votes.post_id WHERE posts.user_id = users.id) AS alinan_oy,
            -- Deleted accounts do not appear in lists, so they are not counted here either (consistent with src/rotalar/takip.ts)
            -- Silinmiş hesaplar listelerde görünmediği için sayıda da sayılmaz (src/rotalar/takip.ts ile tutarlı)
            (SELECT COUNT(*) FROM user_follows f JOIN users u ON u.id = f.follower_id AND u.deleted_at IS NULL WHERE f.followed_id = users.id) AS takipci_sayisi,
            (SELECT COUNT(*) FROM user_follows f JOIN users u ON u.id = f.followed_id AND u.deleted_at IS NULL WHERE f.follower_id = users.id) AS takip_sayisi
       FROM users
       JOIN roles ON roles.id = users.role_id
      WHERE users.username = ? AND users.deleted_at IS NULL`,
    [req.params.username]
  );
  const profil = satirlar[0];
  if (!profil) return next();
  // raw role name for the permission check (it is converted to the Turkish label for display below)
  // yetki denetimi için ham rol adı (aşağıda ekranda gösterilecek Türkçe etikete çevrilir)
  const hamRol = profil.rol;
  profil.rol = ROL_ADLARI[profil.rol] ?? profil.rol;
  profil.alinan_oy = Number(profil.alinan_oy);
  profil.takipci_sayisi = Number(profil.takipci_sayisi);
  profil.takip_sayisi = Number(profil.takip_sayisi);

  // Rank card: all ranks (color/icon/privileges), the current one, the next one and what NEWLY opens at the next one
  // Rütbe kartı: bütün rütbeler (renk/simge/ayrıcalık), şimdiki, sonraki ve sonrakinde YENİ açılanlar
  const tumRutbeler = await rutbeler();
  const simdiki = rutbeBul(profil.points, tumRutbeler)!;
  const sonraki = sonrakiRutbe(profil.points, tumRutbeler);
  const acilacaklar = sonraki ? acilanlar(simdiki, sonraki) : [];
  const [rozetler] = await pool.query(
    "SELECT badges.name FROM user_badges JOIN badges ON badges.id = user_badges.badge_id WHERE user_badges.user_id = ? ORDER BY user_badges.earned_at",
    [profil.id]
  );
  // "puan" (points history) is only visible on a person's own profile; even if someone else asks, Topics opens
  // "puan" (puan geçmişi) yalnızca kişinin kendi profilinde görünür; başkası istese de Konular açılır
  const kendisi = res.locals.kullanici?.id === profil.id;
  const sekme = req.query.sekme === "yorumlar" ? "yorumlar" : req.query.sekme === "etkinlik" ? "etkinlik" : req.query.sekme === "puan" && kendisi ? "puan" : "konular";

  // Showcase (sql/21): pinned topic + up to 3 showcase badges. The pinned topic is shown only if it is still the person's OWN and a non-deleted topic
  // (even if the topic was deleted later or the record was tampered with by hand, someone else's topic doesn't get featured on the profile).
  // Vitrin (sql/21): sabitlenmiş konu + en çok 3 vitrin rozeti. Sabit konu yalnızca hâlâ kişinin KENDİ ve silinmemiş konusuysa
  // gösterilir (konu sonradan silinmiş ya da kayıt elle bozulmuş olsa bile başkasının konusu profilde öne çıkmaz).
  const sabitKonu = profil.sabit_konu_id
    ? (await konuKartlari({ kosul: "topics.id = ? AND topics.user_id = ?", parametreler: [profil.sabit_konu_id, profil.id], benimId: res.locals.kullanici?.id, limit: 1 }))[0] ?? null
    : null;
  const [vitrinRozetleri]: any = await pool.query(
    `SELECT badges.name, badges.description, user_badges.earned_at
       FROM user_badges JOIN badges ON badges.id = user_badges.badge_id
      WHERE user_badges.user_id = ? AND user_badges.vitrin_sira IS NOT NULL
      ORDER BY user_badges.vitrin_sira LIMIT 3`,
    [profil.id]
  );
  const konular = sekme === "konular"
    ? await konuKartlari({ kosul: "topics.user_id = ?", parametreler: [profil.id], benimId: res.locals.kullanici?.id })
    : [];

  // Comments tab: the user's REPLIES. The topic's first post (the topic text) does not count as a comment;
  // it already appears as a card in the "Topics" tab. Deleted posts and deleted topics are not listed.
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

  // Activity tab: ONLY public actions (opening a topic, reply, badge, follow). Secret things like votes, points and private messages
  // are deliberately absent. Four sources are merged into one list with UNION ALL, newest first, at most 30 rows.
  // Columns: tur, zaman, konu_id (if any), baslik (topic title / badge name / followed person), ek (reply text / badge description), ek_id (reply id).
  // Etkinlik sekmesi: YALNIZCA herkese açık eylemler (konu açma, cevap, rozet, takip). Oy, puan, özel mesaj gibi gizli şeyler
  // bilerek yok. Dört kaynak UNION ALL ile tek listede birleşir, zamana göre yeniden eskiye en çok 30 satır.
  // Sütunlar: tur, zaman, konu_id (varsa), baslik (konu başlığı / rozet adı / takip edilen), ek (cevap metni / rozet açıklaması), ek_id (cevap id).
  let etkinlikler: any[] = [];
  if (sekme === "etkinlik") {
    [etkinlikler] = (await pool.query(
      `(SELECT 'konu' AS tur, t.created_at AS zaman, t.id AS konu_id, t.title AS baslik, NULL AS ek, NULL AS ek_id
          FROM topics t WHERE t.user_id = ? AND t.deleted_at IS NULL)
       UNION ALL
       (SELECT 'cevap', p.created_at, t.id, t.title, p.content, p.id
          FROM posts p JOIN topics t ON t.id = p.topic_id AND t.deleted_at IS NULL
         WHERE p.user_id = ? AND p.deleted_at IS NULL
           AND p.id <> (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = p.topic_id))
       UNION ALL
       (SELECT 'rozet', ub.earned_at, NULL, b.name, b.description, NULL
          FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ?)
       UNION ALL
       (SELECT 'takip', f.created_at, NULL, u.username, NULL, NULL
          FROM user_follows f JOIN users u ON u.id = f.followed_id AND u.deleted_at IS NULL WHERE f.follower_id = ?)
       ORDER BY zaman DESC LIMIT 30`,
      [profil.id, profil.id, profil.id, profil.id]
    )) as any;
    for (const e of etkinlikler) if (e.tur === "cevap") e.ek = kisalt(e.ek, 140);
  }

  // Points history (newest first, 100 per page): the reason for each row and, if any, a link to the related topic/post.
  // Pagination: ?once=<log id> = rows OLDER than this id (id < once; used instead of OFFSET, because when a new row is added
  // OFFSET shifts and the same movement would show twice). once is validated with sayi(); 101 rows are requested: the extra one means "there are older ones".
  // Puan geçmişi (yeniden eskiye, sayfa başı 100): her satırın nedeni ve varsa ilgili konu/mesaj bağlantısı.
  // Sayfalama: ?once=<log id> = bu numaradan ESKİ satırlar (id < once; OFFSET yerine kullanılır, çünkü yeni satır eklenince
  // OFFSET kayar ve aynı hareket iki kez görünürdü). once sayi() ile doğrulanır; 101 satır istenir: fazlalık "daha eski var" demektir.
  let puanGecmisi: any[] = [];
  let dahaEskiVar = false;
  const once = sayi(req.query.once);
  if (sekme === "puan") {
    [puanGecmisi] = (await pool.query(
      `SELECT l.id, l.miktar, l.sebep, l.created_at, l.ilgili_id,
              tk.id AS konu_id, tp.id AS mesaj_konu_id, pp.id AS mesaj_id, rz.name AS rozet
         FROM points_log l
         LEFT JOIN topics tk ON l.sebep = 'konu' AND tk.id = l.ilgili_id AND tk.deleted_at IS NULL
         LEFT JOIN posts pp ON l.sebep IN ('cevap','oy','cozum','cozum_geri','silme','geri_yukleme') AND pp.id = l.ilgili_id AND pp.deleted_at IS NULL
         LEFT JOIN topics tp ON tp.id = pp.topic_id AND tp.deleted_at IS NULL
         LEFT JOIN badges rz ON l.sebep IN ('rozet','rozet_geri') AND rz.id = l.ilgili_id
        WHERE l.user_id = ? AND (? IS NULL OR l.id < ?)
        ORDER BY l.id DESC LIMIT 101`, [profil.id, once, once])) as any;
    if (puanGecmisi.length > 100) { dahaEskiVar = true; puanGecmisi = puanGecmisi.slice(0, 100); }
  }

  // This week's (Monday-Sunday) daily contribution count = messages written that day (opening a topic is also a message).
  // WEEKDAY(): Monday 0 ... Sunday 6
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
  const bugun = (new Date().getDay() + 6) % 7; // JS: Sunday 0 → 6 in our layout · JS: Pazar 0 → bizim düzende 6
  const haftalik = GUNLER.map((gun, i) => ({
    gun,
    sayi: Number(gunluk.find((g: any) => g.gun === i)?.sayi ?? 0),
    bugun: i === bugun,
  }));

  // Message/block state for the visitor: "Send message" only if they can write, Block or Unblock in the menu
  // Ziyaretçi için mesaj/engel durumu: "Mesaj gönder" yalnızca yazabiliyorsa, menüde Engelle ya da Engeli kaldır
  const ben = res.locals.kullanici;
  const durum = ben && ben.id !== profil.id ? await mesajDurumu(ben.id, profil.id) : null;

  // Follow button: whether the visitor follows, whether there is a block between us (in either direction). If there is a block the button is not drawn at all.
  // Takip düğmesi: ziyaretçi takip ediyor mu, aramızda (iki yönde) engel var mı. Engel varsa düğme hiç çizilmez.
  let benTakipEdiyorMu = false, aradaEngelVar = false;
  if (ben && ben.id !== profil.id) {
    const [[t]]: any = await pool.query(
      `SELECT (SELECT COUNT(*) FROM user_follows WHERE follower_id = ? AND followed_id = ?) AS takip,
              (SELECT COUNT(*) FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)) AS engel`,
      [ben.id, profil.id, ben.id, profil.id, profil.id, ben.id]
    );
    benTakipEdiyorMu = Number(t.takip) > 0;
    aradaEngelVar = Number(t.engel) > 0;
  }

  res.render("profil", {
    benTakipEdiyorMu, aradaEngelVar,
    mesajAtabilir: durum === "izinli", engelledim: durum === "ben_engelledim",
    profil, rutbeler: tumRutbeler, simdiki, sonraki, acilacaklar, rozetler, konular, haftalik, sekme, yorumlar, etkinlikler, sabitKonu, vitrinRozetleri, puanGecmisi, dahaEskiVar, once, yetkiliProfil: yetkiliMi(hamRol),
    kendisi,
    aktifMenu: res.locals.kullanici?.id === profil.id ? "profil" : "yok",
  });
});

// ---------------------------------------------------------------------------
// Search: /ara?q=...&sekme=konular|kullanicilar|kategoriler
// In LIKE, % and _ are special characters (they mean "anything"); if the user types them
// we put a \ in front of them so they are searched literally.
// Arama: /ara?q=...&sekme=konular|kullanicilar|kategoriler
// LIKE içinde % ve _ özel karakterdir ("herhangi bir şey" demek); kullanıcı bunları yazarsa
// harfi harfine aransın diye önlerine \ koyuyoruz.
// ---------------------------------------------------------------------------
const likeKac = (s: string) => "%" + s.replace(/[\\%_]/g, "\\$&") + "%";

forum.get("/ara", async (req, res) => {
  const q = metin(req.query.q).slice(0, 100);
  const sekme = ["konular", "kullanicilar", "kategoriler"].includes(req.query.sekme as string) ? (req.query.sekme as string) : "konular";
  if (!q) return res.render("ara", { q, sekme, aktifMenu: "ara" });
  // Rate limit only on a real search (q is filled): the empty /ara page is free. For a logged-in user the user is checked, for a guest the IP.
  // Hız sınırı yalnızca gerçek aramada (q dolu): boş /ara sayfası bedava. Giriş yapmışta kullanıcıya, misafirde IP'ye bakılır.
  const aramaAnahtari = res.locals.kullanici ? "u" + res.locals.kullanici.id : "ip" + req.ip;
  const bekleme = aramaHizi.kalanSaniye(aramaAnahtari);
  if (bekleme) return durumSayfasi(req, res, 429, { saniye: bekleme });
  aramaHizi.say(aramaAnahtari);

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
      `SELECT users.username, users.points, users.bio, ${rutbeSutunlari("users")},
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
// Ranking: /siralama?donem=hafta|ay|tum
//   tum  : users.points
//   hafta/ay: the sum of the points written in that period in points_log
// Sıralama: /siralama?donem=hafta|ay|tum
//   tum  : users.points
//   hafta/ay: points_log'da o dönemde yazılan puanların toplamı
// ---------------------------------------------------------------------------
forum.get("/siralama", async (req, res) => {
  const donem = ["hafta", "ay", "tum"].includes(req.query.donem as string) ? (req.query.donem as string) : "tum";
  // Start of the period (SQL expression, constant text): this week's Monday or the 1st of the month
  // Dönem başlangıcı (SQL ifadesi, sabit metin): bu haftanın Pazartesi'si ya da ayın 1'i
  const baslangic = donem === "hafta" ? "CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY"
                  : donem === "ay"    ? "DATE_FORMAT(CURDATE(), '%Y-%m-01')"
                  : "'1000-01-01'";

  let satirlar: any[];
  if (donem === "tum") {
    [satirlar] = (await pool.query(
      `SELECT users.username, users.points AS puan, ${rutbeSutunlari("users")},
              (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL) AS konu_sayisi
         FROM users WHERE users.deleted_at IS NULL AND users.points > 0
        ORDER BY users.points DESC, users.username`
    )) as any;
  } else {
    // Week/month: the per-person total of the amounts written in the points history (points_log) since the start of the period.
    // Since every points change (topic, reply, vote, daily, badge, take-back...) is recorded there one by one,
    // there is no need to recalculate the rules here.
    // Hafta/ay: puan geçmişinde (points_log) dönem başından beri yazılan miktarların kişi başı toplamı.
    // Her puan değişikliği (konu, cevap, oy, günlük, rozet, geri alma...) orada tek tek kayıtlı olduğu için
    // burada kuralları yeniden hesaplamaya gerek yok.
    [satirlar] = (await pool.query(
      `SELECT users.username, d.puan, ${rutbeSutunlari("users")},
              (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL
                  AND topics.created_at >= ${baslangic}) AS konu_sayisi
         FROM (
           SELECT user_id, SUM(miktar) AS puan FROM points_log WHERE created_at >= ${baslangic} GROUP BY user_id
         ) AS d
         JOIN users ON users.id = d.user_id
        WHERE users.deleted_at IS NULL AND d.puan > 0
        ORDER BY d.puan DESC, users.username`
    )) as any;
  }

  const hepsi = satirlar.map((s: any, i: number) => ({ ...s, sira: i + 1, puan: Number(s.puan), konu_sayisi: Number(s.konu_sayisi) }));
  const k = res.locals.kullanici;
  const benim = k
    ? hepsi.find((s) => s.username === k.username) ?? { sira: hepsi.length + 1, username: k.username, rutbe: k.rutbe, rutbe_id: k.rutbe_id, puan: 0, konu_sayisi: 0 }
    : null;

  res.render("siralama", { donem, liste: hepsi.slice(0, 50), benim, rutbeler: await rutbeler(), aktifMenu: "siralama" });
});

// ---------------------------------------------------------------------------
// Report: a topic POST, a USER, a CHAT message or (recipient only) a PRIVATE MESSAGE can be reported.
//   POST /sikayet  fields: post_id | kullanici (username) | sohbet_id | mesaj_id | oda_mesaj_id, sebep, not, engelle (optional)
//   GET  /sikayet?post_id=7  or  ?kullanici=ayse  or  ?sohbet_id=3  or  ?mesaj_id=5  or  ?oda_mesaj_id=9
//        if JavaScript is off, this page opens instead of the window
// reports.hedef_tur says which target it is (sql/08_yonetim.sql). The reasons are in src/sikayet.ts.
// If "engelle" is ticked we also block the author along with the report (user_blocks).
// Şikâyet: bir konu MESAJI, bir KULLANICI, bir SOHBET mesajı ya da (yalnızca alıcı) bir ÖZEL MESAJ şikâyet edilir.
//   POST /sikayet  alanlar: post_id | kullanici (kullanıcı adı) | sohbet_id | mesaj_id | oda_mesaj_id, sebep, not, engelle (isteğe bağlı)
//   GET  /sikayet?post_id=7  ya da  ?kullanici=ayse  ya da  ?sohbet_id=3  ya da  ?mesaj_id=5  ya da  ?oda_mesaj_id=9
//        JavaScript kapalıysa pencere yerine bu sayfa açılır
// reports.hedef_tur hangi hedef olduğunu söyler (sql/08_yonetim.sql). Sebepler src/sikayet.ts'te.
// "engelle" işaretliyse şikâyetin yanında yazarı da engelleriz (user_blocks).
// ---------------------------------------------------------------------------

// For the "block <name> too" box on the GET page, the name of the target's author (on the no-JS path the window cannot read data-yazar)
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
  const odaMesajId = sayi(req.query.oda_mesaj_id);
  const kullanici = metin(req.query.kullanici);
  if (postId) return res.render("sikayet", { post_id: postId, yazar: await hedefYazari("posts", postId) });
  if (sohbetId) return res.render("sikayet", { sohbet_id: sohbetId, yazar: await hedefYazari("chat_messages", sohbetId) });
  if (mesajId) return res.render("sikayet", { mesaj_id: mesajId, yazar: await hedefYazari("messages", mesajId, res.locals.kullanici.id) });
  if (odaMesajId) {
    // Only a member of that room can report (otherwise the message's existence is not revealed either)
    // Yalnızca o odanın üyesi şikâyet edebilir (yoksa mesajın varlığı da söylenmez)
    const [[o]]: any = await pool.query(
      `SELECT u.username FROM room_messages m JOIN users u ON u.id = m.user_id
        WHERE m.id = ? AND m.tur = 'mesaj' AND m.deleted_at IS NULL AND EXISTS (SELECT 1 FROM room_members WHERE room_id = m.room_id AND user_id = ?)`, [odaMesajId, res.locals.kullanici.id]);
    if (o) return res.render("sikayet", { oda_mesaj_id: odaMesajId, yazar: o.username });
  }
  if (kullanici) return res.render("sikayet", { hedef_kullanici: kullanici, yazar: kullanici });
  bildir(req, "hata", "Şikâyet edilecek öğe seçilmedi.");
  res.redirect(geriAdres(req));
});

// Shared final step after saving a report: block the author if asked, show a toast, go back.
// eklendi = result of INSERT IGNORE (false: the same report already existed).
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
  const odaMesajId = sayi(req.body.oda_mesaj_id);
  const kullaniciAdi = metin(req.body.kullanici);
  const sebep = SEBEPLER.includes(req.body.sebep) ? req.body.sebep : null;
  const aciklama = metin(req.body.not).slice(0, 1000) || null;
  const engelleIstendi = !!req.body.engelle;

  // The form sends four hidden fields; whichever is filled is what gets reported (priority: topic post, chat, private message, user)
  // Form dört gizli alan gönderir; hangisi doluysa o şikâyet edilir (öncelik: konu mesajı, sohbet, özel mesaj, kullanıcı)
  if (!postId && sohbetId) return sohbetSikayeti(req, res, sohbetId, sebep, aciklama, engelleIstendi);
  if (!postId && odaMesajId) return odaMesajiSikayeti(req, res, odaMesajId, sebep, aciklama, engelleIstendi);
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

  // INSERT IGNORE: if the same person reports the same message a second time it is not inserted because of the UNIQUE rule (and no error is raised)
  // INSERT IGNORE: aynı kişi aynı mesajı ikinci kez şikâyet ederse UNIQUE kuralı yüzünden eklenmez (hata da vermez)
  const [sonuc]: any = await pool.query(
    "INSERT IGNORE INTO reports (hedef_tur, post_id, reporter_id, sebep, aciklama) VALUES ('konu_mesaji', ?, ?, ?, ?)",
    [postId, k.id, sebep, aciklama]
  );
  await sikayetSonu(req, res, sonuc.affectedRows > 0, mesaj.user_id, engelleIstendi, geri, "Bu mesajı");
});

// General chat message report
// Genel sohbet mesajı şikâyeti
async function sohbetSikayeti(req: express.Request, res: express.Response, sohbetId: number, sebep: string | null, aciklama: string | null, engelleIstendi: boolean) {
  const k = res.locals.kullanici;
  const [satirlar]: any = await pool.query("SELECT id, user_id FROM chat_messages WHERE id = ? AND deleted_at IS NULL", [sohbetId]);
  const m = satirlar[0];
  const geri = m ? `/sohbet?genel=1#s-${m.id}` : "/sohbet?genel=1";
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

// Private message report: ONLY the message's recipient can report (nobody else can see a conversation, so
// they cannot open a report by guessing the message id either; the query looks for the receiver_id = me condition).
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

// Room message report: ONLY a member of that room can report (the query checks membership; a non-member cannot
// open a report by guessing the message id). System rows ("ayse left the room") cannot be reported.
// Oda mesajı şikâyeti: YALNIZCA o odanın üyesi şikâyet edebilir (sorgu üyeliği arar; üye olmayan mesaj id'sini
// tahmin ederek şikâyet açamaz). Sistem satırları ("ayse odadan ayrıldı") şikâyet edilemez.
async function odaMesajiSikayeti(req: express.Request, res: express.Response, odaMesajId: number, sebep: string | null, aciklama: string | null, engelleIstendi: boolean) {
  const k = res.locals.kullanici;
  const [satirlar]: any = await pool.query(
    `SELECT m.id, m.user_id, m.room_id FROM room_messages m
      WHERE m.id = ? AND m.tur = 'mesaj' AND m.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM room_members WHERE room_id = m.room_id AND user_id = ?)`, [odaMesajId, k.id]);
  const m = satirlar[0];
  const geri = m ? `/oda/${m.room_id}#o-${m.id}` : "/sohbet";
  const hata = !m ? "Şikâyet edilecek oda mesajı bulunamadı." : sebepHatasi(sebep, aciklama, "oda_mesaji");
  if (hata) {
    bildir(req, "hata", hata);
    return res.redirect(geri);
  }
  if (m.user_id === k.id) { bildir(req, "hata", "Kendi mesajını şikâyet edemezsin."); return res.redirect(geri); }
  const [sonuc]: any = await pool.query(
    "INSERT IGNORE INTO reports (hedef_tur, room_message_id, reporter_id, sebep, aciklama) VALUES ('oda_mesaji', ?, ?, ?, ?)",
    [odaMesajId, k.id, sebep, aciklama]
  );
  await sikayetSonu(req, res, sonuc.affectedRows > 0, m.user_id, engelleIstendi, geri, "Bu mesajı");
}

// "Report" on the profile: the user is targeted instead of a message (reports.reported_user_id)
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

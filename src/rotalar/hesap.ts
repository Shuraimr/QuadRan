// Hesap: giriş, kayıt, çıkış, şifremi unuttum/sıfırlama, ayarlar, şifre ve e-posta değiştirme, hesabı silme.
import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db.ts";
import { sifreHashle, sifreDogru } from "../sifre.ts";
import { bildir, girisGerekli, metin, yerelAdres, banliSql } from "../yardimci.ts";
import { ayarlar } from "../ayarlar.ts";
import { girisIp, girisHesap, sifirlamaIp, kayitIp } from "../hiz-siniri.ts";

export const hesap = express.Router();

// Oturum sabitleme (session fixation) saldırısına karşı: girişte oturum kimliği yenilenir.
// express-session geri çağırma (callback) kullanıyor; await edebilmek için Promise'e sarıyoruz.
// (Oturum, yanıt gönderilirken express-session tarafından otomatik kaydedilir.)
const oturumuYenile = (req: express.Request) =>
  new Promise<void>((tamam, hata) => req.session.regenerate((e) => (e ? hata(e) : tamam())));

const KULLANICI_ADI = /^[A-Za-z0-9_]{3,30}$/;
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Giriş
// ---------------------------------------------------------------------------
hesap.get("/giris", (req, res) => {
  if (res.locals.kullanici) return res.redirect("/");
  const not = req.session.girisNotu;
  delete req.session.girisNotu;
  res.render("giris", { not, don: yerelAdres(req.query.don) });
});

hesap.post("/giris", async (req, res) => {
  const kullaniciAdi = metin(req.body.kullanici_adi);
  const sifre = typeof req.body.sifre === "string" ? req.body.sifre : "";
  const don = yerelAdres(req.body.don);

  // Hız sınırı: çok fazla yanlış denemeden sonra bir süre bekletilir (kaba kuvvete karşı).
  // Hesap anahtarı küçük harfle: "Ayse" ve "ayse" aynı sayaca yazılsın.
  const ipAnahtari = req.ip ?? "?";
  const hesapAnahtari = kullaniciAdi.toLocaleLowerCase("tr");
  const bekle = Math.max(girisIp.kalanDakika(ipAnahtari), girisHesap.kalanDakika(hesapAnahtari));
  if (bekle) {
    return res.status(429).render("giris", { hata: `Çok fazla yanlış deneme. ${bekle} dakika sonra tekrar dene.`, degerler: { kullanici_adi: kullaniciAdi }, don });
  }

  // Kullanıcı adı YA DA e-posta ile giriş
  const [satirlar]: any = await pool.query(
    `SELECT id, username, password_hash, oturum_surumu, banned_at, banned_until, ban_reason, ${banliSql("users")} AS banli
       FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL`,
    [kullaniciAdi, kullaniciAdi]
  );
  const k = satirlar[0];

  // Kullanıcı yoksa da şifre yanlışsa da AYNI mesaj: hangi kullanıcı adlarının kayıtlı olduğu sızmasın
  if (!k || !(await sifreDogru(sifre, k.password_hash))) {
    girisIp.say(ipAnahtari);
    girisHesap.say(hesapAnahtari);
    return res.status(401).render("giris", { hata: "Kullanıcı adı ya da şifre yanlış.", degerler: { kullanici_adi: kullaniciAdi }, don });
  }
  if (k.banli) {
    // Süreli banda bitiş tarihi, kalıcı banda "süresiz" yazılır; sebep varsa eklenir
    const ne_zaman = k.banned_until
      ? ` (${new Date(k.banned_until).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" })} tarihine kadar)`
      : " (süresiz)";
    const sebep = k.ban_reason ? ` Sebep: ${k.ban_reason}` : "";
    return res.status(403).render("giris", { hata: `Bu hesap moderatörler tarafından uzaklaştırıldı${ne_zaman}.${sebep}`, degerler: { kullanici_adi: kullaniciAdi }, don });
  }
  // Süreli ban bitmişse işareti temizle: giriş serbest, bir sonraki istekte oturum.ts de aynı şeyi görür
  if (k.banned_at) {
    await pool.query("UPDATE users SET banned_at = NULL, banned_until = NULL, ban_reason = NULL WHERE id = ?", [k.id]);
  }

  girisHesap.sifirla(hesapAnahtari);
  await oturumuYenile(req);
  req.session.userId = k.id;
  req.session.surum = k.oturum_surumu;
  // "Beni hatırla": 30 gün kalıcı çerez. Seçilmezse tarayıcı kapanınca biter.
  if (req.body.hatirla) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
  bildir(req, "basari", `Hoş geldin, ${k.username}`);
  res.redirect(don);
});

// ---------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------
hesap.get("/kayit", async (req, res) => {
  if (res.locals.kullanici) return res.redirect("/");
  // Yönetim panelinden kayıt kapatıldıysa form yerine bilgi kutusu çizilir
  res.render("kayit", { kapali: !(await ayarlar()).kayitAcik });
});

hesap.post("/kayit", async (req, res) => {
  // Formu gizlemek yetmez: POST doğrudan gönderilebilir, bu yüzden sunucuda da reddediyoruz
  if (!(await ayarlar()).kayitAcik) return res.status(403).render("kayit", { kapali: true });
  const ipAnahtari = req.ip ?? "?";
  if (kayitIp.kalanDakika(ipAnahtari)) {
    return res.status(429).render("kayit", { hatalar: { username: "Bu bağlantıdan çok fazla hesap açıldı. Biraz sonra tekrar dene." }, degerler: { username: metin(req.body.username), email: metin(req.body.email) } });
  }

  const username = metin(req.body.username);
  const email = metin(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const hatalar: Record<string, string> = {};

  // Tarayıcıdaki required/pattern kuralları atlatılabilir; sunucuda HER ZAMAN yeniden kontrol edilir.
  if (!KULLANICI_ADI.test(username)) hatalar.username = "3-30 karakter; harf, rakam ve alt çizgi kullanılabilir";
  if (!EPOSTA.test(email) || email.length > 255) hatalar.email = "Geçerli bir e-posta adresi yaz";
  if (password.length < 8) hatalar.password = "Şifre en az 8 karakter olmalı";
  if (password.length > 200) hatalar.password = "Şifre en fazla 200 karakter olabilir";
  if (!req.body.kurallar) hatalar.kurallar = "Devam etmek için kuralları kabul etmelisin";

  if (!hatalar.username || !hatalar.email) {
    const [var_]: any = await pool.query("SELECT username, email FROM users WHERE username = ? OR email = ?", [username, email]);
    for (const v of var_) {
      if (v.username.toLowerCase() === username.toLowerCase()) hatalar.username = "Bu kullanıcı adı alınmış";
      if (v.email === email) hatalar.email = "Bu e-posta ile zaten bir hesap var";
    }
  }

  if (Object.keys(hatalar).length) {
    return res.status(400).render("kayit", { hatalar, degerler: { username, email } });
  }

  kayitIp.say(ipAnahtari); // yalnızca gerçekten açılan hesaplar sayılır
  const hash = await sifreHashle(password);
  // Yeni üyelerin rolü "uye". role_id'yi sabit 3 yazmak yerine adından buluyoruz.
  const [sonuc]: any = await pool.query(
    "INSERT INTO users (username, email, password_hash, role_id) SELECT ?, ?, ?, id FROM roles WHERE name = 'uye'",
    [username, email, hash]
  );

  await oturumuYenile(req);
  req.session.userId = sonuc.insertId;
  bildir(req, "basari", "Hesabın oluşturuldu. Aramıza hoş geldin!");
  res.redirect("/");
});

// ---------------------------------------------------------------------------
// Çıkış: POST (GET olsaydı başka bir site <img src="/cikis"> ile seni çıkartabilirdi)
// ---------------------------------------------------------------------------
hesap.post("/cikis", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("quadran.sid");
    res.redirect("/");
  });
});

// ---------------------------------------------------------------------------
// Şifremi unuttum + sıfırlama
//
// Akış: e-posta yaz -> rastgele belirteç üretilir -> bağlantı (belirteçli) kullanıcıya gider
//       -> bağlantıyı açan yeni şifreyi yazar.
// Belirteci veritabanında düz saklamıyoruz, yalnızca sha256 özetini (sql/07_hesap.sql'de açıklandı).
// ---------------------------------------------------------------------------
const belirteciOzetle = (belirtec: string) => createHash("sha256").update(belirtec).digest("hex");

hesap.get("/sifremi-unuttum", (req, res) => {
  res.render("sifremi-unuttum", { gonderildi: req.query.gonderildi === "1" });
});

hesap.post("/sifremi-unuttum", async (req, res) => {
  const email = metin(req.body.email).toLowerCase();
  const ipAnahtari = req.ip ?? "?";
  const bekle = sifirlamaIp.kalanDakika(ipAnahtari);
  if (bekle) {
    return res.status(429).render("sifremi-unuttum", { hata: `Çok fazla istek. ${bekle} dakika sonra tekrar dene.`, degerler: { email } });
  }
  sifirlamaIp.say(ipAnahtari);
  if (!EPOSTA.test(email)) {
    return res.status(400).render("sifremi-unuttum", { hata: "Geçerli bir e-posta adresi yaz.", degerler: { email } });
  }

  const [satirlar]: any = await pool.query("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL", [email]);
  if (satirlar[0]) {
    const belirtec = randomBytes(32).toString("hex"); // 32 rastgele bayt = tahmin edilemez
    await pool.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))",
      [satirlar[0].id, belirteciOzetle(belirtec)]
    );
    // TODO: SMTP eklenince bu satır yerine e-posta gönderilecek. Şimdilik bağlantıyı sunucu konsoluna yazıyoruz.
    console.log(`[şifre sıfırlama] ${email} için bağlantı: http://localhost:3000/sifre-sifirla/${belirtec}`);
  }
  // Kayıtlı olsa da olmasa da AYNI sonuç: hangi adreslerin kayıtlı olduğu öğrenilemesin
  res.redirect("/sifremi-unuttum?gonderildi=1");
});

// Belirteç geçerli mi? Özeti bulunmalı, kullanılmamış ve süresi dolmamış olmalı. Sahibin id'sini döner.
async function belirtecKullanicisi(belirtec: string): Promise<number | null> {
  if (!/^[0-9a-f]{64}$/.test(belirtec)) return null;
  const [satirlar]: any = await pool.query(
    `SELECT password_resets.user_id FROM password_resets
       JOIN users ON users.id = password_resets.user_id AND users.deleted_at IS NULL
      WHERE password_resets.token_hash = ? AND password_resets.used_at IS NULL AND password_resets.expires_at > NOW()`,
    [belirteciOzetle(belirtec)]
  );
  return satirlar[0]?.user_id ?? null;
}

hesap.get("/sifre-sifirla/:token", async (req, res) => {
  const gecerli = await belirtecKullanicisi(req.params.token);
  if (!gecerli) return res.status(400).render("sifre-sifirla", { gecersiz: true });
  res.render("sifre-sifirla", { token: req.params.token });
});

hesap.post("/sifre-sifirla/:token", async (req, res) => {
  const token = req.params.token;
  const userId = await belirtecKullanicisi(token);
  if (!userId) return res.status(400).render("sifre-sifirla", { gecersiz: true });

  const yeni = typeof req.body.password === "string" ? req.body.password : "";
  const tekrar = typeof req.body.password2 === "string" ? req.body.password2 : "";
  let hata = "";
  if (yeni.length < 8) hata = "Şifre en az 8 karakter olmalı.";
  else if (yeni.length > 200) hata = "Şifre en fazla 200 karakter olabilir.";
  else if (yeni !== tekrar) hata = "Şifreler aynı değil.";
  if (hata) return res.status(400).render("sifre-sifirla", { token, hata });

  const hash = await sifreHashle(yeni);
  // İki yazma birlikte olmalı: şifre değişip belirteç açık kalırsa bağlantı tekrar kullanılabilirdi.
  const baglanti = await pool.getConnection();
  try {
    await baglanti.beginTransaction();
    // oturum_surumu + 1: bu hesabın açık bütün oturumları (örn. şifreyi çalan kişininki) düşer
    await baglanti.query("UPDATE users SET password_hash = ?, oturum_surumu = oturum_surumu + 1 WHERE id = ?", [hash, userId]);
    // Bu kullanıcının bütün açık belirteçleri (kullanılan dahil) kapanır: eski e-postalardaki bağlantılar ölür
    await baglanti.query("UPDATE password_resets SET used_at = COALESCE(used_at, NOW()) WHERE user_id = ?", [userId]);
    await baglanti.commit();
  } catch (e) {
    await baglanti.rollback();
    throw e;
  } finally {
    baglanti.release();
  }
  // NOT: kullanıcının başka cihazlardaki açık oturumları düşmüyor. sessions tablosunda user id sütunu yok
  // (veri tek metin alanında), id'ye göre silmek kolay değil. İleride eklenebilir.
  bildir(req, "basari", "Şifren değiştirildi. Yeni şifrenle giriş yapabilirsin.");
  res.redirect("/giris");
});

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------
async function ayarlariOku(userId: number) {
  const [satirlar]: any = await pool.query(
    "SELECT username, bio, email, avatar_url, tema, vurgu, menu_sagda, kompakt, az_animasyon FROM users WHERE id = ?",
    [userId]
  );
  return satirlar[0];
}

hesap.get("/ayarlar", girisGerekli("Ayarlar için giriş yapman gerekiyor."), async (req, res) => {
  res.render("ayarlar", { ayar: await ayarlariOku(res.locals.kullanici.id), aktifMenu: "ayarlar" });
});

hesap.post("/ayarlar/profil", girisGerekli(), async (req, res) => {
  const k = res.locals.kullanici;
  const username = metin(req.body.username);
  const bio = metin(req.body.bio);
  const hatalar: Record<string, string> = {};

  if (!KULLANICI_ADI.test(username)) hatalar.username = "3-30 karakter; harf, rakam ve alt çizgi kullanılabilir";
  if (bio.length > 280) hatalar.bio = "En fazla 280 karakter";
  if (!hatalar.username && username.toLowerCase() !== k.username.toLowerCase()) {
    const [var_]: any = await pool.query("SELECT id FROM users WHERE username = ? AND id <> ?", [username, k.id]);
    if (var_.length) hatalar.username = "Bu kullanıcı adı alınmış";
  }

  if (Object.keys(hatalar).length) {
    const ayar = { ...(await ayarlariOku(k.id)), username, bio };
    return res.status(400).render("ayarlar", { ayar, hatalar, aktifMenu: "ayarlar" });
  }

  await pool.query("UPDATE users SET username = ?, bio = ? WHERE id = ?", [username, bio || null, k.id]);
  bildir(req, "basari", "Profilin kaydedildi");
  res.redirect("/ayarlar#profil");
});

hesap.post("/ayarlar/gorunum", girisGerekli(), async (req, res) => {
  // Yalnızca izin verilen değerler: başka bir şey gelirse varsayılana dön
  const tema = ["koyu", "acik", "sistem"].includes(req.body.tema) ? req.body.tema : "koyu";
  const vurgu = ["safir", "zumrut", "kehribar", "ametist", "yakut"].includes(req.body.vurgu) ? req.body.vurgu : "safir";
  // İşaretlenmemiş checkbox formda hiç gönderilmez; bu yüzden "var mı" diye bakıyoruz
  await pool.query(
    "UPDATE users SET tema = ?, vurgu = ?, menu_sagda = ?, kompakt = ?, az_animasyon = ? WHERE id = ?",
    [tema, vurgu, !!req.body.menu_sagda, !!req.body.kompakt, !!req.body.az_animasyon, res.locals.kullanici.id]
  );
  bildir(req, "basari", "Görünüm ayarların kaydedildi");
  res.redirect("/ayarlar#gorunum");
});

// ---------------------------------------------------------------------------
// Şifre değiştir: /hesap/sifre (mevcut şifre + yeni + tekrar)
// Mevcut şifre sorulur: açık bırakılmış bir oturumu ele geçiren kişi hesabı kalıcı olarak kapamasın.
// ---------------------------------------------------------------------------
async function sifreHash(userId: number): Promise<string> {
  const [satirlar]: any = await pool.query("SELECT password_hash FROM users WHERE id = ?", [userId]);
  return satirlar[0]?.password_hash ?? "";
}

hesap.get("/hesap/sifre", girisGerekli("Şifreni değiştirmek için giriş yapman gerekiyor."), (req, res) => {
  res.render("hesap-sifre", { aktifMenu: "ayarlar" });
});

hesap.post("/hesap/sifre", girisGerekli(), async (req, res) => {
  const k = res.locals.kullanici;
  const mevcut = typeof req.body.mevcut === "string" ? req.body.mevcut : "";
  const yeni = typeof req.body.yeni === "string" ? req.body.yeni : "";
  const tekrar = typeof req.body.tekrar === "string" ? req.body.tekrar : "";
  const hatalar: Record<string, string> = {};

  if (!(await sifreDogru(mevcut, await sifreHash(k.id)))) hatalar.mevcut = "Mevcut şifre yanlış";
  if (yeni.length < 8) hatalar.yeni = "Şifre en az 8 karakter olmalı";
  else if (yeni.length > 200) hatalar.yeni = "Şifre en fazla 200 karakter olabilir";
  else if (yeni === mevcut) hatalar.yeni = "Yeni şifre mevcut şifreyle aynı olamaz";
  if (!hatalar.yeni && yeni !== tekrar) hatalar.tekrar = "Şifreler aynı değil";

  if (Object.keys(hatalar).length) return res.status(400).render("hesap-sifre", { hatalar, aktifMenu: "ayarlar" });

  // Sürümü artır: başka cihazlardaki oturumlar düşer. Bu oturumu yeni sürüme taşıyıp açık tutuyoruz,
  // ve oturum kimliğini de yeniliyoruz (eski kimliği ele geçiren biri devam edemesin).
  await pool.query("UPDATE users SET password_hash = ?, oturum_surumu = oturum_surumu + 1 WHERE id = ?", [await sifreHashle(yeni), k.id]);
  await oturumuYenile(req);
  req.session.userId = k.id;
  req.session.surum = k.oturum_surumu + 1;
  bildir(req, "basari", "Şifren değiştirildi. Diğer cihazlardaki oturumların kapatıldı.");
  res.redirect("/ayarlar#hesap");
});

// ---------------------------------------------------------------------------
// E-posta değiştir: /hesap/eposta (yeni e-posta + mevcut şifre)
// ---------------------------------------------------------------------------
hesap.get("/hesap/eposta", girisGerekli("E-postanı değiştirmek için giriş yapman gerekiyor."), async (req, res) => {
  const [satirlar]: any = await pool.query("SELECT email FROM users WHERE id = ?", [res.locals.kullanici.id]);
  res.render("hesap-eposta", { mevcutEposta: satirlar[0]?.email, aktifMenu: "ayarlar" });
});

hesap.post("/hesap/eposta", girisGerekli(), async (req, res) => {
  const k = res.locals.kullanici;
  const email = metin(req.body.email).toLowerCase();
  const sifre = typeof req.body.sifre === "string" ? req.body.sifre : "";
  const hatalar: Record<string, string> = {};
  const [[bende]]: any = await pool.query("SELECT email, password_hash FROM users WHERE id = ?", [k.id]);

  if (!EPOSTA.test(email) || email.length > 255) hatalar.email = "Geçerli bir e-posta adresi yaz";
  else if (email === bende.email) hatalar.email = "Bu zaten e-posta adresin";
  else {
    const [var_]: any = await pool.query("SELECT id FROM users WHERE email = ? AND id <> ?", [email, k.id]);
    if (var_.length) hatalar.email = "Bu e-posta ile zaten bir hesap var";
  }
  if (!(await sifreDogru(sifre, bende.password_hash))) hatalar.sifre = "Şifre yanlış";

  if (Object.keys(hatalar).length) {
    return res.status(400).render("hesap-eposta", { hatalar, degerler: { email }, mevcutEposta: bende.email, aktifMenu: "ayarlar" });
  }
  await pool.query("UPDATE users SET email = ? WHERE id = ?", [email, k.id]);
  bildir(req, "basari", "E-posta adresin güncellendi");
  res.redirect("/ayarlar#hesap");
});

// Hesabı sil: satırı silmiyoruz (konular/mesajlar ona bağlı), deleted_at ile kapatıyoruz.
// Kullanıcı adı ve e-posta değiştirilir ki aynı ad/adres tekrar kayıt olabilsin.
hesap.post("/hesap/sil", girisGerekli(), async (req, res) => {
  const id = res.locals.kullanici.id;
  await pool.query(
    `UPDATE users SET deleted_at = NOW(), username = CONCAT('silinmis_', id), email = CONCAT('silinmis_', id, '@quadran.invalid'),
            bio = NULL, avatar_url = NULL, banner_url = NULL, password_hash = '' WHERE id = ?`,
    [id]
  );
  req.session.destroy(() => {
    res.clearCookie("quadran.sid");
    res.redirect("/");
  });
});

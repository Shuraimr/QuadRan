// Account: login, sign-up, logout, forgot/reset password, settings, changing password and email, deleting the account.
// Hesap: giriş, kayıt, çıkış, şifremi unuttum/sıfırlama, ayarlar, şifre ve e-posta değiştirme, hesabı silme.
import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db.ts";
import { sifreHashle, sifreDogru } from "../sifre.ts";
import { bildir, girisGerekli, metin, yerelAdres, banliSql, premiumSql } from "../yardimci.ts";
import { ayarlar, yasakliIfade } from "../ayarlar.ts";
import { izinli, kilitBilgisi } from "../rutbe.ts";
import { girisIp, girisHesap, sifirlamaIp, kayitIp } from "../hiz-siniri.ts";
import { yuklemeKatmani, jsonIstiyor, kirpmaOku, gorselIsle, dosyaSil, yuklemeBekleme, yuklemeSay, GorselHatasi, type GorselTuru } from "../yukleme.ts";
import { premiumMu } from "../premium.ts";
import { efektGecerli, susGecerli, renkGecerli } from "../profil-gorunum.ts";

export const hesap = express.Router();

// Against session fixation attacks: the session id is renewed at login.
// express-session uses callbacks; we wrap it in a Promise so we can await it.
// (The session is saved automatically by express-session when the response is sent.)
// Oturum sabitleme (session fixation) saldırısına karşı: girişte oturum kimliği yenilenir.
// express-session geri çağırma (callback) kullanıyor; await edebilmek için Promise'e sarıyoruz.
// (Oturum, yanıt gönderilirken express-session tarafından otomatik kaydedilir.)
const oturumuYenile = (req: express.Request) =>
  new Promise<void>((tamam, hata) => req.session.regenerate((e) => (e ? hata(e) : tamam())));

const KULLANICI_ADI = /^[A-Za-z0-9_]{3,30}$/;
// The /mesajlar/yeni page takes precedence over a profile conversation with this name (src/rotalar/iletisim.ts); so it must not be registrable
// /mesajlar/yeni sayfası bu ada ait profil konuşmasının önüne geçer (src/rotalar/iletisim.ts); alınamasın
const AYRILMIS_AD = ["yeni"];
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Login
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

  // Rate limit: after too many wrong attempts the person is made to wait for a while (against brute force).
  // The account key is lowercase: so that "Ayse" and "ayse" count on the same counter.
  // Hız sınırı: çok fazla yanlış denemeden sonra bir süre bekletilir (kaba kuvvete karşı).
  // Hesap anahtarı küçük harfle: "Ayse" ve "ayse" aynı sayaca yazılsın.
  const ipAnahtari = req.ip ?? "?";
  const hesapAnahtari = kullaniciAdi.toLocaleLowerCase("tr");
  const bekle = Math.max(girisIp.kalanDakika(ipAnahtari), girisHesap.kalanDakika(hesapAnahtari));
  if (bekle) {
    return res.status(429).render("giris", { hata: `Çok fazla yanlış deneme. ${bekle} dakika sonra tekrar dene.`, degerler: { kullanici_adi: kullaniciAdi }, don });
  }

  // Login with username OR email
  // Kullanıcı adı YA DA e-posta ile giriş
  const [satirlar]: any = await pool.query(
    `SELECT id, username, password_hash, oturum_surumu, banned_at, banned_until, ban_reason, ${banliSql("users")} AS banli
       FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL`,
    [kullaniciAdi, kullaniciAdi]
  );
  const k = satirlar[0];

  // The SAME message whether the user does not exist or the password is wrong: so which usernames are registered does not leak
  // Kullanıcı yoksa da şifre yanlışsa da AYNI mesaj: hangi kullanıcı adlarının kayıtlı olduğu sızmasın
  if (!k || !(await sifreDogru(sifre, k.password_hash))) {
    girisIp.say(ipAnahtari);
    girisHesap.say(hesapAnahtari);
    return res.status(401).render("giris", { hata: "Kullanıcı adı ya da şifre yanlış.", degerler: { kullanici_adi: kullaniciAdi }, don });
  }
  if (k.banli) {
    // For a timed ban the end date is written, for a permanent ban "süresiz" (indefinite); the reason is added if there is one
    // Süreli banda bitiş tarihi, kalıcı banda "süresiz" yazılır; sebep varsa eklenir
    const ne_zaman = k.banned_until
      ? ` (${new Date(k.banned_until).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" })} tarihine kadar)`
      : " (süresiz)";
    const sebep = k.ban_reason ? ` Sebep: ${k.ban_reason}` : "";
    return res.status(403).render("giris", { hata: `Bu hesap moderatörler tarafından uzaklaştırıldı${ne_zaman}.${sebep}`, degerler: { kullanici_adi: kullaniciAdi }, don });
  }
  // If a timed ban has ended, clear the flag: login is free, and on the next request oturum.ts sees the same thing
  // Süreli ban bitmişse işareti temizle: giriş serbest, bir sonraki istekte oturum.ts de aynı şeyi görür
  if (k.banned_at) {
    await pool.query("UPDATE users SET banned_at = NULL, banned_until = NULL, ban_reason = NULL WHERE id = ?", [k.id]);
  }

  girisHesap.sifirla(hesapAnahtari);
  await oturumuYenile(req);
  req.session.userId = k.id;
  req.session.surum = k.oturum_surumu;
  // "Remember me": a 30-day persistent cookie. If not selected it ends when the browser closes.
  // "Beni hatırla": 30 gün kalıcı çerez. Seçilmezse tarayıcı kapanınca biter.
  if (req.body.hatirla) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
  bildir(req, "basari", `Hoş geldin, ${k.username}`);
  res.redirect(don);
});

// ---------------------------------------------------------------------------
// Sign-up
// Kayıt
// ---------------------------------------------------------------------------
hesap.get("/kayit", async (req, res) => {
  if (res.locals.kullanici) return res.redirect("/");
  // If sign-up was turned off from the admin panel, an info box is drawn instead of the form
  // Yönetim panelinden kayıt kapatıldıysa form yerine bilgi kutusu çizilir
  res.render("kayit", { kapali: !(await ayarlar()).kayitAcik });
});

hesap.post("/kayit", async (req, res) => {
  // Hiding the form is not enough: a POST can be sent directly, so we reject it on the server too
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

  // The browser's required/pattern rules can be bypassed; they are ALWAYS re-checked on the server.
  // Tarayıcıdaki required/pattern kuralları atlatılabilir; sunucuda HER ZAMAN yeniden kontrol edilir.
  if (!KULLANICI_ADI.test(username)) hatalar.username = "3-30 karakter; harf, rakam ve alt çizgi kullanılabilir";
  else if (AYRILMIS_AD.includes(username.toLowerCase())) hatalar.username = "Bu ad ayrılmış, başka bir ad seç";
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

  kayitIp.say(ipAnahtari); // only accounts that are really created count · yalnızca gerçekten açılan hesaplar sayılır
  const hash = await sifreHashle(password);
  // The role of new members is "uye" (member). Instead of hard-coding role_id as 3 we look it up by name.
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
// Logout: POST (if it were GET another site could log you out with <img src="/cikis">)
// Çıkış: POST (GET olsaydı başka bir site <img src="/cikis"> ile seni çıkartabilirdi)
// ---------------------------------------------------------------------------
hesap.post("/cikis", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rubyyard.sid");
    res.redirect("/");
  });
});

// ---------------------------------------------------------------------------
// Forgot password + reset
//
// Flow: type the email -> a random token is generated -> the link (with the token) goes to the user
//       -> the person who opens the link types the new password.
// We do not store the token in plain text in the database, only its sha256 digest (explained in sql/07_hesap.sql).
//
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
    const belirtec = randomBytes(32).toString("hex"); // 32 random bytes = unguessable · 32 rastgele bayt = tahmin edilemez
    await pool.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))",
      [satirlar[0].id, belirteciOzetle(belirtec)]
    );
    // TODO: when SMTP is added, an email will be sent instead of this line. For now we write the link to the server console.
    // TODO: SMTP eklenince bu satır yerine e-posta gönderilecek. Şimdilik bağlantıyı sunucu konsoluna yazıyoruz.
    console.log(`[şifre sıfırlama] ${email} için bağlantı: http://localhost:3000/sifre-sifirla/${belirtec}`);
  }
  // The SAME result whether registered or not: so which addresses are registered cannot be learned
  // Kayıtlı olsa da olmasa da AYNI sonuç: hangi adreslerin kayıtlı olduğu öğrenilemesin
  res.redirect("/sifremi-unuttum?gonderildi=1");
});

// Is the token valid? Its digest must be found, unused and not expired. Returns the owner's id.
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
  // The two writes must happen together: if the password changed but the token stayed open the link could be reused.
  // İki yazma birlikte olmalı: şifre değişip belirteç açık kalırsa bağlantı tekrar kullanılabilirdi.
  const baglanti = await pool.getConnection();
  try {
    await baglanti.beginTransaction();
    // oturum_surumu + 1: all open sessions of this account (e.g. the one belonging to whoever stole the password) are dropped
    // oturum_surumu + 1: bu hesabın açık bütün oturumları (örn. şifreyi çalan kişininki) düşer
    await baglanti.query("UPDATE users SET password_hash = ?, oturum_surumu = oturum_surumu + 1 WHERE id = ?", [hash, userId]);
    // All open tokens of this user (including the used one) are closed: links in old emails die
    // Bu kullanıcının bütün açık belirteçleri (kullanılan dahil) kapanır: eski e-postalardaki bağlantılar ölür
    await baglanti.query("UPDATE password_resets SET used_at = COALESCE(used_at, NOW()) WHERE user_id = ?", [userId]);
    await baglanti.commit();
  } catch (e) {
    await baglanti.rollback();
    throw e;
  } finally {
    baglanti.release();
  }
  // NOTE: the user's open sessions on other devices are not dropped. The sessions table has no user id column
  // (the data is in a single text field), deleting by id is not easy. It could be added later.
  // NOT: kullanıcının başka cihazlardaki açık oturumları düşmüyor. sessions tablosunda user id sütunu yok
  // (veri tek metin alanında), id'ye göre silmek kolay değil. İleride eklenebilir.
  bildir(req, "basari", "Şifren değiştirildi. Yeni şifrenle giriş yapabilirsin.");
  res.redirect("/giris");
});

// ---------------------------------------------------------------------------
// Settings
// Ayarlar
// ---------------------------------------------------------------------------
async function ayarlariOku(userId: number) {
  const [satirlar]: any = await pool.query(
    `SELECT username, bio, konum, web_sitesi, imza, dm_izni, cevrimici_goster, email, avatar_url, banner_url, created_at, tema, vurgu, menu_sagda, kompakt, az_animasyon, nsfw_tercih,
            premium_bitis, banner_konum, sabit_konu_id, ${premiumSql("users")} AS premium_aktif, profil_efekti, avatar_susu, profil_renk_ana, profil_renk_vurgu, profil_renk_gecis
       FROM users WHERE id = ?`,
    [userId]
  );
  const ayar = satirlar[0];
  ayar.cevrimici_goster = !!ayar.cevrimici_goster;
  // The "Blocked" list in the Privacy section (deleted accounts are not shown)
  // Gizlilik bölümündeki "Engellenenler" listesi (silinmiş hesaplar gösterilmez)
  const [engelliler] = await pool.query(
    `SELECT users.username FROM user_blocks JOIN users ON users.id = user_blocks.blocked_id
      WHERE user_blocks.blocker_id = ? AND users.deleted_at IS NULL ORDER BY user_blocks.created_at DESC`,
    [userId]
  );
  ayar.engelliler = engelliler;
  // Showcase section (sql/21): the person's badges (in order earned; selected if vitrin_sira is filled) and topics that can be pinned (newest 50)
  // Vitrin bölümü (sql/21): kişinin rozetleri (kazanma sırasıyla; vitrin_sira doluysa seçili) ve sabitlenebilecek konuları (en yeni 50)
  [ayar.rozetler] = (await pool.query(
    `SELECT badges.id, badges.name, badges.description, user_badges.vitrin_sira
       FROM user_badges JOIN badges ON badges.id = user_badges.badge_id
      WHERE user_badges.user_id = ? ORDER BY user_badges.earned_at, badges.id`, [userId])) as any;
  [ayar.konular] = (await pool.query(
    "SELECT id, title FROM topics WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50", [userId])) as any;
  return ayar;
}

hesap.get("/ayarlar", girisGerekli("Ayarlar için giriş yapman gerekiyor."), async (req, res) => {
  res.render("ayarlar", { ayar: await ayarlariOku(res.locals.kullanici.id), imzaKilit: kilitBilgisi(res.locals.kullanici, "imza"), aktifMenu: "ayarlar" });
});

hesap.post("/ayarlar/profil", girisGerekli(), async (req, res) => {
  const k = res.locals.kullanici;
  const username = metin(req.body.username);
  const bio = metin(req.body.bio);
  const konum = metin(req.body.konum);
  const webSitesi = metin(req.body.web_sitesi);
  // Signature (rank privilege, at most 120 characters, single line). For someone without the privilege the signature field is not in the form at all;
  // even if sent by hand (server-side validation) it is ignored and the existing signature is kept.
  // İmza (rütbe ayrıcalığı, en çok 120 karakter, tek satır). Ayrıcalığı olmayanın imza alanı formda hiç yoktur;
  // elle gönderilse bile (sunucu tarafı doğrulama) yok sayılır ve var olan imza korunur.
  const imzaIzni = izinli(k, "imza");
  const imza = metin(req.body.imza).replace(/\s+/g, " ");
  const hatalar: Record<string, string> = {};

  if (!KULLANICI_ADI.test(username)) hatalar.username = "3-30 karakter; harf, rakam ve alt çizgi kullanılabilir";
  else if (AYRILMIS_AD.includes(username.toLowerCase())) hatalar.username = "Bu ad ayrılmış, başka bir ad seç";
  if (bio.length > 280) hatalar.bio = "En fazla 280 karakter";
  if (konum.length > 60) hatalar.konum = "En fazla 60 karakter";
  if (imzaIzni && imza.length > 120) hatalar.imza = "En fazla 120 karakter";
  if (imzaIzni && imza && !hatalar.imza) {
    const yasak = await yasakliIfade(imza);
    if (yasak) hatalar.imza = `İmzada yasaklı bir ifade var: “${yasak}”`;
  }
  // Website: only http(s). Schemes like "javascript:" would be drawn as a link on the profile (XSS), so the scheme check is mandatory.
  // Web sitesi: yalnızca http(s). "javascript:" gibi şemalar profilde bağlantı olarak çizilirdi (XSS), o yüzden şema denetimi şart.
  if (webSitesi) {
    let gecerli = false;
    try { const u = new URL(webSitesi); gecerli = /^https?:$/.test(u.protocol) && !!u.hostname; } catch { /* invalid · geçersiz */ }
    if (webSitesi.length > 200) hatalar.web_sitesi = "En fazla 200 karakter";
    else if (!gecerli || !/^https?:\/\//i.test(webSitesi)) hatalar.web_sitesi = "http:// ya da https:// ile başlayan geçerli bir adres yaz";
  }
  if (!hatalar.username && username.toLowerCase() !== k.username.toLowerCase()) {
    const [var_]: any = await pool.query("SELECT id FROM users WHERE username = ? AND id <> ?", [username, k.id]);
    if (var_.length) hatalar.username = "Bu kullanıcı adı alınmış";
  }

  if (Object.keys(hatalar).length) {
    const ayar = { ...(await ayarlariOku(k.id)), username, bio, konum, web_sitesi: webSitesi, ...(imzaIzni ? { imza } : {}) };
    return res.status(400).render("ayarlar", { ayar, hatalar, imzaKilit: kilitBilgisi(k, "imza"), aktifMenu: "ayarlar" });
  }

  await pool.query("UPDATE users SET username = ?, bio = ?, konum = ?, web_sitesi = ? WHERE id = ?", [username, bio || null, konum || null, webSitesi || null, k.id]);
  if (imzaIzni) await pool.query("UPDATE users SET imza = ? WHERE id = ?", [imza || null, k.id]);
  bildir(req, "basari", "Profilin kaydedildi");
  res.redirect("/ayarlar#profil");
});

// Showcase: at most 3 badges + a pinned topic. All of it is re-validated on the server (values in the form can be changed).
// Vitrin: en çok 3 rozet + sabit konu. Hepsi sunucuda yeniden doğrulanır (formdaki değerler değiştirilebilir).
hesap.post("/ayarlar/vitrin", girisGerekli(), async (req, res) => {
  const k = res.locals.kullanici;
  const geri = "/ayarlar#vitrin";
  // A single checkbox arrives as a string, several as an array; convert to numbers and drop duplicates. Order = the order the person earned the badges (not the selection order).
  // Tek onay kutusu string, çoğu dizi gelir; sayıya çevirip yinelenenleri at. Sıra = kişinin rozetlerinin kazanma sırası (seçim sırası değil).
  const gelen = ([] as unknown[]).concat(req.body.rozet ?? []);
  const secilen = [...new Set(gelen.map((v) => Number(v)))];
  if (secilen.some((n) => !Number.isInteger(n) || n < 1)) { bildir(req, "hata", "Geçersiz rozet seçimi."); return res.redirect(geri); }
  if (secilen.length > 3) { bildir(req, "hata", "Vitrine en çok 3 rozet koyabilirsin."); return res.redirect(geri); }
  const [sahip]: any = await pool.query("SELECT badge_id FROM user_badges WHERE user_id = ? ORDER BY earned_at, badge_id", [k.id]);
  const sahipOlunan: number[] = sahip.map((r: any) => r.badge_id);
  if (secilen.some((n) => !sahipOlunan.includes(n))) { bildir(req, "hata", "Yalnızca kazandığın rozetleri vitrine koyabilirsin."); return res.redirect(geri); }

  // Pinned topic: empty = none; if filled it must be the person's own, non-deleted topic
  // Sabit konu: boş = yok; doluysa kişinin kendi ve silinmemiş konusu olmalı
  const ham = metin(req.body.sabit_konu_id);
  let sabitId: number | null = null;
  if (ham) {
    sabitId = Number(ham);
    const [[konu]]: any = Number.isInteger(sabitId) && sabitId > 0
      ? await pool.query("SELECT id FROM topics WHERE id = ? AND user_id = ? AND deleted_at IS NULL", [sabitId, k.id])
      : [[null]];
    if (!konu) { bildir(req, "hata", "Yalnızca kendi konularından birini sabitleyebilirsin."); return res.redirect(geri); }
  }

  // First remove all from the showcase, then give 1..n to the selected ones in the order earned
  // Önce hepsini vitrinden çıkar, sonra seçilenlere kazanma sırasıyla 1..n ver
  await pool.query("UPDATE user_badges SET vitrin_sira = NULL WHERE user_id = ?", [k.id]);
  const sirali = sahipOlunan.filter((id) => secilen.includes(id));
  for (let i = 0; i < sirali.length; i++) {
    await pool.query("UPDATE user_badges SET vitrin_sira = ? WHERE user_id = ? AND badge_id = ?", [i + 1, k.id, sirali[i]]);
  }
  await pool.query("UPDATE users SET sabit_konu_id = ? WHERE id = ?", [sabitId, k.id]);
  bildir(req, "basari", "Vitrinin kaydedildi");
  res.redirect(geri);
});

hesap.post("/ayarlar/gorunum", girisGerekli(), async (req, res) => {
  // Only allowed values: if anything else arrives, fall back to the default
  // Yalnızca izin verilen değerler: başka bir şey gelirse varsayılana dön
  const tema = ["koyu", "acik", "sistem"].includes(req.body.tema) ? req.body.tema : "koyu";
  const vurgu = ["safir", "zumrut", "kehribar", "ametist", "yakut"].includes(req.body.vurgu) ? req.body.vurgu : "safir";
  // +18 content display (sql/23): an invalid value falls back to the default (blurred), nothing else can be written to the ENUM
  // +18 içerik görünümü (sql/23): geçersiz değer varsayılana (bulanık) döner, ENUM'a başka bir şey yazılamaz
  const nsfw = ["gizle", "bulanik", "goster"].includes(req.body.nsfw_tercih) ? req.body.nsfw_tercih : "bulanik";
  // An unchecked checkbox is not sent in the form at all; so we check "is it present"
  // İşaretlenmemiş checkbox formda hiç gönderilmez; bu yüzden "var mı" diye bakıyoruz
  await pool.query(
    "UPDATE users SET tema = ?, vurgu = ?, menu_sagda = ?, kompakt = ?, az_animasyon = ?, nsfw_tercih = ? WHERE id = ?",
    [tema, vurgu, !!req.body.menu_sagda, !!req.body.kompakt, !!req.body.az_animasyon, nsfw, res.locals.kullanici.id]
  );
  bildir(req, "basari", "Görünüm ayarların kaydedildi");
  res.redirect("/ayarlar#gorunum");
});

// ---------------------------------------------------------------------------
// Settings > Profile appearance (sql/18): avatar/banner upload (everyone) and effect, ornament, color (premium only)
// Ayarlar › Profil görünümü (sql/18): avatar/banner yükleme (herkes) ve efekt, süs, renk (yalnızca premium)
// ---------------------------------------------------------------------------
const GORSEL_ADI: Record<GorselTuru, string> = { avatar: "Avatar", banner: "Banner" };
const GERI = "/ayarlar#profil-gorunumu";

const BANNER_KONUMLARI = ["ust", "orta", "alt"];

async function gorselYukle(req: express.Request, res: express.Response, tur: GorselTuru) {
  const k = res.locals.kullanici;
  // The crop window (fetch) expects JSON: the error is shown in the window. The no-JS form returns as before with a toast + redirect.
  // Kırp penceresi (fetch) JSON bekler: hata pencerede gösterilir. JS'siz form eskisi gibi toast + yönlendirme ile döner.
  const json = jsonIstiyor(req);
  const hata = (ileti: string, kod = 400) => {
    if (json) return res.status(kod).json({ hata: ileti });
    bildir(req, "hata", ileti); return res.redirect(GERI);
  };
  if (!req.file) return hata("Yüklemek için bir resim seç (JPG, PNG, WebP ya da GIF, en fazla 8 MB).");
  // Wide-screen alignment only makes sense for the banner; if not sent (no JS) the default is "orta" (center). An invalid value is rejected.
  // Geniş ekran yaslaması yalnızca banner'da anlamlı; gönderilmediyse (JS'siz) varsayılan "orta". Geçersiz değer reddedilir.
  const konum = tur === "banner" && req.body?.konum !== undefined ? String(req.body.konum) : "orta";
  if (!BANNER_KONUMLARI.includes(konum)) return hata("Geçersiz banner konumu.");
  const bekle = yuklemeBekleme(k.id);
  if (bekle) return hata(`Çok fazla yükleme yaptın. ${bekle} dakika sonra tekrar dene.`, 429);
  yuklemeSay(k.id);
  let sonuc;
  try {
    sonuc = await gorselIsle(req.file.buffer, tur, premiumMu(k), kirpmaOku(req.body));
  } catch (e) {
    return hata(e instanceof GorselHatasi ? e.message : "Resim işlenemedi. Başka bir dosya dene.");
  }
  // Column names come from constants in the code (tur is only "avatar" | "banner"), not from the user
  // Sütun adları koddaki sabit değerlerden gelir (tur yalnızca "avatar" | "banner"), kullanıcıdan değil
  const [[eski]]: any = await pool.query(`SELECT ${tur}_url AS adres FROM users WHERE id = ?`, [k.id]);
  await pool.query(`UPDATE users SET ${tur}_url = ?, ${tur}_hareketli = ? WHERE id = ?`, [sonuc.adres, sonuc.hareketli ? 1 : 0, k.id]);
  if (tur === "banner") await pool.query("UPDATE users SET banner_konum = ? WHERE id = ?", [konum, k.id]);
  await dosyaSil(eski?.adres); // so the old file is not left orphaned · eski dosya yetim kalmasın
  if (sonuc.duraganYapildi) bildir(req, "basari", `Hareketli ${tur === "avatar" ? "avatar" : "banner"} premium üyelerde oynar; ilk kare kaydedildi.`);
  else bildir(req, "basari", `${GORSEL_ADI[tur]} güncellendi`);
  if (json) return res.json({ tamam: true, adres: GERI });
  res.redirect(GERI);
}
hesap.post("/ayarlar/avatar", ...yuklemeKatmani("dosya", GERI), (req, res) => gorselYukle(req, res, "avatar"));
hesap.post("/ayarlar/banner", ...yuklemeKatmani("dosya", GERI), (req, res) => gorselYukle(req, res, "banner"));

for (const tur of ["avatar", "banner"] as const) {
  hesap.post(`/ayarlar/${tur}/kaldir`, girisGerekli(), async (req, res) => {
    const k = res.locals.kullanici;
    const [[eski]]: any = await pool.query(`SELECT ${tur}_url AS adres FROM users WHERE id = ?`, [k.id]);
    await pool.query(`UPDATE users SET ${tur}_url = NULL, ${tur}_hareketli = 0${tur === "banner" ? ", banner_konum = 'orta'" : ""} WHERE id = ?`, [k.id]);
    await dosyaSil(eski?.adres);
    bildir(req, "basari", `${GORSEL_ADI[tur]} kaldırıldı`);
    res.redirect(GERI);
  });
}

hesap.post("/ayarlar/profil-gorunumu", girisGerekli(), async (req, res) => {
  const k = res.locals.kullanici;
  const sec = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const varsayilan = !!req.body.varsayilana_don;
  const efekt = varsayilan ? "" : sec(req.body.efekt);
  const sus = varsayilan ? "" : sec(req.body.sus);
  // If "Use my own colors" is off, the color fields (the color picker always sends a value) are ignored and NULL is written
  // "Kendi renklerimi kullan" kapalıysa renk alanları (renk seçici her zaman bir değer gönderir) yok sayılır ve NULL yazılır
  const renkKullan = !varsayilan && !!req.body.renk_kullan;
  const ana = renkKullan ? sec(req.body.renk_ana).toLowerCase() : "";
  const vurgu = renkKullan ? sec(req.body.renk_vurgu).toLowerCase() : "";
  const gecis = renkKullan && req.body.renk_gecis === "gecis" ? 1 : 0; // default: flat · varsayılan: düz
  // Server validation: only known effect/ornament names and #rrggbb (it is written into CSS, so no other format may get in)
  // Sunucu doğrulaması: yalnızca bilinen efekt/süs adları ve #rrggbb (CSS'e yazılacağı için başka hiçbir biçim girmez)
  if ((efekt && !efektGecerli(efekt)) || (sus && !susGecerli(sus))) { bildir(req, "hata", "Geçersiz efekt ya da süs seçimi."); return res.redirect(GERI); }
  if ((ana && !renkGecerli(ana)) || (vurgu && !renkGecerli(vurgu))) { bildir(req, "hata", "Renk #rrggbb biçiminde olmalı (örn. #4b2a6b)."); return res.redirect(GERI); }
  // Premium check: a free person CANNOT select anything, can only clear (all empty)
  // Premium kontrolü: ücretsiz kişi bir şey SEÇEMEZ, yalnızca temizleyebilir (hepsi boş)
  if (!premiumMu(k) && (efekt || sus || ana || vurgu || gecis)) {
    bildir(req, "hata", "Efekt, süs ve renk seçimi premium üyelere özel. Premium şu an yönetici tarafından veriliyor.");
    return res.redirect(GERI);
  }
  await pool.query(
    "UPDATE users SET profil_efekti = ?, avatar_susu = ?, profil_renk_ana = ?, profil_renk_vurgu = ?, profil_renk_gecis = ? WHERE id = ?",
    [efekt || null, sus || null, ana || null, vurgu || null, gecis, k.id]
  );
  bildir(req, "basari", "Profil görünümün kaydedildi");
  res.redirect(GERI);
});

// Privacy: direct message permission and online status. The Blocked list is in the same card, unblocking is POST /engel/:ad/kaldir.
// Gizlilik: özel mesaj izni ve çevrimiçi durumu. Engellenenler listesi aynı kartta, engeli kaldırma POST /engel/:ad/kaldir.
hesap.post("/ayarlar/gizlilik", girisGerekli(), async (req, res) => {
  // Only allowed values: if anything else arrives, the default ("herkes" / everyone)
  // Yalnızca izin verilen değerler: başka bir şey gelirse varsayılan ("herkes")
  const dmIzni = req.body.dm_izni === "kimse" ? "kimse" : "herkes";
  // An unchecked checkbox is not sent in the form at all
  // İşaretlenmemiş checkbox formda hiç gönderilmez
  await pool.query("UPDATE users SET dm_izni = ?, cevrimici_goster = ? WHERE id = ?", [dmIzni, !!req.body.cevrimici_goster, res.locals.kullanici.id]);
  bildir(req, "basari", "Gizlilik ayarların kaydedildi");
  res.redirect("/ayarlar#gizlilik");
});

// ---------------------------------------------------------------------------
// Change password: /hesap/sifre (current password + new + repeat)
// The current password is asked: so someone who takes over a session left open cannot lock the account away for good.
// Şifre değiştir: /hesap/sifre (mevcut şifre + yeni + tekrar)
// Mevcut şifre sorulur: açık bırakılmış bir oturumu ele geçiren kişi hesabı kalıcı olarak kapamasın.
// ---------------------------------------------------------------------------
async function sifreHash(userId: number): Promise<string> {
  const [satirlar]: any = await pool.query("SELECT password_hash FROM users WHERE id = ?", [userId]);
  return satirlar[0]?.password_hash ?? "";
}

hesap.get("/hesap/sifre", girisGerekli("Şifreni değiştirmek için giriş yapman gerekiyor."), (req, res) => {
  res.render("hesap-sifre", { aktifMenu: "ayarlar", ayarBolum: "hesap" });
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

  if (Object.keys(hatalar).length) return res.status(400).render("hesap-sifre", { hatalar, aktifMenu: "ayarlar", ayarBolum: "hesap" });

  // Increase the version: sessions on other devices are dropped. We carry this session to the new version and keep it open,
  // and also renew the session id (so someone who captured the old id cannot continue).
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
// Change email: /hesap/eposta (new email + current password)
// E-posta değiştir: /hesap/eposta (yeni e-posta + mevcut şifre)
// ---------------------------------------------------------------------------
hesap.get("/hesap/eposta", girisGerekli("E-postanı değiştirmek için giriş yapman gerekiyor."), async (req, res) => {
  const [satirlar]: any = await pool.query("SELECT email FROM users WHERE id = ?", [res.locals.kullanici.id]);
  res.render("hesap-eposta", { mevcutEposta: satirlar[0]?.email, aktifMenu: "ayarlar", ayarBolum: "hesap" });
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
    return res.status(400).render("hesap-eposta", { hatalar, degerler: { email }, mevcutEposta: bende.email, aktifMenu: "ayarlar", ayarBolum: "hesap" });
  }
  await pool.query("UPDATE users SET email = ? WHERE id = ?", [email, k.id]);
  bildir(req, "basari", "E-posta adresin güncellendi");
  res.redirect("/ayarlar#hesap");
});

// Delete account: we do not delete the row (topics/messages are tied to it), we close it with deleted_at.
// The username and email are changed so that the same name/address can register again.
// Hesabı sil: satırı silmiyoruz (konular/mesajlar ona bağlı), deleted_at ile kapatıyoruz.
// Kullanıcı adı ve e-posta değiştirilir ki aynı ad/adres tekrar kayıt olabilsin.
hesap.post("/hesap/sil", girisGerekli(), async (req, res) => {
  const id = res.locals.kullanici.id;
  const [[dosyalar]]: any = await pool.query("SELECT avatar_url, banner_url FROM users WHERE id = ?", [id]);
  await pool.query(
    `UPDATE users SET deleted_at = NOW(), username = CONCAT('silinmis_', id), email = CONCAT('silinmis_', id, '@rubyyard.invalid'),
            bio = NULL, avatar_url = NULL, banner_url = NULL, avatar_hareketli = 0, banner_hareketli = 0,
            profil_efekti = NULL, avatar_susu = NULL, profil_renk_ana = NULL, profil_renk_vurgu = NULL, profil_renk_gecis = 0, password_hash = '' WHERE id = ?`,
    [id]
  );
  // Uploaded files are also deleted from disk (personal data)
  // Yüklenen dosyalar diskten de silinir (kişisel veri)
  await dosyaSil(dosyalar?.avatar_url); await dosyaSil(dosyalar?.banner_url);
  req.session.destroy(() => {
    res.clearCookie("rubyyard.sid");
    res.redirect("/");
  });
});

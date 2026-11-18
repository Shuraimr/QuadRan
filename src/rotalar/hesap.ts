// Hesap: giriş, kayıt, çıkış, şifremi unuttum, ayarlar, hesabı silme.
import express from "express";
import { pool } from "../db.ts";
import { sifreHashle, sifreDogru } from "../sifre.ts";
import { bildir, girisGerekli, metin, yerelAdres } from "../yardimci.ts";

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

  // Kullanıcı adı YA DA e-posta ile giriş
  const [satirlar]: any = await pool.query(
    "SELECT id, username, password_hash, banned_at FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL",
    [kullaniciAdi, kullaniciAdi]
  );
  const k = satirlar[0];

  // Kullanıcı yoksa da şifre yanlışsa da AYNI mesaj: hangi kullanıcı adlarının kayıtlı olduğu sızmasın
  if (!k || !(await sifreDogru(sifre, k.password_hash))) {
    return res.status(401).render("giris", { hata: "Kullanıcı adı ya da şifre yanlış.", degerler: { kullanici_adi: kullaniciAdi }, don });
  }
  if (k.banned_at) {
    return res.status(403).render("giris", { hata: "Bu hesap moderatörler tarafından uzaklaştırıldı.", degerler: { kullanici_adi: kullaniciAdi }, don });
  }

  await oturumuYenile(req);
  req.session.userId = k.id;
  // "Beni hatırla": 30 gün kalıcı çerez. Seçilmezse tarayıcı kapanınca biter.
  if (req.body.hatirla) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
  bildir(req, "basari", `Hoş geldin, ${k.username}`);
  res.redirect(don);
});

// ---------------------------------------------------------------------------
// Kayıt
// ---------------------------------------------------------------------------
hesap.get("/kayit", (req, res) => {
  if (res.locals.kullanici) return res.redirect("/");
  res.render("kayit");
});

hesap.post("/kayit", async (req, res) => {
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
// Şifremi unuttum
// E-posta gönderecek bir altyapı (SMTP + paket) henüz yok. Sayfa çalışır ve her durumda
// aynı mesajı gösterir; gerçek sıfırlama bağlantısı gönderimi sonraki adım.
// ---------------------------------------------------------------------------
hesap.get("/sifremi-unuttum", (req, res) => {
  res.render("sifremi-unuttum", { gonderildi: req.query.gonderildi === "1" });
});

hesap.post("/sifremi-unuttum", (req, res) => {
  const email = metin(req.body.email);
  if (!EPOSTA.test(email)) {
    return res.status(400).render("sifremi-unuttum", { hata: "Geçerli bir e-posta adresi yaz.", degerler: { email } });
  }
  // Kayıtlı olsa da olmasa da AYNI sonuç: hangi adreslerin kayıtlı olduğu öğrenilemesin
  res.redirect("/sifremi-unuttum?gonderildi=1");
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

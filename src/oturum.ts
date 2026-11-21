// Session and the shared data every page needs.
// Oturum (session) ve her sayfada gereken ortak veriler.
//
// How does it work?
//  1. On login we write req.session.userId = <user id>.
//  2. express-session sends the browser a cookie that contains only a random session id.
//     The real data (userId etc.) lives in the "sessions" table in the database (express-mysql-session).
//     So even if the server restarts, nobody is logged out.
//  3. On every request the "ortakVeriler" middleware below reads the user from userId and
//     puts it in res.locals.kullanici. Templates use locals.kullanici to tell member from guest.
// Nasıl çalışır?
//  1. Giriş yapınca req.session.userId = <kullanıcı id> yazarız.
//  2. express-session tarayıcıya yalnızca rastgele bir oturum kimliği içeren çerez (cookie) gönderir.
//     Asıl veri (userId vb.) veritabanındaki "sessions" tablosunda durur (express-mysql-session).
//     Böylece sunucu yeniden başlasa da kimse oturumdan düşmez.
//  3. Her istekte aşağıdaki "ortakVeriler" ara katmanı userId'den kullanıcıyı okur ve
//     res.locals.kullanici'ye koyar. Şablonlar locals.kullanici ile üye/misafir ayrımı yapar.
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.ts";
import { rutbeSutunlari, banliSql, bildir, geriAdres, puanEkle, premiumSql } from "./yardimci.ts";
import { ayarlar } from "./ayarlar.ts";
import { rutbeler, rutbeBul, acilanlar, oncekiRutbe, yetkiliMi } from "./rutbe.ts";
import { okunmamisOdaVar } from "./odalar.ts";
import { gunlukYakutVer, sonrakiHarclik, type YakutOdulu } from "./yakut.ts";

// We describe to TypeScript which fields live in req.session
// req.session içinde hangi alanların olduğunu TypeScript'e anlatıyoruz
declare module "express-session" {
  interface SessionData {
    userId: number;
    surum: number; // the value of users.oturum_surumu at login · users.oturum_surumu'nun girişteki değeri
    bildirim: { tur: "basari" | "hata"; metin: string; eylem?: { metin: string; link: string }; rutbe?: { renk: string; simge: string } };
    girisNotu: string;
    csrf: string;
    // the version of the dismissed announcement banner (ayarlar.ts)
    // kapatılan duyuru şeridinin sürümü (ayarlar.ts)
    duyuruKapatilan: string;
    // ruby reward dialogs waiting to be shown (src/yakut.ts)
    // gösterilmeyi bekleyen yakut ödül pencereleri (src/yakut.ts)
    yakutOdulleri: YakutOdulu[];
    // so the text written is not lost if a reply with attachments fails (src/ekler.ts)
    // ekli cevap hata verince yazılan metin kaybolmasın (src/ekler.ts)
    cevapTaslagi: { konu: number; content: string; nsfw?: boolean; kartKapali?: boolean };
  }
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET .env dosyasında yok. .env.example'a bak.");
}

const MySQLStore = MySQLStoreFactory(session as any);
const depo = new MySQLStore(
  {
    // we already created it in sql/06; otherwise the package would create it
    // sql/06'da zaten oluşturduk; yoksa paket oluşturur
    createDatabaseTable: true,
    clearExpired: true,        // deletes expired sessions every 15 minutes · süresi dolan oturumları 15 dakikada bir siler
    expiration: 30 * 24 * 60 * 60 * 1000,
    endConnectionOnClose: false, // the pool is ours; the package must not close it · havuz (pool) bizim; paket kapatmasın
  },
  pool as any
);

export const oturum = session({
  name: "rubyyard.sid",
  // signs the cookie: if the id is changed by hand the server notices
  // çerezi imzalar: kimlik elle değiştirilirse sunucu fark eder
  secret: process.env.SESSION_SECRET,
  store: depo,
  resave: false,             // do not rewrite an unchanged session on every request · değişmeyen oturumu her istekte yeniden yazma
  // do not open a session for guests for nothing (keeps the database from bloating)
  // misafirlere boşuna oturum açma (veritabanı şişmesin)
  saveUninitialized: false,
  cookie: {
    // JavaScript (document.cookie) cannot read the cookie: it cannot be stolen via XSS
    // JavaScript (document.cookie) çereze erişemez: XSS ile çalınamaz
    httpOnly: true,
    // the cookie is not attached to POST requests coming from other sites: basic protection against CSRF
    // başka sitelerden gelen POST isteklerine çerez eklenmez: CSRF'e karşı temel koruma
    sameSite: "lax",
    // "auto": if the request is HTTPS the cookie becomes Secure (sent only over an encrypted connection), and it keeps working on local HTTP.
    // Behind a reverse proxy, TRUST_PROXY must be set so it recognises HTTPS (server.ts).
    // "auto": istek HTTPS ise çerez Secure olur (yalnızca şifreli bağlantıda gönderilir), yerel HTTP'de çalışmaya devam eder.
    // Ters vekil arkasında HTTPS'i tanıması için TRUST_PROXY ayarlanmalı (server.ts).
    secure: "auto",
    // there is no maxAge here: if "Remember me" is chosen it is set to 30 days at login,
    // otherwise the cookie is deleted when the browser closes.
    // maxAge burada yok: "Beni hatırla" seçilirse girişte 30 gün olarak ayarlanır,
    // seçilmezse tarayıcı kapanınca çerez silinir.
  },
});

// ---------------------------------------------------------------------------
// CSRF protection (a second lock on top of sameSite=lax).
//
// Idea: we put a random token in the session and add it to EVERY POST form as a hidden field.
// A form on another site cannot know this token, so it cannot send a POST on our behalf.
//
// The token is generated "lazily": the first time res.locals.csrf is looked at (i.e. while a template draws a form).
// Why? Because saveUninitialized=false, a guest browsing pages that have no form never gets a session.
// On pages with forms such as login/signup, once the token is written to the session express-session
// saves the session and sends the cookie; when the guest submits the form the token is still there.
// (Since the session id is renewed at login, the old token goes away; the next page generates a new one.)
// CSRF koruması (sameSite=lax'in üstüne ikinci kilit).
//
// Fikir: oturuma rastgele bir belirteç koyarız ve HER POST formuna gizli alan olarak ekleriz.
// Başka bir sitedeki form bu belirteci bilemez, bu yüzden bizim adımıza POST gönderemez.
//
// Belirteç "tembel" üretilir: res.locals.csrf'ye ilk bakıldığında (yani bir şablon formu çizerken).
// Neden? saveUninitialized=false olduğu için formu olmayan sayfaları gezen misafire oturum açılmaz.
// Giriş/kayıt gibi formlu sayfalarda ise belirteç oturuma yazılınca express-session oturumu
// kaydeder ve çerezi gönderir; misafir formu gönderdiğinde belirteç yerinde durur.
// (Girişte oturum kimliği yenilendiği için eski belirteç gider; bir sonraki sayfa yenisini üretir.)
// ---------------------------------------------------------------------------
// Multipart (file-uploading) POST addresses: for these the csrf check is done after multer (yukleme.ts)
// Çok parçalı (dosya yükleyen) POST adresleri: csrf kontrolü bunlarda multer'dan sonra yapılır (yukleme.ts)
export const COKLU_PARCALI_ADRESLER = new Set(["/ayarlar/avatar", "/ayarlar/banner"]);
// The reply form that uploads comment attachments is multipart too; since its address contains the topic number, it is recognised by a pattern (src/ekler.ts ekliCevapKatmani)
// Yorum eki yükleyen cevap formu da çok parçalıdır; adresi konu numarası içerdiği için kalıpla tanınır (src/ekler.ts ekliCevapKatmani)
const cokluParcaliMi = (yol: string) => COKLU_PARCALI_ADRESLER.has(yol) || /^\/konu\/\d+\/cevap$/.test(yol);

// Is the incoming token the same as the one in the session? timingSafeEqual requires equal length; the comparison time does not reveal how many characters matched.
// Gelen belirteç oturumdakiyle aynı mı? timingSafeEqual aynı uzunlukta olmayı ister; karşılaştırma süresi kaç karakterin tuttuğunu ele vermez.
export function csrfEsit(req: Request, gelenHam: unknown): boolean {
  const beklenen = req.session.csrf;
  const gelen = typeof gelenHam === "string" ? gelenHam : "";
  const a = Buffer.from(beklenen ?? "");
  const b = Buffer.from(gelen);
  return !!beklenen && a.length === b.length && timingSafeEqual(a, b);
}

export function csrfKoru(req: Request, res: Response, next: NextFunction) {
  // Note: putting a "getter" on res.locals does not work. Express copies res.locals when rendering the page,
  // and copying calls the getter, so a token (and therefore a session) would be generated even on a page with no form.
  // Instead we hand over a small object that has toString: nothing happens when it is copied,
  // and the token is generated only when the template WRITES it to the page with <%= locals.csrf %>.
  // Dikkat: res.locals'a "getter" koymak işe yaramaz. Express sayfayı çizerken res.locals'ı kopyalar,
  // kopyalama getter'ı çağırır ve formu olmayan sayfada bile belirteç (dolayısıyla oturum) üretilirdi.
  // Bunun yerine toString'i olan küçük bir nesne veriyoruz: kopyalanınca bir şey olmaz,
  // belirteç yalnızca şablon <%= locals.csrf %> ile onu sayfaya YAZARKEN üretilir.
  res.locals.csrf = {
    toString() {
      if (!req.session.csrf) req.session.csrf = randomBytes(32).toString("hex");
      return req.session.csrf;
    },
  };

  // Read requests (GET/HEAD) do not change data, no check needed
  // Okuma istekleri (GET/HEAD) veri değiştirmez, kontrol gerekmez
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();

  // File-upload forms (multipart) are not parsed like an urlencoded body: the _csrf field appears only once multer reads the body.
  // So ONLY for the fixed addresses below, the check is deferred to csrfDogrula in the upload layer, AFTER multer
  // (src/yukleme.ts). If a multipart POST comes to any other address the body stays empty and the normal check below gives 403:
  // the protection is not turned off anywhere, only the time of validation changes.
  // Dosya yükleme formları (multipart) urlencoded gövde gibi çözülmez: _csrf alanı ancak multer gövdeyi okuyunca ortaya çıkar.
  // Bu yüzden YALNIZCA aşağıdaki sabit adresler için kontrol, multer'dan SONRA yüklemeKatmani'ndaki csrfDogrula'ya ertelenir
  // (src/yukleme.ts). Başka bir adrese multipart POST gelirse gövde boş kalır ve aşağıdaki normal kontrolde 403 olur:
  // koruma hiçbir yerde kapatılmış değildir, yalnızca doğrulama zamanı değişir.
  if (req.is("multipart/form-data") && cokluParcaliMi(req.path)) return next();

  if (csrfEsit(req, req.body?._csrf)) return next();

  // 403: a browser does not follow the Location header in a 403 response; so a small page
  // writes the toast to the session and sends the user back to the page they came from in 0 seconds.
  // 403: tarayıcı 403 yanıtındaki Location başlığını izlemez; bu yüzden küçük bir sayfa
  // toast'u oturuma yazıp kullanıcıyı 0 saniyede geldiği sayfaya geri yollar.
  if (req.session) bildir(req, "hata", "Oturum doğrulaması başarısız oldu. Sayfayı yenileyip tekrar dene.");
  // The address will be written into HTML, so special characters are escaped
  // Adres HTML içine yazılacağı için özel karakterlerden kaçırılır
  const geri = geriAdres(req, "/").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res.status(403).type("html").send(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${geri}">` +
    `<p>İstek doğrulanamadı. <a href="${geri}">Geri dön</a></p>`
  );
}

// The category list in the sidebar is needed on every page; since categories change rarely, a 30-second memory cache is enough
// (when a category is added in admin, it shows up in the menu within 30 s at the latest).
// Kenar menüdeki kategori listesi her sayfada gerekir; kategoriler seyrek değiştiği için 30 saniyelik bellek önbelleği yeter
// (yönetimde kategori eklenince en geç 30 sn sonra menüde görünür).
let menuKategoriOnbellegi: { bitis: number; liste: any[] } | null = null;
async function menuKategorileri() {
  if (menuKategoriOnbellegi && menuKategoriOnbellegi.bitis > Date.now()) return menuKategoriOnbellegi.liste;
  const [liste]: any = await pool.query("SELECT id, name FROM categories ORDER BY sort_order, id");
  menuKategoriOnbellegi = { bitis: Date.now() + 30_000, liste };
  return liste;
}

// ---------------------------------------------------------------------------
// Daily visit points and streak (sql/13): runs once, on the user's FIRST request of the day.
// The "once a day" guarantee comes from a single conditional UPDATE (if son_gunluk_puan is older than today): even if two concurrent
// requests arrive, only one changes the row (affectedRows = 1), the other does nothing.
// Streak: if they visited yesterday too, seri_gun + 1, otherwise it starts from 1. Every 7th consecutive day gives an extra "seri" point.
// For the day boundary the database's CURDATE() is used instead of JavaScript (a single clock source).
// Günlük ziyaret puanı ve seri (sql/13): kullanıcının günde İLK isteğinde bir kez çalışır.
// "Günde bir kez" garantisi tek bir koşullu UPDATE'ten gelir (son_gunluk_puan bugünden eskiyse): iki eşzamanlı istek
// gelse bile yalnızca biri satırı değiştirir (affectedRows = 1), öbürü hiçbir şey yapmaz.
// Seri: dün de ziyaret edildiyse seri_gun + 1, değilse 1'den başlar. Her 7. ardışık günde ek "seri" puanı verilir.
// Gün sınırı için JavaScript yerine veritabanının CURDATE()'i kullanılır (tek saat kaynağı).
// ---------------------------------------------------------------------------
async function gunlukPuan(req: Request, k: any) {
  const [sonuc]: any = await pool.query(
    `UPDATE users
        SET seri_gun = IF(son_gunluk_puan = CURDATE() - INTERVAL 1 DAY, seri_gun + 1, 1), son_gunluk_puan = CURDATE()
      WHERE id = ? AND (son_gunluk_puan IS NULL OR son_gunluk_puan < CURDATE())`,
    [k.id]
  );
  if (!sonuc.affectedRows) return;
  const kural = (await ayarlar()).puan;
  const [[g]]: any = await pool.query("SELECT seri_gun FROM users WHERE id = ?", [k.id]);
  let sonPuan = Number(k.points);
  if (kural.gunluk > 0) sonPuan = (await puanEkle(k.id, kural.gunluk, "gunluk")).yeni;
  if (kural.seri > 0 && g.seri_gun % 7 === 0) sonPuan = (await puanEkle(k.id, kural.seri, "seri")).yeni;
  // So this request's page shows the new points and rank
  // Bu istekte sayfa yeni puanı ve rütbeyi göstersin
  k.points = sonPuan;
  k.rutbe = rutbeBul(sonPuan)?.name ?? k.rutbe;
  k.rutbe_id = rutbeBul(sonPuan)?.id ?? k.rutbe_id;
  // The daily-login ruby and (if the month changed) the monthly allowance are given with the same "first request of the day" guarantee (src/yakut.ts)
  // Günlük giriş yakutu ve (ay değiştiyse) aylık harçlık da aynı "günde ilk istek" garantisiyle verilir (src/yakut.ts)
  k.yakut = await gunlukYakutVer(req, k, Number(g.seri_gun), sonPuan);
  // If the daily points caused a rank-up, show the celebration on the same page
  // Günlük puanla rütbe atlandıysa kutlama aynı sayfada gösterilsin
  const [[ku]]: any = await pool.query("SELECT kutlama_rutbe_id FROM users WHERE id = ?", [k.id]);
  k.kutlama_rutbe_id = ku.kutlama_rutbe_id;
}

// When a rank-up happens (src/yardimci.ts rutbeKontrol) users.kutlama_rutbe_id is filled; on the next page the celebration notification
// bar is drawn and the field is cleared. If another notification bar (flash) already exists, the celebration waits for the next page.
// Rütbe atlayınca (src/yardimci.ts rutbeKontrol) users.kutlama_rutbe_id dolar; bir sonraki sayfada kutlama bildirim
// çubuğu çizilir ve alan temizlenir. Başka bir bildirim çubuğu (flash) zaten varsa kutlama sonraki sayfaya kalır.
async function rutbeKutlamasi(req: Request, res: Response, k: any) {
  // Only on page loads (GET): a bar not drawn on a POST's redirect would be wasted
  // Yalnızca sayfa açılışlarında (GET): POST'un yönlendirmesinde çizilmeyen bir çubuk boşa harcanırdı
  if (req.method !== "GET" || res.locals.bildirim) return;
  const kutlama = k.kutlama_rutbe_id;
  if (!kutlama) return;
  await pool.query("UPDATE users SET kutlama_rutbe_id = NULL WHERE id = ? AND kutlama_rutbe_id = ?", [k.id, kutlama]);
  const r = (await rutbeler()).find((x) => x.id === kutlama);
  if (!r) return;
  // Admins/moderators already have every privilege (same rule as in the notification): only "You became <Rank>!"
  // Yönetici/moderatör zaten her ayrıcalığa sahip (bildirimdeki kuralla aynı): yalnızca "<Rütbe> oldun!"
  const acilan = yetkiliMi(k.rol) ? [] : acilanlar(oncekiRutbe(r), r).filter((a) => !a.yakinda).map((a) => a.cumle);
  res.locals.bildirim = {
    tur: "basari", rutbe: { renk: r.renk, simge: r.simge },
    metin: `${r.name} oldun!${acilan.length ? " Artık " + acilan.join(", ") + "." : ""}`,
    eylem: { metin: "Rütbeler", link: "/rutbeler" },
  };
}

// If there is a pending ruby reward, it is shown as a dialog on the next page (views/partials/yakut-odul.ejs) and removed from the queue.
// Only on a real page load (GET + browser "document" request): fragments fetched with fetch, like the member card, must not
// consume the dialog. Removal from the queue happens WHILE THE PAGE IS RENDERED (so a GET that redirects does not waste the reward); the wrapper in server.ts
// sometimes renders the same page a second time, so the removal is done once.
// Bekleyen yakut ödülü varsa sıradaki sayfada pencere olarak gösterilir (views/partials/yakut-odul.ejs) ve kuyruktan düşer.
// Yalnızca gerçek sayfa açılışında (GET + tarayıcı "document" isteği): üye kartı gibi fetch ile gelen parçalar pencereyi
// tüketmesin. Kuyruktan düşme sayfa ÇİZİLİRKEN olur (yönlendirme olan bir GET ödülü boşa harcamasın); server.ts'teki sarmalayıcı
// bazen aynı sayfayı ikinci kez çizdiği için düşme bir kez yapılır.
function yakutOdulHazirla(req: Request, res: Response, k: any) {
  const kuyruk = req.session.yakutOdulleri;
  const hedef = req.headers["sec-fetch-dest"];
  if (!kuyruk?.length || req.method !== "GET" || (hedef && hedef !== "document")) return;
  const odul = kuyruk[0];
  res.locals.yakutOdul = { ...odul, sonraki: odul.tur === "harclik" ? sonrakiHarclik(Number(k.points)) : null };
  const cizOrijinal = (res as any).render.bind(res);
  let dustu = false;
  (res as any).render = (...a: any[]) => {
    if (!dustu) { dustu = true; req.session.yakutOdulleri = (req.session.yakutOdulleri ?? []).slice(1); }
    return cizOrijinal(...a);
  };
}

// ---------------------------------------------------------------------------
// Runs on every request: prepares the user, their preferences and the top-bar data.
// Her istekte çalışır: kullanıcıyı, tercihlerini ve üst çubuk verilerini hazırlar.
// ---------------------------------------------------------------------------
export async function ortakVeriler(req: Request, res: Response, next: NextFunction) {
  res.locals.kullanici = null;
  res.locals.tema = "koyu";
  res.locals.vurgu = "safir";
  res.locals.menuYonu = "sol";
  res.locals.kompakt = false;
  res.locals.azAnimasyon = false;
  res.locals.adres = req.path; // for the active item in menus · menülerde aktif öğe için
  res.locals.menuKategoriler = await menuKategorileri();
  // so the rank cache is fresh (the rank chip and privileges are read synchronously in templates)
  // rütbe önbelleği taze olsun (rütbe çipi ve ayrıcalıklar şablonlarda senkron okunur)
  await rutbeler();

  // Announcement banner (partials/duyuru.ejs): only if it has content and was not dismissed in this session
  // Duyuru şeridi (partials/duyuru.ejs): yalnızca doluysa ve bu oturumda kapatılmadıysa
  const site = await ayarlar();
  res.locals.duyuru = site.duyuru && req.session.duyuruKapatilan !== site.duyuruSurum
    ? { metin: site.duyuru, tur: site.duyuruTur }
    : null;

  // Flash notification: shown once and then deleted
  // Flash bildirim: bir kez gösterilip silinir
  if (req.session.bildirim) {
    res.locals.bildirim = req.session.bildirim;
    delete req.session.bildirim;
  }

  const userId = req.session.userId;
  if (!userId) return next();

  const [satirlar]: any = await pool.query(
    `SELECT users.id, users.username, users.points, users.tema, users.vurgu, users.menu_sagda,
            users.premium_bitis, ${premiumSql("users")} AS premium_aktif, users.profil_efekti, users.profil_renk_ana, users.profil_renk_vurgu, users.profil_renk_gecis,
            users.banner_url, users.avatar_hareketli, users.banner_hareketli,
            users.kompakt, users.az_animasyon, users.nsfw_tercih, users.kutlama_rutbe_id, users.yakut, users.seri_gun, users.last_seen_at, users.banned_at, users.deleted_at, users.oturum_surumu,
            ${banliSql("users")} AS banli,
            roles.name AS rol,
            ${rutbeSutunlari("users")}
       FROM users
       JOIN roles ON roles.id = users.role_id
      WHERE users.id = ?`,
    [userId]
  );
  const k = satirlar[0];

  // If a timed ban has ended (banned_at is set but it is no longer active) clear the row: the user continues normally.
  // Süreli ban bitmişse (banned_at dolu ama artık aktif değil) satırı temizle: kullanıcı normal devam eder.
  if (k && k.banned_at && !k.banli) {
    await pool.query("UPDATE users SET banned_at = NULL, banned_until = NULL, ban_reason = NULL WHERE id = ?", [k.id]);
  }

  // If the account is deleted, currently suspended, or the password changed after this session was opened, close the session.
  // (if there is no surum: an old session opened before this feature counts as 0)
  // Hesap silinmiş, şu an uzaklaştırılmış ya da şifre bu oturum açıldıktan sonra değişmişse oturumu kapat.
  // (surum yoksa: bu özellikten önce açılmış eski oturum, 0 sayılır)
  if (!k || k.deleted_at || k.banli || (req.session.surum ?? 0) !== k.oturum_surumu) {
    delete req.session.userId;
    return next();
  }

  res.locals.kullanici = k;
  await gunlukPuan(req, k);
  await rutbeKutlamasi(req, res, k);
  yakutOdulHazirla(req, res, k);
  // "sistem": CSS decides from the browser's light/dark preference (@media prefers-color-scheme),
  // the server cannot know it; so we send data-tema="sistem" as it is.
  // "sistem": tarayıcının açık/koyu tercihine CSS karar verir (@media prefers-color-scheme),
  // sunucu bunu bilemez; bu yüzden data-tema="sistem" olarak olduğu gibi gönderiyoruz.
  res.locals.tema = ["acik", "sistem"].includes(k.tema) ? k.tema : "koyu";
  res.locals.vurgu = k.vurgu;
  res.locals.menuYonu = k.menu_sagda ? "sag" : "sol";
  res.locals.kompakt = !!k.kompakt;
  res.locals.azAnimasyon = !!k.az_animasyon;
  // +18 attachments: gizle (hide) | bulanik (blur) | goster (show) (undefined for guests → templates treat it as "gizle")
  // +18 ekler: gizle | bulanik | goster (misafirde tanımsız → şablonlar "gizle" sayar)
  res.locals.nsfwTercih = k.nsfw_tercih;

  // The "Change category" list in the moderation menu (queried only for staff)
  // Moderasyon menüsündeki "Kategoriyi değiştir" listesi (yalnızca yetkililer için sorgulanır)
  if (["admin", "moderator"].includes(k.rol)) {
    const [kategoriler] = await pool.query("SELECT id, name FROM categories ORDER BY sort_order, id");
    res.locals.tumKategoriler = kategoriler;
    // The pending-report count shown on the "Management" item in the avatar menu and in the panel's sidebar
    // Avatar menüsündeki "Yönetim" öğesinde ve panelin kenar menüsünde görünen bekleyen şikâyet sayısı
    const [[bekleyen]]: any = await pool.query("SELECT COUNT(*) AS n FROM reports WHERE durum = 'bekliyor'");
    res.locals.bekleyenSikayet = Number(bekleyen.n);
  }

  // Top bar: unread counts and the last 5 notifications in the bell panel
  // Üst çubuk: okunmamış sayıları ve zil panelindeki son 5 bildirim
  const [[sayilar]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL) AS bildirim,
            (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND read_at IS NULL) AS mesaj`,
    [k.id, k.id]
  );
  res.locals.okunmamisBildirim = Number(sayilar.bildirim);
  res.locals.okunmamisMesaj = Number(sayilar.mesaj);
  // The dot on "Chat" in the menus: is there an unread message in a room that is not muted (src/odalar.ts)
  // Menülerde "Sohbet" üzerindeki nokta: sessize alınmamış bir odada okunmamış mesaj var mı (src/odalar.ts)
  res.locals.okunmamisOda = await okunmamisOdaVar(k.id);

  const [sonBildirimler]: any = await pool.query(
    `SELECT notifications.id, notifications.metin, notifications.created_at, notifications.read_at,
            users.username AS kisi
       FROM notifications
       LEFT JOIN users ON users.id = notifications.actor_id
      WHERE notifications.user_id = ?
      ORDER BY notifications.created_at DESC, notifications.id DESC
      LIMIT 5`,
    [k.id]
  );
  // Convert to the format bildirim-paneli.ejs expects.
  // The link goes through /bildirimler/<id>: there it is marked as read and redirected to the real address.
  // bildirim-paneli.ejs'in beklediği biçime çevir.
  // Bağlantı /bildirimler/<id> üzerinden gider: orada okundu işaretlenip asıl adrese yönlendirilir.
  res.locals.bildirimler = sonBildirimler.map((n: any) => ({
    avatar_harf: n.kisi ? n.kisi[0] : "Q",
    metin: n.metin,
    zaman: n.created_at,
    okunmadi: !n.read_at,
    link: "/bildirimler/" + n.id,
  }));

  // "Last seen" for the online list. To avoid writing on every request, at most once a minute.
  // Çevrimiçi listesi için "son görülme". Her istekte yazmamak için dakikada en fazla bir kez.
  if (!k.last_seen_at || Date.now() - new Date(k.last_seen_at).getTime() > 60_000) {
    await pool.query("UPDATE users SET last_seen_at = NOW() WHERE id = ?", [k.id]);
  }

  next();
}

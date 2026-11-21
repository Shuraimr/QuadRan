// Oturum (session) ve her sayfada gereken ortak veriler.
//
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

// req.session içinde hangi alanların olduğunu TypeScript'e anlatıyoruz
declare module "express-session" {
  interface SessionData {
    userId: number;
    surum: number; // users.oturum_surumu'nun girişteki değeri
    bildirim: { tur: "basari" | "hata"; metin: string; eylem?: { metin: string; link: string }; rutbe?: { renk: string; simge: string } };
    girisNotu: string;
    csrf: string;
    duyuruKapatilan: string; // kapatılan duyuru şeridinin sürümü (ayarlar.ts)
  }
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET .env dosyasında yok. .env.example'a bak.");
}

const MySQLStore = MySQLStoreFactory(session as any);
const depo = new MySQLStore(
  {
    createDatabaseTable: true, // sql/06'da zaten oluşturduk; yoksa paket oluşturur
    clearExpired: true,        // süresi dolan oturumları 15 dakikada bir siler
    expiration: 30 * 24 * 60 * 60 * 1000,
    endConnectionOnClose: false, // havuz (pool) bizim; paket kapatmasın
  },
  pool as any
);

export const oturum = session({
  name: "quadran.sid",
  secret: process.env.SESSION_SECRET, // çerezi imzalar: kimlik elle değiştirilirse sunucu fark eder
  store: depo,
  resave: false,             // değişmeyen oturumu her istekte yeniden yazma
  saveUninitialized: false,  // misafirlere boşuna oturum açma (veritabanı şişmesin)
  cookie: {
    httpOnly: true,  // JavaScript (document.cookie) çereze erişemez: XSS ile çalınamaz
    sameSite: "lax", // başka sitelerden gelen POST isteklerine çerez eklenmez: CSRF'e karşı temel koruma
    // "auto": istek HTTPS ise çerez Secure olur (yalnızca şifreli bağlantıda gönderilir), yerel HTTP'de çalışmaya devam eder.
    // Ters vekil arkasında HTTPS'i tanıması için TRUST_PROXY ayarlanmalı (server.ts).
    secure: "auto",
    // maxAge burada yok: "Beni hatırla" seçilirse girişte 30 gün olarak ayarlanır,
    // seçilmezse tarayıcı kapanınca çerez silinir.
  },
});

// ---------------------------------------------------------------------------
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
// Çok parçalı (dosya yükleyen) POST adresleri: csrf kontrolü bunlarda multer'dan sonra yapılır (yukleme.ts)
export const COKLU_PARCALI_ADRESLER = new Set(["/ayarlar/avatar", "/ayarlar/banner"]);

// Gelen belirteç oturumdakiyle aynı mı? timingSafeEqual aynı uzunlukta olmayı ister; karşılaştırma süresi kaç karakterin tuttuğunu ele vermez.
export function csrfEsit(req: Request, gelenHam: unknown): boolean {
  const beklenen = req.session.csrf;
  const gelen = typeof gelenHam === "string" ? gelenHam : "";
  const a = Buffer.from(beklenen ?? "");
  const b = Buffer.from(gelen);
  return !!beklenen && a.length === b.length && timingSafeEqual(a, b);
}

export function csrfKoru(req: Request, res: Response, next: NextFunction) {
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

  // Okuma istekleri (GET/HEAD) veri değiştirmez, kontrol gerekmez
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();

  // Dosya yükleme formları (multipart) urlencoded gövde gibi çözülmez: _csrf alanı ancak multer gövdeyi okuyunca ortaya çıkar.
  // Bu yüzden YALNIZCA aşağıdaki sabit adresler için kontrol, multer'dan SONRA yüklemeKatmani'ndaki csrfDogrula'ya ertelenir
  // (src/yukleme.ts). Başka bir adrese multipart POST gelirse gövde boş kalır ve aşağıdaki normal kontrolde 403 olur:
  // koruma hiçbir yerde kapatılmış değildir, yalnızca doğrulama zamanı değişir.
  if (req.is("multipart/form-data") && COKLU_PARCALI_ADRESLER.has(req.path)) return next();

  if (csrfEsit(req, req.body?._csrf)) return next();

  // 403: tarayıcı 403 yanıtındaki Location başlığını izlemez; bu yüzden küçük bir sayfa
  // toast'u oturuma yazıp kullanıcıyı 0 saniyede geldiği sayfaya geri yollar.
  if (req.session) bildir(req, "hata", "Oturum doğrulaması başarısız oldu. Sayfayı yenileyip tekrar dene.");
  // Adres HTML içine yazılacağı için özel karakterlerden kaçırılır
  const geri = geriAdres(req, "/").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res.status(403).type("html").send(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${geri}">` +
    `<p>İstek doğrulanamadı. <a href="${geri}">Geri dön</a></p>`
  );
}

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
// Günlük ziyaret puanı ve seri (sql/13): kullanıcının günde İLK isteğinde bir kez çalışır.
// "Günde bir kez" garantisi tek bir koşullu UPDATE'ten gelir (son_gunluk_puan bugünden eskiyse): iki eşzamanlı istek
// gelse bile yalnızca biri satırı değiştirir (affectedRows = 1), öbürü hiçbir şey yapmaz.
// Seri: dün de ziyaret edildiyse seri_gun + 1, değilse 1'den başlar. Her 7. ardışık günde ek "seri" puanı verilir.
// Gün sınırı için JavaScript yerine veritabanının CURDATE()'i kullanılır (tek saat kaynağı).
// ---------------------------------------------------------------------------
async function gunlukPuan(k: any) {
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
  // Bu istekte sayfa yeni puanı ve rütbeyi göstersin
  k.points = sonPuan;
  k.rutbe = rutbeBul(sonPuan)?.name ?? k.rutbe;
  k.rutbe_id = rutbeBul(sonPuan)?.id ?? k.rutbe_id;
  // Günlük puanla rütbe atlandıysa kutlama aynı sayfada gösterilsin
  const [[ku]]: any = await pool.query("SELECT kutlama_rutbe_id FROM users WHERE id = ?", [k.id]);
  k.kutlama_rutbe_id = ku.kutlama_rutbe_id;
}

// Rütbe atlayınca (src/yardimci.ts rutbeKontrol) users.kutlama_rutbe_id dolar; bir sonraki sayfada kutlama bildirim
// çubuğu çizilir ve alan temizlenir. Başka bir bildirim çubuğu (flash) zaten varsa kutlama sonraki sayfaya kalır.
async function rutbeKutlamasi(req: Request, res: Response, k: any) {
  // Yalnızca sayfa açılışlarında (GET): POST'un yönlendirmesinde çizilmeyen bir çubuk boşa harcanırdı
  if (req.method !== "GET" || res.locals.bildirim) return;
  const kutlama = k.kutlama_rutbe_id;
  if (!kutlama) return;
  await pool.query("UPDATE users SET kutlama_rutbe_id = NULL WHERE id = ? AND kutlama_rutbe_id = ?", [k.id, kutlama]);
  const r = (await rutbeler()).find((x) => x.id === kutlama);
  if (!r) return;
  // Yönetici/moderatör zaten her ayrıcalığa sahip (bildirimdeki kuralla aynı): yalnızca "<Rütbe> oldun!"
  const acilan = yetkiliMi(k.rol) ? [] : acilanlar(oncekiRutbe(r), r).filter((a) => !a.yakinda).map((a) => a.cumle);
  res.locals.bildirim = {
    tur: "basari", rutbe: { renk: r.renk, simge: r.simge },
    metin: `${r.name} oldun!${acilan.length ? " Artık " + acilan.join(", ") + "." : ""}`,
    eylem: { metin: "Rütbeler", link: "/rutbeler" },
  };
}

// ---------------------------------------------------------------------------
// Her istekte çalışır: kullanıcıyı, tercihlerini ve üst çubuk verilerini hazırlar.
// ---------------------------------------------------------------------------
export async function ortakVeriler(req: Request, res: Response, next: NextFunction) {
  res.locals.kullanici = null;
  res.locals.tema = "koyu";
  res.locals.vurgu = "safir";
  res.locals.menuYonu = "sol";
  res.locals.kompakt = false;
  res.locals.azAnimasyon = false;
  res.locals.adres = req.path; // menülerde aktif öğe için
  res.locals.menuKategoriler = await menuKategorileri();
  await rutbeler(); // rütbe önbelleği taze olsun (rütbe çipi ve ayrıcalıklar şablonlarda senkron okunur)

  // Duyuru şeridi (partials/duyuru.ejs): yalnızca doluysa ve bu oturumda kapatılmadıysa
  const site = await ayarlar();
  res.locals.duyuru = site.duyuru && req.session.duyuruKapatilan !== site.duyuruSurum
    ? { metin: site.duyuru, tur: site.duyuruTur }
    : null;

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
            users.kompakt, users.az_animasyon, users.kutlama_rutbe_id, users.last_seen_at, users.banned_at, users.deleted_at, users.oturum_surumu,
            ${banliSql("users")} AS banli,
            roles.name AS rol,
            ${rutbeSutunlari("users")}
       FROM users
       JOIN roles ON roles.id = users.role_id
      WHERE users.id = ?`,
    [userId]
  );
  const k = satirlar[0];

  // Süreli ban bitmişse (banned_at dolu ama artık aktif değil) satırı temizle: kullanıcı normal devam eder.
  if (k && k.banned_at && !k.banli) {
    await pool.query("UPDATE users SET banned_at = NULL, banned_until = NULL, ban_reason = NULL WHERE id = ?", [k.id]);
  }

  // Hesap silinmiş, şu an uzaklaştırılmış ya da şifre bu oturum açıldıktan sonra değişmişse oturumu kapat.
  // (surum yoksa: bu özellikten önce açılmış eski oturum, 0 sayılır)
  if (!k || k.deleted_at || k.banli || (req.session.surum ?? 0) !== k.oturum_surumu) {
    delete req.session.userId;
    return next();
  }

  res.locals.kullanici = k;
  await gunlukPuan(k);
  await rutbeKutlamasi(req, res, k);
  // "sistem": tarayıcının açık/koyu tercihine CSS karar verir (@media prefers-color-scheme),
  // sunucu bunu bilemez; bu yüzden data-tema="sistem" olarak olduğu gibi gönderiyoruz.
  res.locals.tema = ["acik", "sistem"].includes(k.tema) ? k.tema : "koyu";
  res.locals.vurgu = k.vurgu;
  res.locals.menuYonu = k.menu_sagda ? "sag" : "sol";
  res.locals.kompakt = !!k.kompakt;
  res.locals.azAnimasyon = !!k.az_animasyon;

  // Moderasyon menüsündeki "Kategoriyi değiştir" listesi (yalnızca yetkililer için sorgulanır)
  if (["admin", "moderator"].includes(k.rol)) {
    const [kategoriler] = await pool.query("SELECT id, name FROM categories ORDER BY sort_order, id");
    res.locals.tumKategoriler = kategoriler;
    // Avatar menüsündeki "Yönetim" öğesinde ve panelin kenar menüsünde görünen bekleyen şikâyet sayısı
    const [[bekleyen]]: any = await pool.query("SELECT COUNT(*) AS n FROM reports WHERE durum = 'bekliyor'");
    res.locals.bekleyenSikayet = Number(bekleyen.n);
  }

  // Üst çubuk: okunmamış sayıları ve zil panelindeki son 5 bildirim
  const [[sayilar]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL) AS bildirim,
            (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND read_at IS NULL) AS mesaj`,
    [k.id, k.id]
  );
  res.locals.okunmamisBildirim = Number(sayilar.bildirim);
  res.locals.okunmamisMesaj = Number(sayilar.mesaj);
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
  // bildirim-paneli.ejs'in beklediği biçime çevir.
  // Bağlantı /bildirimler/<id> üzerinden gider: orada okundu işaretlenip asıl adrese yönlendirilir.
  res.locals.bildirimler = sonBildirimler.map((n: any) => ({
    avatar_harf: n.kisi ? n.kisi[0] : "Q",
    metin: n.metin,
    zaman: n.created_at,
    okunmadi: !n.read_at,
    link: "/bildirimler/" + n.id,
  }));

  // Çevrimiçi listesi için "son görülme". Her istekte yazmamak için dakikada en fazla bir kez.
  if (!k.last_seen_at || Date.now() - new Date(k.last_seen_at).getTime() > 60_000) {
    await pool.query("UPDATE users SET last_seen_at = NOW() WHERE id = ?", [k.id]);
  }

  next();
}

import { SEBEP_LISTESI } from "./sikayet.ts";
import { belirtme } from "./gizlilik.ts";
import { bulunmaEki, durumSayfasi, yerelAdres } from "./yardimci.ts";
import { ayarlar } from "./ayarlar.ts";
import { rutbeBulId, icerikHtml, baglantiKartlari, disBaglantiHtml, cikisAdresi, rutbeCizimiBaslat, rutbeTazele } from "./rutbe.ts";
import express from "express";
import { oturum, ortakVeriler, csrfKoru } from "./oturum.ts";
import { cikis } from "./rotalar/cikis.ts";
import { hesap } from "./rotalar/hesap.ts";
import { forum } from "./rotalar/forum.ts";
import { mesaj } from "./rotalar/mesaj.ts";
import { takip } from "./rotalar/takip.ts";
import { rutbeRotasi } from "./rotalar/rutbe.ts";
import { iletisim } from "./rotalar/iletisim.ts";
import { odalar } from "./rotalar/odalar.ts";
import { moderasyon } from "./rotalar/moderasyon.ts";
import { yonetim } from "./rotalar/yonetim.ts";
import { duyuruRotasi } from "./ayarlar.ts";
import { premiumRotasi } from "./rotalar/premium.ts";
import { yakutRotasi } from "./rotalar/yakut.ts";
import { EFEKTLER, SUSLER, SVG, EFEKT_ADLARI, SUS_ADLARI } from "./profil-gorunum.ts";
import { onizleme } from "./onizleme.ts";
import { katmanlar } from "./onizleme-katmanlar.ts";
import { sayfalar } from "./onizleme-sayfalar.ts";

const app = express();
// PORT ortam değişkeniyle değiştirilebilir (aynı anda ikinci bir kopya denemek için); verilmezse 3000
const PORT = Number(process.env.PORT) || 3000;

// "X-Powered-By: Express" başlığı saldırgana hangi yazılımı hedefleyeceğini söyler; gereksiz bilgi, kapatılır.
app.disable("x-powered-by");
// Site bir ters vekilin (nginx, Caddy, Cloudflare) arkasına konursa TRUST_PROXY=1 verilir: o zaman req.ip gerçek ziyaretçi
// IP'si olur (hız sınırı herkesi tek kovaya atmaz) ve req.secure HTTPS'i tanır (çerez Secure olur). Vekil yokken
// X-Forwarded-For'a GÜVENİLMEZ, çünkü saldırgan bu başlığı uydurup hız sınırını atlatabilir.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

// Güvenlik başlıkları (paket yerine elle; her birinin ne işe yaradığı görülsün diye):
// - CSP: tarayıcıya yalnızca kendi sitemizden betik çalıştırmasını söyler. İleride bir şablonda kaçırma unutulsa bile
//   araya sokulan <script> ya da onclick="..." ÇALIŞMAZ (XSS'e ikinci savunma hattı). Bu yüzden şablonlarda satır içi
//   betik/olay özniteliği yok; onaylar data-onay ile quadran.js'te. Satır içi stil (style="--x:..") serbest: efektler kullanıyor.
// - frame-ancestors 'none' + X-Frame-Options: site başka bir sitenin iframe'ine konamaz (görünmez çerçeveyle tıklatma, clickjacking).
// - nosniff: tarayıcı dosya türünü tahmin etmez (yüklenen bir görsel betik gibi yorumlanamaz).
// - Referrer-Policy: başka siteye giden bağlantıda adresimizin yalnızca alan adı gider (oda davet kodu gibi yollar sızmaz).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",   // blob: avatar/banner kırpma önizlemesi için
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com",   // yalnızca YouTube kartı oynatılınca açılan iframe (yorum eki kartları)
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.set("view engine", "ejs");
app.set("views", "views");

// public/ klasöründeki dosyalar (CSS gibi) doğrudan sunulur: /css/quadran.css
app.use(express.static("public"));
// Yüklenen avatar/banner dosyaları (src/yukleme.ts): adları rastgele (uuid) ve değişmez olduğundan uzun süre önbelleğe alınır.
// nosniff: tarayıcı dosyayı içeriğine bakıp başka türe yorumlamaz (yalnızca WebP olarak yazıyoruz, ek güvence).
app.use("/yuklemeler", express.static("yuklemeler", {
  maxAge: "30d", immutable: true, index: false, dotfiles: "deny",
  setHeaders: (res) => { res.setHeader("X-Content-Type-Options", "nosniff"); },
}));

// Çevrimdışı sayfası (public/cevrimdisi.html): service worker (public/sw.js) bunu önbelleğe alır, ağ yokken gösterir.
// Adresi uzantısız tutmak için ayrı rota; no-cache: sunucudaki hâli değişince worker güncel kopyayı alsın.
app.get("/cevrimdisi", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile("cevrimdisi.html", { root: "public" });
});
// Form gövdelerini (application/x-www-form-urlencoded) req.body'ye çevirir
app.use(express.urlencoded({ extended: false }));
// Oturum + her sayfada gereken ortak veriler (giriş yapan kullanıcı, bildirim sayıları...)
app.use(oturum);
app.use(ortakVeriler);
// Her POST'ta gizli _csrf alanını doğrular (gövde yukarıda çözümlendiği için burada okunabilir)
app.use(csrfKoru);

// Rütbe çipi/ayrıcalığı numarayla çözülür (src/rutbe.ts rutbeBulId). Çizim sırasında bir numara önbellekte bulunamazsa
// (ör. rütbe başka bir süreçten az önce eklendi) sayfa sessizce gri çiple gitmesin: önbellek BİR KEZ tazelenir ve sayfa
// yeniden çizilir. Hâlâ eksikse uyarı zaten konsola yazılmıştır, yine de sayfa gösterilir.
app.use((req, res, next) => {
  const orijinal = (res as any).render.bind(res);
  (res as any).render = (gorunum: string, secenek?: any, cb?: Function) => {
    if (typeof secenek === "function") { cb = secenek; secenek = undefined; }
    const bitir = (hata: Error | null, html?: string) =>
      cb ? cb(hata, html) : hata ? next(hata) : res.send(html);
    // Her çizimin kendi "eksik" durumu var (src/rutbe.ts): eşzamanlı isteklerin bayrakları birbirine karışmaz.
    const durum = { eksik: false };
    rutbeCizimiBaslat(durum, () => orijinal(gorunum, secenek, (hata: Error | null, html?: string) => {
      if (!hata && durum.eksik) {
        const ikinci = { eksik: false };
        rutbeTazele()
          .then(() => rutbeCizimiBaslat(ikinci, () => orijinal(gorunum, secenek, (h2: Error | null, h2html?: string) => bitir(h2, h2html))))
          .catch(next);
        return;
      }
      bitir(hata, html);
    }));
  };
  next();
});

// Bakım modu (sql/24, panel: Kayıt ve erişim): açıkken yetkililer siteyi normal kullanır (üstte "Bakım modu açık" şeridi,
// partials/duyuru.ejs), diğer herkes 503 bakım sayfasını görür. Oturum ve kullanıcı bilgisi ortakVeriler'de hazır olduğu için
// buraya konuldu. Açık kalanlar: /giris (yetkili girebilsin), /cikis (oturum kapatılabilsin), /cevrimdisi (service worker sayfası);
// statik dosyalar (/css, /js, /sw.js) zaten daha yukarıda sunuluyor, bakım sayfası da bunlara muhtaç.
app.use(async (req, res, next) => {
  const site = await ayarlar();
  if (!site.bakimModu) return next();
  if (["admin", "moderator"].includes(res.locals.kullanici?.rol)) { res.locals.bakimSeridi = true; return next(); }
  if (["/giris", "/cikis"].includes(req.path)) return next();
  res.setHeader("Retry-After", "600");
  durumSayfasi(req, res, 503, { metin: site.bakimMetni || undefined });
});

// Gerçek sayfalar
app.use(cikis);        // /cikis: dış bağlantı onay sayfası
app.use(hesap);
app.use(takip);        // /takip: takip et/bırak, /profil/:ad/takipciler|takip-edilenler
app.use(forum);
app.use(rutbeRotasi);  // /rutbeler
app.use(premiumRotasi); // /premium
app.use(yakutRotasi);   // /yakut: cüzdan, mağaza, unvanlar (sql/22)
app.use(mesaj);
app.use(iletisim);
app.use(odalar);       // /oda: özel odalar (davetle girilen grup sohbetleri)
app.use(moderasyon);
app.use(yonetim);      // /yonetim: gelişmiş yönetim paneli (moderatör + admin)
app.use(duyuruRotasi); // POST /duyuru/kapat

// Tasarım önizlemesi (örnek veriyle): /onizleme/konu, /onizleme/profil ...
// Yalnızca geliştirmede açık: sahte verilerle (örn. admin görünümü) çizilen sayfalar yayındaki sitede görünmemeli.
if (process.env.NODE_ENV !== "production") {
  app.use("/onizleme", onizleme);
  app.use("/onizleme", katmanlar); // /onizleme/katmanlar
  app.use("/onizleme", sayfalar);  // /onizleme/mesajlar, /bildirimler, /ara, /siralama, /sohbet, /moderasyon, /sifremi-unuttum
}

// Şikâyet penceresi (partials/sikayet-penceresi.ejs) birçok sayfada yer alır; sebep listesi ve Türkçe "-i hâli" yardımcısı her şablonda hazır olsun
app.locals.sikayetSebepleri = SEBEP_LISTESI;
app.locals.belirtme = belirtme;
// Rütbe çipi (partials/rutbe.ejs) ve kullanıcı içeriğinde yazar rütbesine göre bağlantı (src/rutbe.ts)
app.locals.rutbeBulId = rutbeBulId;
app.locals.bulunmaEki = bulunmaEki;
app.locals.icerikHtml = icerikHtml;
app.locals.baglantiKartlari = baglantiKartlari; app.locals.disBaglantiHtml = disBaglantiHtml; app.locals.cikisAdresi = cikisAdresi;
// Profil efektleri ve avatar süsleri (src/profil-gorunum.ts): sabit veri, şablonlar çizer
app.locals.EFEKTLER = EFEKTLER; app.locals.SUSLER = SUSLER; app.locals.SVG = SVG;
app.locals.EFEKT_ADLARI = EFEKT_ADLARI; app.locals.SUS_ADLARI = SUS_ADLARI;

// Bütün şablonlarda kullanılabilen yardımcı: "2 saat önce" gibi yazar
app.locals.zaman = (tarih: Date) => {
  const dakika = Math.floor((Date.now() - new Date(tarih).getTime()) / 60000);
  if (dakika < 1) return "az önce";
  if (dakika < 60) return `${dakika} dakika önce`;
  const saat = Math.floor(dakika / 60);
  if (saat < 24) return `${saat} saat önce`;
  const gun = Math.floor(saat / 24);
  if (gun === 1) return "dün";
  if (gun < 30) return `${gun} gün önce`;
  return new Date(tarih).toLocaleDateString("tr-TR");
};

// Hiçbir adres eşleşmezse 404 sayfası
app.use((req, res) => {
  durumSayfasi(req, res, 404);
});

// Beklenmeyen hata: sunucu çökmez, kullanıcıya kısa bir mesaj gider, ayrıntı konsola yazılır
app.use((hata: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Ayrıntı yalnızca konsola gider; kullanıcıya ortak 500 sayfası gösterilir (hata iletisi sızmaz).
  console.error(hata);
  if (res.headersSent) return next(hata); // yanıt yarıda kaldıysa Express bağlantıyı kapatsın
  res.status(500);
  if (String(req.get("accept") ?? "").includes("application/json")) return void res.json({ hata: "Sunucu hatası." });
  // Hata ortakVeriler'de (ör. veritabanı kapalı) çıktıysa menü verileri yok: menüsüz (sade) çizilir.
  // Sayfa çizilirken de hata olursa (callback'e düşer) düz metne dönülür: işleyicinin kendi hatası sonsuz döngü yapmaz.
  res.render("durum", { kod: 500, sade: !res.locals.menuKategoriler, yenileAdresi: req.method === "GET" ? yerelAdres(req.originalUrl) : "/" }, (h2: Error | null, html?: string) => {
    if (h2) { console.error("[500 sayfası çizilemedi]", h2); return void res.type("text/plain").send("Bir şeyler ters gitti. Birkaç saniye sonra tekrar dene."); }
    res.send(html);
  });
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

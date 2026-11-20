import { SEBEP_LISTESI } from "./sikayet.ts";
import { belirtme } from "./gizlilik.ts";
import { rutbeBulId, icerikHtml, rutbeCizimiBaslat, rutbeTazele } from "./rutbe.ts";
import express from "express";
import { oturum, ortakVeriler, csrfKoru } from "./oturum.ts";
import { hesap } from "./rotalar/hesap.ts";
import { forum } from "./rotalar/forum.ts";
import { mesaj } from "./rotalar/mesaj.ts";
import { rutbeRotasi } from "./rotalar/rutbe.ts";
import { iletisim } from "./rotalar/iletisim.ts";
import { odalar } from "./rotalar/odalar.ts";
import { moderasyon } from "./rotalar/moderasyon.ts";
import { yonetim } from "./rotalar/yonetim.ts";
import { duyuruRotasi } from "./ayarlar.ts";
import { premiumRotasi } from "./rotalar/premium.ts";
import { EFEKTLER, SUSLER, SVG, EFEKT_ADLARI, SUS_ADLARI } from "./profil-gorunum.ts";
import { onizleme } from "./onizleme.ts";
import { katmanlar } from "./onizleme-katmanlar.ts";
import { sayfalar } from "./onizleme-sayfalar.ts";

const app = express();
// PORT ortam değişkeniyle değiştirilebilir (aynı anda ikinci bir kopya denemek için); verilmezse 3000
const PORT = Number(process.env.PORT) || 3000;

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

// Gerçek sayfalar
app.use(hesap);
app.use(forum);
app.use(rutbeRotasi);  // /rutbeler
app.use(premiumRotasi); // /premium
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
app.locals.icerikHtml = icerikHtml;
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
  res.status(404).render("404");
});

// Beklenmeyen hata: sunucu çökmez, kullanıcıya kısa bir mesaj gider, ayrıntı konsola yazılır
app.use((hata: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(hata);
  res.status(500).send("Bir şeyler ters gitti. Konsoldaki hataya bak.");
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

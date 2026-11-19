import { SEBEP_LISTESI } from "./sikayet.ts";
import { belirtme } from "./gizlilik.ts";
import express from "express";
import { oturum, ortakVeriler, csrfKoru } from "./oturum.ts";
import { hesap } from "./rotalar/hesap.ts";
import { forum } from "./rotalar/forum.ts";
import { mesaj } from "./rotalar/mesaj.ts";
import { iletisim } from "./rotalar/iletisim.ts";
import { odalar } from "./rotalar/odalar.ts";
import { moderasyon } from "./rotalar/moderasyon.ts";
import { yonetim } from "./rotalar/yonetim.ts";
import { duyuruRotasi } from "./ayarlar.ts";
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

// Form gövdelerini (application/x-www-form-urlencoded) req.body'ye çevirir
app.use(express.urlencoded({ extended: false }));
// Oturum + her sayfada gereken ortak veriler (giriş yapan kullanıcı, bildirim sayıları...)
app.use(oturum);
app.use(ortakVeriler);
// Her POST'ta gizli _csrf alanını doğrular (gövde yukarıda çözümlendiği için burada okunabilir)
app.use(csrfKoru);

// Gerçek sayfalar
app.use(hesap);
app.use(forum);
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

// File upload infrastructure (sql/18). For now avatar and banner; later chat/room/DM photos and videos will pass through the same place,
// so the steps "receive the file -> validate -> process -> write to disk -> delete the old one" are split into general parts.
//
// Security order (all on the server; the browser's accept= can be bypassed):
//  1) Login required (before multer runs): a guest cannot make us buffer an 8 MB body.
//  2) multer memoryStorage + 8 MB limit + MIME filter (jpeg, png, webp, gif).
//  3) CSRF is checked AFTER multer (in multipart the _csrf field can only be read once the body is parsed; oturum.ts COKLU_PARCALI_ADRESLER).
//  4) Rate limit: 10 uploads per 10 minutes per user.
//  5) The real content check is done with sharp: the MIME header can be faked ("a.txt" -> image/png); if sharp cannot actually open the file it is rejected.
//  6) The file is always re-encoded (WebP): the uploaded bytes are NEVER written to disk as they are; no embedded code/metadata remains.
// Dosya yükleme altyapısı (sql/18). Şimdilik avatar ve banner; ileride sohbet/oda/DM fotoğraf ve videosu aynı yerden geçecek,
// bu yüzden "dosyayı al → doğrula → işle → diske yaz → eskisini sil" adımları genel parçalara ayrıldı.
//
// Güvenlik sırası (hepsi sunucuda; tarayıcıdaki accept= atlatılabilir):
//  1) Giriş şart (multer çalışmadan önce): misafir 8 MB'lık gövde tamponlatamaz.
//  2) multer memoryStorage + 8 MB sınırı + MIME süzgeci (jpeg, png, webp, gif).
//  3) CSRF multer'dan SONRA doğrulanır (multipart'ta _csrf alanı ancak gövde çözülünce okunur; oturum.ts COKLU_PARCALI_ADRESLER).
//  4) Hız sınırı: kullanıcı başına 10 dakikada 10 yükleme.
//  5) Asıl içerik doğrulaması sharp'la: MIME başlığı yalanlanabilir ("a.txt" → image/png), sharp dosyayı gerçekten açamazsa reddedilir.
//  6) Dosya her zaman yeniden kodlanır (WebP): yüklenen bayt dizisi diske HİÇ olduğu gibi yazılmaz; gömülü kod/metadata kalmaz.
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import type { Request, Response, NextFunction } from "express";
import { girisGerekli, bildir } from "./yardimci.ts";
import { csrfEsit } from "./oturum.ts";
import { dosyaYukleme } from "./hiz-siniri.ts";

export const YUKLEME_DIZINI = "yuklemeler";
export const YUKLEME_ADRESI = "/yuklemeler";
const SINIR_BAYT = 8 * 1024 * 1024;
// frame limit for animated images: a GIF with thousands of frames must not lock up the server
// hareketli görselde kare sınırı: binlerce karelik GIF sunucuyu kilitlemesin
const EN_COK_KARE = 300;
const IZINLI_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const IZINLI_BICIM = ["jpeg", "png", "webp", "gif"];
mkdirSync(YUKLEME_DIZINI, { recursive: true });

// Output size per target: 2x for retina (avatar is shown at 128px -> 256; banner at the phone ratio 2.2:1 -> 1800×818).
// Since the profile and the card show the banner with object-fit: cover, on wide screens the top/middle/bottom strip is visible (users.banner_konum).
// Hedefe göre çıktı boyutu: retina için 2x (avatar 128px gösterilir → 256; banner telefon oranında 2,2:1 → 1800×818).
// Banner'ı profil ve kart zaten object-fit: cover ile gösterdiği için geniş ekranda üst/orta/alt şerit görünür (users.banner_konum).
const BOYUTLAR = { avatar: { w: 256, h: 256 }, banner: { w: 1800, h: 818 } } as const;
const BANNER_ORAN = 2.2;
const EN_AZ_KIRPMA = 64; // a crop smaller than this is meaningless (and blurry) · bundan küçük bir kırpma anlamsız (ve bulanık) olur

// Crop coming from the browser's "Crop and position" dialog: top-left corner + size in the SOURCE image's natural pixel coordinates
// Tarayıcının "Kırp ve konumla" penceresinden gelen kırpma: KAYNAK görselin doğal piksel koordinatlarında sol-üst köşe + boyut
export type Kirpma = { x: number; y: number; g: number; y2: number };
export type GorselTuru = keyof typeof BOYUTLAR;

const yukleyici = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SINIR_BAYT, files: 1, fields: 8, parts: 10 },
  fileFilter: (_req, dosya, bitti) => bitti(null, IZINLI_MIME.includes(dosya.mimetype)),
});

// The crop dialog sends "Accept: application/json" via fetch: then we return a JSON error instead of a redirect (shown in the dialog)
// Kırp penceresi fetch ile "Accept: application/json" gönderir: o zaman yönlendirme yerine JSON hata döneriz (pencerede gösterilir)
export const jsonIstiyor = (req: Request) => String(req.get("accept") ?? "").includes("application/json");

// Verifies the _csrf from a multipart body after multer (the counterpart of oturum.ts's normal check)
// Multipart gövdesinden gelen _csrf'i multer sonrası doğrular (oturum.ts'in normal kontrolünün karşılığı)
function csrfDogrula(req: Request, res: Response, next: NextFunction) {
  if (csrfEsit(req, req.body?._csrf)) return next();
  if (jsonIstiyor(req)) return void res.status(403).json({ hata: "Oturum doğrulaması başarısız oldu. Sayfayı yenileyip tekrar dene." });
  bildir(req, "hata", "Oturum doğrulaması başarısız oldu. Sayfayı yenileyip tekrar dene.");
  // Same response as oturum.ts `csrfKoru`: 403 + a small page that redirects back (res.redirect would turn the status into 302)
  // oturum.ts csrfKoru ile aynı yanıt: 403 + geri yönlendiren küçük sayfa (res.redirect durumu 302'ye çevirirdi)
  res.status(403).type("html").send('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/ayarlar#profil-gorunumu"><p>İstek doğrulanamadı. <a href="/ayarlar#profil-gorunumu">Geri dön</a></p>');
}

// Middleware array to use on the route: login -> multer -> csrf. `alan` is the name of the file field in the form.
// Rotada kullanılacak ara katman dizisi: giriş → multer → csrf. `alan` formdaki dosya alanının adı.
export function yuklemeKatmani(alan: string, geriAdres: string) {
  return [
    girisGerekli(),
    (req: Request, res: Response, next: NextFunction) => {
      yukleyici.single(alan)(req, res, (hata: unknown) => {
        if (!hata) return next();
        const kod = (hata as { code?: string }).code;
        const ileti = kod === "LIMIT_FILE_SIZE" ? "Dosya en fazla 8 MB olabilir." : "Dosya yüklenemedi. Başka bir dosya dene.";
        if (jsonIstiyor(req)) return res.status(400).json({ hata: ileti });
        bildir(req, "hata", ileti);
        res.redirect(geriAdres);
      });
    },
    csrfDogrula,
  ];
}

// Deletes a file on the server; accepts only addresses in the form we produce (/yuklemeler/<uuid>.webp|mp4|webm):
// even if the value in the database were somehow corrupted, no other file can be deleted (path traversal protection).
// Sunucudaki bir dosyayı siler; yalnızca bizim ürettiğimiz biçimdeki adresleri (/yuklemeler/<uuid>.webp|mp4|webm) kabul eder:
// veritabanındaki değer bir şekilde bozulsa bile başka bir dosya silinemez (yol gezme koruması).
export async function dosyaSil(adres: string | null | undefined) {
  const m = adres && /^\/yuklemeler\/([0-9a-f-]{36}\.(?:webp|mp4|webm))$/.exec(adres);
  if (!m) return;
  try { await unlink(`${YUKLEME_DIZINI}/${m[1]}`); } catch { /* already gone · zaten yok */ }
}

// An error that can be shown to the user as it is (Turkish); other errors are met with a generic message
// Kullanıcıya olduğu gibi gösterilebilen (Türkçe) hata; başka hatalar genel mesajla karşılanır
export class GorselHatasi extends Error {}

export type IslemSonucu = { adres: string; hareketli: boolean; duraganYapildi: boolean };

// Reads the kirp_x/kirp_y/kirp_g/kirp_y2 fields from the body. null if missing or not an integer (= upload without JS: crop from the centre).
// The bounds/ratio check is done inside `gorselIsle` because it needs the image's size.
// Gövdedeki kirp_x/kirp_y/kirp_g/kirp_y2 alanlarını okur. Yoksa ya da tamsayı değilse null (= JS'siz yükleme: ortadan kırp).
// Sınır/oran denetimi görselin boyutu gerektiği için gorselIsle içinde yapılır.
export function kirpmaOku(govde: Record<string, unknown> | undefined): Kirpma | null {
  if (!govde) return null;
  const al = (ad: string) => (typeof govde[ad] === "string" && /^\d{1,5}$/.test(govde[ad] as string) ? Number(govde[ad]) : NaN);
  const k = { x: al("kirp_x"), y: al("kirp_y"), g: al("kirp_g"), y2: al("kirp_y2") };
  return Object.values(k).every(Number.isInteger) ? k : null;
}

// Is the crop inside the image, at least 64 px, and does it match the target ratio? (the crop info comes from the browser, it is not trusted)
// Avatar must be square (±1 px: browser rounding), banner 2.2:1 (±2%). If it does not match the caller falls back to a centre crop.
// Kırpma görselin içinde mi, en az 64 px mi ve hedef orana uyuyor mu? (kırpma bilgisi tarayıcıdan gelir, güvenilmez)
// Avatar kare olmalı (±1 px: tarayıcı yuvarlaması), banner 2,2:1 (±%2). Uymazsa çağıran ortadan kırpmaya düşer.
export function kirpmaGecerli(k: Kirpma, tur: GorselTuru, genislik: number, yukseklik: number): boolean {
  if (k.x < 0 || k.y < 0 || k.g < EN_AZ_KIRPMA || k.y2 < EN_AZ_KIRPMA) return false;
  if (k.x + k.g > genislik || k.y + k.y2 > yukseklik) return false;
  if (tur === "avatar") return Math.abs(k.g - k.y2) <= 1;
  return Math.abs(k.g / k.y2 / BANNER_ORAN - 1) <= 0.02;
}

// Validates and processes the image. If it throws, the message can be shown to the user (Turkish).
// Resmi doğrular ve işler. Hata fırlatırsa mesajı kullanıcıya gösterilebilir (Türkçe).
export async function gorselIsle(tampon: Buffer, tur: GorselTuru, premium: boolean, kirpma: Kirpma | null = null): Promise<IslemSonucu> {
  let meta;
  try {
    // limitInputPixels: giant "decompression bomb" images are rejected without being opened
    // limitInputPixels: dev boyutlu "decompression bomb" resimleri açılmadan reddedilir
    meta = await sharp(tampon, { animated: true, limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new GorselHatasi("Bu dosya geçerli bir resim değil.");
  }
  if (!meta.format || !IZINLI_BICIM.includes(meta.format)) throw new GorselHatasi("Yalnızca JPG, PNG, WebP ve GIF yüklenebilir.");
  const kareler = meta.pages ?? 1;
  if (kareler > EN_COK_KARE) throw new GorselHatasi(`Hareketli görsel en fazla ${EN_COK_KARE} kare olabilir.`);

  const hareketliGirdi = kareler > 1;
  const hareketliKalsin = hareketliGirdi && premium;
  const { w, h } = BOYUTLAR[tur];
  // If it stays animated all frames are processed, otherwise only the first frame. rotate(): applies the EXIF orientation (so phone photos do not come out sideways).
  // Hareketli kalacaksa tüm kareler, değilse yalnızca ilk kare işlenir. rotate(): EXIF yönünü uygular (telefon fotoğrafları yan çıkmasın).
  let boru = sharp(tampon, { animated: hareketliKalsin, limitInputPixels: 40_000_000 });
  if (!hareketliKalsin) boru = boru.rotate();
  // Crop: the size PER FRAME (pageHeight for animated images) and the EXIF orientation are taken into account. The browser shows the rotated
  // image's naturalWidth/Height; in sharp rotate() is applied before extract, so for orientations 5-8 width and height swap.
  // sharp applies extract to each frame separately for animated images (tested: frames are cropped without corruption).
  // Kırpma: görselin KARE başına (hareketli görselde pageHeight) boyutu ve EXIF yönü hesaba katılır. Tarayıcı döndürülmüş
  // görselin naturalWidth/Height'ını gösterir; sharp'ta rotate() extract'tan önce uygulanır, o yüzden 5–8 yönlerinde en/boy yer değiştirir.
  // sharp, hareketli görselde extract'ı her kareye ayrı uygular (denendi: kareler bozulmadan kırpılıyor).
  if (kirpma) {
    const yanmis = !hareketliKalsin && (meta.orientation ?? 1) >= 5;
    const gen = yanmis ? (meta.pageHeight ?? meta.height ?? 0) : (meta.width ?? 0);
    const yuk = yanmis ? (meta.width ?? 0) : (meta.pageHeight ?? meta.height ?? 0);
    if (kirpmaGecerli(kirpma, tur, gen, yuk)) boru = boru.extract({ left: kirpma.x, top: kirpma.y, width: kirpma.g, height: kirpma.y2 });
  }
  boru = boru.resize(w, h, { fit: "cover", position: "centre" });
  const cikti = await boru.webp({ quality: 90, effort: 5 }).toBuffer();

  const dosyaAdi = `${randomUUID()}.webp`;
  await writeFile(`${YUKLEME_DIZINI}/${dosyaAdi}`, cikti);
  return { adres: `${YUKLEME_ADRESI}/${dosyaAdi}`, hareketli: hareketliKalsin, duraganYapildi: hareketliGirdi && !premium };
}

// Rate limit check: if blocked, returns how many minutes to wait
// Hız sınırı denetimi: engelliyse kaç dakika beklemesi gerektiğini döndürür
export const yuklemeBekleme = (kullaniciId: number) => dosyaYukleme.kalanDakika("k" + kullaniciId);
export const yuklemeSay = (kullaniciId: number) => dosyaYukleme.say("k" + kullaniciId);

// Comment attachments (sql/23): up to 6 photos OR 1 video per reply. The pipeline follows the same security order as the avatar/banner flow
// in src/yukleme.ts; the differences:
//  - Photo: sharp applies the EXIF orientation, ALL metadata (including EXIF/GPS) is removed (sharp default: if withMetadata is not called,
//    nothing is written to the output), long edge at most 2048 px, WebP. An animated GIF stays animated only for premium (same rule as the avatar).
//  - Video: not transcoded (no ffmpeg on the server); validated by its FILE SIGNATURE (mp4: "ftyp", webm: EBML 1A45DFA3), the extension/MIME is not trusted,
//    written as-is under a random name. An mp4 with a codec the browser cannot play will not play but is harmless (nosniff + served only as video).
//  - CSRF is verified AFTER multer (oturum.ts cokluParcaliMi: /konu/:id/cevap).
// Yorum ekleri (sql/23): bir cevaba en çok 6 fotoğraf YA DA 1 video. Altyapı src/yukleme.ts'in avatar/banner akışıyla aynı güvenlik
// sırasını izler; farklar:
//  - Fotoğraf: sharp ile EXIF yönü uygulanır, TÜM metadata (EXIF/GPS dahil) silinir (sharp varsayılanı: withMetadata çağrılmazsa
//    çıktıya hiçbir şey yazılmaz), uzun kenar en çok 2048 px, WebP. Hareketli GIF yalnızca premium'da hareketli kalır (avatarla aynı kural).
//  - Video: dönüştürülmez (sunucuda ffmpeg yok); dosya İMZASINDAN (mp4: "ftyp", webm: EBML 1A45DFA3) doğrulanır, uzantıya/MIME'a güvenilmez,
//    olduğu gibi rastgele adla yazılır. Tarayıcı oynatamayan codec'li bir mp4 yüklenirse oynatılmaz ama zararsızdır (nosniff + yalnızca video olarak sunulur).
//  - CSRF multer'dan SONRA doğrulanır (oturum.ts cokluParcaliMi: /konu/:id/cevap).
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import type { Request, Response, NextFunction } from "express";
import { girisGerekli, bildir } from "./yardimci.ts";
import { csrfEsit } from "./oturum.ts";
import { YUKLEME_DIZINI, YUKLEME_ADRESI, jsonIstiyor, GorselHatasi } from "./yukleme.ts";

export const EN_COK_RESIM = 6;
const RESIM_SINIRI = 10 * 1024 * 1024;
const VIDEO_SINIRI = 50 * 1024 * 1024;
const UZUN_KENAR = 2048;
const EN_COK_KARE = 300;
const RESIM_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_MIME = ["video/mp4", "video/webm"];
const RESIM_BICIM = ["jpeg", "png", "webp", "gif"];

const yukleyici = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_SINIRI, files: EN_COK_RESIM + 1, fields: 10, parts: 20 },
  fileFilter: (_req, dosya, bitti) => bitti(null, dosya.fieldname === "video" ? VIDEO_MIME.includes(dosya.mimetype) : RESIM_MIME.includes(dosya.mimetype)),
});
const alanlar = yukleyici.fields([{ name: "resimler", maxCount: EN_COK_RESIM }, { name: "video", maxCount: 1 }]);
// Upper limit on total size before the body is buffered: 6×10 MB photos or a 50 MB video plus a little margin
// Gövde tamponlanmadan önce toplam boyut üst sınırı: 6×10 MB fotoğraf ya da 50 MB video + biraz zarf payı
const GOVDE_SINIRI = 6 * RESIM_SINIRI + 2 * 1024 * 1024;

export type EkDosyasi = { tur: "resim" | "video"; adres: string; genislik: number | null; yukseklik: number | null; boyut: number };
export type EkGirdisi = { resimler: Express.Multer.File[]; video: Express.Multer.File | null };

// So the typed text is not lost on a redirect back: a temporary draft is stored in the session; the topic page reads it once and deletes it
// Geri yönlendirmede yazılan metin kaybolmasın: oturuma geçici taslak yazılır, konu sayfası bir kez okuyup siler
export function taslakKaydet(req: Request, konuId: number) {
  const b = req.body ?? {};
  if (typeof b.content === "string") req.session.cevapTaslagi = { konu: konuId, content: b.content.slice(0, 10000), nsfw: !!b.nsfw, kartKapali: b.kart_kapali === "1" };
}

function hataYanit(req: Request, res: Response, konuId: number, ileti: string, durum = 400) {
  if (jsonIstiyor(req)) return void res.status(durum).json({ hata: ileti });
  taslakKaydet(req, konuId);
  bildir(req, "hata", ileti);
  res.redirect("/konu/" + konuId + "#cevap");
}

// Middleware chain for the reply route: login → size limit → multer (only runs for multipart) → csrf → process the files
// Cevap yolu için ara katman dizisi: giriş → boyut üst sınırı → multer (yalnızca multipart ise çalışır) → csrf → dosyaları düzenle
export const ekliCevapKatmani = [
  girisGerekli("Cevap yazmak için giriş yapman gerekiyor."),
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.is("multipart/form-data")) return next();
    const konuId = Number(req.params.id) || 0;
    if (Number(req.get("content-length") ?? 0) > GOVDE_SINIRI) return hataYanit(req, res, konuId, "Ekler çok büyük: fotoğraf en fazla 10 MB, video en fazla 50 MB olabilir.", 413);
    alanlar(req, res, (hata: unknown) => {
      if (!hata) return next();
      const kod = (hata as { code?: string }).code;
      const ileti = kod === "LIMIT_FILE_SIZE" ? "Ekler çok büyük: fotoğraf en fazla 10 MB, video en fazla 50 MB olabilir."
        : kod === "LIMIT_UNEXPECTED_FILE" || kod === "LIMIT_FILE_COUNT" ? `Bir yoruma en fazla ${EN_COK_RESIM} fotoğraf ya da 1 video eklenebilir.`
        : "Ekler yüklenemedi. Başka bir dosya dene.";
      hataYanit(req, res, konuId, ileti);
    });
  },
  (req: Request, res: Response, next: NextFunction) => {
    if (csrfEsit(req, req.body?._csrf)) return next();
    const konuId = Number(req.params.id) || 0;
    if (jsonIstiyor(req)) return void res.status(403).json({ hata: "Oturum doğrulaması başarısız oldu. Sayfayı yenileyip tekrar dene." });
    bildir(req, "hata", "Oturum doğrulaması başarısız oldu. Sayfayı yenileyip tekrar dene.");
    res.status(403).type("html").send(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/konu/${konuId}#cevap"><p>İstek doğrulanamadı. <a href="/konu/${konuId}#cevap">Geri dön</a></p>`);
  },
];

// Extracts the attachment entries from multer's req.files field
// multer'ın req.files alanından ek girdisini çıkarır
export function ekGirdisi(req: Request): EkGirdisi {
  const f = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  return { resimler: f.resimler ?? [], video: f.video?.[0] ?? null };
}

// Video type from the file signature: mp4 ("....ftyp") or webm/mkv (EBML header). Anything else does not count as video.
// Dosya imzasından video türü: mp4 ("....ftyp") ya da webm/mkv (EBML başlığı). Başka bir şey video sayılmaz.
export function videoTuru(t: Buffer): "mp4" | "webm" | null {
  if (t.length >= 12 && t.toString("latin1", 4, 8) === "ftyp") return "mp4";
  if (t.length >= 4 && t[0] === 0x1a && t[1] === 0x45 && t[2] === 0xdf && t[3] === 0xa3) return "webm";
  return null;
}

async function resimIsle(tampon: Buffer, premium: boolean): Promise<EkDosyasi> {
  let meta;
  try { meta = await sharp(tampon, { animated: true, limitInputPixels: 40_000_000 }).metadata(); }
  catch { throw new GorselHatasi("Fotoğraflardan biri geçerli bir resim değil."); }
  if (!meta.format || !RESIM_BICIM.includes(meta.format)) throw new GorselHatasi("Yalnızca JPG, PNG, WebP ve GIF fotoğraf eklenebilir.");
  const kareler = meta.pages ?? 1;
  if (kareler > EN_COK_KARE) throw new GorselHatasi(`Hareketli görsel en fazla ${EN_COK_KARE} kare olabilir.`);
  const hareketli = kareler > 1 && premium;
  let boru = sharp(tampon, { animated: hareketli, limitInputPixels: 40_000_000 });
  // apply the EXIF orientation (metadata is not written afterwards anyway → the orientation info goes too, and the image stays upright)
  // EXIF yönü uygulanır (sonra metadata zaten yazılmaz → yön bilgisi de gider, görüntü doğru durur)
  if (!hareketli) boru = boru.rotate();
  boru = boru.resize(UZUN_KENAR, UZUN_KENAR, { fit: "inside", withoutEnlargement: true });
  // no withMetadata/keepExif: EXIF, GPS and ICC are all stripped
  // withMetadata/keepExif YOK: EXIF, GPS, ICC hepsi silinir
  const cikti = await boru.webp({ quality: 88, effort: 4 }).toBuffer();
  const ad = `${randomUUID()}.webp`;
  await writeFile(`${YUKLEME_DIZINI}/${ad}`, cikti);
  const m2 = await sharp(cikti, { animated: hareketli }).metadata();
  return { tur: "resim", adres: `${YUKLEME_ADRESI}/${ad}`, genislik: m2.width ?? null, yukseklik: (m2.pageHeight ?? m2.height) ?? null, boyut: cikti.length };
}

// Validates, processes and writes the attachments to disk. On error, whatever was written so far is deleted and GorselHatasi is thrown (its message is shown to the user).
// Ekleri doğrular, işler ve diske yazar. Hata olursa o ana kadar yazılanlar silinir ve GorselHatasi fırlar (mesajı kullanıcıya gösterilir).
export async function ekleriIsle(girdi: EkGirdisi, premium: boolean): Promise<EkDosyasi[]> {
  const yazilan: EkDosyasi[] = [];
  try {
    if (girdi.video) {
      if (girdi.resimler.length) throw new GorselHatasi("Bir yoruma fotoğraf ya da video eklenebilir, ikisi birden eklenemez.");
      const t = girdi.video.buffer;
      const tur = videoTuru(t);
      if (!tur) throw new GorselHatasi("Bu dosya geçerli bir video değil. Yalnızca MP4 ve WebM eklenebilir.");
      const ad = `${randomUUID()}.${tur}`;
      await writeFile(`${YUKLEME_DIZINI}/${ad}`, t);
      yazilan.push({ tur: "video", adres: `${YUKLEME_ADRESI}/${ad}`, genislik: null, yukseklik: null, boyut: t.length });
    }
    for (const r of girdi.resimler) {
      if (r.size > RESIM_SINIRI) throw new GorselHatasi("Fotoğraf en fazla 10 MB olabilir.");
      yazilan.push(await resimIsle(r.buffer, premium));
    }
    return yazilan;
  } catch (hata) {
    await Promise.all(yazilan.map((e) => unlink(e.adres.replace(YUKLEME_ADRESI, YUKLEME_DIZINI)).catch(() => {})));
    throw hata;
  }
}

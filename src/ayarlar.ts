// Site ayarları (site_settings tablosu): kayıt açık mı, duyuru, yasaklı kelimeler.
//
// Her sayfa isteğinde bu ayarlara bakıldığı için (duyuru şeridi) her seferinde veritabanına gitmeyiz:
// bellekte tutarız (önbellek). Ayar kaydedilince önbellek hemen silinir (ayarOnbellekTemizle);
// ayrıca 60 saniye sonra kendiliğinden eskir, böylece veritabanı elle değiştirilse ya da ikinci bir
// sunucu kopyası çalışsa bile en geç bir dakikada herkes aynı değeri görür.
import express from "express";
import { pool } from "./db.ts";
import { bildir, geriAdres } from "./yardimci.ts";

export type SiteAyarlari = {
  kayitAcik: boolean;
  duyuru: string;
  duyuruTur: "info" | "uyari";
  duyuruSurum: string;
  yasakli: string[];
  puan: PuanKurallari;
  oda: OdaAyarlari;
};

// Özel oda ayarı (sql/12): bir kişinin sahibi olabileceği en çok oda sayısı. Yönetim: Sohbet > Odalar.
// (Oda açabilecek rütbe artık ayar değil, rütbenin "oda_ac" ayrıcalığıdır: sql/13, Puan ve ödüller > Rütbeler.)
export type OdaAyarlari = { kisiSiniri: number };
export const ODA_VARSAYILAN: OdaAyarlari = { kisiSiniri: 3 };
export const ODA_SINIR_ENFAZLA = 50;

// Puan kuralları (site_settings: puan_konu, puan_cevap, puan_oy, puan_gunluk, puan_seri, puan_cozum, puan_rozet, puan_davet).
// Yönetici panelinden (Puan ve ödüller > Puan kuralları) değiştirilir.
//   davet: KULLANILMIYOR, "davet" puan kaynağı referans aşamasına (CLAUDE.md yol haritası 3.4) ertelendi; ayar anahtarı ve
//     points_log 'davet' sebebi şimdiden hazır, panelde gösterilmez. Referans/davet kabulü yazılırken puanEkle(..., "davet", ...) buraya bağlanacak.
//   gunlukTavan (puan_gunluk_tavan): bir kişinin günde konu açma + cevap yazmadan kazanabileceği toplam puan; 0 = sınırsız
//   gunluk: günde ilk ziyaret · seri: 7 gün üst üste ziyaret · cozum: cevabı çözüm seçilen yazara · rozet: her yeni rozet
export type PuanKurallari = { konu: number; cevap: number; oy: number; gunluk: number; seri: number; cozum: number; rozet: number; davet: number; gunlukTavan: number };
export const PUAN_VARSAYILAN: PuanKurallari = { konu: 5, cevap: 2, oy: 1, gunluk: 1, seri: 5, cozum: 15, rozet: 10, davet: 5, gunlukTavan: 40 };
export const TAVAN_ENFAZLA = 10000; // günlük konu/cevap puanı tavanı (sql/17): 0 = sınırsız
export const PUAN_ENFAZLA = 1000; // yanlışlıkla 99999 yazılmasın diye üst sınır

// Ayardan gelen metni güvenli bir tam sayıya çevirir; bozuksa varsayılana döner (site hiç bozulmasın).
function puanDegeri(ham: string | undefined, varsayilan: number) {
  const n = Number(ham);
  return ham !== undefined && ham.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= PUAN_ENFAZLA ? n : varsayilan;
}

// Oda ayarı için güvenli tam sayı (bozuksa varsayılan)
function tamSayi(ham: string | undefined, varsayilan: number, enaz: number, enfazla: number) {
  const n = Number(ham);
  return ham !== undefined && ham.trim() !== "" && Number.isInteger(n) && n >= enaz && n <= enfazla ? n : varsayilan;
}

const OMUR_MS = 60_000;
let onbellek: { veri: SiteAyarlari; zaman: number } | null = null;

export async function ayarlar(): Promise<SiteAyarlari> {
  if (onbellek && Date.now() - onbellek.zaman < OMUR_MS) return onbellek.veri;
  const [satirlar]: any = await pool.query("SELECT anahtar, deger FROM site_settings");
  const h: Record<string, string> = {};
  for (const s of satirlar) h[s.anahtar] = s.deger;
  const veri: SiteAyarlari = {
    kayitAcik: (h.kayit_acik ?? "1") === "1",
    duyuru: h.duyuru ?? "",
    duyuruTur: h.duyuru_tur === "uyari" ? "uyari" : "info",
    duyuruSurum: h.duyuru_surum ?? "0",
    yasakli: kelimeListesi(h.yasakli_kelimeler ?? ""),
    puan: {
      konu: puanDegeri(h.puan_konu, PUAN_VARSAYILAN.konu),
      cevap: puanDegeri(h.puan_cevap, PUAN_VARSAYILAN.cevap),
      oy: puanDegeri(h.puan_oy, PUAN_VARSAYILAN.oy),
      gunluk: puanDegeri(h.puan_gunluk, PUAN_VARSAYILAN.gunluk),
      seri: puanDegeri(h.puan_seri, PUAN_VARSAYILAN.seri),
      cozum: puanDegeri(h.puan_cozum, PUAN_VARSAYILAN.cozum),
      rozet: puanDegeri(h.puan_rozet, PUAN_VARSAYILAN.rozet),
      davet: puanDegeri(h.puan_davet, PUAN_VARSAYILAN.davet), // henüz kullanılmıyor (referans aşamasında bağlanacak)
      gunlukTavan: tamSayi(h.puan_gunluk_tavan, PUAN_VARSAYILAN.gunlukTavan, 0, TAVAN_ENFAZLA),
    },
    oda: {
      kisiSiniri: tamSayi(h.kisi_basi_oda_siniri, ODA_VARSAYILAN.kisiSiniri, 1, ODA_SINIR_ENFAZLA),
    },
  };
  onbellek = { veri, zaman: Date.now() };
  return veri;
}

// Puan kuralları kısayolu: route'lar yalnızca bunu ister
export async function puanKurallari(): Promise<PuanKurallari> {
  return (await ayarlar()).puan;
}

export function ayarOnbellekTemizle() {
  onbellek = null;
}

// Tek bir ayarı yazar (anahtar koddan gelir). Önbelleği temizlemeyi çağıran yapar (birden çok ayar birlikte yazılır).
export async function ayarYaz(anahtar: string, deger: string, userId: number) {
  await pool.query(
    "INSERT INTO site_settings (anahtar, deger, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE deger = VALUES(deger), updated_by = VALUES(updated_by)",
    [anahtar, deger, userId]
  );
}

// ---------------------------------------------------------------------------
// Yasaklı kelimeler
// Türkçe büyük/küçük harf: JavaScript'in varsayılan toLowerCase()'i "I" harfini "i" yapar, oysa Türkçede
// "I" -> "ı" ve "İ" -> "i" olmalı. toLocaleLowerCase("tr") bunu doğru yapar; hem listeyi hem metni
// aynı şekilde küçültürüz.
// Ama insanlar Türkçe klavye kullanmadan da yazar: "KOTUKELIME" Türkçe küçültmede "kotukelıme" olur ve
// listedeki "kotukelime" ile eşleşmez; filtre büyük harfle atlatılırdı. Bu yüzden küçülttükten sonra
// "ı"yı da "i"ye çeviriyoruz: I, ı, İ, i hepsi aynı sayılır. (Bedeli: "ılık" ile "ilik" de aynı sayılır;
// filtre için kaçırmaktansa fazla yakalamak daha iyi.)
// ---------------------------------------------------------------------------
export const kucult = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i");

// Ham metin (satır ya da virgülle ayrılmış) -> temiz, tekrarsız, küçük harfli liste
export function kelimeListesi(ham: string): string[] {
  const kelimeler = ham.split(/[\n\r,]+/).map((k) => kucult(k.trim().replace(/\s+/g, " "))).filter(Boolean);
  return [...new Set(kelimeler)];
}

// Verilen metinlerden biri yasaklı bir ifade içeriyorsa o ifadeyi döner, yoksa null.
// Metnin İÇİNDE arar (kelime kökü de yakalansın diye: Türkçe ekler kelimeye yapışır). Yanlış eşleşme olursa
// yönetici o ifadeyi listeden çıkarır.
export async function yasakliIfade(...metinler: string[]): Promise<string | null> {
  const { yasakli } = await ayarlar();
  if (!yasakli.length) return null;
  const hepsi = kucult(metinler.join("\n"));
  return yasakli.find((k) => hepsi.includes(k)) ?? null;
}

// ---------------------------------------------------------------------------
// Duyuru şeridini kapatma: POST /duyuru/kapat (herkese açık, giriş gerekmez)
// Hangi duyuru sürümünün kapatıldığı oturumda tutulur; duyuru değişince sürüm değişir, şerit yeniden çıkar.
// ---------------------------------------------------------------------------
export const duyuruRotasi = express.Router();

duyuruRotasi.post("/duyuru/kapat", async (req, res) => {
  const { duyuruSurum } = await ayarlar();
  req.session.duyuruKapatilan = duyuruSurum;
  res.redirect(geriAdres(req, "/"));
});

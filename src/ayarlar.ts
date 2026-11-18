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
};

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
  };
  onbellek = { veri, zaman: Date.now() };
  return veri;
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

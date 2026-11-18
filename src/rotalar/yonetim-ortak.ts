// Yönetim panelinin alt dosyalarının ortak kullandığı küçük yardımcılar.
import type { Request, Response, NextFunction } from "express";
import { sayi } from "../yardimci.ts";

// Yalnızca admin: moderatör ya da üye 403 sayfasını görür (GET de POST da).
// Ana kapı (yonetim.ts) zaten "moderator ya da admin mi?" diye bakmış olur; bu ikinci, daha dar kapıdır.
export function sadeceAdmin(req: Request, res: Response, next: NextFunction) {
  if (res.locals.kullanici?.rol === "admin") return next();
  res.status(403).render("yonetim/yasak", { sadeceYonetici: true });
}

// Sayfalama hesabı: toplam kayıttan sayfa sayısı ve SQL'deki OFFSET çıkar.
// ?sayfa= geçersizse ya da sınırı aşıyorsa en yakın geçerli sayfaya çekilir.
export function sayfala(req: Request, toplam: number, boyut = 25) {
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / boyut));
  const sayfa = Math.min(sayi(req.query.sayfa) ?? 1, sayfaSayisi);
  return { sayfa, sayfaSayisi, toplam, boyut, offset: (sayfa - 1) * boyut };
}

// Formdan gelen birden çok değer (aynı adlı checkbox'lar): tek değerde metin, çoğunda dizi gelir.
// Hepsini pozitif tam sayı dizisine çevirir, tekrarları atar, en fazla 200 öğe alır.
export function idListesi(deger: unknown): number[] {
  const ham = Array.isArray(deger) ? deger : deger === undefined ? [] : [deger];
  const idler = ham.map((d) => sayi(d)).filter((n): n is number => n !== null);
  return [...new Set(idler)].slice(0, 200);
}

// Sorgu dizgesindeki seçili değerleri okur: sabit izin listesinde yoksa varsayılanı döner
export function secim<T extends string>(deger: unknown, izinli: readonly T[], varsayilan: T): T {
  return typeof deger === "string" && (izinli as readonly string[]).includes(deger) ? (deger as T) : varsayilan;
}

// YYYY-AA-GG biçimindeki tarih filtresi: geçerliyse aynen döner, değilse boş
export function tarihFiltresi(deger: unknown): string {
  return typeof deger === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deger) && !Number.isNaN(Date.parse(deger)) ? deger : "";
}

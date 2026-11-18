// Şifre hash'leme: Node'un kendi crypto.scrypt'i (ek paket yok).
//
// Neden düz hash (sha256 gibi) değil? scrypt bilerek YAVAŞ ve bellek isteyen bir fonksiyon.
// Veritabanı çalınsa bile saldırganın milyarlarca şifre denemesi çok pahalı olur.
//
// Saklanan biçim:  scrypt$<tuz>$<hash>   (tuz ve hash base64)
// Tuz (salt): her kullanıcıya özel rastgele 16 bayt. Aynı şifreyi kullanan iki kişinin hash'i farklı çıkar.
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (sifre: string, tuz: Buffer, uzunluk: number) => Promise<Buffer>;
const UZUNLUK = 64;

export async function sifreHashle(sifre: string): Promise<string> {
  const tuz = randomBytes(16);
  const hash = await scryptAsync(sifre, tuz, UZUNLUK);
  return `scrypt$${tuz.toString("base64")}$${hash.toString("base64")}`;
}

export async function sifreDogru(sifre: string, saklanan: string): Promise<boolean> {
  const [tur, tuzB64, hashB64] = saklanan.split("$");
  if (tur !== "scrypt" || !tuzB64 || !hashB64) return false; // eski "gecici" gibi değerler hiç eşleşmez
  const beklenen = Buffer.from(hashB64, "base64");
  const hesaplanan = await scryptAsync(sifre, Buffer.from(tuzB64, "base64"), beklenen.length);
  // timingSafeEqual: karşılaştırma süresi, kaçıncı baytta farklılık olduğunu ele vermez
  return hesaplanan.length === beklenen.length && timingSafeEqual(hesaplanan, beklenen);
}

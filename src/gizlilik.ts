// Gizlilik ve engelleme kuralları (sql/11_gizlilik.sql). Özel mesajın gönderilip gönderilemeyeceğine
// hem sayfa çizilirken (yazı kutusu yerine kart) hem de POST'ta (asıl koruma) buradan bakılır;
// kural tek yerde dursun, iki yerde ayrışmasın.
import { pool } from "./db.ts";

// "izinli"        -> yazabilir
// "ben_engelledim" -> ben onu engelledim (engeli kaldırabilirim)
// "kapali"        -> o beni engellemiş YA DA özel mesajları kapatmış. Hangisi olduğunu bilerek AYIRMIYORUZ:
//                    engellendiğini öğrenen kişi ısrar edebilir ya da başka hesapla ulaşmaya çalışabilir.
export type MesajDurumu = "izinli" | "ben_engelledim" | "kapali";

export async function mesajDurumu(benId: number, kisiId: number): Promise<MesajDurumu> {
  const [[s]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?) AS ben,
            (SELECT COUNT(*) FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?) AS o,
            (SELECT dm_izni FROM users WHERE id = ?) AS dm_izni`,
    [benId, kisiId, kisiId, benId, kisiId]
  );
  if (Number(s.ben) > 0) return "ben_engelledim";
  if (Number(s.o) > 0 || s.dm_izni === "kimse") return "kapali";
  return "izinli";
}

// Engel kaydı (zaten varsa sessizce geçer: PRIMARY KEY çift kaydı engeller). Kendini engellemeyi CHECK de reddeder.
export async function engelle(benId: number, kisiId: number) {
  if (benId === kisiId) return;
  await pool.query("INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)", [benId, kisiId]);
  await takipleriSil(benId, kisiId);
}

// Engel iki yönde de takibi bitirir: engellediğin kişi seni takip etmeye devam etmesin, sen de onu.
export async function takipleriSil(a: number, b: number) {
  await pool.query(
    "DELETE FROM user_follows WHERE (follower_id = ? AND followed_id = ?) OR (follower_id = ? AND followed_id = ?)",
    [a, b, b, a]
  );
}

// "Çevrimiçi": son 5 dakikada bir sayfa açmış VE durumunu göstermeyi kapatmamış.
// Süreyi SQL'de hesaplatıyoruz (tek saat kaynağı veritabanı): SELECT'e bu parçayı ekle.
export const cevrimiciSql = (tablo: string) =>
  `(${tablo}.cevrimici_goster = 1 AND ${tablo}.last_seen_at >= NOW() - INTERVAL 5 MINUTE)`;

// Türkçe belirtme hâli eki: ayse -> ayse’yi, ahmet -> ahmet’i, kemal -> kemal’i, ali -> ali’yi.
// Ad kullanıcı adıdır (A-Z, 0-9, _): son sesli harfe bakıp ünlü uyumuna göre -ı/-i/-u/-ü, ad sesli harfle bitiyorsa araya y girer.
// (public/js/quadran.js'te aynı işin küçük bir kopyası var: şikâyet penceresi adı tarayıcıda yazıyor.)
export function belirtme(ad: string): string {
  const kucuk = ad.toLocaleLowerCase("tr");
  const sesliler = "aeıioöuü";
  let son = "";
  for (const h of kucuk) if (sesliler.includes(h)) son = h;
  const ek = "aı".includes(son) && son ? "ı" : "ei".includes(son) && son ? "i" : "ou".includes(son) && son ? "u" : son === "ö" || son === "ü" ? "ü" : "i";
  const sesliyleBiter = sesliler.includes(kucuk[kucuk.length - 1] ?? "");
  return `${ad}’${sesliyleBiter ? "y" : ""}${ek}`;
}

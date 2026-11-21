// Privacy and blocking rules (sql/11_gizlilik.sql). Whether a direct message may be sent is checked
// here both when the page is rendered (a card instead of the text box) and on POST (the real
// protection), so the rule lives in one place and cannot drift apart in two.
// Gizlilik ve engelleme kuralları (sql/11_gizlilik.sql). Özel mesajın gönderilip gönderilemeyeceğine
// hem sayfa çizilirken (yazı kutusu yerine kart) hem de POST'ta (asıl koruma) buradan bakılır;
// kural tek yerde dursun, iki yerde ayrışmasın.
import { pool } from "./db.ts";

// "izinli"         -> can write
// "ben_engelledim" -> I blocked them (I can remove the block)
// "kapali"         -> they blocked me OR turned off direct messages. We deliberately do NOT tell
//                     these apart: someone who learns they were blocked may persist or try to
//                     reach out with another account.
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

// Block record (silently skipped if it already exists: the PRIMARY KEY prevents duplicates). The CHECK constraint also rejects blocking yourself.
// Engel kaydı (zaten varsa sessizce geçer: PRIMARY KEY çift kaydı engeller). Kendini engellemeyi CHECK de reddeder.
export async function engelle(benId: number, kisiId: number) {
  if (benId === kisiId) return;
  await pool.query("INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)", [benId, kisiId]);
  await takipleriSil(benId, kisiId);
}

// A block ends following in both directions: the person you block stops following you, and you stop following them.
// Engel iki yönde de takibi bitirir: engellediğin kişi seni takip etmeye devam etmesin, sen de onu.
export async function takipleriSil(a: number, b: number) {
  await pool.query(
    "DELETE FROM user_follows WHERE (follower_id = ? AND followed_id = ?) OR (follower_id = ? AND followed_id = ?)",
    [a, b, b, a]
  );
}

// "Online": opened a page in the last 5 minutes AND has not turned off showing their status.
// The duration is computed in SQL (the database is the single clock source): add this fragment to the SELECT.
// "Çevrimiçi": son 5 dakikada bir sayfa açmış VE durumunu göstermeyi kapatmamış.
// Süreyi SQL'de hesaplatıyoruz (tek saat kaynağı veritabanı): SELECT'e bu parçayı ekle.
export const cevrimiciSql = (tablo: string) =>
  `(${tablo}.cevrimici_goster = 1 AND ${tablo}.last_seen_at >= NOW() - INTERVAL 5 MINUTE)`;

// Turkish accusative suffix: ayse -> ayse’yi, ahmet -> ahmet’i, kemal -> kemal’i, ali -> ali’yi.
// The name is a username (A-Z, 0-9, _): look at the last vowel and pick -ı/-i/-u/-ü by vowel harmony; if the name ends in a vowel, a y goes in between.
// (public/js/rubyyard.js has a small copy of the same logic: the report dialog writes the name in the browser.)
// Türkçe belirtme hâli eki: ayse -> ayse’yi, ahmet -> ahmet’i, kemal -> kemal’i, ali -> ali’yi.
// Ad kullanıcı adıdır (A-Z, 0-9, _): son sesli harfe bakıp ünlü uyumuna göre -ı/-i/-u/-ü, ad sesli harfle bitiyorsa araya y girer.
// (public/js/rubyyard.js'te aynı işin küçük bir kopyası var: şikâyet penceresi adı tarayıcıda yazıyor.)
export function belirtme(ad: string): string {
  const kucuk = ad.toLocaleLowerCase("tr");
  const sesliler = "aeıioöuü";
  let son = "";
  for (const h of kucuk) if (sesliler.includes(h)) son = h;
  const ek = "aı".includes(son) && son ? "ı" : "ei".includes(son) && son ? "i" : "ou".includes(son) && son ? "u" : son === "ö" || son === "ü" ? "ü" : "i";
  const sesliyleBiter = sesliler.includes(kucuk[kucuk.length - 1] ?? "");
  return `${ad}’${sesliyleBiter ? "y" : ""}${ek}`;
}

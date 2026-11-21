// Shared operations used by staff: ban, content delete/restore.
// Both /moderasyon and /yonetim use the functions here; the rule lives in one place so it does not drift apart in two.
//
// The functions know nothing about HTTP (req/res): they only do database work and return the result.
// The audit-log entry (denetim) and the toast are written in the calling route.
// Yetkililerin kullandığı ortak işlemler: ban, içerik silme/geri alma.
// Hem /moderasyon hem /yonetim buradaki fonksiyonları kullanır; kural bir yerde dursun, iki yerde ayrışmasın.
//
// Fonksiyonlar HTTP'yi (req/res) bilmez: sadece veritabanı işi yapar ve sonucu döner.
// İşlem kaydı (denetim) ve toast, çağıran route'ta yazılır.
import { pool } from "./db.ts";
import { bildirimGonder, kisalt, banliSql, silinenCozumuTemizle, mesajPuaniniGeriAl, mesajPuaniniGeriVer, rutbeKontrol } from "./yardimci.ts";

export type Yetkili = { id: number; rol: string };
export type Hedef = { id: number; username: string; rol: string; silindi: boolean; banli: boolean };

export async function kullaniciGetir(id: number | null): Promise<Hedef | null> {
  if (!id) return null;
  const [satirlar]: any = await pool.query(
    `SELECT users.id, users.username, roles.name AS rol, users.deleted_at IS NOT NULL AS silindi, ${banliSql("users")} AS banli
       FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = ?`,
    [id]
  );
  const k = satirlar[0];
  return k ? { ...k, silindi: !!k.silindi, banli: !!k.banli } : null;
}

// Is there another manageable admin (not deleted, ban not over)? Used to protect the last admin.
// Yönetilebilir (silinmemiş, ban'ı bitmemiş) başka yönetici var mı? Son yöneticiyi korumak için.
export async function digerAdminVar(haricId: number): Promise<boolean> {
  const [[s]]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM users JOIN roles ON roles.id = users.role_id
      WHERE roles.name = 'admin' AND users.deleted_at IS NULL AND NOT ${banliSql("users")} AND users.id <> ?`,
    [haricId]
  );
  return Number(s.n) > 0;
}

// May the actor perform an action (ban, role, points, account closure...) on the target?
// Returns the refusal reason, or null if allowed.
//   - Nobody can perform a management action on themselves (banning themselves and locking themselves out, demoting themselves...).
//   - A moderator acts only on those with the "uye" role: cannot touch admins or other moderators.
//   - sonAdminKoru: if the action takes the target out of management (ban, demoting the role, closing the account) the last admin is protected.
// Yapan kişi, hedef üzerinde (ban, rol, puan, hesap kapatma...) işlem yapabilir mi?
// Dönen değer: reddetme sebebi ya da izin varsa null.
//   - Kimse kendi üzerinde yönetim işlemi yapamaz (kendini banlayıp kilitlenmek, kendini düşürmek...).
//   - Moderatör yalnızca "uye" rolündekilere işlem yapar: yöneticilere ve diğer moderatörlere dokunamaz.
//   - sonAdminKoru: işlem hedefi yönetim dışına çıkarıyorsa (ban, rol düşürme, hesap kapatma) son yönetici korunur.
export async function islemHatasi(yapan: Yetkili, hedef: Hedef | null, sonAdminKoru = false): Promise<string | null> {
  if (!hedef) return "Kullanıcı bulunamadı.";
  if (hedef.id === yapan.id) return "Kendi hesabın üzerinde bu işlemi yapamazsın.";
  if (yapan.rol !== "admin" && hedef.rol !== "uye") return "Moderatörler yöneticiler ve moderatörler üzerinde işlem yapamaz.";
  if (sonAdminKoru && hedef.rol === "admin" && !(await digerAdminVar(hedef.id))) return "Son yöneticiye bu işlem yapılamaz.";
  return null;
}

// ---------------------------------------------------------------------------
// Ban: gun = 1 | 7 | 30 (timed) or null (permanent). A reason is required.
// banned_at is always now; if banned_until is empty it is permanent.
// If the target is already banned the duration/reason is refreshed (to extend or shorten the ban).
// Returns the error text or null.
// Ban: gun = 1 | 7 | 30 (süreli) ya da null (kalıcı). Sebep zorunlu.
// banned_at her zaman şimdi olur; banned_until boşsa kalıcıdır.
// Hedef zaten banlıysa süre/sebep yenilenir (ban'ı uzatmak ya da kısaltmak için).
// Dönen değer: hata metni ya da null.
// ---------------------------------------------------------------------------
export const BAN_SURELERI: Record<string, { gun: number | null; etiket: string }> = {
  "1": { gun: 1, etiket: "1 gün" },
  "7": { gun: 7, etiket: "7 gün" },
  "30": { gun: 30, etiket: "30 gün" },
  kalici: { gun: null, etiket: "kalıcı" },
};

export async function banla(yapan: Yetkili, hedefId: number, sureAnahtari: string, sebep: string): Promise<{ hata: string | null; hedef: Hedef | null; etiket: string }> {
  const hedef = await kullaniciGetir(hedefId);
  const sure = BAN_SURELERI[sureAnahtari];
  if (!sure) return { hata: "Geçerli bir süre seç.", hedef, etiket: "" };
  if (!sebep || sebep.length > 255) return { hata: sebep ? "Sebep en fazla 255 karakter olabilir." : "Ban sebebi yazmalısın.", hedef, etiket: "" };
  const hata = await islemHatasi(yapan, hedef, true);
  if (hata) return { hata, hedef, etiket: "" };
  if (hedef!.silindi) return { hata: "Hesap zaten kapatılmış.", hedef, etiket: "" };

  // INTERVAL ? DAY: the day count comes from a fixed table in code and is still bound with ?
  // INTERVAL ? DAY: gün sayısı koddaki sabit tablodan geliyor ve yine de ? ile bağlanıyor
  await pool.query(
    sure.gun === null
      ? "UPDATE users SET banned_at = NOW(), banned_until = NULL, ban_reason = ? WHERE id = ?"
      : "UPDATE users SET banned_at = NOW(), banned_until = DATE_ADD(NOW(), INTERVAL ? DAY), ban_reason = ? WHERE id = ?",
    sure.gun === null ? [sebep, hedefId] : [sure.gun, sebep, hedefId]
  );
  // The suspended person is dropped from the session; when the period ends and they return (or an admin lifts it) they should see the reason.
  // Uzaklaştırılan kişi oturumdan düşer; süre bitip geri dönünce (ya da yönetici kaldırınca) gerekçeyi görsün.
  await bildirimGonder({
    alan: hedefId, yapan: null, tur: "moderasyon",
    metin: `Hesabın uzaklaştırıldı (${sure.etiket}). Sebep: ${sebep}`, link: "/",
  });
  return { hata: null, hedef, etiket: sure.etiket };
}

export async function banKaldir(yapan: Yetkili, hedefId: number): Promise<{ hata: string | null; hedef: Hedef | null }> {
  const hedef = await kullaniciGetir(hedefId);
  const hata = await islemHatasi(yapan, hedef);
  if (hata) return { hata, hedef };
  await pool.query("UPDATE users SET banned_at = NULL, banned_until = NULL, ban_reason = NULL WHERE id = ?", [hedefId]);
  return { hata: null, hedef };
}

// ---------------------------------------------------------------------------
// Close pending reports. The column name comes from a fixed table in code, the value is bound with ?.
// Bekleyen şikâyetleri kapat. Sütun adı koddaki sabit tablodan gelir, değer ? ile bağlanır.
// ---------------------------------------------------------------------------
export const HEDEF_SUTUN: Record<string, string> = {
  konu_mesaji: "post_id",
  kullanici: "reported_user_id",
  sohbet_mesaji: "chat_message_id",
  ozel_mesaj: "message_id",
  oda_mesaji: "room_message_id",
};

export async function sikayetleriKapat(tur: string, hedefId: number, durum: "islendi" | "reddedildi", yetkiliId: number): Promise<number> {
  const [sonuc]: any = await pool.query(
    `UPDATE reports SET durum = ?, handled_by = ?, handled_at = NOW() WHERE ${HEDEF_SUTUN[tur]} = ? AND durum = 'bekliyor'`,
    [durum, yetkiliId, hedefId]
  );
  return sonuc.affectedRows;
}

// ---------------------------------------------------------------------------
// Topic post: soft delete (the row stays, deleted_at is filled). If it was the topic's first post the topic is deleted too.
// ALL of the post's pending reports become "processed" at once.
// Returns the deleted post's info, or null if not found/already deleted.
// Konu mesajı: yumuşak sil (satır kalır, deleted_at dolar). Konunun ilk mesajıysa konu da silinir.
// Mesajın bekleyen BÜTÜN şikâyetleri tek seferde "işlendi" olur.
// Dönen değer: silinen mesajın bilgisi, bulunamadı/zaten silinmişse null.
// ---------------------------------------------------------------------------
// sebep (optional): the reason written when deleting from the panel; it is appended to the notification sent to the author.
// sebep (isteğe bağlı): panelden silerken yazılan gerekçe, yazara giden bildirimin sonuna eklenir.
const sebepEki = (sebep?: string) => (sebep ? ` Sebep: ${sebep}` : "");

export async function mesajiSil(postId: number, yetkiliId: number, sebep?: string) {
  const [satirlar]: any = await pool.query(
    `SELECT posts.id, posts.user_id, posts.topic_id, posts.content,
            posts.id = (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id) AS ilk_mi
       FROM posts WHERE posts.id = ? AND posts.deleted_at IS NULL`,
    [postId]
  );
  const mesaj = satirlar[0];
  if (!mesaj) return null;

  // The writes must go together: if left half-done (post deleted but report open, solution mark still there) it becomes inconsistent.
  // If the deleted reply was the topic's solution (or the deleted post is the topic itself, for the solution reply) the mark is removed and the open solution
  // points are taken back; the points the author earned from this post are taken back too (all in the same transaction).
  // Yazma işlemleri birlikte olmalı: yarım kalırsa (mesaj silinmiş ama şikâyet açık, çözüm işareti duruyor) tutarsızlık olur.
  // Silinen cevap konunun çözümüyse (ya da silinen mesaj konunun kendisiyse, çözüm cevabı için) işaret kalkar ve açık çözüm
  // puanı geri alınır; yazarın bu mesajdan kazandığı puan da geri alınır (hepsi aynı transaction).
  const baglanti = await pool.getConnection();
  let puanlar: { kisi: number; eski: number; yeni: number }[] = [];
  try {
    await baglanti.beginTransaction();
    // Lock order is the same EVERYWHERE: topic → post → users (`silinenCozumuTemizle` already locks the topic, the lock can be re-acquired).
    // The "not deleted?" check is redone INSIDE the lock: the first read above was lockless, so concurrent deletes of the same post
    // could all pass it (the points row would be single but notifications and audit entries would multiply). The losing request here
    // sees the deleted post, writes nothing and returns null; callers write no notification/audit entry when they see null.
    // Kilit sırası HER YERDE aynı: konu → mesaj → users (silinenCozumuTemizle konuyu zaten kilitler, kilit yeniden alınabilir).
    // "Silinmemiş mi" denetimi kilidin İÇİNDE yeniden yapılır: yukarıdaki ilk okuma kilitsizdi, aynı mesaja gelen eşzamanlı
    // silmelerin hepsi onu geçebilirdi (puan satırı tekti ama bildirim ve işlem kaydı çoğalırdı). Kaybeden istek burada
    // silinmiş mesajı görür, hiçbir şey yazmadan null döner; çağıranlar null görünce bildirim/işlem kaydı yazmaz.
    await baglanti.query("SELECT id FROM topics WHERE id = ? FOR UPDATE", [mesaj.topic_id]);
    const [[hala]]: any = await baglanti.query("SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [postId]);
    if (!hala) { await baglanti.rollback(); return null; }
    mesaj.ilk_mi = !!mesaj.ilk_mi;
    // topic lock first (before the points locks)
    // konu kilidi önce (puan kilitlerinden önce)
    puanlar = await silinenCozumuTemizle(baglanti, mesaj);
    const kayip = await mesajPuaniniGeriAl(baglanti, mesaj);
    if (kayip) puanlar.push(kayip);
    await baglanti.query("UPDATE posts SET deleted_at = NOW() WHERE id = ?", [postId]);
    if (mesaj.ilk_mi) await baglanti.query("UPDATE topics SET deleted_at = COALESCE(deleted_at, NOW()) WHERE id = ?", [mesaj.topic_id]);
    await baglanti.query(
      "UPDATE reports SET durum = 'islendi', handled_by = ?, handled_at = NOW() WHERE post_id = ? AND durum = 'bekliyor'",
      [yetkiliId, postId]
    );
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }

  for (const p of puanlar) await rutbeKontrol(p.kisi, p.eski, p.yeni);

  // Actor is null: the notification does not show the staff member's name, it arrives as "Moderasyon".
  // Yapan null: bildirimde yetkilinin adı görünmez, "Moderasyon" olarak gelir.
  await bildirimGonder({
    alan: mesaj.user_id, yapan: null, tur: "moderasyon",
    metin: `Mesajın moderatörler tarafından kaldırıldı: “${kisalt(mesaj.content, 50)}”.${sebepEki(sebep)}`,
    link: mesaj.ilk_mi ? "/" : `/konu/${mesaj.topic_id}`,
  });
  return mesaj;
}

// Restore a deleted post. If it is the first post the topic comes back too. Restored: true.
// The author's points taken back at deletion are given back (`mesajPuaniniGeriVer`): so a person does not lose out if staff deleted by mistake.
// Points do not multiply because the amount given back is computed from the 'silme' + 'geri_yukleme' records (restoring again gives 0).
// If the solution mark was removed at deletion, restoring does NOT automatically mark it AGAIN and the solution points are not given back:
// the topic owner can pick the reply as the solution again if they want. Otherwise delete → restore could multiply points.
// Silinmiş mesajı geri getir. İlk mesajsa konu da geri gelir. Geri alınan: true.
// Yazarın silinirken geri alınan puanı geri verilir (mesajPuaniniGeriVer): yetkili yanlışlıkla sildiyse kişi kaybetmesin.
// Puan çoğalmaz çünkü geri verilen miktar 'silme' + 'geri_yukleme' kayıtlarından hesaplanır (tekrar geri yükleme 0 verir).
// Silinirken çözüm işareti kalktıysa geri alınca otomatik YENİDEN işaretlenmez ve çözüm puanı geri verilmez:
// konu sahibi isterse cevabı yeniden çözüm seçer. Aksi hâlde sil → geri al ile puan çoğaltılabilirdi.
export async function mesajiGeriAl(postId: number): Promise<boolean> {
  const [satirlar]: any = await pool.query(
    `SELECT posts.id, posts.user_id, posts.topic_id,
            posts.id = (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id) AS ilk_mi
       FROM posts WHERE posts.id = ? AND posts.deleted_at IS NOT NULL`,
    [postId]
  );
  const mesaj = satirlar[0];
  if (!mesaj) return false;
  const baglanti = await pool.getConnection();
  let puan: { kisi: number; eski: number; yeni: number } | null = null;
  try {
    await baglanti.beginTransaction();
    // lock order: topic first, then post, then users
    // kilit sırası: önce konu, sonra mesaj, sonra users
    await baglanti.query("SELECT id FROM topics WHERE id = ? FOR UPDATE", [mesaj.topic_id]);
    // Re-check inside the lock (same reason as `mesajiSil`): two concurrent restores must not process the points/record twice.
    // Kilit içinde yeniden denetim (mesajiSil ile aynı neden): eşzamanlı iki geri alma puanı/kaydı iki kez işlemesin.
    const [[hala]]: any = await baglanti.query("SELECT id FROM posts WHERE id = ? AND deleted_at IS NOT NULL FOR UPDATE", [postId]);
    if (!hala) { await baglanti.rollback(); return false; }
    await baglanti.query("UPDATE posts SET deleted_at = NULL WHERE id = ?", [postId]);
    if (mesaj.ilk_mi) await baglanti.query("UPDATE topics SET deleted_at = NULL WHERE id = ?", [mesaj.topic_id]);
    puan = await mesajPuaniniGeriVer(baglanti, mesaj);
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }
  if (puan) await rutbeKontrol(puan.kisi, puan.eski, puan.yeni);
  return true;
}

// Delete topic = delete the topic's first post (`mesajiSil` closes the topic too).
// Konuyu sil = konunun ilk mesajını silmek (mesajiSil konuyu da kapatır).
export async function konuyuSil(topicId: number, yetkiliId: number, sebep?: string): Promise<boolean> {
  const [[konu]]: any = await pool.query("SELECT id, deleted_at FROM topics WHERE id = ?", [topicId]);
  if (!konu || konu.deleted_at) return false;
  const [[ilk]]: any = await pool.query("SELECT MIN(id) AS id FROM posts WHERE topic_id = ?", [topicId]);
  const silinen = ilk?.id ? await mesajiSil(ilk.id, yetkiliId, sebep) : null;
  if (silinen) return true;
  // `mesajiSil` returned null: the first post was already deleted, or another concurrent request deleted it before us.
  // The topic is closed only if it is still open; if no row changed (affectedRows 0) the operation counts as not done, and the caller writes no record.
  // mesajiSil null döndü: ilk mesaj zaten silinmişti ya da eşzamanlı başka bir istek bizden önce sildi.
  // Yalnızca konu hâlâ açıksa kapatılır; satır değişmediyse (affectedRows 0) işlem yapılmamış sayılır, çağıran kayıt yazmaz.
  const [s]: any = await pool.query("UPDATE topics SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL", [topicId]);
  return s.affectedRows > 0;
}

// Restore topic: topic + first post come back together, the first post's taken-back points are given back too (same rule as `mesajiGeriAl`).
// Konuyu geri getir: konu + ilk mesaj birlikte döner, ilk mesajın geri alınan puanı da geri verilir (mesajiGeriAl ile aynı kural).
export async function konuyuGeriAl(topicId: number): Promise<boolean> {
  const [[konu]]: any = await pool.query("SELECT id, deleted_at FROM topics WHERE id = ?", [topicId]);
  if (!konu || !konu.deleted_at) return false;
  const baglanti = await pool.getConnection();
  let puan: { kisi: number; eski: number; yeni: number } | null = null;
  try {
    await baglanti.beginTransaction();
    // Lock order: topic first, then post, then users. The "deleted?" check is redone inside the lock (a single record on concurrent restore).
    // Kilit sırası: önce konu, sonra mesaj, sonra users. Silinmiş mi denetimi kilidin içinde yeniden yapılır (eşzamanlı geri almada tek kayıt).
    const [[hala]]: any = await baglanti.query("SELECT id FROM topics WHERE id = ? AND deleted_at IS NOT NULL FOR UPDATE", [topicId]);
    if (!hala) { await baglanti.rollback(); return false; }
    await baglanti.query("UPDATE topics SET deleted_at = NULL WHERE id = ?", [topicId]);
    const [[ilk]]: any = await baglanti.query("SELECT id, user_id FROM posts WHERE topic_id = ? ORDER BY id LIMIT 1", [topicId]);
    if (ilk) {
      await baglanti.query("UPDATE posts SET deleted_at = NULL WHERE id = ?", [ilk.id]);
      puan = await mesajPuaniniGeriVer(baglanti, ilk);
    }
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }
  if (puan) await rutbeKontrol(puan.kisi, puan.eski, puan.yeni);
  return true;
}

// Chat message (general chat): soft delete + close its reports
// Sohbet mesajı (genel sohbet): yumuşak sil + şikâyetlerini kapat
export async function sohbetMesajiSil(id: number, yetkiliId: number, sebep?: string) {
  const [satirlar]: any = await pool.query("SELECT id, user_id, content FROM chat_messages WHERE id = ? AND deleted_at IS NULL", [id]);
  const m = satirlar[0];
  if (!m) return null;
  await pool.query("UPDATE chat_messages SET deleted_at = NOW() WHERE id = ?", [id]);
  await sikayetleriKapat("sohbet_mesaji", id, "islendi", yetkiliId);
  await bildirimGonder({
    alan: m.user_id, yapan: null, tur: "moderasyon",
    metin: `Sohbetteki mesajın moderatörler tarafından kaldırıldı: “${kisalt(m.content, 50)}”.${sebepEki(sebep)}`, link: "/sohbet?genel=1",
  });
  return m;
}

export async function sohbetMesajiGeriAl(id: number): Promise<boolean> {
  const [sonuc]: any = await pool.query("UPDATE chat_messages SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL", [id]);
  return sonuc.affectedRows > 0;
}

// Private message: removed only from the report queue (private messages are not browsed in the admin panel, privacy).
// Özel mesaj: yalnızca şikâyet kuyruğundan silinir (yönetim panelinde özel mesajlar gezilmez, gizlilik).
export async function ozelMesajiSil(id: number, yetkiliId: number, sebep?: string) {
  const [satirlar]: any = await pool.query("SELECT id, sender_id, content FROM messages WHERE id = ? AND deleted_at IS NULL", [id]);
  const m = satirlar[0];
  if (!m) return null;
  await pool.query("UPDATE messages SET deleted_at = NOW() WHERE id = ?", [id]);
  await sikayetleriKapat("ozel_mesaj", id, "islendi", yetkiliId);
  await bildirimGonder({
    alan: m.sender_id, yapan: null, tur: "moderasyon",
    metin: `Gönderdiğin bir özel mesaj şikâyet üzerine moderatörler tarafından kaldırıldı.${sebepEki(sebep)}`, link: "/mesajlar",
  });
  return m;
}

// Room message (private room, sql/12): staff delete only from the report queue (room messages are not browsed in the panel, privacy).
// Oda mesajı (özel oda, sql/12): yetkili yalnızca şikâyet kuyruğundan siler (odaların mesajları panelde gezilmez, gizlilik).
export async function odaMesajiSil(id: number, yetkiliId: number, sebep?: string) {
  const [satirlar]: any = await pool.query("SELECT id, user_id, content FROM room_messages WHERE id = ? AND tur = 'mesaj' AND deleted_at IS NULL", [id]);
  const m = satirlar[0];
  if (!m) return null;
  await pool.query("UPDATE room_messages SET deleted_at = NOW() WHERE id = ?", [id]);
  await sikayetleriKapat("oda_mesaji", id, "islendi", yetkiliId);
  await bildirimGonder({
    alan: m.user_id, yapan: null, tur: "moderasyon",
    metin: `Bir oda mesajın şikâyet üzerine moderatörler tarafından kaldırıldı: “${kisalt(m.content, 50)}”.${sebepEki(sebep)}`, link: "/sohbet",
  });
  return m;
}

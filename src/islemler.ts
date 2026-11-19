// Yetkililerin kullandığı ortak işlemler: ban, içerik silme/geri alma.
// Hem /moderasyon hem /yonetim buradaki fonksiyonları kullanır; kural bir yerde dursun, iki yerde ayrışmasın.
//
// Fonksiyonlar HTTP'yi (req/res) bilmez: sadece veritabanı işi yapar ve sonucu döner.
// İşlem kaydı (denetim) ve toast, çağıran route'ta yazılır.
import { pool } from "./db.ts";
import { bildirimGonder, kisalt, banliSql } from "./yardimci.ts";

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

// Yönetilebilir (silinmemiş, ban'ı bitmemiş) başka yönetici var mı? Son yöneticiyi korumak için.
export async function digerAdminVar(haricId: number): Promise<boolean> {
  const [[s]]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM users JOIN roles ON roles.id = users.role_id
      WHERE roles.name = 'admin' AND users.deleted_at IS NULL AND NOT ${banliSql("users")} AND users.id <> ?`,
    [haricId]
  );
  return Number(s.n) > 0;
}

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

  // INTERVAL ? DAY: gün sayısı koddaki sabit tablodan geliyor ve yine de ? ile bağlanıyor
  await pool.query(
    sure.gun === null
      ? "UPDATE users SET banned_at = NOW(), banned_until = NULL, ban_reason = ? WHERE id = ?"
      : "UPDATE users SET banned_at = NOW(), banned_until = DATE_ADD(NOW(), INTERVAL ? DAY), ban_reason = ? WHERE id = ?",
    sure.gun === null ? [sebep, hedefId] : [sure.gun, sebep, hedefId]
  );
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
// Bekleyen şikâyetleri kapat. Sütun adı koddaki sabit tablodan gelir, değer ? ile bağlanır.
// ---------------------------------------------------------------------------
export const HEDEF_SUTUN: Record<string, string> = {
  konu_mesaji: "post_id",
  kullanici: "reported_user_id",
  sohbet_mesaji: "chat_message_id",
  ozel_mesaj: "message_id",
};

export async function sikayetleriKapat(tur: string, hedefId: number, durum: "islendi" | "reddedildi", yetkiliId: number): Promise<number> {
  const [sonuc]: any = await pool.query(
    `UPDATE reports SET durum = ?, handled_by = ?, handled_at = NOW() WHERE ${HEDEF_SUTUN[tur]} = ? AND durum = 'bekliyor'`,
    [durum, yetkiliId, hedefId]
  );
  return sonuc.affectedRows;
}

// ---------------------------------------------------------------------------
// Konu mesajı: yumuşak sil (satır kalır, deleted_at dolar). Konunun ilk mesajıysa konu da silinir.
// Mesajın bekleyen BÜTÜN şikâyetleri tek seferde "işlendi" olur.
// Dönen değer: silinen mesajın bilgisi, bulunamadı/zaten silinmişse null.
// ---------------------------------------------------------------------------
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

  // Üç yazma işlemi birlikte olmalı: yarım kalırsa (mesaj silinmiş ama şikâyet açık) tutarsızlık olur.
  const baglanti = await pool.getConnection();
  try {
    await baglanti.beginTransaction();
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

  // Yapan null: bildirimde yetkilinin adı görünmez, "Moderasyon" olarak gelir.
  await bildirimGonder({
    alan: mesaj.user_id, yapan: null, tur: "moderasyon",
    metin: `Mesajın moderatörler tarafından kaldırıldı: “${kisalt(mesaj.content, 50)}”.${sebepEki(sebep)}`,
    link: mesaj.ilk_mi ? "/" : `/konu/${mesaj.topic_id}`,
  });
  return mesaj;
}

// Silinmiş mesajı geri getir. İlk mesajsa konu da geri gelir. Geri alınan: true.
export async function mesajiGeriAl(postId: number): Promise<boolean> {
  const [satirlar]: any = await pool.query(
    `SELECT posts.id, posts.topic_id,
            posts.id = (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id) AS ilk_mi
       FROM posts WHERE posts.id = ? AND posts.deleted_at IS NOT NULL`,
    [postId]
  );
  const mesaj = satirlar[0];
  if (!mesaj) return false;
  await pool.query("UPDATE posts SET deleted_at = NULL WHERE id = ?", [postId]);
  if (mesaj.ilk_mi) await pool.query("UPDATE topics SET deleted_at = NULL WHERE id = ?", [mesaj.topic_id]);
  return true;
}

// Konuyu sil = konunun ilk mesajını silmek (mesajiSil konuyu da kapatır).
export async function konuyuSil(topicId: number, yetkiliId: number, sebep?: string): Promise<boolean> {
  const [[konu]]: any = await pool.query("SELECT id, deleted_at FROM topics WHERE id = ?", [topicId]);
  if (!konu || konu.deleted_at) return false;
  const [[ilk]]: any = await pool.query("SELECT MIN(id) AS id FROM posts WHERE topic_id = ?", [topicId]);
  const silinen = ilk?.id ? await mesajiSil(ilk.id, yetkiliId, sebep) : null;
  if (!silinen) await pool.query("UPDATE topics SET deleted_at = NOW() WHERE id = ?", [topicId]); // ilk mesaj zaten silinmişti
  return true;
}

export async function konuyuGeriAl(topicId: number): Promise<boolean> {
  const [[konu]]: any = await pool.query("SELECT id, deleted_at FROM topics WHERE id = ?", [topicId]);
  if (!konu || !konu.deleted_at) return false;
  await pool.query("UPDATE topics SET deleted_at = NULL WHERE id = ?", [topicId]);
  await pool.query("UPDATE posts SET deleted_at = NULL WHERE id = (SELECT m FROM (SELECT MIN(id) AS m FROM posts WHERE topic_id = ?) AS x)", [topicId]);
  return true;
}

// Sohbet mesajı (genel sohbet): yumuşak sil + şikâyetlerini kapat
export async function sohbetMesajiSil(id: number, yetkiliId: number, sebep?: string) {
  const [satirlar]: any = await pool.query("SELECT id, user_id, content FROM chat_messages WHERE id = ? AND deleted_at IS NULL", [id]);
  const m = satirlar[0];
  if (!m) return null;
  await pool.query("UPDATE chat_messages SET deleted_at = NOW() WHERE id = ?", [id]);
  await sikayetleriKapat("sohbet_mesaji", id, "islendi", yetkiliId);
  await bildirimGonder({
    alan: m.user_id, yapan: null, tur: "moderasyon",
    metin: `Sohbetteki mesajın moderatörler tarafından kaldırıldı: “${kisalt(m.content, 50)}”.${sebepEki(sebep)}`, link: "/sohbet",
  });
  return m;
}

export async function sohbetMesajiGeriAl(id: number): Promise<boolean> {
  const [sonuc]: any = await pool.query("UPDATE chat_messages SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL", [id]);
  return sonuc.affectedRows > 0;
}

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

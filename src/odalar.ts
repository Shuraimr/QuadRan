// Özel odalar (sql/12_odalar.sql): davetle girilen grup sohbetlerinin ortak mantığı.
// Route'lar src/rotalar/odalar.ts'te; burada hem onların hem /sohbet merkezinin (iletisim.ts) ve oturum.ts'in
// kullandığı sorgular ve kurallar durur. Kural bir yerde dursun, iki yerde ayrışmasın.
import { randomInt } from "node:crypto";
import { pool } from "./db.ts";
import { ayarlar } from "./ayarlar.ts";
import { rutbeSutunlari, kisalt, likeKac } from "./yardimci.ts";
import { rutbeler, kilitBilgisi } from "./rutbe.ts";
import { cevrimiciSql } from "./gizlilik.ts";

export type OdaRol = "sahip" | "yonetici" | "uye";
// Yönetici ve sahip odayı yönetir (davet, bağlantı, çıkarma, mesaj silme, ad/açıklama)
export const yonetir = (rol: OdaRol | undefined | null) => rol === "sahip" || rol === "yonetici";

// ---------------------------------------------------------------------------
// Davet bağlantısı kodu: 8 karakter, okunur biçim K7Q2-XM9P. Karıştırılan harfler (I, O, 0, 1, L) alfabede yok.
// randomInt kriptografik olarak güvenli rastgele sayı verir (Math.random tahmin edilebilir, davetiye için uygun değil).
// ---------------------------------------------------------------------------
const KOD_ALFABE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function kodUret(): string {
  let k = "";
  for (let i = 0; i < 8; i++) k += KOD_ALFABE[randomInt(KOD_ALFABE.length)];
  return k.slice(0, 4) + "-" + k.slice(4);
}
// Adresten gelen kodu kurala çevirir (küçük harf, tiresiz yazılmış olabilir); biçim bozuksa null
export function kodDuzelt(ham: string): string | null {
  const t = ham.toLocaleUpperCase("en").replace(/[^A-Z0-9]/g, "");
  return t.length === 8 && [...t].every((h) => KOD_ALFABE.includes(h)) ? t.slice(0, 4) + "-" + t.slice(4) : null;
}

// ---------------------------------------------------------------------------
// Oda açma kuralı: rütbenin "oda_ac" ayrıcalığı (src/rutbe.ts, panelde Rütbeler tablosundan ayarlanır) + sahip olunan
// oda sınırı. Yöneticiler ve moderatörler rütbe şartından muaftır (sınır herkese uygulanır).
// kilit: ayrıcalığı ilk açan rütbe ve kalan puan (kilit kartı partials/kilit.ejs için).
// ---------------------------------------------------------------------------
export type OlusturmaDurumu = {
  izinli: boolean;
  rutbeYeter: boolean; sinirDolu: boolean;
  kilit: ReturnType<typeof kilitBilgisi>;
  sahip: number; sinir: number;
};

export async function olusturmaDurumu(kullanici: { id: number; points: number; rol: string }): Promise<OlusturmaDurumu> {
  const { oda } = await ayarlar();
  await rutbeler(); // önbellek taze olsun
  const [[s]]: any = await pool.query("SELECT COUNT(*) AS n FROM rooms WHERE sahip_id = ? AND deleted_at IS NULL", [kullanici.id]);
  const kilit = kilitBilgisi(kullanici, "oda_ac");
  const rutbeYeter = kilit.acik;
  const sahip = Number(s.n);
  const sinirDolu = sahip >= oda.kisiSiniri;
  return { izinli: rutbeYeter && !sinirDolu, rutbeYeter, sinirDolu, kilit, sahip, sinir: oda.kisiSiniri };
}

// Sistem satırı ("ayse odaya ahmet’i ekledi"): room_messages'a tur='sistem' olarak yazılır, metin hazırdır.
export async function sistemMesaji(odaId: number, kullaniciId: number, metin: string): Promise<number> {
  const [sonuc]: any = await pool.query("INSERT INTO room_messages (room_id, user_id, tur, content) VALUES (?, ?, 'sistem', ?)", [odaId, kullaniciId, metin.slice(0, 2000)]);
  return sonuc.insertId;
}

// "Engel var mı?" iki yönde: ben onu ya da o beni engellemiş. Davet ve arama bunu eler.
export const engelSql = (a: string, b: string) =>
  `EXISTS (SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = ${a} AND ub.blocked_id = ${b}) OR (ub.blocker_id = ${b} AND ub.blocked_id = ${a}))`;

// ---------------------------------------------------------------------------
// Okunmamış nokta: sessize alınmamış herhangi bir odada okunmamış mesaj var mı? (oturum.ts her istekte sorar)
// Okunmamış = benim olmayan, silinmemiş, sistem olmayan ve engellediğim kişiden gelmeyen, son_okunan_id'den büyük mesaj.
// ---------------------------------------------------------------------------
export async function okunmamisOdaVar(benId: number): Promise<boolean> {
  const [[s]]: any = await pool.query(
    `SELECT EXISTS (
        SELECT 1 FROM room_members m
          JOIN rooms r ON r.id = m.room_id AND r.deleted_at IS NULL
          JOIN room_messages x ON x.room_id = m.room_id AND x.id > COALESCE(m.son_okunan_id, 0)
         WHERE m.user_id = ? AND m.sessiz = 0 AND x.tur = 'mesaj' AND x.deleted_at IS NULL AND x.user_id <> ?
           AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ? AND b.blocked_id = x.user_id)
     ) AS var`,
    [benId, benId, benId]
  );
  return Number(s.var) > 0;
}

// ---------------------------------------------------------------------------
// /sohbet merkezinin sol listesi: bekleyen davetler, genel sohbetin son mesajı, benim odalarım.
// ---------------------------------------------------------------------------
export type OdaSatiri = {
  id: number; ad: string; sessiz: boolean; kapali: boolean; okunmamis: number;
  son_metin: string | null; son_zaman: Date | null;
};

export async function hubVerisi(kullanici: { id: number; points: number; rol: string }) {
  const [odalar]: any = await pool.query(
    `SELECT r.id, r.ad, m.sessiz, r.kapatildi_at IS NOT NULL AS kapali,
            (SELECT COUNT(*) FROM room_messages x
              WHERE x.room_id = r.id AND x.id > COALESCE(m.son_okunan_id, 0) AND x.tur = 'mesaj' AND x.deleted_at IS NULL AND x.user_id <> ?
                AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ? AND b.blocked_id = x.user_id)) AS okunmamis,
            son.content AS son_icerik, son.tur AS son_tur, son.created_at AS son_zaman, su.username AS son_yazar,
            EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ? AND b.blocked_id = son.user_id) AS son_engelli
       FROM room_members m
       JOIN rooms r ON r.id = m.room_id AND r.deleted_at IS NULL
       LEFT JOIN room_messages son ON son.id = (SELECT MAX(y.id) FROM room_messages y WHERE y.room_id = r.id AND y.deleted_at IS NULL)
       LEFT JOIN users su ON su.id = son.user_id
      WHERE m.user_id = ?
      ORDER BY COALESCE(son.id, 0) DESC, r.id DESC`,
    [kullanici.id, kullanici.id, kullanici.id, kullanici.id]
  );
  for (const o of odalar) {
    o.okunmamis = Number(o.okunmamis); o.sessiz = !!o.sessiz; o.kapali = !!o.kapali;
    // Önizleme "ad: metin"; sistem satırı zaten tam cümle; engellediğim kişinin mesajı özetlenmez
    o.son_metin = !o.son_icerik ? null : o.son_engelli ? "Engellediğin kişinin mesajı"
      : kisalt(o.son_tur === "sistem" ? o.son_icerik : `${o.son_yazar}: ${o.son_icerik}`, 80);
  }

  const [davetler]: any = await pool.query(
    `SELECT i.id, r.ad AS oda, u.username AS davet_eden
       FROM room_invites i JOIN rooms r ON r.id = i.room_id AND r.deleted_at IS NULL JOIN users u ON u.id = i.davet_eden
      WHERE i.davet_edilen = ? AND i.durum = 'bekliyor' ORDER BY i.id DESC`,
    [kullanici.id]
  );

  const [[genel]]: any = await pool.query(
    `SELECT c.content, c.created_at, u.username FROM chat_messages c JOIN users u ON u.id = c.user_id
      WHERE c.deleted_at IS NULL ORDER BY c.id DESC LIMIT 1`
  );
  return {
    odalar: odalar as OdaSatiri[], davetler,
    genel: genel ? { metin: kisalt(`${genel.username}: ${genel.content}`, 80), zaman: genel.created_at } : null,
    olustur: await olusturmaDurumu(kullanici),
  };
}

// ---------------------------------------------------------------------------
// Bir odanın sayfa verisi. Üye değilsen null (varlığını da söylemiyoruz: 404).
// ---------------------------------------------------------------------------
export async function uyelik(odaId: number, benId: number) {
  const [[o]]: any = await pool.query(
    `SELECT r.id, r.ad, r.aciklama, r.sahip_id, r.created_at, r.kapatildi_at IS NOT NULL AS kapali, m.rol, m.sessiz
       FROM rooms r JOIN room_members m ON m.room_id = r.id AND m.user_id = ?
      WHERE r.id = ? AND r.deleted_at IS NULL`,
    [benId, odaId]
  );
  if (!o) return null;
  return { ...o, kapali: !!o.kapali, sessiz: !!o.sessiz } as {
    id: number; ad: string; aciklama: string | null; sahip_id: number; created_at: Date; kapali: boolean; rol: OdaRol; sessiz: boolean;
  };
}

export async function odaDetayi(oda: NonNullable<Awaited<ReturnType<typeof uyelik>>>, benId: number) {
  // Önce okundu işaretle: soldaki listede bu odanın sayısı ve menüdeki nokta güncel çıksın
  await pool.query(
    "UPDATE room_members SET son_okunan_id = (SELECT COALESCE(MAX(id), 0) FROM room_messages WHERE room_id = ?) WHERE room_id = ? AND user_id = ?",
    [oda.id, oda.id, benId]
  );

  const [mesajlar]: any = await pool.query(
    `SELECT * FROM (
       SELECT m.id, m.tur, m.content, m.created_at, m.user_id, u.username AS yazar, ${rutbeSutunlari("u")}, mm.rol AS oda_rol,
              EXISTS (SELECT 1 FROM user_blocks b WHERE b.blocker_id = ? AND b.blocked_id = m.user_id) AS engelli
         FROM room_messages m JOIN users u ON u.id = m.user_id
         LEFT JOIN room_members mm ON mm.room_id = m.room_id AND mm.user_id = m.user_id
        WHERE m.room_id = ? AND m.deleted_at IS NULL
        ORDER BY m.id DESC LIMIT 100
     ) AS son ORDER BY id`,
    [benId, oda.id]
  );
  for (const m of mesajlar) m.engelli = !!m.engelli;

  const [uyeler]: any = await pool.query(
    `SELECT u.id, u.username, ${rutbeSutunlari("u")}, m.rol, ${cevrimiciSql("u")} AS cevrimici
       FROM room_members m JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ? AND u.deleted_at IS NULL
      ORDER BY FIELD(m.rol, 'sahip', 'yonetici', 'uye'), u.username`,
    [oda.id]
  );
  for (const u of uyeler) u.cevrimici = !!u.cevrimici;

  const detay: Record<string, any> = { mesajlar, uyeler, cevrimiciSayisi: uyeler.filter((u: any) => u.cevrimici).length, baglantilar: [], bekleyenDavetler: [] };
  if (yonetir(oda.rol)) {
    // Etkin = iptal edilmemiş, süresi dolmamış, kullanım sınırı dolmamış
    const [baglantilar]: any = await pool.query(
      `SELECT l.id, l.kod, l.son_kullanma, l.kullanim_siniri, l.kullanim, l.created_at, u.username AS olusturan
         FROM room_links l JOIN users u ON u.id = l.olusturan
        WHERE l.room_id = ? AND l.iptal_at IS NULL AND (l.son_kullanma IS NULL OR l.son_kullanma > NOW())
          AND (l.kullanim_siniri IS NULL OR l.kullanim < l.kullanim_siniri)
        ORDER BY l.id DESC`,
      [oda.id]
    );
    detay.baglantilar = baglantilar;
    const [bekleyen]: any = await pool.query(
      `SELECT i.id, u.username FROM room_invites i JOIN users u ON u.id = i.davet_edilen
        WHERE i.room_id = ? AND i.durum = 'bekliyor' ORDER BY i.id DESC`,
      [oda.id]
    );
    detay.bekleyenDavetler = bekleyen;
  }
  return detay;
}

// Davet edilebilecek kişiler: kendim, silinmiş hesaplar, üyeler, bekleyen davetlisi olanlar ve aramızda engel
// bulunanlar (iki yönde de) çıkmaz. En çok 8 sonuç.
export async function davetAra(benId: number, odaId: number, q: string) {
  if (!q) return [];
  const [satirlar]: any = await pool.query(
    `SELECT u.username, ${rutbeSutunlari("u")} FROM users u
      WHERE u.username LIKE ? AND u.deleted_at IS NULL AND u.id <> ?
        AND NOT EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = ? AND m.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM room_invites i WHERE i.room_id = ? AND i.davet_edilen = u.id AND i.durum = 'bekliyor')
        AND NOT ${engelSql("?", "u.id")}
      ORDER BY u.username LIMIT 8`,
    [likeKac(q), benId, odaId, odaId, benId, benId]
  );
  return satirlar as { username: string; rutbe: string | null }[];
}

// Şikâyet kuyruğunun ortak mantığı. /moderasyon (basit kuyruk) ve /yonetim/sikayetler (gelişmiş kuyruk)
// aynı fonksiyonları kullanır.
//
// Şikâyet modeli (sql/08_yonetim.sql): reports.hedef_tur hangi sütunun dolu olduğunu söyler.
//   konu_mesaji -> post_id | kullanici -> reported_user_id | sohbet_mesaji -> chat_message_id | ozel_mesaj -> message_id
import type { Request, Response } from "express";
import { pool } from "./db.ts";
import { denetim } from "./denetim.ts";
import { rutbeSql, bildirimGonder, kisalt, banliSql } from "./yardimci.ts";
import {
  HEDEF_SUTUN, banla, mesajiSil, sohbetMesajiSil, ozelMesajiSil, sikayetleriKapat, type Yetkili,
} from "./islemler.ts";

export const TUR_ETIKET: Record<string, string> = {
  konu_mesaji: "Konu mesajı",
  kullanici: "Kullanıcı",
  sohbet_mesaji: "Sohbet mesajı",
  ozel_mesaj: "Özel mesaj",
};
export const TURLER = Object.keys(TUR_ETIKET);
export const SEBEPLER = ["Spam veya reklam", "Hakaret veya nefret söylemi", "Konu dışı", "Başka bir sebep"];

export type Onizleme = {
  tur: string; id: number;
  yazarId: number; yazar: string; yazarRol: string; rutbe: string | null; banli: boolean;
  icerik: string | null; tarih: Date | null; silindi: boolean;
  link: string;
  konu?: { id: number; title: string };
  alici?: string;
  baglam?: { id: number; gonderen: string; icerik: string; hedef: boolean; silindi: boolean; tarih: Date }[];
};

// Bir şikâyet hedefinin (mesaj, kullanıcı...) gösterim bilgisi. Bulunamazsa null.
export async function hedefOnizleme(tur: string, id: number): Promise<Onizleme | null> {
  const kisi = (t: string) => `${t}.id AS yazar_id, ${t}.username AS yazar, ${rutbeSql(t)} AS rutbe, ${banliSql(t)} AS banli,
            (SELECT roles.name FROM roles WHERE roles.id = ${t}.role_id) AS yazar_rol`;
  let satir: any;
  if (tur === "konu_mesaji") {
    [[satir]] = (await pool.query(
      `SELECT posts.id, posts.content, posts.created_at, posts.deleted_at, ${kisi("u")}, topics.id AS konu_id, topics.title AS konu_baslik
         FROM posts JOIN users u ON u.id = posts.user_id JOIN topics ON topics.id = posts.topic_id WHERE posts.id = ?`, [id])) as any;
    if (!satir) return null;
    return {
      tur, id, yazarId: satir.yazar_id, yazar: satir.yazar, yazarRol: satir.yazar_rol, rutbe: satir.rutbe, banli: !!satir.banli,
      icerik: satir.content, tarih: satir.created_at, silindi: !!satir.deleted_at,
      link: `/konu/${satir.konu_id}#mesaj-${id}`, konu: { id: satir.konu_id, title: satir.konu_baslik },
    };
  }
  if (tur === "sohbet_mesaji") {
    [[satir]] = (await pool.query(
      `SELECT c.id, c.content, c.created_at, c.deleted_at, ${kisi("u")} FROM chat_messages c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [id])) as any;
    if (!satir) return null;
    return {
      tur, id, yazarId: satir.yazar_id, yazar: satir.yazar, yazarRol: satir.yazar_rol, rutbe: satir.rutbe, banli: !!satir.banli,
      icerik: satir.content, tarih: satir.created_at, silindi: !!satir.deleted_at, link: `/sohbet#s-${id}`,
    };
  }
  if (tur === "kullanici") {
    [[satir]] = (await pool.query(`SELECT ${kisi("u")} FROM users u WHERE u.id = ?`, [id])) as any;
    if (!satir) return null;
    return {
      tur, id, yazarId: satir.yazar_id, yazar: satir.yazar, yazarRol: satir.yazar_rol, rutbe: satir.rutbe, banli: !!satir.banli,
      icerik: null, tarih: null, silindi: false, link: `/profil/${satir.yazar}`,
    };
  }
  if (tur === "ozel_mesaj") {
    [[satir]] = (await pool.query(
      `SELECT m.id, m.content, m.created_at, m.deleted_at, m.sender_id, m.receiver_id, alici.username AS alici, ${kisi("u")}
         FROM messages m JOIN users u ON u.id = m.sender_id JOIN users alici ON alici.id = m.receiver_id WHERE m.id = ?`, [id])) as any;
    if (!satir) return null;

    // GİZLİLİK: özel mesajlar iki kişiye aittir. Moderatör bütün konuşmayı değil, yalnızca şikâyet edilen
    // mesajı ve çevresindeki birkaç mesajı (öncesinden 3, sonrasından 2) görür; bağlam anlaşılsın diye.
    // Konuşmayı bu kadarıyla sınırlamak için iki yönlü eşleşme (A->B ya da B->A) ve LIMIT kullanıyoruz.
    const ikili = "((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))";
    const p = [satir.sender_id, satir.receiver_id, satir.receiver_id, satir.sender_id];
    const [oncesi]: any = await pool.query(
      `SELECT m.id, m.content, m.created_at, m.deleted_at, g.username AS gonderen FROM messages m JOIN users g ON g.id = m.sender_id
        WHERE ${ikili} AND m.id < ? ORDER BY m.id DESC LIMIT 3`, [...p, id]);
    const [sonrasi]: any = await pool.query(
      `SELECT m.id, m.content, m.created_at, m.deleted_at, g.username AS gonderen FROM messages m JOIN users g ON g.id = m.sender_id
        WHERE ${ikili} AND m.id > ? ORDER BY m.id ASC LIMIT 2`, [...p, id]);
    const bicim = (m: any, hedef: boolean) => ({
      id: m.id, gonderen: m.gonderen, icerik: m.deleted_at ? "Bu mesaj silindi." : m.content, hedef, silindi: !!m.deleted_at, tarih: m.created_at,
    });
    return {
      tur, id, yazarId: satir.yazar_id, yazar: satir.yazar, yazarRol: satir.yazar_rol, rutbe: satir.rutbe, banli: !!satir.banli,
      icerik: satir.content, tarih: satir.created_at, silindi: !!satir.deleted_at,
      link: "", alici: satir.alici,
      baglam: [...oncesi.reverse().map((m: any) => bicim(m, false)), bicim({ ...satir, gonderen: satir.yazar }, true), ...sonrasi.map((m: any) => bicim(m, false))],
    };
  }
  return null;
}

// Uyarı bildirimi metni (hedef türüne göre)
function uyariBildirimi(o: Onizleme) {
  const alinti = o.icerik ? `“${kisalt(o.icerik, 50)}”` : "";
  if (o.tur === "konu_mesaji") return { metin: `Moderatörler mesajın için seni uyardı: ${alinti}. Lütfen topluluk kurallarına dikkat et.`, link: o.link };
  if (o.tur === "sohbet_mesaji") return { metin: `Moderatörler sohbetteki mesajın için seni uyardı: ${alinti}. Lütfen topluluk kurallarına dikkat et.`, link: "/sohbet" };
  if (o.tur === "ozel_mesaj") return { metin: "Moderatörler gönderdiğin bir özel mesaj için seni uyardı. Lütfen topluluk kurallarına dikkat et.", link: "/mesajlar" };
  return { metin: "Moderatörler hakkındaki şikâyetler nedeniyle seni uyardı. Lütfen topluluk kurallarına dikkat et.", link: "/profil/" + o.yazar };
}

export type SikayetEylemi = "sil" | "uyar" | "banla" | "reddet";

// Bir şikâyet HEDEFİ üzerinde işlem: o hedefe gelen bekleyen bütün şikâyetler birlikte kapanır.
// Dönen değer: { ok, mesaj }. İşlem kaydı da burada yazılır.
export async function sikayetIslemi(
  req: Request, res: Response, yetkili: Yetkili, eylem: SikayetEylemi, tur: string, hedefId: number,
  secenek: { sure?: string; sebep?: string; sikayetId?: number } = {}
): Promise<{ ok: boolean; mesaj: string }> {
  if (!HEDEF_SUTUN[tur]) return { ok: false, mesaj: "Geçersiz hedef türü." };
  const o = await hedefOnizleme(tur, hedefId);
  if (!o) return { ok: false, mesaj: "Şikâyet edilen öğe bulunamadı." };
  // Moderatör, yöneticinin içeriğini ya da kendisini ilgilendiren şikâyetleri işleyemez
  if (yetkili.rol !== "admin" && o.yazarRol === "admin") return { ok: false, mesaj: "Yöneticiler hakkındaki şikâyetleri yalnızca yöneticiler işler." };

  const ayrinti: Record<string, unknown> = { sikayet: secenek.sikayetId ?? null, yazar: o.yazar };

  if (eylem === "sil") {
    if (tur === "kullanici") return { ok: false, mesaj: "Bu bir kullanıcı şikâyeti, silinecek içerik yok." };
    const silinen = tur === "konu_mesaji" ? await mesajiSil(hedefId, yetkili.id)
      : tur === "sohbet_mesaji" ? await sohbetMesajiSil(hedefId, yetkili.id)
      : await ozelMesajiSil(hedefId, yetkili.id);
    // Zaten silinmişse yalnızca şikâyetleri kapat
    if (!silinen) await sikayetleriKapat(tur, hedefId, "islendi", yetkili.id);
    await denetim(req, res, "sikayet.sil", tur, hedefId, { ...ayrinti, zaten_silinmisti: !silinen });
    return { ok: true, mesaj: silinen ? "İçerik silindi, şikâyetler işlendi." : "İçerik zaten silinmişti, şikâyetler kapatıldı." };
  }

  if (eylem === "uyar") {
    const b = uyariBildirimi(o);
    await bildirimGonder({ alan: o.yazarId, yapan: null, tur: "moderasyon", metin: b.metin, link: b.link });
    await sikayetleriKapat(tur, hedefId, "islendi", yetkili.id);
    await denetim(req, res, "sikayet.uyar", tur, hedefId, ayrinti);
    return { ok: true, mesaj: `${o.yazar} uyarıldı, şikâyetler işlendi.` };
  }

  if (eylem === "banla") {
    const sonuc = await banla(yetkili, o.yazarId, secenek.sure ?? "kalici", secenek.sebep || "Şikâyet üzerine moderatör kararı");
    if (sonuc.hata) return { ok: false, mesaj: sonuc.hata };
    await sikayetleriKapat(tur, hedefId, "islendi", yetkili.id);
    await denetim(req, res, "sikayet.ban", tur, hedefId, { ...ayrinti, sure: sonuc.etiket, sebep: secenek.sebep || "Şikâyet üzerine moderatör kararı" });
    return { ok: true, mesaj: `${o.yazar} uzaklaştırıldı (${sonuc.etiket}), şikâyetler işlendi.` };
  }

  // reddet: hedefe gelen bütün bekleyen şikâyetler "reddedildi"
  const n = await sikayetleriKapat(tur, hedefId, "reddedildi", yetkili.id);
  await denetim(req, res, "sikayet.reddet", tur, hedefId, { ...ayrinti, adet: n });
  return { ok: true, mesaj: "Şikâyetler reddedildi." };
}

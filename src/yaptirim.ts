// Sanction (ban/warning) history: read from audit_log. There is no separate "sanctions table"; the audit log already holds
// "who, to whom, when, for what reason" and we wanted it to be the single source of truth.
//
// An audit entry is tied to a person in two ways:
//  - done from the user's page: hedef_tur = 'kullanici', hedef_id = the person
//  - done from a report (sikayet.ban / sikayet.uyar): hedef_id is the reported CONTENT; the person is in ayrinti.kullanici_id
// Yaptırım (ban/uyarı) geçmişi: audit_log'dan okunur. Ayrı bir "yaptırım tablosu" yok; işlem kaydı zaten
// "kim, kime, ne zaman, hangi sebeple" bilgisini tutuyor ve tek gerçek kaynak o olsun istedik.
//
// Bir işlem kaydı iki yoldan bir kişiye bağlanır:
//  - kullanıcı sayfasından yapılanlar: hedef_tur = 'kullanici', hedef_id = kişi
//  - şikâyetten yapılanlar (sikayet.ban / sikayet.uyar): hedef_id şikâyet edilen İÇERİKTİR; kişi ayrinti.kullanici_id'de
import { pool } from "./db.ts";

export const BAN_EYLEMLERI = ["kullanici.ban", "sikayet.ban"];
export const UYARI_EYLEMLERI = ["kullanici.uyar", "sikayet.uyar"];
export const YAPTIRIM_EYLEMLERI = [...BAN_EYLEMLERI, ...UYARI_EYLEMLERI, "kullanici.ban_kaldir"];

// SQL fragment that finds the person a sanction was applied to in an audit_log row (needs two ?: the person's id, the person's id)
// audit_log satırının yaptırım uygulanan kişisini bulan SQL parçası (iki ? ister: kişi id'si, kişi id'si)
export const KISIYE_BAGLI = `((audit_log.hedef_tur = 'kullanici' AND audit_log.hedef_id = ?) OR JSON_EXTRACT(audit_log.ayrinti, '$.kullanici_id') = ?)`;

export async function yaptirimGecmisi(userId: number, yapanId?: number, limit = 30) {
  // if yapanId is given, only that staff member's records (a moderator sees their own actions)
  // yapanId verilirse yalnızca o yetkilinin kayıtları (moderatör kendi işlemlerini görür)
  const [satirlar]: any = await pool.query(
    `SELECT audit_log.id, audit_log.eylem, audit_log.ayrinti, audit_log.created_at, users.username AS aktor
       FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
      WHERE audit_log.eylem IN (?) AND ${KISIYE_BAGLI} ${yapanId ? "AND audit_log.actor_id = ?" : ""}
      ORDER BY audit_log.id DESC LIMIT ?`,
    [YAPTIRIM_EYLEMLERI, userId, userId, ...(yapanId ? [yapanId] : []), limit]
  );
  return satirlar;
}

// A lightweight version for the author's "past sanctions" count in the report panel: (warning count, ban count)
// Şikâyet panelinde yazarın "geçmiş yaptırımı" sayısı için hafif sürüm: (uyarı sayısı, ban sayısı)
export async function yaptirimSayilari(userId: number) {
  const [[s]]: any = await pool.query(
    `SELECT COALESCE(SUM(audit_log.eylem IN (?)), 0) AS uyari, COALESCE(SUM(audit_log.eylem IN (?)), 0) AS ban
       FROM audit_log WHERE audit_log.eylem IN (?) AND ${KISIYE_BAGLI}`,
    [UYARI_EYLEMLERI, BAN_EYLEMLERI, [...UYARI_EYLEMLERI, ...BAN_EYLEMLERI], userId, userId]
  );
  return { uyari: Number(s.uyari), ban: Number(s.ban) };
}

// End date from the ban duration text ("7 gün", "kalıcı"). Null if permanent.
// Ban süresi metninden ("7 gün", "kalıcı") bitiş tarihi. Kalıcıysa null.
export function banBitisi(olusma: Date, sure: unknown): Date | null {
  const m = typeof sure === "string" ? sure.match(/^(\d+) gün$/) : null;
  return m ? new Date(new Date(olusma).getTime() + Number(m[1]) * 86_400_000) : null;
}

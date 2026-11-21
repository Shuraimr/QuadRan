// Audit log (audit_log): every action performed by staff is written here as one row.
// Why? So that "who did what, and when?" can be answered from one place when there is a report or a bug.
// İşlem kaydı (audit_log): yetkililerin yaptığı her işlem buraya bir satır olarak yazılır.
// Neden? "Kim, neyi, ne zaman yaptı?" sorusu bir şikâyet ya da hata olduğunda tek yerden cevaplanabilsin.
import type { Request, Response } from "express";
import { pool } from "./db.ts";

// eylem   : a name grouped with dots, like 'kullanici.ban'
// hedefTur: what the action was performed on ('kullanici', 'konu', 'konu_mesaji', 'kategori'...)
// ayrinti : extra information such as the reason or old/new values (stored as JSON)
// If the record cannot be written we do not break the main action (it was already done); we log the error to the console.
// eylem   : 'kullanici.ban' gibi nokta ile gruplanmış ad
// hedefTur: işlemin üzerinde yapıldığı şey ('kullanici', 'konu', 'konu_mesaji', 'kategori'...)
// ayrinti : sebep, eski/yeni değer gibi ek bilgi (JSON olarak saklanır)
// Kayıt yazılamazsa asıl işlemi bozmayız (işlem zaten yapıldı), hatayı konsola yazarız.
export async function denetim(
  req: Request, res: Response, eylem: string,
  hedefTur: string | null, hedefId: number | null, ayrinti?: Record<string, unknown>
) {
  try {
    await pool.query(
      "INSERT INTO audit_log (actor_id, eylem, hedef_tur, hedef_id, ayrinti, ip) VALUES (?, ?, ?, ?, ?, ?)",
      [res.locals.kullanici?.id ?? null, eylem, hedefTur, hedefId, ayrinti ? JSON.stringify(ayrinti) : null, (req.ip ?? "").slice(0, 45) || null]
    );
  } catch (hata) {
    console.error("[işlem kaydı yazılamadı]", eylem, hata);
  }
}

// To show action names in a readable form in the template
// Şablonda eylem adlarını okunur yazmak için
export const EYLEM_ETIKETLERI: Record<string, string> = {
  "kullanici.rol": "Rol değiştirildi",
  "kullanici.puan": "Puan ayarlandı",
  "kullanici.ban": "Uzaklaştırıldı",
  "kullanici.ban_kaldir": "Uzaklaştırma kaldırıldı",
  "kullanici.rozet_ver": "Rozet verildi",
  "kullanici.rozet_al": "Rozet geri alındı",
  "kullanici.hesap_kapat": "Hesap kapatıldı",
  "kullanici.sifre_sifirla": "Şifre sıfırlandı",
  "icerik.sil": "İçerik silindi",
  "icerik.geri_al": "İçerik geri alındı",
  "icerik.nsfw": "Ekler +18 işaretlendi",
  "icerik.nsfw_kaldir": "+18 işareti kaldırıldı",
  "konu.sabitle": "Konu sabitlendi",
  "konu.sabit_kaldir": "Konu sabiti kaldırıldı",
  "konu.kilitle": "Konu kilitlendi",
  "konu.kilit_ac": "Konu kilidi açıldı",
  "konu.tasi": "Konu taşındı",
  "kategori.ekle": "Kategori eklendi",
  "kategori.duzenle": "Kategori düzenlendi",
  "kategori.sil": "Kategori silindi",
  "kategori.konulari_tasi": "Kategorideki konular taşındı",
  "rutbe.ekle": "Rütbe eklendi",
  "rutbe.duzenle": "Rütbe düzenlendi",
  "rutbe.sil": "Rütbe silindi",
  "rozet.ekle": "Rozet tanımı eklendi",
  "rozet.duzenle": "Rozet tanımı düzenlendi",
  "rozet.sil": "Rozet tanımı silindi",
  "sikayet.sil": "Şikâyet: içerik silindi",
  "sikayet.uyar": "Şikâyet: uyarıldı",
  "sikayet.ban": "Şikâyet: uzaklaştırıldı",
  "sikayet.reddet": "Şikâyet reddedildi",
  "ayar.kaydet": "Site ayarları kaydedildi",
  "ayar.filtre": "Otomatik filtre güncellendi",
  "ayar.puan": "Puan kuralları güncellendi",
  "unvan.ekle": "Unvan eklendi",
  "unvan.duzenle": "Unvan düzenlendi",
  "ayar.duyuru": "Duyuru şeridi güncellendi",
  "ayar.kayit": "Kayıt ayarı değiştirildi",
  "ayar.bakim": "Bakım modu değiştirildi",
  "oda.kapat": "Oda kapatıldı",
  "oda.ac": "Oda yeniden açıldı",
  "ayar.oda": "Oda ayarları güncellendi",
  "bildirim.toplu": "Toplu bildirim gönderildi",
  "kullanici.uyar": "Üye uyarıldı",
  "kullanici.oturum_kapat": "Oturumlar kapatıldı",
  "kullanici.premium_ver": "Premium verildi",
  "kullanici.premium_kaldir": "Premium kaldırıldı",
  "kullanici.yakut": "Yakut verildi / alındı",
  "ayar.yakut": "Yakut kuralları güncellendi",
};

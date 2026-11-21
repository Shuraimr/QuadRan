// Yakut (para birimi) (sql/22): bakiye, hareket defteri, günlük seri ve aylık harçlık ödülleri, unvan satın alma.
//
// KURAL: users.yakut'a giden HER değişiklik yakutEkle'den geçer ve yakut_log'a bir satır yazar (puanEkle/points_log ile aynı
// kalıp). Böylece bir kullanıcının log toplamı her zaman bakiyesine eşit kalır ve "yakutum nereye gitti?" sorusu defterden cevaplanır.
// Puan (rütbe) ile karıştırma: puan harcanmaz, yakut harcanır.
import type { Request } from "express";
import { pool } from "./db.ts";
import { ayarlar } from "./ayarlar.ts";
import { rutbeBul, sonrakiRutbe } from "./rutbe.ts";
import { premiumMu } from "./premium.ts";

// sebep: harclik (rütbe aylık) | seri (günlük giriş) | premium (premium aylık) | yonetim (panelden elle ver/al) | unvan_al
//        | ileride: yardim, bahsis, super_yorum, one_cikar
export type YakutSebebi = "harclik" | "seri" | "premium" | "yonetim" | "unvan_al" | "yardim" | "bahsis" | "super_yorum" | "one_cikar";

export const SEBEP_ETIKETLERI: Record<string, string> = {
  harclik: "Aylık rütbe harçlığı", seri: "Günlük giriş serisi", premium: "Premium aylık yakutu", yonetim: "Yönetici işlemi",
  unvan_al: "Unvan satın alındı", yardim: "Yardım ödülü", bahsis: "Bahşiş", super_yorum: "Süper yorum", one_cikar: "Konu öne çıkarma",
};

// Panelden bir seferde verilebilecek/alınabilecek en büyük miktar (yanlışlıkla fazladan sıfır yazılmasın)
export const YONETIM_ENFAZLA = 100_000;

export type YakutSonucu = { eski: number; yeni: number; yetersiz?: boolean };

// miktar eksiyse (harcama) ve bakiye yetmiyorsa HİÇBİR ŞEY yazılmaz, { yetersiz: true } döner: bakiye asla sıfırın altına inmez
// (puanEkle'nin tersine kırpma YOK: "300 yakutluk unvanı 120 yakutla al" kısmen ödenemez, ya tam ödenir ya hiç).
// baglanti: çağıranın transaction bağlantısı (örn. unvan satın alma, yakut ve unvan satırı AYNI transaction'da yazılır).
// Bağlantı verilirse commit/rollback çağırana aittir; yetersiz dönerse çağıran rollback yapmalıdır.
export async function yakutEkle(
  userId: number, miktar: number, sebep: YakutSebebi, ilgiliId: number | null = null, aciklama: string | null = null,
  baglanti?: { query: Function }
): Promise<YakutSonucu> {
  const kendi = !baglanti;
  const bag: any = baglanti ?? (await pool.getConnection());
  try {
    if (kendi) await bag.beginTransaction();
    // FOR UPDATE: aynı kişinin eşzamanlı iki harcaması aynı bakiyeyi görüp ikisi de geçemesin
    const [[satir]]: any = await bag.query("SELECT yakut FROM users WHERE id = ? FOR UPDATE", [userId]);
    if (!satir) { if (kendi) await bag.rollback(); return { eski: 0, yeni: 0 }; }
    const eski = Number(satir.yakut);
    if (eski + miktar < 0) { if (kendi) await bag.rollback(); return { eski, yeni: eski, yetersiz: true }; }
    const yeni = eski + miktar;
    if (miktar !== 0) {
      await bag.query("UPDATE users SET yakut = ? WHERE id = ?", [yeni, userId]);
      await bag.query("INSERT INTO yakut_log (user_id, miktar, sebep, ilgili_id, aciklama) VALUES (?, ?, ?, ?, ?)",
        [userId, miktar, sebep, ilgiliId, aciklama ? aciklama.slice(0, 200) : null]);
    }
    if (kendi) await bag.commit();
    return { eski, yeni };
  } catch (hata) {
    if (kendi) await bag.rollback();
    throw hata;
  } finally {
    if (kendi) bag.release();
  }
}

// ---------------------------------------------------------------------------
// Ödül penceresi kuyruğu: günlük giriş ya da aylık harçlık verilince oturuma bir kayıt eklenir; bir sonraki çizilen sayfada
// ilki pencere olarak gösterilir ve kuyruktan düşer (oturum.ts › yakutOdulHazirla, views/partials/yakut-odul.ejs).
// Kuyruk neden oturumda: ödül giriş isteğinde değil, kişi sayfayı AÇINCA görünmeli; veritabanında ayrı tablo gereksiz, kayıp olursa
// yakut zaten cüzdanda ve hareketlerde durur (pencere yalnızca bir "tebrik").
// ---------------------------------------------------------------------------
export type YakutOdulu = { tur: "seri" | "harclik" | "premium"; miktar: number; gun?: number; rutbe?: string;
  parcalar?: { tur?: string; etiket: string; miktar: number }[] };

// Günde ilk istekte (oturum.ts › gunlukPuan) çağrılır: seri yakutu + (ay değiştiyse) aylık harçlık.
// "Günde bir kez" garantisini çağıran koşullu UPDATE sağlar; aylık harçlık için kendi koşullu UPDATE'imiz var
// (son_harclik bu aydan eskiyse): iki eşzamanlı istek bile aynı ay için yalnızca bir kez harçlık verir.
// Ay değeri JavaScript yerine veritabanının CURDATE()'inden gelir (gün sınırıyla aynı saat kaynağı).
export async function gunlukYakutVer(req: Request, k: any, seriGun: number, puan: number): Promise<number> {
  const kural = (await ayarlar()).yakut;
  const kuyruk: YakutOdulu[] = [];

  // Günlük giriş: her gün seriGunluk, her 7. ardışık günde seriYedinci
  const seriMiktar = seriGun > 0 && seriGun % 7 === 0 ? kural.seriYedinci : kural.seriGunluk;
  if (seriMiktar > 0) {
    await yakutEkle(k.id, seriMiktar, "seri", null, `${seriGun}. gün`);
    kuyruk.push({ tur: "seri", miktar: seriMiktar, gun: seriGun });
  }

  // Aylık rütbe harçlığı (admin/moderatör dahil: rütbe puandan hesaplanır) + premium üyeye ayrıca premium yakutu
  const [[ay]]: any = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS ay");
  const [guncel]: any = await pool.query(
    "UPDATE users SET son_harclik = ? WHERE id = ? AND (son_harclik IS NULL OR son_harclik < ?)", [ay.ay, k.id, ay.ay]);
  if (guncel.affectedRows) {
    const rutbe = rutbeBul(puan);
    if (rutbe && rutbe.aylik_yakut > 0) {
      await yakutEkle(k.id, rutbe.aylik_yakut, "harclik", rutbe.id, `${rutbe.name} rütbesi, ${ay.ay}`);
      kuyruk.push({ tur: "harclik", miktar: rutbe.aylik_yakut, rutbe: rutbe.name });
    }
    if (premiumMu(k) && kural.premiumAylik > 0) {
      await yakutEkle(k.id, kural.premiumAylik, "premium", null, ay.ay);
      kuyruk.push({ tur: "premium", miktar: kural.premiumAylik });
    }
  }

  // Aynı anda verilen ödüller (ayın ilk gününde seri + harçlık + premium) TEK pencerede toplanır: üç sayfa boyunca arka arkaya
  // pencere kapatmak yorucuydu. Başlık en büyük olay (harçlık > premium > seri), miktar toplam, altında kalem kalem döküm.
  if (kuyruk.length > 1) {
    const ana = kuyruk.find((o) => o.tur === "harclik") ?? kuyruk.find((o) => o.tur === "premium") ?? kuyruk[0];
    const etiket = (o: YakutOdulu) => o.tur === "seri" ? `Günlük seri · ${o.gun}. gün` : o.tur === "harclik" ? `${o.rutbe} harçlığı` : "Premium yakutu";
    const birlesik: YakutOdulu = { ...ana, miktar: kuyruk.reduce((t, o) => t + o.miktar, 0),
      parcalar: kuyruk.map((o) => ({ tur: o.tur, etiket: etiket(o), miktar: o.miktar })) };
    kuyruk.splice(0, kuyruk.length, birlesik);
  }
  if (kuyruk.length) req.session.yakutOdulleri = [...(req.session.yakutOdulleri ?? []), ...kuyruk].slice(-6);
  const [[g]]: any = await pool.query("SELECT yakut FROM users WHERE id = ?", [k.id]);
  return Number(g.yakut);
}

// Pencerede "Usta'da ayda 200 · 64 puan kaldı" kutusu için: kişinin bir sonraki rütbesi (yoksa null)
export function sonrakiHarclik(puan: number) {
  const r = sonrakiRutbe(puan);
  return r ? { ad: r.name, aylik: r.aylik_yakut, kalan: r.min_points - puan } : null;
}

// Ödeme/harcama sonrası bir sonraki sayfada gösterilecek tr-TR biçimli sayı
export const yakutYaz = (n: number) => Number(n).toLocaleString("tr-TR");

// ---------------------------------------------------------------------------
// Unvanlar: satın alma tek transaction'da. Yakut düşümü ve sahiplik satırı birlikte yazılır (seçim ayrı: unvan_id boşsa en pahalı
// unvan otomatik gösterilir, yardimci.ts › unvanSql); bir adım hata verirse hiçbiri yazılmaz, kişi yakutunu kaybedip unvanı alamamış olmaz.
// ---------------------------------------------------------------------------
export type UnvanAlSonucu = { durum: "ok" | "yok" | "zaten" | "yetersiz"; unvan?: { id: number; ad: string; fiyat: number }; eksik?: number };

export async function unvanAl(userId: number, unvanId: number): Promise<UnvanAlSonucu> {
  const bag = await pool.getConnection();
  try {
    await bag.beginTransaction();
    const [[u]]: any = await bag.query("SELECT id, ad, fiyat FROM unvanlar WHERE id = ? AND aktif = 1", [unvanId]);
    if (!u) { await bag.rollback(); return { durum: "yok" }; }
    const unvan = { id: Number(u.id), ad: String(u.ad), fiyat: Number(u.fiyat) };
    // Aynı unvanı iki kez alma: önce kullanıcı satırı kilitlenir (yakutEkle de aynısını kilitler), sonra sahiplik bakılır
    await bag.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    const [[var_]]: any = await bag.query("SELECT 1 AS v FROM kullanici_unvanlari WHERE user_id = ? AND unvan_id = ?", [userId, unvanId]);
    if (var_) { await bag.rollback(); return { durum: "zaten", unvan }; }
    const sonuc = await yakutEkle(userId, -unvan.fiyat, "unvan_al", unvan.id, unvan.ad, bag);
    if (sonuc.yetersiz) { await bag.rollback(); return { durum: "yetersiz", unvan, eksik: unvan.fiyat - sonuc.eski }; }
    await bag.query("INSERT INTO kullanici_unvanlari (user_id, unvan_id) VALUES (?, ?)", [userId, unvan.id]);
    await bag.commit();
    return { durum: "ok", unvan };
  } catch (hata) {
    await bag.rollback();
    throw hata;
  } finally {
    bag.release();
  }
}

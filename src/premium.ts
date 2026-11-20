// Premium üyelik (sql/18): tek kural burada. Gerçek ödeme YOK; admin panelden bitiş tarihi verir (yonetim-kullanici.ts).
//
// premium_bitis NULL ya da geçmişse kişi ücretsizdir. "Süresiz" premium çok ileri bir tarihle (PREMIUM_SURESIZ) tutulur,
// böylece tek karşılaştırma her durumu kapsar. ADMIN (kurucu) premium şartından MUAFTIR (kullanıcı kararı 2026-11-20):
// SQL tarafında yardimci.ts › premiumSql bunu hesaplar ve premium_aktif olarak döner. Moderatör muaf DEĞİL.
export const PREMIUM_SURESIZ = "9999-12-31 23:59:59";

// Kullanıcı nesnesi iki biçimden birinde gelebilir:
//  - SQL'den `premium_aktif` (MySQL NOW() ile hesaplanmış 0/1; saat tek kaynaktan) ya da
//  - ham `premium_bitis` tarihi (JS saatiyle karşılaştırılır).
export function premiumMu(k: { premium_aktif?: unknown; premium_bitis?: unknown } | null | undefined): boolean {
  if (!k) return false;
  if (k.premium_aktif !== undefined && k.premium_aktif !== null) return Number(k.premium_aktif) === 1;
  if (!k.premium_bitis) return false;
  return new Date(k.premium_bitis as string | Date).getTime() > Date.now();
}

// Panelde "Premium ver" seçenekleri: ay sayısı (null = süresiz). Anahtar formdan gelir, listeden doğrulanır.
export const PREMIUM_SURELERI: Record<string, { etiket: string; ay: number | null }> = {
  "1": { etiket: "1 ay", ay: 1 },
  "3": { etiket: "3 ay", ay: 3 },
  "12": { etiket: "12 ay", ay: 12 },
  suresiz: { etiket: "Süresiz", ay: null },
};

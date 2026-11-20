# Bağımsız eleştiri kaydı

Her aşamanın sonunda `elestirmen` alt ajanının verdiği puan. 8.0 altı → revizyon (kullanıcı onayıyla) ve yeniden eleştiri.

| Tarih | Aşama | Puan | Sonuç | Revizyon turu |
|---|---|---|---|---|
| 2026-11-20 | Rütbe sistemi (3.1) | 5.0 (tavan: güvenlik; tavansız 5.5) | REVİZYON GEREKLİ — 2 kritik (panelde saklı XSS, çözüm puanı yarış koşulu), 13 maddelik revizyon | 0 |
| 2026-11-20 | Rütbe sistemi (3.1) — revizyon sonrası | 7.7 | REVİZYON GEREKLİ — önceki 2 kritik kapandı; 2 önemli (yetkili silişinde ve konu silinince puan geri alınmıyor → puan kasma), 6 küçük, görsel ölçüm doğrulanamadı; 9 maddelik revizyon | 1 |
| 2026-11-20 | Rütbe sistemi (3.1) — 2. revizyon sonrası | 7.4 | REVİZYON GEREKLİ — 1 önemli (konu silinince sahibinin kendi cevaplarının puanı kalıyor → puan kasma), 6 küçük; görsel ölçüm eleştirmen tarafından doğrulanamadı (tarayıcı yok); 9 maddelik revizyon | 2 |

## Ölçüm kanıtı — Rütbe sistemi, 3. revizyon (2026-11-20)

Yerleşik tarayıcı, test sunucusu :3096, admin oturumu (shurai), `olcum.js` (taşma + çakışma + çubuk arkası; çubuk arkası 375 ve 1075'te).
Puan geçmişi 110 geçici satırla dolduruldu (ölçümden sonra silindi).

| Sayfa | 375 | 1075 | 1440 |
|---|---|---|---|
| /rutbeler, /profil/shurai, /profil/shurai?sekme=puan, /profil/ahmet, /konu/1, /yonetim/puan/rutbeler, /ayarlar, /siralama | 0 bulgu | 0 bulgu | 0 bulgu |

- 24 sayfa×ölçek, çıktı: `out: []`. Puan sekmesi: her ölçekte 100 satır + "Daha eski" bağlantısı.
- Kendi profilinde sekme listesinde "Puan geçmişi" Konular sekmesindeyken de var (`.siralama` içinde).
- curl senaryoları (:3096): kendi konusuna 2 cevap → puan yok; konu sil → net 0; 5 paralel yetkili silme → 1 `silme`, 1 bildirim, 1 işlem kaydı; üye 8 hızlı cevaptan 6'sı yazıldı ("Çok hızlı yazıyorsun"), moderatör muaf.
- Gözle bakılmadı: açık tema (tema hesap ayarından geliyor, shurai'de koyu), üye oturumuyla kilit kartı, Figma 07 karşılaştırması.
| 2026-11-20 | Rütbe sistemi (3.1) — 3. revizyon sonrası | 7.7 | REVİZYON GEREKLİ — 2 önemli (CLAUDE.md temizlik komutu kullanıcının bugünkü oy satırlarını siliyor; açık tema/üye kilit kartı/Figma 07 doğrulaması yok), 3 küçük (konu açarak puan kasma yalnızca yavaşlıyor, oyda 0 kırpma açığı, profilde Puan geçmişi iki kez); 6 maddelik revizyon | 3 |

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

## Ölçüm kanıtı — Rütbe sistemi, 4. revizyon (2026-11-20)

Yerleşik tarayıcı, test sunucusu :3096 (`ahmet.localhost` ayrı çerez alanı), **üye oturumu (ahmet), açık tema** (`data-tema="acik"`, ölçüm sonrası koyuya döndürüldü).

| Sayfa | 375 | 1075 | 1440 |
|---|---|---|---|
| /rutbeler, /profil/ahmet, /profil/ahmet?sekme=puan, /ayarlar (kilit kartı), /konu/1, /siralama, /oda/yeni (→ /sohbet, kilit kartı), / | 0 bulgu | 0 bulgu | 0 bulgu |

- 24 sayfa×ölçek: taşma, çakışma, çubuk arkası `out: []`; her sayfada tema `acik`. Kilit kartı (`kilit-kart`) /ayarlar ve /sohbet'te çiziliyor; / sayfasında kilit kartı yok (yalnızca kilitli 'Sohbete katıl' bağlantısı) — ilk kayıttaki iddia yanlıştı, ölçüm betiği adında 'kilit' geçen her öğeyi sayıyordu.
- Not: ilk ekran görüntüleri soluk çıktı; sebep `sayfa-giris` animasyonunun bitmemesiydi (animasyon bitince opaklık 1, kontrast normal).
- Oy düzeltmesi (curl): puanı 0 olan yazara eksi → artı → geri al ve artı → eksi → geri al döngülerinde puan 0 → 1 → 0 ve 1 → 0 → 0; `puan_etkisi` −1/0 ve 1/1 doğru.

### Figma 07 karşılaştırması (ekran görüntüsüyle)
| Figma | Kod | Durum |
|---|---|---|
| 18:92 profil rütbe kartı | simge, ad, puan, ilerleme çubuğu, "X rütbesine N puan kaldı · açılacaklar", kilitli liste, "Bütün rütbeler →" | Aynı. Fark: kartın altındaki "Puan geçmişi" kaldırıldı (sekme listesinde var; tekrar yok kuralı). |
| 18:130 tek tip kilit kartı | "Oda açma [Müdavim] rütbesinde açılır · 99 puan kaldı · Nasıl puan kazanılır?" | Aynı. |
| 18:142 rütbe atlama çubuğu | "X oldun! Artık …" + Gör | Kodda aynı metin kalıbı (rutbeKontrol + kutlama çubuğu); bu turda tetiklenip ekranda bakılmadı. |
| 19:2 telefon /rutbeler | başlık, alt metin, 8 rütbe satırı, "sen buradasın", puan | Yapı aynı. Farklar: Figma'da üstte "← Profil" geri bağlantısı var, kodda yok; ayrıcalık metinleri panel ayarlarından geliyor (Efsane/Duayen'de Figma "Özel profil çerçevesi / isim rengi" diyor, kodda "Yeni ayrıcalık yok" — bu ayrıcalıklar premium/profil aşamasında). |
| 19:95 panel rütbe×ayrıcalık tablosu | sütunlar Rütbe · Eşik · Oda aç · Bağlantı · Görsel · Video · İmza · Günlük oy; 8 rütbenin işaretleri ve eşikleri; boş günlük oy = "sınırsız"; Rütbe ekle + Kaydet; "yetkililer muaftır" notu | İşaret matrisi Figma'yla birebir aynı (curl ile çıkarıldı). Fazlası: "Kullanıcı" sayısı sütunu ve satır başına "Sil" (rütbe silme). |
| 2026-11-20 | Rütbe sistemi (3.1) — 4. revizyon sonrası | 7.0 (tavan: kanıt çelişkisi — '/' sayfasında kilit kartı iddiası yanlış; tavansız 7.4) | REVİZYON GEREKLİ — 3 önemli (görsel/video yükleme yokken vaat ediliyor; Efsane/Duayen 'Yeni ayrıcalık yok' Figma ve kararla farklı, kullanıcıya sorulmadı; kanıt çelişkisi), 5 küçük (eşzamanlı oyda deadlock → 500, oy bildirimi seli, ölü kod/eski yorum, '← Profil' yok, sql/16 varsayımı); 7 maddelik revizyon | 4 |
| 2026-11-21 | Masaüstü sol menü ve Ayarlar düzeni (masaüstü + tablet) | 6.6 | 9 maddelik revizyon listesi, kullanıcı onayı bekleniyor |
| 2026-11-21 | Yakut (3.6): /yakut mağaza + cüzdan, seri/harçlık, ödül penceresi, unvanlar | 6.9 | REVİZYON GEREKLİ — 3 önemli (hareketler sayfalamasında çakışma, PRE + mor efekt / en yüksek unvan yok ve kayıtsız, "Gezgin'da" ek hatası), 8 küçük; 10 maddelik revizyon; kullanıcı onayladı, uygulandı (+ unvan kararı "şimdi yap": PRE, en değerli unvan, panel; ödüller tek pencerede) | 1 |
| 2026-11-21 | Telefon arayüzü genel denetimi + Yakut revizyonu (opus eleştirmen) | 5.4 | REVİZYON GEREKLİ — 4 önemli (mobil animasyon ve üst çubuk hiç ele alınmamış, telefonda 44px kuralı yaygın bozuk, üye kartı sayfası avatar süsünü kırpıyor, 320px'te üst çubuk taşıyor), 5 küçük; 9 maddelik revizyon (önce Figma "Telefon" sayfası), kullanıcı onayı bekleniyor | 0 |

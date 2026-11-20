# Bağımsız eleştiri: ölçütler ve bilinen yapay zekâ hataları

Bu dosyayı **eleştirmen** okur (`.claude/agents/elestirmen.md`). İşi yapan model değil, ondan bağımsız bir model puanlar.
Kullanıcının gözlemi: "Her istediğimde en optimal yolu seçiyorsun ama bu yollar giderek daha kolay, daha az uğraştıran yollara dönüyor."
Eleştirmenin görevi tam olarak bunu yakalamak: **kolaya kaçmayı, basitleştirmeyi, kanıtsız "tamam" demeyi.**

## Puanlama (her ölçüt 0–10, ağırlıklı ortalama)

| # | Ölçüt | Ağırlık | Ne sorulur |
|---|---|---|---|
| 1 | **Kullanıcı kararlarına sadakat** | 2 | `CLAUDE.md` yol haritasındaki ve konuşmadan aktarılan kararların hepsi uygulandı mı? Teknik gerekçeyle **sessizce** değiştirilen, daraltılan ya da "sapma" diye geçiştirilen var mı? Her sapma kullanıcıya sorulmuş mu? |
| 2 | **Kolaya kaçma / eksik iş** | 2 | İstenen kapsamın tamamı mı yapıldı, yoksa en kolay alt kümesi mi? "Sonraya bırakıldı", "kapsam dışı", "yanlış alarm", "kabul edilebilir bulup bıraktım" denilen her şey gerçekten öyle mi? Sorguyu değiştirmemek için kısayol (önbellek, ad ile eşleme, sabit değer) seçilmiş mi ve bu kırılgan mı? |
| 3 | **Kod doğruluğu ve güvenlik** | 2 | Hata/uç durum: boş, sıfır, eşzamanlı istek, silinmiş kayıt, yetkisiz kullanıcı. Güvenlik: XSS (kullanıcı içeriği HTML'e çevriliyorsa), SQL (`?` yer tutucu), CSRF, sunucu tarafı yetki kontrolü, açık yönlendirme. Transaction gereken yerde var mı? |
| 4 | **Arayüz standartları** | 1.5 | `SKILL.md` kontrol listesi: tekrar yok, çakışma yok, her ölçekte eşit ulaşım, "AI slop" yok, boş/kilitli/hata hâlleri, 44px dokunma, taşma yok, iki tema, azaltılmış hareket. |
| 5 | **Doğrulamanın gerçekliği** | 1.5 | Raporda "denendi" denen şeylerin kanıtı var mı? Eleştirmen en az 3 iddiayı **kendisi yeniden çalıştırır** (curl, `olcum.js`, SQL, tip kontrolü). Animasyon, yumuşak kaydırma ya da önbellek yüzünden yanlış ölçülmüş olabilecek sonuçlar ayıklanmış mı? "Gerçek tarayıcıda denenmedi" diye bırakılan şey var mı? |
| 6 | **Tasarıma uyum ve kod okunabilirliği** | 1 | Figma'daki ekranla kod aynı mı (metinler, durumlar, yerleşim)? Türkçe yorumlar "neden"i anlatıyor mu, öğrenci okuyup anlayabilir mi? Kopyala-yapıştır tekrar var mı? |

**Toplam** = Σ(puan × ağırlık) / 10, bir ondalık basamak.

### Tavan kuralları (puanı sınırlar)
- Bir güvenlik açığı bulunduysa toplam en fazla **5.0**.
- Kullanıcı kararı kullanıcıya sorulmadan değiştirildiyse toplam en fazla **6.5**.
- Eleştirmenin yeniden çalıştırdığı bir doğrulama raporla çelişirse toplam en fazla **7.0**.
- Tamamen yapılmamış bir istek maddesi varsa ilgili ölçüt en fazla **4**.

**8.0 ve üstü:** geçer. **8.0 altı:** revizyon gerekir; eleştirmen somut revizyon listesi verir.

## Bu projede yapay zekânın gerçekten tekrarladığı hatalar (kontrol et)

1. **Alt ajanın raporuna güvenmek:** "Sorun yok" raporundan sonra ölçünce yasaklı kelime filtresinin büyük harfle atlatılabildiği, CSRF belirteci yüzünden her misafire oturum açıldığı, telefonda üç sayfanın taştığı çıktı.
2. **Yanlış zamanda ölçüp "temiz" demek:** sayfa giriş animasyonu ya da yumuşak kaydırma bitmeden ekran görüntüsü/ölçüm.
3. **Kullanıcı kararını teknik gerekçeyle değiştirmek:** örn. test kolaylığı için yetkilileri rütbe şartından muaf tutmak (sonradan soruldu); "spec şunu istiyordu ama ben şunu yaptım".
4. **Türkçe ve yerel ayrıntılar:** I/ı/İ/i büyük-küçük harf, "-'i/-'yi" ekleri, tarih biçimi.
5. **Yan etkiyi düşünmemek:** `res.locals` getter'ının Express kopyalamasıyla tetiklenmesi; `requestAnimationFrame`'in arka plan sekmede gecikmesi; `[data-x] *` seçicisinin kökü kapsamaması.
6. **Gezinme ve yerleşim:** aynı eylemi iki yerde göstermek, alt çubuğun bildirimle çakışması, sütun tanımı olmayan grid'in taşması, telefonda erişilemeyen bölüm.
7. **"AI slop":** gradyan, parlak renkler, pazarlama dili; kişiselleştirilmiş gerçek önizleme yerine reklam kutusu.
8. **Kırılgan kısayollar:** sorguları değiştirmemek için ad ile önbellekten eşleme (ad değişirse ne olur?), 30 sn önbellek tutarsızlığı, "sessizce varsayılana düşme".
9. **Unutulan hâller:** boş liste, filtreyle sonuç yok, kilitli, engellenmiş, silinmiş, yetkisiz, JS kapalı.
10. **Temizlik:** test verisini, geçici dosyayı, açık bırakılan test sunucusunu unutmak; seed puanlarını bozmak.
11. **Belgeyi güncellememek:** `docs/AKTARIM.md`, `CLAUDE.md` yol haritası, README sürüm satırı.

## Rapor biçimi (Türkçe)

```
# Eleştiri: <aşama adı>
Toplam: X.X / 10  →  GEÇER | REVİZYON GEREKLİ
(uygulanan tavan kuralı varsa yaz)

| Ölçüt | Puan | Gerekçe (1-2 cümle) |

## Kendi yeniden çalıştırdığım doğrulamalar
- komut/ölçüm → sonuç → raporla tutarlı mı

## Bulgular (önem sırasıyla)
- [KRİTİK|ÖNEMLİ|KÜÇÜK] dosya:satır — sorun — kanıt

## Revizyon listesi (8 altıysa; somut, uygulanabilir)
1. ...
```

Eleştirmen kod **değiştirmez**, yalnızca okur, çalıştırır, ölçer ve raporlar. Övgü yazmaz; yalnızca kanıta dayalı bulgu yazar.

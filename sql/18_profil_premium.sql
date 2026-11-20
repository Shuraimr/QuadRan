-- Profil görünümü ve premium (Figma "10 · Premium" ve "11 · Premium: profil efektleri ve renk").
-- Bir kez çalıştırılır (ALTER TABLE tekrar çalışmaz).
--
-- premium_bitis    : NULL ya da geçmiş tarih = ücretsiz. "Süresiz" premium, çok ileri bir tarihle (9999-12-31) tutulur;
--                    böylece tek karşılaştırma (premium_bitis > NOW()) her durumu kapsar. Ödeme yok, panelden elle verilir.
-- profil_efekti    : kart/profil üstünde oynayan kaplama animasyonu (cadilar, melek, seytan, kar, sakura, atesbocegi); NULL = yok.
-- avatar_susu      : avatarın çevresindeki süs (cadi_sapkasi, hale_kanat, boynuz_kuyruk, bere, kiraz, fener); NULL = yok.
-- profil_renk_ana / profil_renk_vurgu : kişinin seçtiği serbest renkler (#rrggbb); NULL = sitenin kendi renkleri.
-- profil_renk_gecis : 0 = banner düz ana renk (varsayılan), 1 = banner'da ana→vurgu yumuşak geçiş (kişi isterse; başka hiçbir yerde gradyan yok).
-- avatar_hareketli / banner_hareketli : yüklenen dosya hareketli WebP mi (yalnızca premium üyenin GIF'i hareketli kalır).
-- avatar_url ve banner_url sql/01'den beri vardı; artık yükleme altyapısı (src/yukleme.ts) dolduruyor.
ALTER TABLE users
  ADD COLUMN premium_bitis DATETIME NULL,
  ADD COLUMN profil_efekti VARCHAR(20) NULL,
  ADD COLUMN avatar_susu VARCHAR(20) NULL,
  ADD COLUMN profil_renk_ana CHAR(7) NULL,
  ADD COLUMN profil_renk_vurgu CHAR(7) NULL,
  ADD COLUMN profil_renk_gecis TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN avatar_hareketli TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN banner_hareketli TINYINT(1) NOT NULL DEFAULT 0;

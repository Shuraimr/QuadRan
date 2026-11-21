-- Which strip of the banner is shown on wide screens (tablet/desktop).
-- The banner is stored in the phone ratio (2.2:1); tablet shows 3:1, desktop 3.7:1 and crops from top/bottom.
-- In the "Crop and position" dialog the person picks Top / Middle / Bottom; when displayed it is converted to object-position.
-- Run once (ALTER TABLE does not run twice).
-- Banner'ın geniş ekranda (tablet/masaüstü) hangi şeridinin görüneceği.
-- Banner telefon oranında (2,2:1) saklanır; tablet 3:1, masaüstü 3,7:1 gösterir ve üst/alttan kırpar.
-- Kişi "Kırp ve konumla" penceresinde Üst / Orta / Alt seçer; gösterimde object-position'a çevrilir.
-- Bir kez çalıştırılır (ALTER TABLE tekrar çalışmaz).
ALTER TABLE users ADD COLUMN banner_konum ENUM('ust','orta','alt') NOT NULL DEFAULT 'orta';

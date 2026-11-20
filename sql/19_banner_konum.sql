-- Banner'ın geniş ekranda (tablet/masaüstü) hangi şeridinin görüneceği.
-- Banner telefon oranında (2,2:1) saklanır; tablet 3:1, masaüstü 3,7:1 gösterir ve üst/alttan kırpar.
-- Kişi "Kırp ve konumla" penceresinde Üst / Orta / Alt seçer; gösterimde object-position'a çevrilir.
-- Bir kez çalıştırılır (ALTER TABLE tekrar çalışmaz).
ALTER TABLE users ADD COLUMN banner_konum ENUM('ust','orta','alt') NOT NULL DEFAULT 'orta';

SET NAMES utf8mb4;
-- Puan geri alma düzeltmeleri (sql/15). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/15_puan_geri_alma.sql

-- points_log.sebep'e iki yeni değer (eski değerler aynen korunur):
--   rozet_geri  : rozet geri alınınca (yönetici "rozet al") geri alınan rozet puanı. 'rozet' ile ayrı tutulur ki
--                 "bu rozet için hâlâ açık puan ne kadar?" hesabı (SUM(rozet) + SUM(rozet_geri)) karışmasın.
--   geri_yukleme: yetkili silinen mesajı geri getirince yazara geri verilen puan. 'silme' ile eşleşir: bir mesajın
--                 "geri alınmış ama geri verilmemiş" miktarı SUM(silme) + SUM(geri_yukleme) ile bulunur; böylece
--                 sil → geri al → sil döngüsünde puan ne çoğalır ne iki kez düşer.
ALTER TABLE points_log
    MODIFY COLUMN sebep ENUM('konu','cevap','oy','gunluk','seri','cozum','rozet','duzeltme','silme','baslangic','cozum_geri','davet','rozet_geri','geri_yukleme') NOT NULL;

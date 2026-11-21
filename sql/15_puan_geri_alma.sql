SET NAMES utf8mb4;
-- Point-reversal fixes (sql/15). Apply once to a running database:
-- Puan geri alma düzeltmeleri (sql/15). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/15_puan_geri_alma.sql

-- Two new values for points_log.sebep (existing values are kept as they are):
--   rozet_geri  : the badge points taken back when a badge is revoked (admin "revoke badge"). Kept separate from 'rozet' so that
--                 the "how many points are still open for this badge?" calculation (SUM(rozet) + SUM(rozet_geri)) does not get mixed up.
--   geri_yukleme: the points returned to the author when a moderator restores a deleted message. It pairs with 'silme': the amount of a message
--                 that is "taken back but not yet returned" is found with SUM(silme) + SUM(geri_yukleme); so in a
--                 delete → restore → delete cycle the points are neither duplicated nor deducted twice.
-- points_log.sebep'e iki yeni değer (eski değerler aynen korunur):
--   rozet_geri  : rozet geri alınınca (yönetici "rozet al") geri alınan rozet puanı. 'rozet' ile ayrı tutulur ki
--                 "bu rozet için hâlâ açık puan ne kadar?" hesabı (SUM(rozet) + SUM(rozet_geri)) karışmasın.
--   geri_yukleme: yetkili silinen mesajı geri getirince yazara geri verilen puan. 'silme' ile eşleşir: bir mesajın
--                 "geri alınmış ama geri verilmemiş" miktarı SUM(silme) + SUM(geri_yukleme) ile bulunur; böylece
--                 sil → geri al → sil döngüsünde puan ne çoğalır ne iki kez düşer.
ALTER TABLE points_log
    MODIFY COLUMN sebep ENUM('konu','cevap','oy','gunluk','seri','cozum','rozet','duzeltme','silme','baslangic','cozum_geri','davet','rozet_geri','geri_yukleme') NOT NULL;

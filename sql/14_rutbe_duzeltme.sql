SET NAMES utf8mb4;
-- Rütbe sistemi düzeltmeleri (sql/14). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/14_rutbe_duzeltme.sql

-- 1) points_log.sebep'e üç yeni değer (eski değerler aynen korunur):
--    baslangic : puan geçmişi tutulmadan önceki toplam ("Önceki puanların"). Eskiden bu satırlar 'duzeltme' idi ve
--                şablon tarihin yılına bakıyordu (kırılgan); artık sebep açıkça ayrı.
--    cozum_geri: çözüm işareti kalkınca/çözüm cevabı silinince geri alınan çözüm puanı. 'silme' mesaj silince verilen
--                puanı geri almak için de kullanıldığından, "bu cevap için hâlâ açık çözüm puanı ne kadar?" hesabı
--                (SUM(cozum) + SUM(cozum_geri)) ayrı bir sebep olmadan karışırdı.
--    davet     : KULLANILMIYOR. Davet puanı referans aşamasında (CLAUDE.md yol haritası 3.4) bağlanacak
--                (src/yardimci.ts puanEkle(..., "davet", ...)); şimdiden hazır ki o aşama yeni ALTER gerektirmesin.
ALTER TABLE points_log
    MODIFY COLUMN sebep ENUM('konu','cevap','oy','gunluk','seri','cozum','rozet','duzeltme','silme','baslangic','cozum_geri','davet') NOT NULL;

-- 2) sql/13'ün yazdığı geçmiş satırlar baslangic olur. Tarihi 2000-01-01 olarak BIRAKIYORUZ (kullanıcının kayıt tarihi
--    yapmayız): bu puanların gerçek tarihi bilinmiyor; kayıt tarihi verirsek "bu hafta/bu ay" sıralamasında yeni
--    kayıtlıların bütün eski puanı bu haftaya yazılmış görünür. Yöneticinin elle yazdığı 'duzeltme' satırlarına
--    dokunulmaz (yalnızca 13'ün yazdığı, tam 2000-01-01 tarihli olanlar).
UPDATE points_log SET sebep = 'baslangic' WHERE sebep = 'duzeltme' AND created_at = '2000-01-01 00:00:00';

-- 3) Davet puanı ayarı (şimdilik kullanılmıyor; panelde gösterilmez). INSERT IGNORE: değeri ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES ('puan_davet', '5');

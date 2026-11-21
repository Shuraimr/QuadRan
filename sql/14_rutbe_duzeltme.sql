SET NAMES utf8mb4;
-- Rank system fixes (sql/14). Apply once to a running database:
-- Rütbe sistemi düzeltmeleri (sql/14). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/14_rutbe_duzeltme.sql

-- 1) Three new values for points_log.sebep (existing values are kept as they are):
--    baslangic : the total from before point history was kept ("Your earlier points"). These rows used to be 'duzeltme' and
--                the template looked at the year of the date (fragile); now the reason is explicitly separate.
--    cozum_geri: the solution points taken back when the solved mark is removed / the solution answer is deleted. Since 'silme' is also used
--                to take back points given when a message is deleted, the "how many solution points are still open for this answer?" calculation
--                (SUM(cozum) + SUM(cozum_geri)) would get mixed up without a separate reason.
--    davet     : UNUSED. The invite points will be wired in at the referral stage (CLAUDE.md roadmap 3.4)
--                (src/yardimci.ts puanEkle(..., "davet", ...)); it is prepared now so that stage needs no new ALTER.
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

-- 2) The history rows written by sql/13 become baslangic. We LEAVE the date as 2000-01-01 (we do not turn it into the user's signup date):
--    the real date of these points is unknown; if we gave them the signup date, a newly registered user's entire old score would
--    look as if it was earned this week in the "this week/this month" ranking. The 'duzeltme' rows an admin wrote by hand
--    are not touched (only those written by 13, dated exactly 2000-01-01).
-- 2) sql/13'ün yazdığı geçmiş satırlar baslangic olur. Tarihi 2000-01-01 olarak BIRAKIYORUZ (kullanıcının kayıt tarihi
--    yapmayız): bu puanların gerçek tarihi bilinmiyor; kayıt tarihi verirsek "bu hafta/bu ay" sıralamasında yeni
--    kayıtlıların bütün eski puanı bu haftaya yazılmış görünür. Yöneticinin elle yazdığı 'duzeltme' satırlarına
--    dokunulmaz (yalnızca 13'ün yazdığı, tam 2000-01-01 tarihli olanlar).
UPDATE points_log SET sebep = 'baslangic' WHERE sebep = 'duzeltme' AND created_at = '2000-01-01 00:00:00';

-- 3) Invite points setting (unused for now; not shown in the panel). INSERT IGNORE: does not overwrite the value.
-- 3) Davet puanı ayarı (şimdilik kullanılmıyor; panelde gösterilmez). INSERT IGNORE: değeri ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES ('puan_davet', '5');

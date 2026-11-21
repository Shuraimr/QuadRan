SET NAMES utf8mb4;
-- Admin panel rework (sql/10): points rules setting + bulk announcement notification.
-- To apply by hand to a running database (running it again is harmless); see the command below.
-- Yönetim paneli yeniden düzeni (sql/10): puan kuralları ayarı + toplu duyuru bildirimi.
-- Çalışan veritabanına elle uygulamak için (tekrar çalıştırmak zararsızdır):
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/10_panel.sql

-- 1) The 'duyuru' (announcement) type is added to notifications: a bulk notification an admin sends to everyone or to one role.
--    MODIFY rewrites the full ENUM list; existing values stay as they are, running it again changes nothing.
-- 1) Bildirim türüne 'duyuru' eklenir: yöneticinin herkese/bir role gönderdiği toplu bildirim.
--    MODIFY, ENUM'un tam listesini yeniden yazar; eski değerler aynen kalır, tekrar çalıştırınca bir şey değişmez.
ALTER TABLE notifications
    MODIFY COLUMN tur ENUM('cevap','oy','rozet','mesaj','moderasyon','duyuru') NOT NULL;

-- 2) Points rules (site_settings): the values 5 / 2 / 1 that used to be hard-coded are now read from here.
--    INSERT IGNORE: running it again does not overwrite a value the admin has changed.
-- 2) Puan kuralları (site_settings): kodda sabit olan 5 / 2 / 1 değerleri artık buradan okunur.
--    INSERT IGNORE: yönetici değeri değiştirdiyse tekrar çalıştırmak onu ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES
    ('puan_konu', '5'),
    ('puan_cevap', '2'),
    ('puan_oy', '1');

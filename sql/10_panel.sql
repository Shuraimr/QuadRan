SET NAMES utf8mb4;
-- Yönetim paneli yeniden düzeni (sql/10): puan kuralları ayarı + toplu duyuru bildirimi.
-- Çalışan veritabanına elle uygulamak için (tekrar çalıştırmak zararsızdır):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/10_panel.sql

-- 1) Bildirim türüne 'duyuru' eklenir: yöneticinin herkese/bir role gönderdiği toplu bildirim.
--    MODIFY, ENUM'un tam listesini yeniden yazar; eski değerler aynen kalır, tekrar çalıştırınca bir şey değişmez.
ALTER TABLE notifications
    MODIFY COLUMN tur ENUM('cevap','oy','rozet','mesaj','moderasyon','duyuru') NOT NULL;

-- 2) Puan kuralları (site_settings): kodda sabit olan 5 / 2 / 1 değerleri artık buradan okunur.
--    INSERT IGNORE: yönetici değeri değiştirdiyse tekrar çalıştırmak onu ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES
    ('puan_konu', '5'),
    ('puan_cevap', '2'),
    ('puan_oy', '1');

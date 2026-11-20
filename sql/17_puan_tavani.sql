SET NAMES utf8mb4;
-- Günlük konu/cevap puanı tavanı (sql/17). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/17_puan_tavani.sql
--
-- Neden: konu açıp/cevap yığıp puan kasmayı sınırlar. Bir kişi günde konu açma + cevap yazmadan en çok bu kadar puan
-- kazanır; aşan içerik yine yayınlanır ama puan getirmez. 0 = sınırsız. Panelden (Puan ve ödüller) değiştirilir.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES ('puan_gunluk_tavan', '40');

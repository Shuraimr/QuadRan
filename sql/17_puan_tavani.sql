SET NAMES utf8mb4;
-- Daily cap on topic/reply points (sql/17). Apply once to a running database:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/17_puan_tavani.sql
--
-- Why: limits farming points by opening topics / piling up replies. A person earns at most this many points per day
-- from opening topics + writing replies; content beyond the cap is still published but earns no points. 0 = unlimited.
-- Changed from the admin panel (Points and rewards).
--
-- Günlük konu/cevap puanı tavanı (sql/17). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/17_puan_tavani.sql
--
-- Neden: konu açıp/cevap yığıp puan kasmayı sınırlar. Bir kişi günde konu açma + cevap yazmadan en çok bu kadar puan
-- kazanır; aşan içerik yine yayınlanır ama puan getirmez. 0 = sınırsız. Panelden (Puan ve ödüller) değiştirilir.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES ('puan_gunluk_tavan', '40');

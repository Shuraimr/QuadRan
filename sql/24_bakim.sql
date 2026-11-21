SET NAMES utf8mb4;
-- Maintenance mode (sql/24). Applied once to the running database (running it again is harmless):
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/24_bakim.sql
--
-- bakim_modu: while '1', admins and moderators use the site normally (a warning strip at the top), everyone else and guests see the 503 maintenance page.
-- bakim_metni: written next to the sentence "Site güncelleniyor." on the maintenance page (e.g. "Estimated end: 14:30").
-- Changed from the panel (Kayıt ve erişim).
-- Bakım modu (sql/24). Çalışan veritabanına bir kez uygulanır (tekrar çalıştırmak zararsız):
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/24_bakim.sql
--
-- bakim_modu: '1' iken admin ve moderatör siteyi normal kullanır (üstte uyarı şeridi), diğerleri ve misafirler 503 bakım sayfası görür.
-- bakim_metni: bakım sayfasında "Site güncelleniyor." cümlesinin yanına yazılır (örn. "Tahmini bitiş: 14:30").
-- Panelden (Kayıt ve erişim) değiştirilir.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES ('bakim_modu', '0'), ('bakim_metni', '');

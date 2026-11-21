SET NAMES utf8mb4;
-- Bakım modu (sql/24). Çalışan veritabanına bir kez uygulanır (tekrar çalıştırmak zararsız):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/24_bakim.sql
--
-- bakim_modu: '1' iken admin ve moderatör siteyi normal kullanır (üstte uyarı şeridi), diğerleri ve misafirler 503 bakım sayfası görür.
-- bakim_metni: bakım sayfasında "Site güncelleniyor." cümlesinin yanına yazılır (örn. "Tahmini bitiş: 14:30").
-- Panelden (Kayıt ve erişim) değiştirilir.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES ('bakim_modu', '0'), ('bakim_metni', '');

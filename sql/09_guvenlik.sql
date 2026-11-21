SET NAMES utf8mb4;
-- Security: log out sessions on other devices when the password changes.
-- To apply by hand to a running database:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/09_guvenlik.sql
--
-- Güvenlik: şifre değişince diğer cihazlardaki oturumları düşürmek.
-- Çalışan veritabanına elle uygulamak için:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/09_guvenlik.sql

-- Session version: written to the session at login. When the password changes this number goes up by 1;
-- if the number in the session differs from the one in the database, that session is invalid (src/oturum.ts).
-- Why not delete the rows of the sessions table? It has no user id column, the data sits in a single text field;
-- finding which row belongs to whom would mean opening and reading all of them. Comparing a number is both simple and fast.
--
-- Oturum sürümü: girişte oturuma yazılır. Şifre değişince bu sayı 1 artar;
-- oturumdaki sayı veritabanındakinden farklıysa o oturum geçersizdir (src/oturum.ts).
-- Neden sessions tablosunu silmiyoruz? O tabloda user id sütunu yok, veri tek bir metin alanında;
-- hangi satırın kime ait olduğunu bulmak için hepsini açıp okumak gerekirdi. Sayı karşılaştırmak hem basit hem hızlı.
ALTER TABLE users ADD COLUMN oturum_surumu INT UNSIGNED NOT NULL DEFAULT 0;

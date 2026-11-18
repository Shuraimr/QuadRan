SET NAMES utf8mb4;
-- Güvenlik: şifre değişince diğer cihazlardaki oturumları düşürmek.
-- Çalışan veritabanına elle uygulamak için:
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/09_guvenlik.sql

-- Oturum sürümü: girişte oturuma yazılır. Şifre değişince bu sayı 1 artar;
-- oturumdaki sayı veritabanındakinden farklıysa o oturum geçersizdir (src/oturum.ts).
-- Neden sessions tablosunu silmiyoruz? O tabloda user id sütunu yok, veri tek bir metin alanında;
-- hangi satırın kime ait olduğunu bulmak için hepsini açıp okumak gerekirdi. Sayı karşılaştırmak hem basit hem hızlı.
ALTER TABLE users ADD COLUMN oturum_surumu INT UNSIGNED NOT NULL DEFAULT 0;

-- Follow system: who follows whom + the "takip" (follow) notification type.
-- Docker runs these in order on first setup; for a live DB, by hand:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/20_takip.sql
-- Takip sistemi: kim kimi takip ediyor + "takip" bildirim türü.
-- Docker ilk kurulumda sıralı çalıştırır; canlı DB'ye elle:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/20_takip.sql

-- Composite key (follower_id, followed_id): the same person cannot follow the same person twice, and the
-- "who am I following" query is fast with this key. A separate index on followed_id serves "who follows me".
-- If a user is deleted (ON DELETE CASCADE) their follow records go too; the CHECK blocks self-following at the database level.
-- Bileşik anahtar (follower_id, followed_id): aynı kişi aynı kişiyi iki kez takip edemez ve
-- "ben kimleri takip ediyorum" sorgusu bu anahtarla hızlıdır. "Beni kimler takip ediyor" için followed_id'ye ayrı dizin.
-- Kullanıcı silinirse (ON DELETE CASCADE) takip kayıtları da gider; CHECK kendini takibi veritabanı düzeyinde engeller.
CREATE TABLE IF NOT EXISTS user_follows (
    follower_id INT UNSIGNED NOT NULL,
    followed_id INT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followed_id),
    KEY (followed_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT user_follows_kendini_takip CHECK (follower_id <> followed_id)
);

-- Notification type 'takip'. MODIFY keeps the old values as they are (same order as in sql/13).
-- Bildirim türü 'takip'. MODIFY eski değerleri aynen korur (sql/13'teki sıra).
ALTER TABLE notifications
    MODIFY COLUMN tur ENUM('cevap','oy','rozet','mesaj','moderasyon','duyuru','oda','rutbe','takip') NOT NULL;

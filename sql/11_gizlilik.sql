SET NAMES utf8mb4;
-- Profil seçenekleri ve gizlilik (sql/11).
-- Çalışan veritabanına bir kez uygulanır (ALTER TABLE tekrar çalışmaz):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/11_gizlilik.sql

-- 1) Profil alanları ve gizlilik tercihleri.
--    dm_izni: kimler özel mesaj atabilir. cevrimici_goster: kapalıysa "çevrimiçi" listesinde ve mesajlarda görünmez.
ALTER TABLE users
    ADD COLUMN konum VARCHAR(60) NULL AFTER bio,
    ADD COLUMN web_sitesi VARCHAR(200) NULL AFTER konum,
    ADD COLUMN dm_izni ENUM('herkes','kimse') NOT NULL DEFAULT 'herkes',
    ADD COLUMN cevrimici_goster BOOLEAN NOT NULL DEFAULT TRUE;

-- 2) Engelleme: blocker_id, blocked_id'yi engelledi. İki taraf da birbirine yazamaz (kod tarafında kontrol edilir).
--    Kendini engellemek CHECK ile reddedilir; kullanıcı silinirse satırlar CASCADE ile gider.
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id INT UNSIGNED NOT NULL,
    blocked_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    INDEX (blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT user_blocks_kendini_engelleme CHECK (blocker_id <> blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 3) reports.sebep zaten VARCHAR(64): yeni sebep adlarının en uzunu ("Kişisel bilgi paylaşımı") sığar, genişletmek gerekmedi.
--    Eski sebep metinleri ("Hakaret veya nefret söylemi") satırlarda aynen kalır.

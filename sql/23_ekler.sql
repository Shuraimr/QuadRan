SET NAMES utf8mb4;
-- Yorum ekleri ve +18 (sql/23): yorumlara fotoğraf/video eki, bağlantı kartı kapatma, kişinin +18 görünüm tercihi.
-- Çalışan veritabanına bir kez uygulanır (ALTER TABLE tekrar çalışmaz):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/23_ekler.sql

-- 1) Ekler: bir yoruma en çok 6 fotoğraf YA DA 1 video (sınır sunucuda denetlenir, tabloda değil).
--    adres: /yuklemeler/<uuid>.webp (resim) ya da .mp4/.webm (video). nsfw_kim: +18'i kim işaretledi (yazar mı yetkili mi);
--    yetkili işaretini yazar kaldıramaz, yetkili kaldırırsa yazarın işareti de gider.
CREATE TABLE ekler (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id    INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    tur        ENUM('resim','video') NOT NULL,
    adres      VARCHAR(120) NOT NULL,
    genislik   INT UNSIGNED NULL,
    yukseklik  INT UNSIGNED NULL,
    boyut      INT UNSIGNED NOT NULL DEFAULT 0,
    sira       TINYINT UNSIGNED NOT NULL DEFAULT 0,
    nsfw       TINYINT(1) NOT NULL DEFAULT 0,
    nsfw_kim   ENUM('yazar','yetkili') NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (post_id, sira),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2) Yazar, bağlantı kartlarının çizilmemesini seçebilir (bağlantı metinde kalır)
ALTER TABLE posts ADD COLUMN kart_kapali TINYINT(1) NOT NULL DEFAULT 0;

-- 3) +18 içerik görünümü: gizle | bulanik | goster (misafir her zaman gizle)
ALTER TABLE users ADD COLUMN nsfw_tercih ENUM('gizle','bulanik','goster') NOT NULL DEFAULT 'bulanik';

SET NAMES utf8mb4;
-- Comment attachments and +18 (sql/23): photo/video attachments on comments, turning off link cards, the person's +18 display preference.
-- Applied once to a running database (ALTER TABLE cannot run twice); see the command below.
-- Yorum ekleri ve +18 (sql/23): yorumlara fotoğraf/video eki, bağlantı kartı kapatma, kişinin +18 görünüm tercihi.
-- Çalışan veritabanına bir kez uygulanır (ALTER TABLE tekrar çalışmaz):
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/23_ekler.sql

-- 1) Attachments: a comment may have at most 6 photos OR 1 video (the limit is checked on the server, not in the table).
--    address: /yuklemeler/<uuid>.webp (image) or .mp4/.webm (video). nsfw_kim: who marked it +18 (the author or a moderator);
--    the author cannot remove a moderator's mark, and if a moderator removes it the author's mark goes too.
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

-- 2) The author may choose not to have link cards rendered (the link stays in the text)
-- 2) Yazar, bağlantı kartlarının çizilmemesini seçebilir (bağlantı metinde kalır)
ALTER TABLE posts ADD COLUMN kart_kapali TINYINT(1) NOT NULL DEFAULT 0;

-- 3) +18 content display: gizle (hide) | bulanik (blur) | goster (show) (guests always get hide)
-- 3) +18 içerik görünümü: gizle | bulanik | goster (misafir her zaman gizle)
ALTER TABLE users ADD COLUMN nsfw_tercih ENUM('gizle','bulanik','goster') NOT NULL DEFAULT 'bulanik';

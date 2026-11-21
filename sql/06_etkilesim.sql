SET NAMES utf8mb4;
-- Session, vote, notification, report and user preferences.
-- On a fresh install Docker runs this itself after 01-05.
-- To apply by hand to a running database:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/06_etkilesim.sql
--
-- Oturum, oy, bildirim, şikâyet ve kullanıcı tercihleri.
-- Yeni kurulumda Docker bunu 01-05'ten sonra kendisi çalıştırır.
-- Çalışan veritabanına elle uygulamak için:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/06_etkilesim.sql

-- ---------------------------------------------------------------------------
-- User preferences and states
--   tema/vurgu/...: the "Appearance" form on the settings page
--   last_seen_at  : the "online" list in chat (people who opened a page in the last 5 minutes)
--   banned_at     : filled when a moderator says "suspend"; if filled the user cannot log in
-- Kullanıcı tercihleri ve durumları
--   tema/vurgu/...: ayarlar sayfasındaki "Görünüm" formu
--   last_seen_at  : sohbetteki "çevrimiçi" listesi (son 5 dakikada sayfa açanlar)
--   banned_at     : moderatör "uzaklaştır" deyince dolar; dolu ise giriş yapamaz
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN tema         ENUM('koyu','acik','sistem') NOT NULL DEFAULT 'koyu',
    ADD COLUMN vurgu        ENUM('safir','zumrut','kehribar','ametist','yakut') NOT NULL DEFAULT 'safir',
    ADD COLUMN menu_sagda   BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN kompakt      BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN az_animasyon BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN last_seen_at DATETIME NULL,
    ADD COLUMN banned_at    DATETIME NULL;

-- Topic states: "pin" and "lock" in the moderation menu
--   if pinned_at is filled the topic stays at the top of the feed, if locked_at is filled no replies can be written.
-- Konu durumları: moderasyon menüsündeki "sabitle" ve "kilitle"
--   pinned_at dolu ise akışta en üstte durur, locked_at dolu ise cevap yazılamaz.
ALTER TABLE topics
    ADD COLUMN pinned_at DATETIME NULL,
    ADD COLUMN locked_at DATETIME NULL;

-- ---------------------------------------------------------------------------
-- Votes: a user gives a single vote to a post (+1 or -1).
--   PRIMARY KEY (user_id, post_id) guarantees this at the database level:
--   if the same person votes a second time the INSERT fails, and we UPDATE instead.
--   created_at: needed for the "this week / this month" points on the ranking page.
-- Oylar: bir kullanıcı bir mesaja tek oy verir (+1 ya da -1).
--   PRIMARY KEY (user_id, post_id) bunu veritabanı seviyesinde garanti eder:
--   aynı kişi ikinci kez oy verirse INSERT hata verir, biz de UPDATE ederiz.
--   created_at: sıralama sayfasında "bu hafta / bu ay" puanı için gerekli.
-- ---------------------------------------------------------------------------
CREATE TABLE post_votes (
    user_id    INT UNSIGNED NOT NULL,
    post_id    INT UNSIGNED NOT NULL,
    value      TINYINT      NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, post_id),
    CHECK (value IN (-1, 1)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Notifications
--   user_id : the person RECEIVING the notification
--   actor_id: the person who PERFORMED the action (NULL for a system notification; an icon is shown instead of an avatar)
--   tur     : determines the icon (notifications page)
--   metin   : ready-made sentence ("ayse replied to your topic: ...")
--   link    : address to go to when clicked
-- Bildirimler
--   user_id : bildirimi ALAN kişi
--   actor_id: eylemi YAPAN kişi (sistem bildirimi ise NULL; avatar yerine simge çıkar)
--   tur     : simgeyi belirler (bildirimler sayfası)
--   metin   : hazır cümle ("ayse konuna cevap yazdı: ...")
--   link    : tıklanınca gidilecek adres
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    actor_id   INT UNSIGNED NULL,
    tur        ENUM('cevap','oy','rozet','mesaj','moderasyon') NOT NULL,
    metin      VARCHAR(300) NOT NULL,
    link       VARCHAR(300) NOT NULL,
    read_at    DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX (user_id, created_at),
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Reports (moderation queue)
--   UNIQUE (post_id, reporter_id): the same person cannot report the same post twice.
--   handled_by / handled_at: which moderator handled it and when (the "handled today" counter)
-- Şikâyetler (moderasyon kuyruğu)
--   UNIQUE (post_id, reporter_id): aynı kişi aynı mesajı iki kez şikâyet edemez.
--   handled_by / handled_at: hangi moderatör ne zaman işledi ("bugün işlenen" sayacı)
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id     INT UNSIGNED NOT NULL,
    reporter_id INT UNSIGNED NOT NULL,
    sebep       VARCHAR(64)   NOT NULL,
    aciklama    VARCHAR(1000) NULL,
    durum       ENUM('bekliyor','islendi','reddedildi') NOT NULL DEFAULT 'bekliyor',
    handled_by  INT UNSIGNED NULL,
    handled_at  DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (post_id, reporter_id),
    FOREIGN KEY (post_id)     REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (handled_by)  REFERENCES users(id) ON DELETE SET NULL
);

-- Session table (express-mysql-session). The package creates it itself if missing;
-- we write it out explicitly here so the schema is visible.
-- Oturum tablosu (express-mysql-session). Paket yoksa kendisi de oluşturur;
-- burada açıkça yazıyoruz ki şemada ne olduğu görünsün.
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    expires    INT UNSIGNED NOT NULL,
    data       MEDIUMTEXT COLLATE utf8mb4_bin
);

-- ---------------------------------------------------------------------------
-- Real password for the test users: all of them use "test1234"
-- (the 'gecici' value in 03_seed.sql was not a hash, so logging in with it was impossible)
-- Test kullanıcılarına gerçek şifre: hepsinin şifresi "test1234"
-- (03_seed.sql'deki 'gecici' bir hash değildi, onunla giriş yapılamazdı)
-- ---------------------------------------------------------------------------
UPDATE users SET password_hash = 'scrypt$QHOAS4+eGkCj6Ff1hoKMxA==$Sx7z0sIcSq3qPqscjQDHPGuyReJUj5Gl1Kc56omq2rnjsWDK6LFMBUFf6C+d6o2g861R+XKWbV28e7J9ECmwFA==' WHERE username = 'shurai';
UPDATE users SET password_hash = 'scrypt$KiNUl8747Hp2CSKCk67tSg==$zTvXjxjikOxwjyQGt8u9sEj2f+lMzpw7khpmMsya92H2+k87aAkTm0B4E+vk56e2YyAoRD5BSXjn9CbNnCK5nQ==' WHERE username = 'ayse';
UPDATE users SET password_hash = 'scrypt$Gv28OMb1/3L1g1gjLBPIHA==$SFzSs13z039saQqJONt/xV2Gb2wGoJ9TVT9BZXJ5ccXmePWL5YqPDcSueX4Sunp4tCBIV4J7LBsIGjLmd3rYWQ==' WHERE username = 'ahmet';

-- Test votes
-- Test oyları
INSERT INTO post_votes (user_id, post_id, value) VALUES
    (2, 1, 1), (3, 1, 1), (1, 2, 1), (1, 3, 1);

-- ---------------------------------------------------------------------------
-- Points rule (same as src/puan.ts):  opening a topic +5, writing a reply +2, every vote on your post +1 / -1
-- Recompute points from scratch from the existing data. GREATEST(..., 0): points is UNSIGNED, it cannot go negative.
-- Puan kuralı (src/puan.ts ile aynı):  konu açmak +5, cevap yazmak +2, mesajına gelen her oy +1 / -1
-- Var olan veriden puanları baştan hesapla. GREATEST(..., 0): points UNSIGNED, eksiye düşemez.
-- ---------------------------------------------------------------------------
UPDATE users SET points = GREATEST(0,
      5 * (SELECT COUNT(*) FROM topics WHERE topics.user_id = users.id AND topics.deleted_at IS NULL)
    + 2 * (SELECT COUNT(*) FROM posts
             JOIN topics ON topics.id = posts.topic_id
            WHERE posts.user_id = users.id AND posts.deleted_at IS NULL
              AND posts.id <> (SELECT MIN(p2.id) FROM posts p2 WHERE p2.topic_id = posts.topic_id))
    + (SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes
         JOIN posts ON posts.id = post_votes.post_id
        WHERE posts.user_id = users.id)
);

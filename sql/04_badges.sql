SET NAMES utf8mb4;

-- Badge definitions
-- Rozet tanımları
CREATE TABLE badges (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64)  NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL
);

-- Junction table: which user earned which badge, and when
-- Ara tablo: hangi kullanıcı hangi rozeti ne zaman aldı
CREATE TABLE user_badges (
    user_id   INT UNSIGNED      NOT NULL,
    badge_id  SMALLINT UNSIGNED NOT NULL,
    earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, badge_id),
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
);

-- Test data
-- Test verileri
INSERT INTO badges (name, description) VALUES
    ('Kurucu',     'Forumu kuran kişi'),
    ('İlk Konu',   'İlk konusunu açtı'),
    ('Yardımsever','Başkasının sorusuna cevap verdi');

INSERT INTO user_badges (user_id, badge_id) VALUES
    (1, 1),
    (1, 2),
    (2, 3),
    (3, 2);

-- Kategoriler: forumun bölümleri
CREATE TABLE categories (
    id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(64) NOT NULL UNIQUE,
    description VARCHAR(255) NULL
);

-- Konular: her konu bir kategoride, bir kullanıcı tarafından açılır
CREATE TABLE topics (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id SMALLINT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    title       VARCHAR(200) NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL,

    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE RESTRICT
);

-- Mesajlar: konuya yazılan her şey (ilk mesaj dahil)
CREATE TABLE posts (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    topic_id   INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    content    TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,

    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE RESTRICT
);

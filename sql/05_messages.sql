SET NAMES utf8mb4;

-- Genel sohbet: herkesin gördüğü mesajlar
CREATE TABLE chat_messages (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    content    VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Özel mesajlar: iki kullanıcı arasında
CREATE TABLE messages (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_id   INT UNSIGNED NOT NULL,
    receiver_id INT UNSIGNED NOT NULL,
    content     TEXT NOT NULL,
    read_at     DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Test verileri
INSERT INTO chat_messages (user_id, content) VALUES
    (3, 'Selam millet'),
    (1, 'Hoş geldin!');

INSERT INTO messages (sender_id, receiver_id, content) VALUES
    (3, 1, 'Docker kurulumunda yardım eder misin?'),
    (1, 3, 'Tabii, :z ekledin mi?');

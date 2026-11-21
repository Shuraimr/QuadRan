SET NAMES utf8mb4;
-- Roles: they decide permissions
-- Roller: yetkiyi belirler
CREATE TABLE roles (
    id   TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(32) NOT NULL UNIQUE
);

INSERT INTO roles (name) VALUES ('admin'), ('moderator'), ('uye');

-- Ranks: earned by points, appearance only
-- Rütbeler: puana göre kazanılır, sadece görünüş
CREATE TABLE ranks (
    id         TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(32) NOT NULL UNIQUE,
    min_points INT UNSIGNED NOT NULL UNIQUE
);

INSERT INTO ranks (name, min_points) VALUES
    ('Çaylak', 0),
    ('Müdavim', 100),
    ('Usta', 500),
    ('Efsane', 2000);

-- Users
-- Kullanıcılar
CREATE TABLE users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(32)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url    VARCHAR(500) NULL,
    banner_url    VARCHAR(500) NULL,
    bio           TEXT         NULL,
    points        INT UNSIGNED NOT NULL DEFAULT 0,
    role_id       TINYINT UNSIGNED NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at    DATETIME NULL,

    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

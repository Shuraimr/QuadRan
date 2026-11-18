SET NAMES utf8mb4;
-- Hesap işlemleri: şifre sıfırlama belirteçleri ve kullanıcı şikâyeti.
-- Çalışan veritabanına elle uygulamak için:
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/07_hesap.sql

-- ---------------------------------------------------------------------------
-- Şifre sıfırlama belirteçleri
--   Bağlantıdaki belirteç (32 rastgele bayt, hex) veritabanına ASLA düz yazılmaz; yalnızca sha256 özeti saklanır.
--   Veritabanı sızsa bile özetten çalışan bir bağlantı üretilemez.
--   expires_at: oluşturulduktan 1 saat sonrası. used_at: kullanılınca dolar, ikinci kez kullanılamaz.
-- ---------------------------------------------------------------------------
CREATE TABLE password_resets (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    token_hash CHAR(64)     NOT NULL,
    expires_at DATETIME     NOT NULL,
    used_at    DATETIME     NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (token_hash),
    INDEX (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Kullanıcı şikâyeti
--   Bir şikâyet ya bir MESAJI (post_id) ya da bir KULLANICIYI (reported_user_id) hedefler; ikisi birden olmaz.
--   Eski UNIQUE (post_id, reporter_id) kalır: post_id NULL ise MySQL bu satırları "farklı" sayar, sorun çıkmaz.
--   Kullanıcı şikâyetleri için ayrı UNIQUE: aynı kişi aynı kullanıcıyı iki kez şikâyet edemez.
-- ---------------------------------------------------------------------------
ALTER TABLE reports
    MODIFY post_id INT UNSIGNED NULL,
    ADD COLUMN reported_user_id INT UNSIGNED NULL AFTER post_id,
    ADD FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD UNIQUE (reported_user_id, reporter_id),
    ADD CONSTRAINT reports_hedef_tek CHECK ((post_id IS NULL) <> (reported_user_id IS NULL));

SET NAMES utf8mb4;
-- Yönetim paneli (/yonetim): süreli ban, kategori sırası, silinebilir sohbet/özel mesaj,
-- site ayarları, işlem kaydı ve şikâyetlerin genel (çok hedefli) modele taşınması.
-- Çalışan veritabanına elle uygulamak için (BİR KEZ; ALTER TABLE tekrar çalıştırılırsa "duplicate column" der):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/08_yonetim.sql

-- ---------------------------------------------------------------------------
-- Süreli uzaklaştırma
--   banned_at dolu + banned_until NULL  = kalıcı ban (eski davranış, moderasyon "uzaklaştır" böyle yazar)
--   banned_at dolu + banned_until dolu  = o tarihe kadar ban; tarih geçince ban kendiliğinden biter
--   (oturum.ts ve giriş, "banned_until > NOW()" koşuluna bakar; süresi dolan satırı temizler)
--   ban_reason: yönetici/moderatörün yazdığı sebep, giriş ekranında kullanıcıya gösterilir
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN banned_until DATETIME NULL AFTER banned_at,
    ADD COLUMN ban_reason   VARCHAR(255) NULL AFTER banned_until;

-- Kategori sırası (yönetim panelinden değiştirilir). 10'ar 10'ar: araya yeni kategori sığsın diye.
ALTER TABLE categories ADD COLUMN sort_order INT NOT NULL DEFAULT 0;
UPDATE categories SET sort_order = id * 10;

-- Sohbet ve özel mesajlar da yumuşak silinir (satır kalır, şikâyetin hedefi kaybolmaz)
ALTER TABLE chat_messages ADD COLUMN deleted_at DATETIME NULL;
ALTER TABLE messages      ADD COLUMN deleted_at DATETIME NULL;

-- ---------------------------------------------------------------------------
-- Site ayarları: anahtar/değer tablosu. Sunucu bunları bellekte önbelleğe alır (src/ayarlar.ts).
--   kayit_acik        '1' ya da '0'
--   duyuru, duyuru_tur  bütün sayfaların üstünde görünen şerit ('info' | 'uyari')
--   duyuru_surum      duyuru her değiştiğinde yenilenir: kapatmış olanlar yeni duyuruyu yine görsün
--   yasakli_kelimeler  satır başına bir kelime/ifade (küçük harfe çevrilmiş)
-- ---------------------------------------------------------------------------
CREATE TABLE site_settings (
    anahtar    VARCHAR(64) NOT NULL PRIMARY KEY,
    deger      TEXT        NOT NULL,
    updated_by INT UNSIGNED NULL,
    updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO site_settings (anahtar, deger) VALUES
    ('kayit_acik', '1'),
    ('duyuru', ''),
    ('duyuru_tur', 'info'),
    ('duyuru_surum', '0'),
    ('yasakli_kelimeler', '');

-- ---------------------------------------------------------------------------
-- İşlem kaydı (denetim): yetkililerin yaptığı HER işlem bir satır.
--   eylem     'kullanici.ban', 'icerik.sil'... (nokta ile gruplanmış)
--   hedef_tur 'kullanici' | 'konu' | 'konu_mesaji' | 'sohbet_mesaji' | 'ozel_mesaj' | 'kategori' | 'rutbe' | 'rozet' | 'ayar' ...
--   ayrinti   işlemin ayrıntısı (sebep, eski/yeni değer...) JSON
-- Actor silinirse satır kalır (SET NULL): kayıt, kişiden uzun yaşamalı.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id   INT UNSIGNED NULL,
    eylem      VARCHAR(64)  NOT NULL,
    hedef_tur  VARCHAR(32)  NULL,
    hedef_id   INT UNSIGNED NULL,
    ayrinti    JSON NULL,
    ip         VARCHAR(45)  NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX (created_at),
    INDEX (actor_id, created_at),
    INDEX (hedef_tur, hedef_id),
    INDEX (eylem),
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Şikâyetler artık GENEL: hedef_tur hangi sütunun dolu olduğunu söyler.
--   konu_mesaji   -> post_id
--   kullanici     -> reported_user_id
--   sohbet_mesaji -> chat_message_id   (genel sohbet)
--   ozel_mesaj    -> message_id        (iki kişilik özel mesaj; yalnızca ALICI şikâyet edebilir)
-- Grup/oda sohbetleri eklendiğinde: hedef_tur'a yeni değer (ör. 'oda_mesaji'), reports'a yeni FK sütunu
-- (ör. room_message_id), UNIQUE (room_message_id, reporter_id) ve aşağıdaki CHECK'e bir dal eklenir; başka şey değişmez.
-- ---------------------------------------------------------------------------
ALTER TABLE reports
    ADD COLUMN hedef_tur ENUM('konu_mesaji','kullanici','sohbet_mesaji','ozel_mesaj') NOT NULL DEFAULT 'konu_mesaji' AFTER id,
    ADD COLUMN chat_message_id INT UNSIGNED NULL AFTER reported_user_id,
    ADD COLUMN message_id      INT UNSIGNED NULL AFTER chat_message_id,
    ADD FOREIGN KEY (chat_message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    ADD FOREIGN KEY (message_id)      REFERENCES messages(id)      ON DELETE CASCADE,
    ADD UNIQUE (chat_message_id, reporter_id),
    ADD UNIQUE (message_id, reporter_id),
    ADD INDEX (hedef_tur, durum);

-- Var olan satırları taşı: kullanıcı şikâyetleri 'kullanici' olur, geri kalanı zaten 'konu_mesaji' (varsayılan)
UPDATE reports SET hedef_tur = 'kullanici' WHERE reported_user_id IS NOT NULL;

-- Eski "ya mesaj ya kullanıcı" kuralı yerine: tam olarak bir hedef dolu VE hedef_tur o hedefle uyumlu
ALTER TABLE reports DROP CHECK reports_hedef_tek;
ALTER TABLE reports ADD CONSTRAINT reports_hedef_tek CHECK (
       (hedef_tur = 'konu_mesaji'   AND post_id IS NOT NULL AND reported_user_id IS NULL AND chat_message_id IS NULL AND message_id IS NULL)
    OR (hedef_tur = 'kullanici'     AND post_id IS NULL AND reported_user_id IS NOT NULL AND chat_message_id IS NULL AND message_id IS NULL)
    OR (hedef_tur = 'sohbet_mesaji' AND post_id IS NULL AND reported_user_id IS NULL AND chat_message_id IS NOT NULL AND message_id IS NULL)
    OR (hedef_tur = 'ozel_mesaj'    AND post_id IS NULL AND reported_user_id IS NULL AND chat_message_id IS NULL AND message_id IS NOT NULL)
);

SET NAMES utf8mb4;
-- Özel odalar (sql/12): yalnızca davetle ya da davet bağlantısıyla girilen grup sohbetleri.
-- Çalışan veritabanına bir kez uygulanır (ALTER TABLE tekrar çalışmaz):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/12_odalar.sql

-- 1) Odalar. Silme = yumuşak silme (deleted_at); kapatildi_at = yetkililer odayı kapattı
--    (üyeler okuyabilir ama yazamaz; yetkili açınca NULL olur).
CREATE TABLE IF NOT EXISTS rooms (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ad          VARCHAR(60)  NOT NULL,
    aciklama    VARCHAR(280) NULL,
    sahip_id    INT UNSIGNED NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL,
    kapatildi_at DATETIME NULL,
    INDEX (sahip_id),
    FOREIGN KEY (sahip_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 2) Üyelik. rol: sahip (odada tek), yonetici, uye. sessiz: bu oda için okunmamış noktası/sayısı sayılmaz.
--    son_okunan_id: üyenin odada okuduğu son mesaj numarası; okunmamış sayısı = bundan büyük mesajlar.
CREATE TABLE IF NOT EXISTS room_members (
    room_id       INT UNSIGNED NOT NULL,
    user_id       INT UNSIGNED NOT NULL,
    rol           ENUM('sahip','yonetici','uye') NOT NULL DEFAULT 'uye',
    sessiz        BOOLEAN NOT NULL DEFAULT FALSE,
    son_okunan_id INT UNSIGNED NULL,
    joined_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id),
    INDEX (user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 3) Kişiye davet. Aynı oda + kişi için tek "bekliyor" kaydı olması kodda sağlanır (UNIQUE koymadık:
--    eski reddedilmiş/iptal edilmiş davetler kalır, kişi sonra yeniden davet edilebilir).
CREATE TABLE IF NOT EXISTS room_invites (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id       INT UNSIGNED NOT NULL,
    davet_eden    INT UNSIGNED NOT NULL,
    davet_edilen  INT UNSIGNED NOT NULL,
    durum         ENUM('bekliyor','kabul','ret','iptal') NOT NULL DEFAULT 'bekliyor',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (davet_edilen, durum),
    INDEX (room_id, durum),
    FOREIGN KEY (room_id)      REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (davet_eden)   REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (davet_edilen) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 4) Davet bağlantıları: /oda/katil/<kod>.
--    kod DÜZ METİN saklanır (özet değil): bağlantı bir şifre değil, odaya girmek için paylaşılan bir davetiye;
--    yöneticiler "Etkin bağlantılar" listesinde onu yeniden görüp kopyalayabilmeli. Zarar sınırlıdır: bağlantı
--    süre/kullanım sınırıyla kısıtlanabilir ve istenince iptal edilir (iptal_at). Kod 8 karakter, karıştırılan
--    harfler (I, O, 0, 1, L) yok, okunur biçim: K7Q2-XM9P.
CREATE TABLE IF NOT EXISTS room_links (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id         INT UNSIGNED NOT NULL,
    olusturan       INT UNSIGNED NOT NULL,
    kod             VARCHAR(16) NOT NULL UNIQUE,
    son_kullanma    DATETIME NULL,
    kullanim_siniri INT UNSIGNED NULL,
    kullanim        INT UNSIGNED NOT NULL DEFAULT 0,
    iptal_at        DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (room_id),
    FOREIGN KEY (room_id)   REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (olusturan) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 5) Odadan çıkarılanlar 24 saat bağlantıyla geri giremez. (Sütun adı "until" MySQL'de ayrılmış kelime olduğu için "bitis".)
CREATE TABLE IF NOT EXISTS room_bans (
    room_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    bitis   DATETIME NOT NULL,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 6) Oda mesajları. tur 'sistem': "ayse odaya ahmet’i ekledi" gibi olay satırları; user_id olayı yapan kişidir,
--    metin hazır yazılır. Sistem satırları şikâyet edilemez, okunmamış sayılmaz.
CREATE TABLE IF NOT EXISTS room_messages (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id     INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    tur         ENUM('mesaj','sistem') NOT NULL DEFAULT 'mesaj',
    content     VARCHAR(2000) NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL,
    INDEX (room_id, id),
    INDEX (user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 7) Şikâyet: yeni hedef türü 'oda_mesaji' (sql/08'deki not: enum'a değer + FK sütunu + UNIQUE + CHECK'e bir dal).
ALTER TABLE reports
    MODIFY COLUMN hedef_tur ENUM('konu_mesaji','kullanici','sohbet_mesaji','ozel_mesaj','oda_mesaji') NOT NULL DEFAULT 'konu_mesaji',
    ADD COLUMN room_message_id INT UNSIGNED NULL AFTER message_id,
    ADD FOREIGN KEY (room_message_id) REFERENCES room_messages(id) ON DELETE CASCADE,
    ADD UNIQUE (room_message_id, reporter_id);

ALTER TABLE reports DROP CHECK reports_hedef_tek;
ALTER TABLE reports ADD CONSTRAINT reports_hedef_tek CHECK (
       (hedef_tur = 'konu_mesaji'   AND post_id IS NOT NULL AND reported_user_id IS NULL AND chat_message_id IS NULL AND message_id IS NULL AND room_message_id IS NULL)
    OR (hedef_tur = 'kullanici'     AND post_id IS NULL AND reported_user_id IS NOT NULL AND chat_message_id IS NULL AND message_id IS NULL AND room_message_id IS NULL)
    OR (hedef_tur = 'sohbet_mesaji' AND post_id IS NULL AND reported_user_id IS NULL AND chat_message_id IS NOT NULL AND message_id IS NULL AND room_message_id IS NULL)
    OR (hedef_tur = 'ozel_mesaj'    AND post_id IS NULL AND reported_user_id IS NULL AND chat_message_id IS NULL AND message_id IS NOT NULL AND room_message_id IS NULL)
    OR (hedef_tur = 'oda_mesaji'    AND post_id IS NULL AND reported_user_id IS NULL AND chat_message_id IS NULL AND message_id IS NULL AND room_message_id IS NOT NULL)
);

-- 8) Bildirim türü 'oda' (oda daveti, odadan çıkarılma...). MODIFY eski değerleri aynen korur.
ALTER TABLE notifications
    MODIFY COLUMN tur ENUM('cevap','oy','rozet','mesaj','moderasyon','duyuru','oda') NOT NULL;

-- 9) Ayarlar (panelde Sohbet > Odalar sekmesinden değişir): oda açmak için gereken puan (100 = Müdavim)
--    ve kişi başına en çok kaç oda sahibi olunabileceği. INSERT IGNORE: tekrar çalıştırmak yönetici değerini ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES
    ('oda_rutbe_esigi', '100'),
    ('kisi_basi_oda_siniri', '3');

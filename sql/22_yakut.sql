SET NAMES utf8mb4;
-- Yakut (para birimi) (sql/22): bakiye, hareket defteri (yakut_log), rütbe başına aylık harçlık, unvan mağazası.
-- Çalışan veritabanına bir kez uygulanır (ALTER TABLE tekrar çalışmaz):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/22_yakut.sql
--
-- Yakut puandan AYRIDIR: puan rütbeyi belirler ve harcanmaz, yakut harcanır. Bakiyeye giden HER değişiklik
-- yakut_log'a bir satır yazar ve yalnızca src/yakut.ts › yakutEkle'den geçer (puanEkle/points_log ile aynı kalıp).

-- 1) Kullanıcı: bakiye, son harçlık ayı ("2026-11"; o ayın harçlığı verildi mi) ve seçili unvan (kullanici_unvanlari'ndan biri).
ALTER TABLE users
    ADD COLUMN yakut        INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN son_harclik  CHAR(7) NULL,
    ADD COLUMN unvan_id     INT UNSIGNED NULL;

-- 2) Hareket defteri. miktar işaretli (+ kazanç, - harcama). sebep sabit bir liste değil VARCHAR: yeni harcama türleri
--    (yardim, bahsis, super_yorum, one_cikar) ENUM'u değiştirmeden eklenir. aciklama: panelden verilen/alınan yakutun sebebi vb.
CREATE TABLE yakut_log (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    miktar     INT NOT NULL,
    sebep      VARCHAR(20) NOT NULL,   -- harclik | seri | premium | yonetim | unvan_al | (ileride) yardim, bahsis, super_yorum, one_cikar
    ilgili_id  INT UNSIGNED NULL,      -- unvan_al -> unvan no
    aciklama   VARCHAR(200) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id, id),
    INDEX (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- 3) Rütbenin aylık yakut harçlığı: rütbe yükseldikçe artar (en düşük 40, en yüksek 400). Panelde Puan ve ödüller > Rütbeler'den düzenlenir.
ALTER TABLE ranks ADD COLUMN aylik_yakut INT UNSIGNED NOT NULL DEFAULT 0;
UPDATE ranks SET aylik_yakut = CASE
    WHEN min_points >= 5000 THEN 400
    WHEN min_points >= 2000 THEN 330
    WHEN min_points >= 1000 THEN 260
    WHEN min_points >= 500  THEN 200
    WHEN min_points >= 250  THEN 160
    WHEN min_points >= 100  THEN 120
    WHEN min_points >= 30   THEN 80
    ELSE 40 END;

-- 4) Unvan mağazası: yakutla alınan eğlenceli unvanlar. Alınan unvan kullanici_unvanlari'nda kalıcıdır.
CREATE TABLE unvanlar (
    id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ad    VARCHAR(40) NOT NULL UNIQUE,
    fiyat INT UNSIGNED NOT NULL,
    aktif BOOLEAN NOT NULL DEFAULT TRUE,
    sira  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE kullanici_unvanlari (
    user_id  INT UNSIGNED NOT NULL,
    unvan_id INT UNSIGNED NOT NULL,
    alindi   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, unvan_id),
    FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
    FOREIGN KEY (unvan_id) REFERENCES unvanlar(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Seçili unvan: unvan silinirse seçim boşalır (kişi yetim bir unvan göstermesin)
ALTER TABLE users ADD FOREIGN KEY (unvan_id) REFERENCES unvanlar(id) ON DELETE SET NULL;

INSERT INTO unvanlar (ad, fiyat, sira) VALUES
    ('NixOS Enjoyer', 300, 1),
    ('Apple Glazer', 300, 2),
    ('Vim''den çıkamayan', 450, 3),
    ('Arch btw', 300, 4),
    ('Tab mı boşluk mu', 250, 5);

-- 5) Yakut kazanma ayarları. INSERT IGNORE: yönetici değerini ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES
    ('yakut_seri_gunluk', '10'),   -- günlük giriş: her gün
    ('yakut_seri_yedinci', '50'),  -- 7., 14., 21... ardışık günde 10 yerine
    ('yakut_premium_aylik', '300'); -- premium üyeye ayda bir

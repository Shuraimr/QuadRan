SET NAMES utf8mb4;
-- Rütbe sistemi (sql/13): 8 rütbe (renk + simge), rütbe başına ayrıcalıklar, puan geçmişi (points_log),
-- kabul edilen cevap ("çözüm"), günlük giriş serisi, imza ve rütbe atlama bildirimi.
-- Çalışan veritabanına bir kez uygulanır (ALTER TABLE tekrar çalışmaz):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/13_rutbe.sql

-- 1) Rütbe görünümü ve ayrıcalıkları (ranks satırında durur; panelde Puan ve ödüller > Rütbeler'den düzenlenir).
--    renk: 8 renk anahtarından biri (gri, yesil, camgobegi, mavi, mor, amber, turuncu, pembe; CSS'te --rutbe-<anahtar>)
--    simge: views/partials/ikon.ejs'teki simge adı
--    oda_ac / baglanti / gorsel / video / imza: o rütbe ve üstündekiler için açık mı
--    gunluk_oy: günde en çok kaç oy (NULL = sınırsız)
ALTER TABLE ranks
    ADD COLUMN renk      VARCHAR(16) NOT NULL DEFAULT 'gri',
    ADD COLUMN simge     VARCHAR(16) NOT NULL DEFAULT 'filiz',
    ADD COLUMN oda_ac    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN baglanti  BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN gorsel    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN video     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN imza      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN gunluk_oy INT UNSIGNED NULL;

-- 2) Var olan dört rütbe eşiğine göre güncellenir (adlar korunur), dört yenisi araya eklenir.
UPDATE ranks SET renk = 'gri',       simge = 'filiz',  gunluk_oy = 20   WHERE min_points = 0;
UPDATE ranks SET renk = 'camgobegi', simge = 'ev',     gunluk_oy = 100  WHERE min_points = 100;
UPDATE ranks SET renk = 'mor',       simge = 'cekic',  gunluk_oy = NULL WHERE min_points = 500;
UPDATE ranks SET renk = 'turuncu',   simge = 'tac',    gunluk_oy = NULL WHERE min_points = 2000;
INSERT INTO ranks (name, min_points, renk, simge, gunluk_oy) VALUES
    ('Gezgin',  30,   'yesil', 'pusula', 50),
    ('Katkıcı', 250,  'mavi',  'el',     200),
    ('Uzman',   1000, 'amber', 'yildiz', NULL),
    ('Duayen',  5000, 'pembe', 'elmas',  NULL);

-- 3) Ayrıcalıklar basamak basamak açılır: oda açma ve bağlantı Müdavim'den, görsel Katkıcı'dan,
--    imza Usta'dan, video Uzman'dan; üst rütbeler hepsini korur.
UPDATE ranks SET baglanti = (min_points >= 100), gorsel = (min_points >= 250), imza = (min_points >= 500), video = (min_points >= 1000);

-- 4) Eski "oda açmak için en az puan" ayarı (sql/12) artık rütbenin oda_ac ayrıcalığıdır: yöneticinin
--    seçtiği eşik varsa oda_ac o puan ve üstündeki rütbelere verilir (ayar yoksa 100 = Müdavim), sonra ayar silinir.
UPDATE ranks SET oda_ac = (min_points >= COALESCE((SELECT CAST(deger AS UNSIGNED) FROM site_settings WHERE anahtar = 'oda_rutbe_esigi'), 100));
DELETE FROM site_settings WHERE anahtar = 'oda_rutbe_esigi';

-- 5) Yeni puan kaynakları (panelde Puan ve ödüller > Puan kuralları). INSERT IGNORE: yönetici değerini ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES
    ('puan_gunluk', '1'),   -- günde ilk ziyaret
    ('puan_seri',   '5'),   -- 7 gün üst üste ziyaret (her 7. günde bir)
    ('puan_cozum',  '15'),  -- cevabı çözüm olarak işaretlenen yazara
    ('puan_rozet',  '10');  -- her yeni rozet

-- 6) Puan geçmişi: users.points'e giden HER değişiklik bir satır yazar (src/yardimci.ts puanEkle).
--    miktar uygulanan gerçek farktır (puan 0'ın altına inemediği için istenenden küçük olabilir), böylece
--    bir kullanıcının satırlarının toplamı her zaman users.points'e eşit kalır. ilgili_id sebebe göre:
--    konu -> konu no, cevap/oy/cozum/silme -> mesaj (posts) no, rozet -> rozet no.
CREATE TABLE points_log (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    miktar     INT NOT NULL,
    sebep      ENUM('konu','cevap','oy','gunluk','seri','cozum','rozet','duzeltme','silme') NOT NULL,
    ilgili_id  INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id, id),
    INDEX (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Geçmiş veri: eski puanların hangi olaydan ve ne zaman geldiği kayıtlı değildi. Her kullanıcı için, o güne kadarki
-- toplam puanı tek bir 'duzeltme' satırı olarak yazıyoruz; böylece satır toplamı = users.points eşitliği baştan tutar.
-- Tarihi 2000-01-01 yapıyoruz (bilinmeyen eski tarih): "bu hafta/bu ay" sıralaması puan geçmişinden hesaplandığı için
-- bugünün tarihini verseydik herkesin bütün puanı bu haftaya yazılmış görünürdü. Puan geçmişi sayfası bu satırı "Önceki puanların" diye gösterir.
INSERT INTO points_log (user_id, miktar, sebep, created_at) SELECT id, points, 'duzeltme', '2000-01-01 00:00:00' FROM users WHERE points > 0;

-- 7) Kullanıcı: imza (Usta'dan itibaren), günlük giriş serisi ve bekleyen rütbe kutlaması.
--    son_gunluk_puan: günlük puanın son verildiği gün; seri_gun: üst üste ziyaret edilen gün sayısı.
--    kutlama_rutbe_id: rütbe atlayınca dolar, bir sonraki sayfada kutlama bildirimi gösterilince temizlenir
--    (oturumda değil veritabanında: oyu alan kişi o an çevrimdışı/başka cihazda olabilir).
ALTER TABLE users
    ADD COLUMN imza             VARCHAR(120) NULL,
    ADD COLUMN son_gunluk_puan  DATE NULL,
    ADD COLUMN seri_gun         INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN kutlama_rutbe_id TINYINT UNSIGNED NULL;

-- 8) Çözüm: konunun sahibinin kabul ettiği cevap (silinirse işaret kalkar).
ALTER TABLE topics
    ADD COLUMN cozum_post_id INT UNSIGNED NULL,
    ADD FOREIGN KEY (cozum_post_id) REFERENCES posts(id) ON DELETE SET NULL;

-- 9) Bildirim türü 'rutbe' (rütbe atlama). MODIFY eski değerleri aynen korur.
ALTER TABLE notifications
    MODIFY COLUMN tur ENUM('cevap','oy','rozet','mesaj','moderasyon','duyuru','oda','rutbe') NOT NULL;

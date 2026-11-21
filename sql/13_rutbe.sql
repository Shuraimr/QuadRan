SET NAMES utf8mb4;
-- Rank system (sql/13): 8 ranks (color + icon), per-rank privileges, points history (points_log),
-- accepted answer ("solution"), daily login streak, signature and rank-up notification.
-- Rütbe sistemi (sql/13): 8 rütbe (renk + simge), rütbe başına ayrıcalıklar, puan geçmişi (points_log),
-- kabul edilen cevap ("çözüm"), günlük giriş serisi, imza ve rütbe atlama bildirimi.
-- Applied once to a running database (ALTER TABLE cannot run twice); see the command below.
-- Çalışan veritabanına bir kez uygulanır (ALTER TABLE tekrar çalışmaz):
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/13_rutbe.sql

-- 1) Rank appearance and privileges (kept on the ranks row; edited in the panel under Puan ve ödüller > Rütbeler).
--    renk: one of 8 color keys (gri, yesil, camgobegi, mavi, mor, amber, turuncu, pembe; --rutbe-<key> in CSS)
--    simge: icon name from views/partials/ikon.ejs
--    oda_ac / baglanti / gorsel / video / imza: whether it is open to that rank and above (room creation / links / images / video / signature)
--    gunluk_oy: maximum votes per day (NULL = unlimited)
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

-- 2) Updated according to the four existing rank thresholds (names are kept), four new ones are inserted in between.
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

-- 3) Privileges unlock step by step: room creation and links from Müdavim, images from Katkıcı,
--    signature from Usta, video from Uzman; higher ranks keep all of them.
-- 3) Ayrıcalıklar basamak basamak açılır: oda açma ve bağlantı Müdavim'den, görsel Katkıcı'dan,
--    imza Usta'dan, video Uzman'dan; üst rütbeler hepsini korur.
UPDATE ranks SET baglanti = (min_points >= 100), gorsel = (min_points >= 250), imza = (min_points >= 500), video = (min_points >= 1000);

-- 4) The old "minimum points to create a room" setting (sql/12) is now the rank's oda_ac privilege: if the admin
--    had chosen a threshold, oda_ac is granted to ranks at or above that many points (100 = Müdavim if no setting), then the setting is deleted.
-- 4) Eski "oda açmak için en az puan" ayarı (sql/12) artık rütbenin oda_ac ayrıcalığıdır: yöneticinin
--    seçtiği eşik varsa oda_ac o puan ve üstündeki rütbelere verilir (ayar yoksa 100 = Müdavim), sonra ayar silinir.
UPDATE ranks SET oda_ac = (min_points >= COALESCE((SELECT CAST(deger AS UNSIGNED) FROM site_settings WHERE anahtar = 'oda_rutbe_esigi'), 100));
DELETE FROM site_settings WHERE anahtar = 'oda_rutbe_esigi';

-- 5) New point sources (in the panel under Puan ve ödüller > Puan kuralları). INSERT IGNORE: does not overwrite the admin's value.
-- 5) Yeni puan kaynakları (panelde Puan ve ödüller > Puan kuralları). INSERT IGNORE: yönetici değerini ezmez.
INSERT IGNORE INTO site_settings (anahtar, deger) VALUES
    ('puan_gunluk', '1'),   -- first visit of the day · günde ilk ziyaret
    ('puan_seri',   '5'),   -- 7 days of consecutive visits (once every 7th day) · 7 gün üst üste ziyaret (her 7. günde bir)
    ('puan_cozum',  '15'),  -- to the author whose answer is marked as the solution · cevabı çözüm olarak işaretlenen yazara
    ('puan_rozet',  '10');  -- every new badge · her yeni rozet

-- 6) Points history: EVERY change to users.points writes one row (src/yardimci.ts puanEkle).
--    miktar is the actual difference applied (it can be smaller than requested because points cannot drop below 0), so
--    the sum of a user's rows always equals users.points. ilgili_id depends on the reason:
--    konu -> topic id, cevap/oy/cozum/silme -> message (posts) id, rozet -> badge id.
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

-- Historical data: it was not recorded which event or when the old points came from. For each user, the total
-- points up to today are written as a single 'duzeltme' (correction) row; this way the row sum = users.points equality holds from the start.
-- The date is set to 2000-01-01 (unknown old date): since the "this week/this month" ranking is computed from the points history,
-- giving today's date would make everyone's entire score look like it was earned this week. The points history page shows this row as "Önceki puanların" (Your earlier points).
-- Geçmiş veri: eski puanların hangi olaydan ve ne zaman geldiği kayıtlı değildi. Her kullanıcı için, o güne kadarki
-- toplam puanı tek bir 'duzeltme' satırı olarak yazıyoruz; böylece satır toplamı = users.points eşitliği baştan tutar.
-- Tarihi 2000-01-01 yapıyoruz (bilinmeyen eski tarih): "bu hafta/bu ay" sıralaması puan geçmişinden hesaplandığı için
-- bugünün tarihini verseydik herkesin bütün puanı bu haftaya yazılmış görünürdü. Puan geçmişi sayfası bu satırı "Önceki puanların" diye gösterir.
INSERT INTO points_log (user_id, miktar, sebep, created_at) SELECT id, points, 'duzeltme', '2000-01-01 00:00:00' FROM users WHERE points > 0;

-- 7) User: signature (from Usta on), daily login streak and pending rank celebration.
--    son_gunluk_puan: the day the daily point was last granted; seri_gun: number of consecutive days visited.
--    kutlama_rutbe_id: filled when a rank is gained, cleared once the celebration notification is shown on the next page
--    (in the database, not the session: the person who received the vote may be offline or on another device at that moment).
-- 7) Kullanıcı: imza (Usta'dan itibaren), günlük giriş serisi ve bekleyen rütbe kutlaması.
--    son_gunluk_puan: günlük puanın son verildiği gün; seri_gun: üst üste ziyaret edilen gün sayısı.
--    kutlama_rutbe_id: rütbe atlayınca dolar, bir sonraki sayfada kutlama bildirimi gösterilince temizlenir
--    (oturumda değil veritabanında: oyu alan kişi o an çevrimdışı/başka cihazda olabilir).
ALTER TABLE users
    ADD COLUMN imza             VARCHAR(120) NULL,
    ADD COLUMN son_gunluk_puan  DATE NULL,
    ADD COLUMN seri_gun         INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN kutlama_rutbe_id TINYINT UNSIGNED NULL;

-- 8) Solution: the answer accepted by the topic owner (the mark is cleared if it is deleted).
-- 8) Çözüm: konunun sahibinin kabul ettiği cevap (silinirse işaret kalkar).
ALTER TABLE topics
    ADD COLUMN cozum_post_id INT UNSIGNED NULL,
    ADD FOREIGN KEY (cozum_post_id) REFERENCES posts(id) ON DELETE SET NULL;

-- 9) Notification type 'rutbe' (rank-up). MODIFY keeps the old values as they are.
-- 9) Bildirim türü 'rutbe' (rütbe atlama). MODIFY eski değerleri aynen korur.
ALTER TABLE notifications
    MODIFY COLUMN tur ENUM('cevap','oy','rozet','mesaj','moderasyon','duyuru','oda','rutbe') NOT NULL;

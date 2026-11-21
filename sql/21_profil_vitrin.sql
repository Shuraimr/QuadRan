-- Profil vitrini: vitrine konan rozetler (en çok 3) ve profile sabitlenen konu.
-- Docker ilk kurulumda sıralı çalıştırır; canlı DB'ye elle (bir kez; ALTER TABLE tekrar çalışmaz):
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/21_profil_vitrin.sql

-- vitrin_sira: 1–3 = vitrinde bu sırada gösterilir, NULL = vitrinde değil. Ayrı tablo yerine mevcut
-- user_badges satırına sütun eklendi: rozet zaten kişiye ait, "hangi rozetler seçili" aynı satırda durur.
ALTER TABLE user_badges
    ADD COLUMN vitrin_sira TINYINT UNSIGNED NULL;

-- sabit_konu_id: profilde öne çıkarılan konu. Konu kalıcı silinirse (ON DELETE SET NULL) sabit kendiliğinden kalkar;
-- soft delete (deleted_at) durumunu ise profil sorgusu ayrıca denetler.
ALTER TABLE users
    ADD COLUMN sabit_konu_id INT UNSIGNED NULL,
    ADD CONSTRAINT users_sabit_konu_fk FOREIGN KEY (sabit_konu_id) REFERENCES topics(id) ON DELETE SET NULL;

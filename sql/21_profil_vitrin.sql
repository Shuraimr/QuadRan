-- Profile showcase: the badges placed in the showcase (at most 3) and the topic pinned to the profile.
-- Docker runs these in order on first setup; on a live DB by hand (once; ALTER TABLE does not run twice):
-- Profil vitrini: vitrine konan rozetler (en çok 3) ve profile sabitlenen konu.
-- Docker ilk kurulumda sıralı çalıştırır; canlı DB'ye elle (bir kez; ALTER TABLE tekrar çalışmaz):
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/21_profil_vitrin.sql

-- vitrin_sira: 1-3 = shown in the showcase in this order, NULL = not in the showcase. Instead of a separate table a column was added to the existing
-- user_badges row: the badge already belongs to the person, and "which badges are selected" stays in the same row.
-- vitrin_sira: 1–3 = vitrinde bu sırada gösterilir, NULL = vitrinde değil. Ayrı tablo yerine mevcut
-- user_badges satırına sütun eklendi: rozet zaten kişiye ait, "hangi rozetler seçili" aynı satırda durur.
ALTER TABLE user_badges
    ADD COLUMN vitrin_sira TINYINT UNSIGNED NULL;

-- sabit_konu_id: the topic highlighted on the profile. If the topic is permanently deleted (ON DELETE SET NULL) the pin disappears by itself;
-- the soft delete (deleted_at) state is checked separately by the profile query.
-- sabit_konu_id: profilde öne çıkarılan konu. Konu kalıcı silinirse (ON DELETE SET NULL) sabit kendiliğinden kalkar;
-- soft delete (deleted_at) durumunu ise profil sorgusu ayrıca denetler.
ALTER TABLE users
    ADD COLUMN sabit_konu_id INT UNSIGNED NULL,
    ADD CONSTRAINT users_sabit_konu_fk FOREIGN KEY (sabit_konu_id) REFERENCES topics(id) ON DELETE SET NULL;

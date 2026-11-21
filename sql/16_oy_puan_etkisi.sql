SET NAMES utf8mb4;
-- The amount a vote ACTUALLY applied to the author's points (sql/16). Apply once to a running database:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/16_oy_puan_etkisi.sql
--
-- Why: points never drop below 0 (puanEkle clamps). A downvote on an author with 0 points removes nothing; previously, if
-- the vote was later flipped to an upvote, "difference = 2" wrote +2, and undoing the vote then took -1: with no vote left,
-- the author kept a net +1.
-- Now every vote row stores the real amount it applied; when the vote changes or is undone only that amount is corrected.
-- This way, even if the puan_oy setting changes later, the amount taken back equals the amount given.
--
-- Oyun yazarın puanına GERÇEKTE uyguladığı miktar (sql/16). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i rubyyard-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" rubyyard' < sql/16_oy_puan_etkisi.sql
--
-- Neden: puan 0'ın altına inmez (puanEkle kırpar). Puanı 0 olan yazara verilen eksi oy hiçbir şey düşürmez; eskiden oy
-- sonra artıya çevrilince "fark = 2" ile +2 yazılıyor, oy geri alınınca −1 düşüyordu: ortada oy yokken yazara net +1 kalıyordu.
-- Artık her oy satırı yazara uyguladığı gerçek miktarı tutar; oy değişince/geri alınınca yalnızca o miktar düzeltilir.
-- Bu sayede puan_oy ayarı sonradan değişse de geri alınan miktar, verilen miktarla aynı olur.
ALTER TABLE post_votes ADD COLUMN puan_etkisi SMALLINT NOT NULL DEFAULT 0 AFTER value;

-- Existing votes: unknown whether they were clamped, so assume they were given with that day's setting (value × puan_oy).
-- Mevcut oylar: kırpılıp kırpılmadıkları bilinmediği için o günkü ayarla verildikleri varsayılır (value × puan_oy).
UPDATE post_votes
   SET puan_etkisi = value * COALESCE((SELECT CAST(deger AS SIGNED) FROM site_settings WHERE anahtar = 'puan_oy'), 1);

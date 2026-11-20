SET NAMES utf8mb4;
-- Oyun yazarın puanına GERÇEKTE uyguladığı miktar (sql/16). Çalışan veritabanına bir kez uygulanır:
--   docker exec -i quadran-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" quadran' < sql/16_oy_puan_etkisi.sql
--
-- Neden: puan 0'ın altına inmez (puanEkle kırpar). Puanı 0 olan yazara verilen eksi oy hiçbir şey düşürmez; eskiden oy
-- sonra artıya çevrilince "fark = 2" ile +2 yazılıyor, oy geri alınınca −1 düşüyordu: ortada oy yokken yazara net +1 kalıyordu.
-- Artık her oy satırı yazara uyguladığı gerçek miktarı tutar; oy değişince/geri alınınca yalnızca o miktar düzeltilir.
-- Bu sayede puan_oy ayarı sonradan değişse de geri alınan miktar, verilen miktarla aynı olur.
ALTER TABLE post_votes ADD COLUMN puan_etkisi SMALLINT NOT NULL DEFAULT 0 AFTER value;

-- Mevcut oylar: kırpılıp kırpılmadıkları bilinmediği için o günkü ayarla verildikleri varsayılır (value × puan_oy).
UPDATE post_votes
   SET puan_etkisi = value * COALESCE((SELECT CAST(deger AS SIGNED) FROM site_settings WHERE anahtar = 'puan_oy'), 1);

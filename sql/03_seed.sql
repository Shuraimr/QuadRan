SET NAMES utf8mb4;
-- Test verileri (seed). Gerçek kullanıcılar değil, denemek için.
INSERT INTO users (username, email, password_hash, role_id) VALUES
    ('shurai', 'shurai@test.com', 'gecici', 1),
    ('ayse',   'ayse@test.com',   'gecici', 2),
    ('ahmet',  'ahmet@test.com',  'gecici', 3);

INSERT INTO categories (name, description) VALUES
    ('Genel',    'Her şeyden biraz'),
    ('Yazılım',  'Kod, araçlar, sorunlar'),
    ('Oyunlar',  'Ne oynuyorsun?');

INSERT INTO topics (category_id, user_id, title) VALUES
    (2, 1, 'Fedora''da Docker ile MySQL kurulumu'),
    (1, 3, 'Merhaba, ben yeniyim');

INSERT INTO posts (topic_id, user_id, content) VALUES
    (1, 1, 'SELinux beni benden aldı, :z ekleyince düzeldi.'),
    (1, 2, 'Hepimiz o yollardan geçtik.'),
    (2, 3, 'Selam herkese!'),
    (2, 1, 'Hoş geldin ahmet.');

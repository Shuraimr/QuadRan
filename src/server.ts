import express from "express";
import { pool } from "./db.ts";
import { onizleme } from "./onizleme.ts";

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.set("views", "views");

// public/ klasöründeki dosyalar (CSS gibi) doğrudan sunulur: /css/quadran.css
app.use(express.static("public"));

// Tasarım önizlemesi (örnek veriyle): /onizleme/konu, /onizleme/profil ...
app.use("/onizleme", onizleme);

// Bütün şablonlarda kullanılabilen yardımcı: "2 saat önce" gibi yazar
app.locals.zaman = (tarih: Date) => {
  const dakika = Math.floor((Date.now() - new Date(tarih).getTime()) / 60000);
  if (dakika < 1) return "az önce";
  if (dakika < 60) return `${dakika} dakika önce`;
  const saat = Math.floor(dakika / 60);
  if (saat < 24) return `${saat} saat önce`;
  const gun = Math.floor(saat / 24);
  if (gun === 1) return "dün";
  if (gun < 30) return `${gun} gün önce`;
  return new Date(tarih).toLocaleDateString("tr-TR");
};

app.get("/", async (req, res) => {
  // Konular: kategori adı, yazar, yazarın rütbesi, ilk mesajın özeti, yorum sayısı
  const [konular] = await pool.query(`
    SELECT topics.id, topics.title, topics.created_at,
           categories.name AS kategori,
           users.username AS yazar,
           (SELECT ranks.name FROM ranks
             WHERE ranks.min_points <= users.points
             ORDER BY ranks.min_points DESC LIMIT 1) AS rutbe,
           (SELECT posts.content FROM posts
             WHERE posts.topic_id = topics.id AND posts.deleted_at IS NULL
             ORDER BY posts.id LIMIT 1) AS ozet,
           (SELECT GREATEST(COUNT(*) - 1, 0) FROM posts
             WHERE posts.topic_id = topics.id AND posts.deleted_at IS NULL) AS yorum_sayisi
    FROM topics
    JOIN categories ON categories.id = topics.category_id
    JOIN users ON users.id = topics.user_id
    WHERE topics.deleted_at IS NULL
    ORDER BY topics.created_at DESC
  `);

  const [kategoriler] = await pool.query(
    "SELECT id, name FROM categories ORDER BY id"
  );

  const [sohbet] = await pool.query(`
    SELECT chat_messages.content, users.username AS yazar
    FROM chat_messages
    JOIN users ON users.id = chat_messages.user_id
    ORDER BY chat_messages.created_at DESC
    LIMIT 3
  `);

  const [liderler] = await pool.query(`
    SELECT users.username, users.points,
           (SELECT ranks.name FROM ranks
             WHERE ranks.min_points <= users.points
             ORDER BY ranks.min_points DESC LIMIT 1) AS rutbe
    FROM users
    WHERE users.deleted_at IS NULL
    ORDER BY users.points DESC
    LIMIT 3
  `);

  res.render("konular", { konular, kategoriler, sohbet, liderler });
});

// Hiçbir adres eşleşmezse 404 sayfası
app.use((req, res) => {
  res.status(404).render("404");
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

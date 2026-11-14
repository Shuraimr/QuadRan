import express from "express";
import { pool } from "./db.ts";

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");
app.set("views", "views");

app.get("/", async (req, res) => {
  const [konular] = await pool.query(`
    SELECT topics.id, topics.title, categories.name AS kategori,
           users.username AS yazar, topics.created_at
    FROM topics
    JOIN categories ON categories.id = topics.category_id
    JOIN users ON users.id = topics.user_id
    WHERE topics.deleted_at IS NULL
    ORDER BY topics.created_at DESC
  `);
  res.render("konular", { konular });
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

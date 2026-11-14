import express from "express";

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("QuadRan çalışıyor!");
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

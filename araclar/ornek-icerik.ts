// Sample content: adds topics, comments, photo attachments, YouTube/GitHub cards and +18 test attachments to try out the site.
//   Add:     npm run ornek
//   Remove:  npm run ornek -- --sil
// Why a separate script (not sql/NN): photo attachments need files on disk (yuklemeler/ is not in git). The script draws the images itself
// with sharp, so the same content is produced on every setup.
// It writes only as the seed users (shurai, ayse, ahmet); it writes NO points rows (so the rule points = points_log total is not broken).
// Removal is done by topic titles: no topic outside the list below is touched.
// The +18 test attachments are NOT real explicit content: they are plain images that say "+18 TEST"; only for trying the flag/blur flow.
// Örnek içerik: siteyi denemek için konular, yorumlar, fotoğraf ekleri, YouTube/GitHub kartları ve +18 deneme ekleri ekler.
//   Ekle:  npm run ornek
//   Sil:   npm run ornek -- --sil
// Neden ayrı betik (sql/NN değil): fotoğraf ekleri diskte dosya ister (yuklemeler/ git'e girmez). Betik resimleri sharp ile
// kendisi çizer, böylece her kurulumda aynı içerik üretilir.
// Yalnızca seed kullanıcıları (shurai, ayse, ahmet) yazar; puan satırı YAZILMAZ (puan = points_log toplamı kuralı bozulmasın).
// Silme konu başlıklarıyla yapılır: aşağıdaki listede olmayan hiçbir konuya dokunulmaz.
// +18 deneme ekleri gerçek müstehcen içerik DEĞİL: "+18 TEST" yazılı düz görsellerdir; yalnızca işaret/bulanıklık akışını denemek için.
import { randomUUID } from "node:crypto";
import { mkdir, unlink, stat } from "node:fs/promises";
import sharp from "sharp";
import { pool } from "../src/db.ts";
// Same directory/address as src/yukleme.ts (that file is not imported: it loaded multer/rate limiter etc. and kept the process open)
// src/yukleme.ts ile aynı dizin/adres (o dosya içe aktarılmaz: multer/hız sınırı vb. yükleyip süreci açık tutuyordu)
const YUKLEME_DIZINI = "yuklemeler", YUKLEME_ADRESI = "/yuklemeler";

const RICK = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

// Simple landscape drawing (SVG → WebP): sky, sun, two rows of mountains. Colors vary per image.
// Basit manzara çizimi (SVG → WebP): gökyüzü, güneş, iki sıra dağ. Renkler resim başına değişir.
function manzara(gok: [string, string], dag: [string, string], gunes: string, yazi = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gok[0]}"/><stop offset="1" stop-color="${gok[1]}"/></linearGradient></defs>
    <rect width="1600" height="1000" fill="url(#g)"/>
    <circle cx="1150" cy="330" r="110" fill="${gunes}" opacity=".9"/>
    <path d="M0 700 L260 430 L470 620 L720 360 L980 640 L1230 420 L1600 690 V1000 H0Z" fill="${dag[0]}"/>
    <path d="M0 820 L340 610 L640 800 L940 590 L1300 820 L1600 700 V1000 H0Z" fill="${dag[1]}"/>
    ${yazi ? `<text x="800" y="540" font-family="sans-serif" font-size="150" font-weight="700" fill="#fff" text-anchor="middle">${yazi}</text>` : ""}
  </svg>`;
}

const RESIMLER: Record<string, string> = {
  sabah: manzara(["#9ec9ff", "#ffe2b8"], ["#5b6f8f", "#2f3d55"], "#fff3c4"),
  gunbatimi: manzara(["#ff9a6b", "#5a2d6e"], ["#4a2a4f", "#21152b"], "#ffd27a"),
  gece: manzara(["#0b1430", "#28406e"], ["#1b2440", "#0c1122"], "#e9eefc"),
  masaustu: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#1d2230"/>
    <rect x="0" y="0" width="1600" height="48" fill="#11141c"/><rect x="80" y="110" width="860" height="560" rx="14" fill="#272d3d"/>
    <rect x="80" y="110" width="860" height="44" rx="14" fill="#31384b"/><rect x="1000" y="110" width="520" height="760" rx="14" fill="#272d3d"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="110" y="${190 + i * 38}" width="${300 + ((i * 137) % 480)}" height="14" rx="7" fill="${["#7aa2f7", "#9ece6a", "#bb9af7", "#e0af68"][i % 4]}" opacity=".85"/>`).join("")}
    ${Array.from({ length: 8 }, (_, i) => `<rect x="1030" y="${150 + i * 84}" width="460" height="60" rx="10" fill="#31384b"/>`).join("")}</svg>`,
  test18a: manzara(["#d43c3c", "#5c1010"], ["#7a1c1c", "#3d0b0b"], "#ffb3b3", "+18 TEST"),
  test18b: manzara(["#7a3cd4", "#24105c"], ["#3f1c7a", "#1c0b3d"], "#d9c2ff", "+18 TEST"),
};

type Yorum = { yazar: string; metin: string; resimler?: string[]; nsfw?: "yazar" | "yetkili"; gunOnce: number };
type Konu = { kategori: string; yazar: string; baslik: string; metin: string; gunOnce: number; yorumlar: Yorum[] };

const KONULAR: Konu[] = [
  {
    kategori: "Genel", yazar: "ayse", baslik: "Bu klibi izlemeyen kalmasın, efsane bir şarkı", gunOnce: 6,
    metin: `Dün gece rastladım, sözleri çok anlamlı. Herkes bir kez dinlemeli:\n${RICK}`,
    yorumlar: [
      { yazar: "ahmet", metin: "Açtım ve... ayse bunu bana neden yaptın 😐", gunOnce: 6 },
      { yazar: "shurai", metin: "Klasik. Ben de karşılığını vereyim, bu çok daha iyi bir sürüm:\nhttps://youtu.be/dQw4w9WgXcQ", gunOnce: 5 },
      { yazar: "ayse", metin: "Never gonna give you up 🎶 Kısası da var: https://www.youtube.com/shorts/dQw4w9WgXcQ", gunOnce: 5 },
    ],
  },
  {
    kategori: "Yazılım", yazar: "shurai", baslik: "En sevdiğiniz açık kaynak projeler hangileri?", gunOnce: 5,
    metin: "Ben rubyyard'ı yazarken çok şey öğrendiğim projeleri paylaşayım, siz de ekleyin. Express 5 çıkınca geçtim, async hataları artık kendisi yakalıyor:\nhttps://github.com/expressjs/express",
    yorumlar: [
      { yazar: "ahmet", metin: "Çekirdek dururken başka proje mi olur 🙂\nhttps://github.com/torvalds/linux", gunOnce: 4 },
      { yazar: "ayse", metin: "Resim işlerinde sharp'a bayılıyorum, hem hızlı hem EXIF'i temizlemek tek satır:\nhttps://github.com/lovell/sharp", gunOnce: 4 },
      { yazar: "shurai", metin: "Node'un TypeScript'i doğrudan çalıştırması da hayat kurtardı, derleme adımı yok:\nhttps://github.com/nodejs/node", gunOnce: 3 },
    ],
  },
  {
    kategori: "Genel", yazar: "ahmet", baslik: "Hafta sonu çektiğim manzaralar", gunOnce: 4,
    metin: "Telefonla çektim, filtre yok. Hangisini duvar kâğıdı yapayım?",
    yorumlar: [
      { yazar: "ahmet", metin: "Sabah, gün batımı ve gece:", resimler: ["sabah", "gunbatimi", "gece"], gunOnce: 4 },
      { yazar: "ayse", metin: "Gün batımı açık ara! Renkler harika.", gunOnce: 3 },
      { yazar: "shurai", metin: "Gece olanı alıyorum, koyu temaya çok yakışıyor 🌙", resimler: ["gece"], gunOnce: 3 },
    ],
  },
  {
    kategori: "Yazılım", yazar: "ayse", baslik: "Yeni masaüstü düzenim (Fedora + tiling)", gunOnce: 3,
    metin: "Sonunda kafama göre bir düzen kurdum. Ayar dosyalarını da paylaşırım isteyen olursa.",
    yorumlar: [
      { yazar: "ayse", metin: "Ekran görüntüsü:", resimler: ["masaustu"], gunOnce: 3 },
      { yazar: "ahmet", metin: "Renk şeması tokyo night mı? Çok temiz.", gunOnce: 2 },
      { yazar: "ayse", metin: "Evet 🙂 Bu arada bir sorum var, nedenini bilen var mı? Ayrıntı burada: " + RICK, gunOnce: 2 },
      { yazar: "ahmet", metin: "Tıklamıyorum artık 😂 Bağlantı önizlemesinden belli oluyor.", gunOnce: 2 },
    ],
  },
  {
    kategori: "Genel", yazar: "shurai", baslik: "[TEST] +18 içerik işareti ve bulanıklaştırma denemesi", gunOnce: 2,
    metin: "Bu konu yalnızca deneme içindir. Aşağıdaki görseller müstehcen DEĞİL, yalnızca \"+18 TEST\" yazılı düz görsellerdir. Ayarlar › Görünüm › +18 içerik ile Gizle / Bulanık / Göster arasında geçip farkı görebilirsiniz.",
    yorumlar: [
      { yazar: "ahmet", metin: "Yazarın kendisi +18 işaretledi:", resimler: ["test18a"], nsfw: "yazar", gunOnce: 2 },
      { yazar: "ayse", metin: "Bunu yetkili (moderatör) sonradan işaretledi:", resimler: ["test18b", "gunbatimi"], nsfw: "yetkili", gunOnce: 1 },
      { yazar: "shurai", metin: "İşaretsiz karşılaştırma görseli:", resimler: ["sabah"], gunOnce: 1 },
    ],
  },
  {
    kategori: "Oyunlar", yazar: "ahmet", baslik: "Bu ara ne oynuyorsunuz?", gunOnce: 1,
    metin: "Ben yine eski bir RPG'ye döndüm, bitiremedim bir türlü. Siz?",
    yorumlar: [
      { yazar: "ayse", metin: "Arkadaşlarla co-op hayatta kalma oyunu, her akşam ayrı bir felaket 😅", gunOnce: 1 },
      { yazar: "shurai", metin: "rubyyard'a çok oyunculu oyunlar gelince burada oynarız 👀", gunOnce: 0 },
      { yazar: "ayse", metin: "O zaman ilk turnuvanın ödülü belli: " + RICK, gunOnce: 0 },
    ],
  },
];

async function idler() {
  const [satirlar]: any = await pool.query("SELECT id, username FROM users WHERE username IN ('shurai','ayse','ahmet')");
  const [kat]: any = await pool.query("SELECT id, name FROM categories");
  return {
    kullanici: Object.fromEntries(satirlar.map((s: any) => [s.username, s.id])) as Record<string, number>,
    kategori: Object.fromEntries(kat.map((k: any) => [k.name, k.id])) as Record<string, number>,
  };
}

async function sil() {
  const basliklar = KONULAR.map((k) => k.baslik);
  const [konular]: any = await pool.query("SELECT id FROM topics WHERE title IN (?)", [basliklar]);
  if (!konular.length) return console.log("Silinecek örnek içerik yok.");
  const ids = konular.map((k: any) => k.id);
  const [ekler]: any = await pool.query("SELECT e.adres FROM ekler e JOIN posts p ON p.id = e.post_id WHERE p.topic_id IN (?)", [ids]);
  for (const e of ekler) await unlink(YUKLEME_DIZINI + "/" + e.adres.split("/").pop()).catch(() => {});
  await pool.query("DELETE FROM ekler WHERE post_id IN (SELECT id FROM posts WHERE topic_id IN (?))", [ids]);
  await pool.query("DELETE FROM posts WHERE topic_id IN (?)", [ids]);
  await pool.query("DELETE FROM topics WHERE id IN (?)", [ids]);
  await pool.query("DELETE FROM chat_messages WHERE content = ? AND user_id = (SELECT id FROM users WHERE username = 'ayse')",
    ["Herkese güzel bir şarkı önerim var: " + RICK]);
  console.log(`${ids.length} örnek konu, yorumları ve ${ekler.length} eki silindi.`);
}

async function ekle() {
  const [var_]: any = await pool.query("SELECT COUNT(*) AS n FROM topics WHERE title IN (?)", [KONULAR.map((k) => k.baslik)]);
  if (Number(var_[0].n)) return console.log("Örnek içerik zaten var. Yeniden eklemek için önce: npm run ornek -- --sil");
  const { kullanici, kategori } = await idler();
  await mkdir(YUKLEME_DIZINI, { recursive: true });

  // Makes a separate file for the same image every time it is attached (delete/remove works per attachment)
  // Aynı resmi her eklendiği yerde ayrı dosya yapar (silme/kaldırma eke göre çalışıyor)
  async function resimYaz(ad: string) {
    const dosya = randomUUID() + ".webp";
    const bilgi = await sharp(Buffer.from(RESIMLER[ad])).webp({ quality: 82 }).toFile(YUKLEME_DIZINI + "/" + dosya);
    return { adres: YUKLEME_ADRESI + "/" + dosya, genislik: bilgi.width, yukseklik: bilgi.height, boyut: (await stat(YUKLEME_DIZINI + "/" + dosya)).size };
  }
  const zaman = (gun: number, dakika: number) => new Date(Date.now() - gun * 86400000 - dakika * 60000);

  let yorumSayisi = 0, ekSayisi = 0;
  for (const k of KONULAR) {
    const [t]: any = await pool.query("INSERT INTO topics (category_id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
      [kategori[k.kategori], kullanici[k.yazar], k.baslik, zaman(k.gunOnce, 600)]);
    await pool.query("INSERT INTO posts (topic_id, user_id, content, created_at) VALUES (?, ?, ?, ?)",
      [t.insertId, kullanici[k.yazar], k.metin, zaman(k.gunOnce, 600)]);
    let dk = 540;
    for (const y of k.yorumlar) {
      const [p]: any = await pool.query("INSERT INTO posts (topic_id, user_id, content, created_at) VALUES (?, ?, ?, ?)",
        [t.insertId, kullanici[y.yazar], y.metin, zaman(y.gunOnce, (dk -= 45))]);
      yorumSayisi++;
      for (const [i, ad] of (y.resimler ?? []).entries()) {
        const r = await resimYaz(ad);
        // the "yetkili" (staff) flag only on the first attachment (as if a moderator flagged just one attachment); the "yazar" (author) flag on all attachments
        // "yetkili" işareti yalnızca ilk eke (moderatör tek bir eki işaretlemiş gibi); "yazar" işareti bütün eklere
        const nsfw = y.nsfw === "yazar" || (y.nsfw === "yetkili" && i === 0) ? 1 : 0;
        await pool.query(
          "INSERT INTO ekler (post_id, user_id, tur, adres, genislik, yukseklik, boyut, sira, nsfw, nsfw_kim) VALUES (?, ?, 'resim', ?, ?, ?, ?, ?, ?, ?)",
          [p.insertId, kullanici[y.yazar], r.adres, r.genislik, r.yukseklik, r.boyut, i, nsfw, nsfw ? y.nsfw : null]);
        ekSayisi++;
      }
    }
  }
  // One in the general chat too 🙂
  // Genel sohbete de bir tane 🙂
  await pool.query("INSERT INTO chat_messages (user_id, content) VALUES (?, ?)", [kullanici.ayse, "Herkese güzel bir şarkı önerim var: " + RICK]);
  console.log(`${KONULAR.length} konu, ${yorumSayisi} yorum, ${ekSayisi} fotoğraf eki ve 1 sohbet mesajı eklendi.`);
}

try {
  if (process.argv.includes("--sil")) await sil(); else await ekle();
} finally {
  await pool.end();
  // so that a lingering handle (sharp worker threads etc.) does not keep the script waiting
  // açık kalan bir tutamak (sharp iş parçacıkları vb.) betiği bekletmesin
  process.exit(0);
}

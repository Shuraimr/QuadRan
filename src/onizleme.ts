// Design preview: shows templates with SAMPLE data, does not touch the database.
// As the real pages get written, this file and the "/onizleme" line in server.ts can be deleted.
// Addresses: /onizleme/konu  /giris  /kayit  /konu-yeni  /profil  /ayarlar  /404
// For the signed-in view add ?uye=1 at the end, to try a theme add ?tema=acik&vurgu=zumrut.
// Tasarım önizlemesi: şablonları ÖRNEK veriyle gösterir, veritabanına dokunmaz.
// Gerçek sayfalar yazıldıkça bu dosya ve server.ts'deki "/onizleme" satırı silinebilir.
// Adresler: /onizleme/konu  /giris  /kayit  /konu-yeni  /profil  /ayarlar  /404
// Giriş yapmış görünüm için sonuna ?uye=1, tema denemek için ?tema=acik&vurgu=zumrut ekle.
import express from "express";
import { rutbeler, rutbeBul, sonrakiRutbe, acilanlar, kilitBilgisi } from "./rutbe.ts";

export const onizleme = express.Router();

const saatOnce = (s: number) => new Date(Date.now() - s * 3600 * 1000);
const kartlar = [
  { id: 1, title: "Fedora’da SELinux açıkken Docker volume izin hatası nasıl çözülür?", kategori: "Yazılım", yazar: "shurai", rutbe: "Usta", created_at: saatOnce(2), ozet: "Volume’u bağladım ama container dosyaları okuyamıyor. :z etiketini ekleyince düzeldi, tam olarak ne yapıyor?", yorum_sayisi: 3, skor: 342 },
  { id: 2, title: "rubyyard’a hoş geldiniz: kurallar ve ilk adımlar", kategori: "Genel", yazar: "shurai", rutbe: "Usta", created_at: saatOnce(72), ozet: "Forumu birlikte büyütüyoruz. Konu açmadan önce kategorilere ve oy sistemine göz atın.", yorum_sayisi: 41, skor: 128 },
];

onizleme.use((req, res, next) => {
  res.locals.kullanici = req.query.uye ? { username: "shurai", rutbe: "Usta", points: 640, rol: "admin" } : null;
  res.locals.tema = req.query.tema || "koyu";
  res.locals.vurgu = req.query.vurgu || "safir";
  next();
});

onizleme.get("/konu", (req, res) => {
  res.render("konu", {
    konu: { id: 1, title: kartlar[0].title, kategori: "Yazılım", created_at: saatOnce(2), duzenlendi: true, yazar: "shurai", rutbe: "Usta", puan: 640, konu_sayisi: 24 },
    mesajlar: [
      { id: 1, yazar: "shurai", rutbe: "Usta", created_at: saatOnce(2), deleted_at: null, skor: 343, benim_oyum: 1, content: "Volume’u compose dosyasında bağladım ama container içinden dosyalar okunamıyor. Loglarda “Permission denied” görüyorum, dosya izinleri ise doğru görünüyor.\n\nSonuna :z etiketini ekleyince düzeldi:\n\n  volumes:\n    - ./sql:/docker-entrypoint-initdb.d:z\n\nÇalışıyor ama tam olarak ne yaptığını anlamadım. :z ile :Z arasındaki fark ne?" },
      { id: 2, yazar: "ayse", rutbe: "Müdavim", created_at: saatOnce(1), deleted_at: null, skor: 58, benim_oyum: 1, content: ":z etiketi klasörü SELinux’ta “paylaşılan container içeriği” olarak işaretler, birden fazla container okuyabilir. :Z ise sadece o container’a özel yapar." },
      { id: 3, yazar: "shurai", rutbe: "Usta", created_at: saatOnce(0.9), deleted_at: null, skor: 12, benim_oyum: 0, konu_sahibi: true, content: "Çok net oldu, teşekkürler." },
      { id: 4, yazar: "x", created_at: saatOnce(0.5), deleted_at: new Date(), content: "" },
      { id: 5, yazar: "ahmet", rutbe: "Çaylak", created_at: saatOnce(0.3), deleted_at: null, skor: -3, benim_oyum: -1, content: "SELinux’u kapatsan daha kolay olmaz mı?" },
    ],
    benzerler: [{ id: 7, title: "mycli ile sorgu geçmişi nasıl tutulur?", skor: 96 }, { id: 8, title: "Node 22’de TypeScript’i doğrudan çalıştırmak", skor: 71 }],
  });
});

onizleme.get("/giris", (req, res) => res.render("giris", { not: "Oy vermek için giriş yapman gerekiyor. Girişten sonra kaldığın konuya döneceksin." }));

onizleme.get("/kayit", (req, res) => res.render("kayit", {
  hatalar: { username: "Bu kullanıcı adı alınmış. Başka bir ad dene.", password: "Zayıf: en az 8 karakter olmalı" },
  degerler: { username: "ahmet", email: "ahmet@ornek.com" },
}));

onizleme.get("/konu-yeni", (req, res) => res.render("konu-yeni", {
  kategoriler: [{ id: 1, name: "Genel" }, { id: 2, name: "Yazılım" }, { id: 3, name: "Donanım" }],
  degerler: { category_id: 2, title: kartlar[0].title },
}));

onizleme.get("/profil", async (req, res) => {
  const tum = await rutbeler();
  const simdiki = rutbeBul(640, tum)!, sonraki = sonrakiRutbe(640, tum);
  res.render("profil", {
  simdiki, sonraki, acilacaklar: sonraki ? acilanlar(simdiki, sonraki) : [], puanGecmisi: [],
  profil: { username: "shurai", bio: "Bilgisayar programcılığı öğrencisi. Linux, tasarım ve iyi düzenlenmiş tartışmalar sever.", avatar_url: null, banner_url: null, rol: "Admin", created_at: new Date("2026-11-13"), points: 640, rutbe: "Usta", konu_sayisi: 24, mesaj_sayisi: 186, alinan_oy: 1204 },
  rutbeler: tum,
  konular: kartlar,
  rozetler: [{ name: "Kurucu" }, { name: "İlk konu" }, { name: "100 oy" }],
  haftalik: [["Pzt", 2], ["Sal", 0], ["Çar", 5], ["Per", 2], ["Cum", 9], ["Cmt", 9], ["Paz", 0]].map(([gun, sayi]) => ({ gun, sayi, bugun: gun === "Cmt" })),
  kendisi: !!req.query.uye,
  });
});

onizleme.get("/ayarlar", (req, res) => {
  res.locals.kullanici = { username: "shurai", rutbe: "Usta", points: 640, rol: "admin" };
  res.render("ayarlar", { ayar: { username: "shurai", bio: "Bilgisayar programcılığı öğrencisi.", email: "shurai@ornek.com", avatar_url: null, tema: res.locals.tema, vurgu: res.locals.vurgu, menu_sagda: false, kompakt: false, az_animasyon: true }, imzaKilit: kilitBilgisi(res.locals.kullanici, "imza") });
});

onizleme.get("/404", (req, res) => res.status(404).render("durum", { kod: 404 }));

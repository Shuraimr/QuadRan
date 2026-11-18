// Katmanlar önizlemesi: arama, bildirimler, menüler, şikâyet ve bildirim çubukları ÖRNEK veriyle.
// /onizleme altına bağlanınca adres: /onizleme/katmanlar
// Deneme: ?tema=acik&vurgu=zumrut&menu=sag
import express from "express";

export const katmanlar = express.Router();

const saatOnce = (s: number) => new Date(Date.now() - s * 3600 * 1000);

katmanlar.get("/katmanlar", (req, res) => {
  res.locals.tema = req.query.tema || "koyu";
  res.locals.vurgu = req.query.vurgu || "safir";
  res.locals.menuYonu = req.query.menu === "sag" ? "sag" : "sol";
  res.locals.kullanici = { username: "shurai", rutbe: "Usta", points: 640, rol: "admin" };
  res.locals.okunmamisBildirim = 2;
  res.locals.okunmamisMesaj = 3;
  res.locals.bildirimler = [
    { avatar_harf: "A", metin: "ayse konuna cevap yazdı: “:z etiketi klasörü…”", zaman: saatOnce(1), okunmadi: true, link: "/konu/1#mesaj-2" },
    { avatar_harf: "Q", metin: "Konun 100 oy aldı: “100 oy” rozetini kazandın.", zaman: saatOnce(3), okunmadi: true, link: "/profil/shurai" },
    { avatar_harf: "A", metin: "ahmet sana özel mesaj gönderdi", zaman: saatOnce(26), okunmadi: false, link: "/mesajlar" },
  ];
  res.locals.bildirim = { tur: "basari", metin: "Cevabın yayınlandı", eylem: { metin: "Görüntüle", link: "/konu/1#mesaj-3" } };
  res.locals.aramaOrnek = {
    sorgu: "selinux",
    konular: [
      { id: 1, baslik: "Fedora’da SELinux açıkken Docker volume izin hatası", kategori: "Yazılım", oy: 342 },
      { id: 9, baslik: "SELinux’u kapatmadan Adminer nasıl çalışır?", kategori: "Yazılım", oy: 18 },
    ],
    kullanicilar: [{ username: "selin_ux", rutbe: "Çaylak" }],
    kategoriler: [{ id: 2, ad: "Yazılım", konu_sayisi: 214 }],
  };
  res.render("katmanlar-onizleme", { baslik: "Katmanlar", aktifMenu: "akis" });
});

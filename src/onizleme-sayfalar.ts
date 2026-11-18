// Önizleme: mesajlar, bildirimler, ara, sıralama, sohbet, moderasyon, şifremi unuttum.
// ÖRNEK veri kullanır, veritabanına dokunmaz. /onizleme altına bağlanır (server.ts'de).
// Adresler: /onizleme/mesajlar  /mesajlar/ayse  /bildirimler  /ara?q=selinux  /siralama  /sohbet  /moderasyon  /sifremi-unuttum
// Ortak ekler: ?misafir=1 (çıkış yapmış görünüm), ?bos=1 (boş durum), ?tema=acik&vurgu=zumrut
import express from "express";

export const sayfalar = express.Router();

// ---------- Yardımcılar ----------
const dakikaOnce = (d: number) => new Date(Date.now() - d * 60 * 1000);
const saatOnce = (s: number) => dakikaOnce(s * 60);
// "gun" gün önce, saat:dakika (yerel). Bugün için dakikaOnce kullan: gelecekte kalmasın
const gunSaat = (gun: number, saat: number, dk = 0) => {
  const t = new Date();
  t.setDate(t.getDate() - gun);
  t.setHours(saat, dk, 0, 0);
  return t;
};
const rutbeHesapla = (puan: number) => (puan >= 2000 ? "Efsane" : puan >= 500 ? "Usta" : puan >= 100 ? "Müdavim" : "Çaylak");
const rutbeler = [
  { name: "Çaylak", min_points: 0 },
  { name: "Müdavim", min_points: 100 },
  { name: "Usta", min_points: 500 },
  { name: "Efsane", min_points: 2000 },
];
const dizge = (v: unknown, varsayilan = "") => (typeof v === "string" ? v : varsayilan);

sayfalar.use((req, res, next) => {
  res.locals.kullanici = req.query.misafir ? null : { username: "shurai", rutbe: "Usta", points: 640, rol: "admin" };
  res.locals.tema = dizge(req.query.tema, "koyu");
  res.locals.vurgu = dizge(req.query.vurgu, "safir");
  next();
});

// ---------- /mesajlar ----------
const konusmaVerisi = [
  { kullanici: "ayse", rutbe: "Müdavim", son_mesaj: "Tamamdır, yarın laboratuvarda konuşuruz.", son_zaman: dakikaOnce(12), okunmamis: 2, son_benden: false },
  { kullanici: "ahmet", rutbe: "Çaylak", son_mesaj: "Fedora kurulumunda wifi sürücüsü çıkmadı, bakabilir misin?", son_zaman: dakikaOnce(95), okunmamis: 1, son_benden: false },
  { kullanici: "mert", rutbe: "Usta", son_mesaj: "Ryzen 5 5600 + B550 olursa iş görür.", son_zaman: gunSaat(1, 21, 40), okunmamis: 0, son_benden: true },
  { kullanici: "zeynep", rutbe: "Usta", son_mesaj: "Figma dosyasını paylaştım, yorumlarını bekliyorum.", son_zaman: gunSaat(4, 15, 5), okunmamis: 0, son_benden: false },
  { kullanici: "elif", rutbe: "Müdavim", son_mesaj: "Teşekkürler!", son_zaman: gunSaat(12, 9, 30), okunmamis: 0, son_benden: false },
];

const konusmaGecmisi = (kullanici: string) => {
  const m = (id: number, benim: boolean, content: string, created_at: Date, read_at: Date | null = null) => ({ id, benim, content, created_at, read_at });
  if (kullanici === "ayse") {
    return [
      m(1, false, "Selam, SELinux konusuna cevap yazdım, baktın mı?", gunSaat(1, 20, 14)),
      m(2, true, "Baktım, çok işime yaradı. audit2allow kısmını ilk kez duydum.", gunSaat(1, 20, 20), gunSaat(1, 20, 22)),
      m(3, true, "Okulda Apache denerken de aynı hatayı almıştım.", gunSaat(1, 20, 21), gunSaat(1, 20, 22)),
      m(4, false, "Güzel, enforcing modunu kapatmadan çözmek en doğrusu.", gunSaat(1, 20, 30)),
      m(5, false, "Yarın ödev teslim günü, hazır mısın?", dakikaOnce(50)),
      m(6, true, "Neredeyse. Docker compose dosyasında bir volume hatası kaldı, :z ekleyince düzeldi.", dakikaOnce(40), dakikaOnce(30)),
      m(7, false, "Tamamdır, yarın laboratuvarda konuşuruz.", dakikaOnce(12)),
    ];
  }
  if (kullanici === "ahmet") {
    return [
      m(1, false, "Merhaba, yeni başladım. Fedora kurulumunda wifi sürücüsü çıkmadı, bakabilir misin?", dakikaOnce(95)),
    ];
  }
  if (kullanici === "mert") {
    return [
      m(1, true, "Bütçem 20 bin TL, oyun ve biraz Blender için hangi işlemci?", gunSaat(1, 21, 30), gunSaat(1, 21, 38)),
      m(2, false, "Ryzen 5 5600 + B550 olursa iş görür.", gunSaat(1, 21, 40)),
      m(3, true, "Ekran kartını sonra ekleyeceğim, teşekkürler.", gunSaat(1, 21, 41)),
    ];
  }
  return [];
};

const mesajlarSayfasi = (req: express.Request, res: express.Response) => {
  const bos = !!req.query.bos;
  const q = dizge(req.query.q).trim();
  let konusmalar = bos ? [] : konusmaVerisi;
  if (q) konusmalar = konusmalar.filter((k) => k.kullanici.includes(q.toLowerCase()));
  const kisi = req.params.kullanici as string | undefined;
  const bilinen = konusmaVerisi.find((k) => k.kullanici === kisi);
  const acik = kisi
    ? { kullanici: kisi, rutbe: bilinen?.rutbe ?? "Çaylak", mesajlar: bos ? [] : konusmaGecmisi(kisi) }
    : null;
  res.render("mesajlar", { aktifMenu: "mesajlar", q, konusmalar, acik });
};
sayfalar.get("/mesajlar", mesajlarSayfasi);
sayfalar.get("/mesajlar/:kullanici", mesajlarSayfasi);

// ---------- /bildirimler ----------
sayfalar.get("/bildirimler", (req, res) => {
  const t = (tur: string, kisi: string | null, metin: string, link: string, created_at: Date, okundu: boolean) =>
    ({ tur, kisi, metin, link, created_at, read_at: okundu ? created_at : null });
  const hepsi = [
    t("cevap", "ayse", "ayse, “Fedora’da SELinux açıkken Docker volume izin hatası” konunuza cevap yazdı.", "/konu/1", dakikaOnce(14), false),
    t("oy", "mert", "mert, “QuadRan’a hoş geldiniz” konunuzu beğendi.", "/konu/2", dakikaOnce(70), false),
    t("mesaj", "ahmet", "ahmet sana yeni bir mesaj gönderdi.", "/mesajlar/ahmet", dakikaOnce(95), false),
    t("rozet", null, "Yeni rozet kazandın: “100 oy”.", "/profil/shurai", saatOnce(5), true),
    t("cevap", "zeynep", "zeynep, “Node 22’de TypeScript’i doğrudan çalıştırmak” konusunda sana cevap verdi.", "/konu/8", gunSaat(2, 18, 20), true),
    t("moderasyon", null, "Bir şikâyetin incelendi: mesaj kaldırıldı.", "/moderasyon", gunSaat(4, 11, 0), true),
    t("oy", "elif", "elif, cevabını beğendi.", "/konu/7", gunSaat(5, 22, 10), true),
    t("rozet", null, "Yeni rozet kazandın: “İlk konu”.", "/profil/shurai", gunSaat(12, 14, 0), true),
    t("mesaj", "mert", "mert sana yeni bir mesaj gönderdi.", "/mesajlar/mert", gunSaat(15, 21, 40), true),
  ];
  const filtre = dizge(req.query.filtre) === "okunmamis" ? "okunmamis" : "hepsi";
  const bos = !!req.query.bos;
  let bildirimler = bos ? [] : hepsi;
  if (filtre === "okunmamis") bildirimler = bildirimler.filter((b) => !b.read_at);
  res.render("bildirimler", { aktifMenu: "bildirimler", filtre, okunmamis_sayisi: bos ? 0 : hepsi.filter((b) => !b.read_at).length, bildirimler });
});

// ---------- /ara ----------
const aramaKonulari = [
  { id: 1, title: "Fedora’da SELinux açıkken Docker volume izin hatası nasıl çözülür?", kategori: "Yazılım", yazar: "shurai", rutbe: "Usta", created_at: saatOnce(2), ozet: "Volume’u bağladım ama container dosyaları okuyamıyor. :z etiketini ekleyince düzeldi, tam olarak ne yapıyor?", yorum_sayisi: 3, skor: 342 },
  { id: 11, title: "SELinux’u kapatmak yerine politika nasıl yazılır? audit2allow rehberi", kategori: "Yazılım", yazar: "ayse", rutbe: "Müdavim", created_at: saatOnce(30), ozet: "Her hatada setenforce 0 yazmak yerine kendi modülünü üretmenin adımları.", yorum_sayisi: 12, skor: 87 },
  { id: 12, title: "Okul laboratuvarında SELinux enforcing modunda Apache açılmıyor", kategori: "Okul", yazar: "ahmet", rutbe: "Çaylak", created_at: saatOnce(120), ozet: "Document root’u /home altına taşıdım, 403 alıyorum. httpd_sys_content_t etiketi gerekiyor mu?", yorum_sayisi: 5, skor: 14 },
  { id: 13, title: "Ryzen 5 5600 için hangi anakart alınmalı?", kategori: "Donanım", yazar: "mert", rutbe: "Usta", created_at: saatOnce(50), ozet: "B450, B550 ve A520 arasındaki farklar, fiyat performans karşılaştırması.", yorum_sayisi: 19, skor: 64 },
  { id: 14, title: "Minecraft sunucusunu Docker ile ayağa kaldırma", kategori: "Oyun", yazar: "zeynep", rutbe: "Usta", created_at: saatOnce(200), ozet: "Paper sunucusu, volume ile dünya yedeği ve RAM sınırı ayarı.", yorum_sayisi: 8, skor: 41 },
  { id: 8, title: "Node 22’de TypeScript’i doğrudan çalıştırmak", kategori: "Yazılım", yazar: "zeynep", rutbe: "Usta", created_at: saatOnce(300), ozet: "Derleme adımı olmadan .ts dosyasını çalıştırmanın sınırları.", yorum_sayisi: 22, skor: 71 },
];
const aramaKullanicilari = [
  { username: "shurai", rutbe: "Usta", points: 640, konu_sayisi: 24, bio: "Bilgisayar programcılığı öğrencisi." },
  { username: "ayse", rutbe: "Müdavim", points: 310, konu_sayisi: 9, bio: "Linux ve ağ meraklısı." },
  { username: "ahmet", rutbe: "Çaylak", points: 45, konu_sayisi: 2, bio: "" },
  { username: "selinuxcu", rutbe: "Müdavim", points: 220, konu_sayisi: 6, bio: "Etiketler, bağlamlar, politikalar." },
  { username: "mert", rutbe: "Usta", points: 905, konu_sayisi: 31, bio: "Donanım ve oyun." },
  { username: "zeynep", rutbe: "Usta", points: 1180, konu_sayisi: 40, bio: "Arayüz tasarımı ve Node." },
];
const aramaKategorileri = [
  { id: 1, name: "Genel", konu_sayisi: 58 },
  { id: 2, name: "Yazılım", konu_sayisi: 143 },
  { id: 3, name: "Donanım", konu_sayisi: 76 },
  { id: 4, name: "Oyun", konu_sayisi: 64 },
  { id: 5, name: "Okul", konu_sayisi: 39 },
];

sayfalar.get("/ara", (req, res) => {
  const q = dizge(req.query.q, "selinux").trim();
  const kucuk = q.toLocaleLowerCase("tr-TR");
  const esles = (s: string) => s.toLocaleLowerCase("tr-TR").includes(kucuk);
  const bos = !!req.query.bos;
  const konular = bos || !q ? [] : aramaKonulari.filter((k) => esles(k.title));
  const kullanicilar = bos || !q ? [] : aramaKullanicilari.filter((u) => esles(u.username));
  const kategoriler = bos || !q ? [] : aramaKategorileri.filter((c) => esles(c.name));
  const sekmeler = ["konular", "kullanicilar", "kategoriler"];
  const sekme = sekmeler.includes(dizge(req.query.sekme)) ? dizge(req.query.sekme) : "konular";
  res.render("ara", {
    aktifMenu: "ara",
    q,
    sekme,
    sayilar: { konular: konular.length, kullanicilar: kullanicilar.length, kategoriler: kategoriler.length },
    konular,
    kullanicilar,
    kategoriler,
  });
});

// ---------- /siralama ----------
const siralamaVerisi: Record<string, Array<[string, number, number, number]>> = {
  // [kullanıcı, dönem puanı, konu sayısı, toplam puan]
  tum: [["kernelkadir", 2140, 88, 2140], ["zeynep", 1180, 40, 1180], ["mert", 905, 31, 905], ["shurai", 640, 24, 640], ["can", 512, 17, 512], ["ayse", 310, 9, 310], ["selinuxcu", 220, 6, 220], ["elif", 188, 5, 188], ["ahmet", 45, 2, 45]],
  ay: [["zeynep", 214, 7, 1180], ["shurai", 190, 6, 640], ["mert", 166, 5, 905], ["ayse", 120, 3, 310], ["can", 97, 2, 512], ["kernelkadir", 80, 2, 2140], ["elif", 54, 1, 188], ["ahmet", 25, 1, 45]],
  hafta: [["mert", 66, 2, 905], ["zeynep", 52, 1, 1180], ["ayse", 48, 1, 310], ["shurai", 44, 2, 640], ["ahmet", 20, 1, 45], ["can", 12, 0, 512]],
};

sayfalar.get("/siralama", (req, res) => {
  const d = dizge(req.query.donem);
  const donem = d === "hafta" || d === "ay" ? d : "tum";
  const bos = !!req.query.bos;
  const liste = bos ? [] : siralamaVerisi[donem].map(([username, puan, konu_sayisi, toplam], i) => ({ sira: i + 1, username, rutbe: rutbeHesapla(toplam), puan, konu_sayisi }));
  const benim = res.locals.kullanici ? liste.find((s) => s.username === res.locals.kullanici.username) ?? null : null;
  res.render("siralama", { aktifMenu: "siralama", donem, liste, benim, rutbeler });
});

// ---------- /sohbet ----------
sayfalar.get("/sohbet", (req, res) => {
  const m = (id: number, yazar: string, content: string, dk: number) => ({ id, yazar, rutbe: rutbeHesapla(({ shurai: 640, ayse: 310, ahmet: 45, mert: 905, zeynep: 1180 } as Record<string, number>)[yazar] ?? 0), content, created_at: dakikaOnce(dk) });
  const mesajlar = req.query.bos ? [] : [
    m(1, "mert", "Günaydın. Biri 5600 ile 5600X arasındaki farkı biliyor mu?", 190),
    m(2, "mert", "Fiyat farkı çok değil ama X sürümü kutuda soğutucu ile gelmiyor sanırım.", 188),
    m(3, "zeynep", "Evet, 5600X’te soğutucu yok. 5600’de Wraith Stealth var.", 180),
    m(4, "ahmet", "Selam, Fedora’da wifi sürücüsü çıkmıyor. Kimse yaşadı mı?", 95),
    m(5, "ayse", "Hangi kart? lspci -nn çıktısını atarsan bakarız.", 90),
    m(6, "ayse", "Broadcom ise rpmfusion’dan akmod-wl paketi gerekir.", 89),
    m(7, "ahmet", "Evet Broadcom. Deniyorum, teşekkürler.", 84),
    m(8, "shurai", "Akşam laboratuvarda Docker ödevine bakıyorum, isteyen gelsin.", 30),
    m(9, "shurai", "SELinux etiketlerine de değiniriz.", 29),
    m(10, "zeynep", "Ben gelirim, notlarımı da getiririm.", 8),
  ];
  const cevrimici = req.query.bos ? [] : [{ username: "shurai" }, { username: "ayse" }, { username: "zeynep" }, { username: "mert" }];
  res.render("sohbet", { aktifMenu: "sohbet", mesajlar, cevrimici });
});

// ---------- /moderasyon ----------
sayfalar.get("/moderasyon", (req, res) => {
  const post = (id: number, yazar: string, rutbe: string, content: string, dk: number, silindi = false) => ({ id, yazar, rutbe, content, created_at: dakikaOnce(dk), deleted_at: silindi ? dakikaOnce(5) : null });
  const hepsi = [
    { id: 1, durum: "bekliyor", sebep: "Hakaret", aciklama: "Başka bir kullanıcıya kişisel saldırı var.", created_at: dakikaOnce(25), bildiren: "ayse", ayni_post_sayisi: 3, post: post(41, "ahmet", "Çaylak", "Bu kadar basit şeyi bilmiyorsan forumda ne işin var, git önce temel bilgisayar dersi al.", 180), konu: { id: 12, title: "Okul laboratuvarında SELinux enforcing modunda Apache açılmıyor" } },
    { id: 2, durum: "bekliyor", sebep: "Spam", aciklama: "", created_at: dakikaOnce(130), bildiren: "mert", ayni_post_sayisi: 1, post: post(57, "yeniuye99", "Çaylak", "Ucuz oyun hesabı ve lisans anahtarı satışı, ayrıntılar için özel mesaj atın.", 200), konu: { id: 14, title: "Minecraft sunucusunu Docker ile ayağa kaldırma" } },
    { id: 3, durum: "bekliyor", sebep: "Konu dışı", aciklama: "Donanım sorusunun altında alakasız bir tartışma açıldı.", created_at: saatOnce(6), bildiren: "zeynep", ayni_post_sayisi: 2, post: post(63, "can", "Usta", "Bence en iyisi hepsini bırakıp telefondan oyun oynamak, bilgisayar almaya gerek yok.", 400), konu: { id: 13, title: "Ryzen 5 5600 için hangi anakart alınmalı?" } },
    { id: 4, durum: "islendi", sebep: "Spam", aciklama: "", created_at: saatOnce(20), bildiren: "ayse", ayni_post_sayisi: 2, post: post(29, "reklamci", "Çaylak", "Bedava kripto kazanmak için bağlantıya tıkla.", 1300, true), konu: { id: 2, title: "QuadRan’a hoş geldiniz: kurallar ve ilk adımlar" } },
    { id: 5, durum: "reddedildi", sebep: "Yanıltıcı bilgi", aciklama: "Yanlış komut öneriyor.", created_at: gunSaat(2, 16, 0), bildiren: "ahmet", ayni_post_sayisi: 1, post: post(18, "ayse", "Müdavim", "setenforce 0 yazmak geçici çözümdür, kalıcı değildir; kalıcı için /etc/selinux/config düzenlenir.", 3000), konu: { id: 1, title: "Fedora’da SELinux açıkken Docker volume izin hatası nasıl çözülür?" } },
  ];
  const d = dizge(req.query.durum);
  const durum = ["bekliyor", "islendi", "reddedildi", "hepsi"].includes(d) ? d : "bekliyor";
  const bos = !!req.query.bos;
  const sikayetler = bos ? [] : hepsi.filter((s) => durum === "hepsi" || s.durum === durum);
  const ozet = bos ? { bekleyen: 0, bugun_islenen: 0, toplam: 0 } : { bekleyen: hepsi.filter((s) => s.durum === "bekliyor").length, bugun_islenen: 1, toplam: hepsi.length };
  res.render("moderasyon", { aktifMenu: "moderasyon", durum, ozet, sikayetler });
});

// ---------- /sifremi-unuttum ----------
sayfalar.get("/sifremi-unuttum", (req, res) => {
  res.render("sifremi-unuttum", { gonderildi: !!req.query.gonderildi });
});

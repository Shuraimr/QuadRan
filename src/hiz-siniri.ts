// Rate limiting: protection against brute-force attacks.
// If someone tries thousands of passwords on an account, they are stopped for a while after a certain number of attempts.
//
// Counters are kept in the server's MEMORY (no extra package). The cost:
//  - Counters reset when the server restarts.
//  - If several server copies run, each one counts separately.
// Enough for this single-server project; if it grows, the counters can move to the database or Redis.
//
// Hız sınırı (rate limit): kaba kuvvet (brute force) saldırılarına karşı.
// Biri bir hesabın şifresini binlerce kez denemeye çalışırsa belli bir sayıdan sonra bir süre durdurulur.
//
// Sayaçlar sunucunun BELLEĞİNDE tutulur (ek paket yok). Bedeli:
//  - Sunucu yeniden başlayınca sayaçlar sıfırlanır.
//  - Birden fazla sunucu kopyası çalışırsa her biri ayrı sayar.
// Tek sunuculu bu proje için yeterli; büyürse sayaçlar veritabanına ya da Redis'e taşınabilir.

type Kayit = { sayi: number; bitis: number };

export class HizSiniri {
  private kayitlar = new Map<string, Kayit>();
  private limit: number;
  private sureMs: number;

  constructor(limit: number, sureDakika: number) {
    this.limit = limit;
    this.sureMs = sureDakika * 60_000;
    // Clean up expired records now and then (so memory does not bloat). unref: must not keep the process from exiting.
    // Süresi dolan kayıtları arada bir temizle (bellek şişmesin). unref: süreç kapanmasını engellemesin.
    setInterval(() => this.temizle(), 60_000).unref();
  }

  // Is this key blocked right now? If so, returns how many minutes remain, otherwise 0.
  // Bu anahtar şu an engelli mi? Engelliyse kaç dakika kaldığını döndürür, değilse 0.
  kalanDakika(anahtar: string): number {
    const k = this.kayitlar.get(anahtar);
    if (!k || k.bitis <= Date.now() || k.sayi < this.limit) return 0;
    return Math.ceil((k.bitis - Date.now()) / 60_000);
  }

  // The same information in seconds (for the countdown on the 429 page; 0 if none)
  // Aynı bilgi saniye olarak (429 sayfasındaki geri sayım için; yoksa 0)
  kalanSaniye(anahtar: string): number {
    const k = this.kayitlar.get(anahtar);
    if (!k || k.bitis <= Date.now() || k.sayi < this.limit) return 0;
    return Math.ceil((k.bitis - Date.now()) / 1000);
  }

  // Count one attempt. The window starts with the first attempt and resets when its time is up.
  // Bir deneme say. Pencere ilk denemeyle başlar ve süre dolunca sıfırlanır.
  say(anahtar: string) {
    const simdi = Date.now();
    const k = this.kayitlar.get(anahtar);
    if (!k || k.bitis <= simdi) this.kayitlar.set(anahtar, { sayi: 1, bitis: simdi + this.sureMs });
    else k.sayi++;
  }

  // On a successful login, delete that key's counter
  // Başarılı girişte o anahtarın sayacını sil
  sifirla(anahtar: string) {
    this.kayitlar.delete(anahtar);
  }

  private temizle() {
    const simdi = Date.now();
    for (const [a, k] of this.kayitlar) if (k.bitis <= simdi) this.kayitlar.delete(a);
  }
}

// Login: 20 wrong attempts from the same IP, 5 for the same account / 15 minutes.
// Two separate counters: they slow down trying many accounts from one IP as well as attacking one account from many IPs.
// Giriş: aynı IP'den 20, aynı hesaba 5 yanlış deneme / 15 dakika.
// İki ayrı sayaç: tek IP'den çok hesap denenmesini de, çok IP'den tek hesaba saldırıyı da yavaşlatır.
export const girisIp = new HizSiniri(20, 15);
export const girisHesap = new HizSiniri(5, 15);
// Forgot password: 5 requests from the same IP / 15 minutes (so the console/mailbox does not get flooded)
// Şifremi unuttum: aynı IP'den 5 istek / 15 dakika (konsolu/e-posta kutusunu doldurmasın)
export const sifirlamaIp = new HizSiniri(5, 15);
// Sign-up: 5 accounts from the same IP / 60 minutes (to prevent mass fake accounts)
// Kayıt: aynı IP'den 5 hesap / 60 dakika (toplu sahte hesap açılmasın)
export const kayitIp = new HizSiniri(5, 60);
// Room message: at most 20 messages per minute from the same user (so they cannot fill the room by sending repeatedly).
// This counter is set up only for this use: unlike the login counters, say() is called on every send.
// Oda mesajı: aynı kullanıcıdan dakikada en çok 20 mesaj (art arda gönderip odayı doldurmasın).
// Sayaç yalnızca bu kullanım için kurulur: giriş sayaçlarından farklı olarak her gönderimde say() çağrılır.
export const odaMesaj = new HizSiniri(20, 1);
// Opening topics and writing replies: at most 6 per minute from the same user (slows rapid posting meant to farm points or flood a topic).
// Shared counter: opening a topic is also a message. Staff (admin/moderator) are exempt; as with room messages, say() is called only once validation passes.
// Konu açma ve cevap yazma: aynı kullanıcıdan dakikada en çok 6 (puan kasmak ya da konuyu doldurmak için seri yazmayı yavaşlatır).
// Ortak sayaç: konu açmak da bir mesajdır. Yetkililer (admin/moderatör) muaf; oda mesajındaki gibi say() yalnızca doğrulama geçince çağrılır.
export const cevapYazma = new HizSiniri(6, 1);
// File upload (avatar/banner, src/yukleme.ts): at most 10 uploads per 10 minutes from the same user (sharp processing is expensive, and so the disk does not fill up).
// Dosya yükleme (avatar/banner, src/yukleme.ts): aynı kullanıcıdan 10 dakikada en çok 10 yükleme (sharp işlemi pahalı, disk dolmasın).
export const dosyaYukleme = new HizSiniri(10, 10);
// Ruby spending (buying/selecting a title, src/rotalar/yakut.ts): at most 12 actions per minute from the same user
// (so mashing the button or trying to buy with a script is slowed down). The key is the user id.
// Yakut harcaması (unvan satın alma/seçme, src/rotalar/yakut.ts): aynı kullanıcıdan dakikada en çok 12 işlem
// (düğmeye art arda basmak ya da betikle satın alma denemek yavaşlasın). Anahtar kullanıcı numarasıdır.
export const yakutHarcama = new HizSiniri(12, 1);
// Reply with attachment (photo/video, src/ekler.ts): at most 6 posts with attachments per 10 minutes from the same user (sharp processing is expensive, and so the disk does not fill up).
// Separate from the cevapYazma counter: it does not affect normal replies. Staff are exempt.
// Ekli cevap (fotoğraf/video, src/ekler.ts): aynı kullanıcıdan 10 dakikada en çok 6 ekli gönderi (sharp işlemi pahalı, disk dolmasın).
// cevapYazma sayacından ayrı: normal cevap yazmayı etkilemez. Yetkililer muaf.
export const ekliCevap = new HizSiniri(6, 10);
// Search (GET /ara): at most 30 searches per minute from the same IP (or the user, if logged in). It is the most expensive
// page, scanning three tables with LIKE; so a script cannot query it repeatedly and tire the database. When exceeded, the 429 status page (views/durum.ejs) is shown.
// Arama (GET /ara): aynı IP'den (girişliyse kullanıcıdan) dakikada en çok 30 arama. LIKE ile üç tabloyu tarayan en pahalı
// sayfa; betikle art arda sorgulanıp veritabanı yorulmasın. Aşılırsa 429 durum sayfası (views/durum.ejs) görünür.
export const aramaHizi = new HizSiniri(30, 1);

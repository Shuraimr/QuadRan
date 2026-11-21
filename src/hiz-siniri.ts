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
    // Süresi dolan kayıtları arada bir temizle (bellek şişmesin). unref: süreç kapanmasını engellemesin.
    setInterval(() => this.temizle(), 60_000).unref();
  }

  // Bu anahtar şu an engelli mi? Engelliyse kaç dakika kaldığını döndürür, değilse 0.
  kalanDakika(anahtar: string): number {
    const k = this.kayitlar.get(anahtar);
    if (!k || k.bitis <= Date.now() || k.sayi < this.limit) return 0;
    return Math.ceil((k.bitis - Date.now()) / 60_000);
  }

  // Aynı bilgi saniye olarak (429 sayfasındaki geri sayım için; yoksa 0)
  kalanSaniye(anahtar: string): number {
    const k = this.kayitlar.get(anahtar);
    if (!k || k.bitis <= Date.now() || k.sayi < this.limit) return 0;
    return Math.ceil((k.bitis - Date.now()) / 1000);
  }

  // Bir deneme say. Pencere ilk denemeyle başlar ve süre dolunca sıfırlanır.
  say(anahtar: string) {
    const simdi = Date.now();
    const k = this.kayitlar.get(anahtar);
    if (!k || k.bitis <= simdi) this.kayitlar.set(anahtar, { sayi: 1, bitis: simdi + this.sureMs });
    else k.sayi++;
  }

  // Başarılı girişte o anahtarın sayacını sil
  sifirla(anahtar: string) {
    this.kayitlar.delete(anahtar);
  }

  private temizle() {
    const simdi = Date.now();
    for (const [a, k] of this.kayitlar) if (k.bitis <= simdi) this.kayitlar.delete(a);
  }
}

// Giriş: aynı IP'den 20, aynı hesaba 5 yanlış deneme / 15 dakika.
// İki ayrı sayaç: tek IP'den çok hesap denenmesini de, çok IP'den tek hesaba saldırıyı da yavaşlatır.
export const girisIp = new HizSiniri(20, 15);
export const girisHesap = new HizSiniri(5, 15);
// Şifremi unuttum: aynı IP'den 5 istek / 15 dakika (konsolu/e-posta kutusunu doldurmasın)
export const sifirlamaIp = new HizSiniri(5, 15);
// Kayıt: aynı IP'den 5 hesap / 60 dakika (toplu sahte hesap açılmasın)
export const kayitIp = new HizSiniri(5, 60);
// Oda mesajı: aynı kullanıcıdan dakikada en çok 20 mesaj (art arda gönderip odayı doldurmasın).
// Sayaç yalnızca bu kullanım için kurulur: giriş sayaçlarından farklı olarak her gönderimde say() çağrılır.
export const odaMesaj = new HizSiniri(20, 1);
// Konu açma ve cevap yazma: aynı kullanıcıdan dakikada en çok 6 (puan kasmak ya da konuyu doldurmak için seri yazmayı yavaşlatır).
// Ortak sayaç: konu açmak da bir mesajdır. Yetkililer (admin/moderatör) muaf; oda mesajındaki gibi say() yalnızca doğrulama geçince çağrılır.
export const cevapYazma = new HizSiniri(6, 1);
// Dosya yükleme (avatar/banner, src/yukleme.ts): aynı kullanıcıdan 10 dakikada en çok 10 yükleme (sharp işlemi pahalı, disk dolmasın).
export const dosyaYukleme = new HizSiniri(10, 10);
// Yakut harcaması (unvan satın alma/seçme, src/rotalar/yakut.ts): aynı kullanıcıdan dakikada en çok 12 işlem
// (düğmeye art arda basmak ya da betikle satın alma denemek yavaşlasın). Anahtar kullanıcı numarasıdır.
export const yakutHarcama = new HizSiniri(12, 1);
// Ekli cevap (fotoğraf/video, src/ekler.ts): aynı kullanıcıdan 10 dakikada en çok 6 ekli gönderi (sharp işlemi pahalı, disk dolmasın).
// cevapYazma sayacından ayrı: normal cevap yazmayı etkilemez. Yetkililer muaf.
export const ekliCevap = new HizSiniri(6, 10);
// Arama (GET /ara): aynı IP'den (girişliyse kullanıcıdan) dakikada en çok 30 arama. LIKE ile üç tabloyu tarayan en pahalı
// sayfa; betikle art arda sorgulanıp veritabanı yorulmasın. Aşılırsa 429 durum sayfası (views/durum.ejs) görünür.
export const aramaHizi = new HizSiniri(30, 1);

// Rütbe sistemi (sql/13): rütbeler, rütbe başına ayrıcalıklar, kilit bilgisi, kullanıcı içeriğinde bağlantı.
// Rütbe SAKLANMAZ, puandan hesaplanır: puana göre ranks tablosundaki en yüksek eşik. ranks küçük bir tablo
// (8 satır) ve her sayfada gerektiği için bellekte tutarız (kategori önbelleği gibi); panelden değişince
// rutbeOnbellekTemizle() çağrılır, ayrıca 30 saniyede kendiliğinden eskir.
import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "./db.ts";

export type Rutbe = {
  id: number; name: string; min_points: number; renk: string; simge: string;
  oda_ac: boolean; baglanti: boolean; gorsel: boolean; video: boolean; imza: boolean;
  gunluk_oy: number | null; // null = sınırsız
};

// Panelde seçilebilen renk anahtarları ve simgeler (CSS: --rutbe-<anahtar>; simge: partials/ikon.ejs)
export const RENKLER = ["gri", "yesil", "camgobegi", "mavi", "mor", "amber", "turuncu", "pembe"] as const;
export const RENK_ADLARI: Record<string, string> = {
  gri: "Gri", yesil: "Yeşil", camgobegi: "Camgöbeği", mavi: "Mavi", mor: "Mor", amber: "Amber", turuncu: "Turuncu", pembe: "Pembe",
};
export const SIMGELER = ["filiz", "pusula", "ev", "el", "cekic", "yildiz", "tac", "elmas"] as const;
export const SIMGE_ADLARI: Record<string, string> = {
  filiz: "Filiz", pusula: "Pusula", ev: "Ev", el: "El", cekic: "Çekiç", yildiz: "Yıldız", tac: "Taç", elmas: "Elmas",
};

// Açılıp kapanan ayrıcalıklar. ad: kilit kartında "<ad> ... rütbesinde açılır"; acar: "Artık ..." cümlesi.
export const AYRICALIKLAR = [
  { anahtar: "oda_ac",   ad: "Oda açma",           acar: "oda açabilirsin" },
  { anahtar: "baglanti", ad: "Bağlantı paylaşma",  acar: "bağlantıların tıklanabilir olur" },
  { anahtar: "gorsel",   ad: "Görsel yükleme",     acar: "görsel yükleyebilirsin" },
  { anahtar: "video",    ad: "Video yükleme",      acar: "video yükleyebilirsin" },
  { anahtar: "imza",     ad: "İmza",               acar: "imza ekleyebilirsin" },
] as const;
export type AyricalikAnahtari = (typeof AYRICALIKLAR)[number]["anahtar"];

const OMUR_MS = 30_000;
let onbellek: { liste: Rutbe[]; bitis: number } | null = null;
let sonListe: Rutbe[] = []; // senkron erişim için en son yüklenen liste (şablonlar await edemez)

export async function rutbeler(): Promise<Rutbe[]> {
  if (onbellek && onbellek.bitis > Date.now()) return onbellek.liste;
  const [satirlar]: any = await pool.query(
    `SELECT id, name, min_points, renk, simge, oda_ac, baglanti, gorsel, video, imza, gunluk_oy FROM ranks ORDER BY min_points`
  );
  const liste: Rutbe[] = satirlar.map((s: any) => ({
    id: s.id, name: s.name, min_points: Number(s.min_points), renk: s.renk, simge: s.simge,
    oda_ac: !!s.oda_ac, baglanti: !!s.baglanti, gorsel: !!s.gorsel, video: !!s.video, imza: !!s.imza,
    gunluk_oy: s.gunluk_oy === null ? null : Number(s.gunluk_oy),
  }));
  onbellek = { liste, bitis: Date.now() + OMUR_MS };
  sonListe = liste;
  return liste;
}
export function rutbeOnbellekTemizle() { onbellek = null; }

// Senkron yardımcılar: ortakVeriler her istekte rutbeler()'i bekler, bu yüzden şablon çizilirken liste taze.
export const rutbeAdlari = () => sonListe;

// Rütbeyi NUMARASIYLA çözer (sorgulardan rutbe_id gelir, src/yardimci.ts rutbeSutunlari). Ada göre arama rütbe panelden
// yeniden adlandırılınca önbellekteki eski adla eşleşmeyip çipi sessizce griye düşürürdü. Numara listede yoksa (ör. rütbe
// az önce eklendi, önbellek eski) sessiz kalmayız: uyarı yazılır ve O SAYFA ÇİZİMİNİN "eksik" bayrağı kalkar; server.ts'teki
// sayfa çizimi bayrağı görünce önbelleği BİR KEZ tazeleyip sayfayı yeniden çizer. Numara hiç verilmediyse (yalnızca /onizleme
// örnek verisi) ada bakılır, bu bir hata sayılmaz.
//
// Bayrak neden istek başına: eskiden modül düzeyinde tek bir değişkendi; iki istek aynı anda çizilirken A'nın bayrağını B'nin
// çizim sonu tüketirse A eksik çiple (gri) gider, B gereksiz yere yeniden çizilirdi. Şimdi her çizim kendi durum nesnesini
// taşır (AsyncLocalStorage: şablon senkron çağrıldığı için rutbeBulId'ye parametre geçirmeden o çizime ulaşırız).
// Yenileme de tek paylaşılan Promise'tir: aynı anda gelen çok sayıda eksik, tek veritabanı sorgusuyla çözülür.
type CizimDurumu = { eksik: boolean };
const cizimDeposu = new AsyncLocalStorage<CizimDurumu>();
export function rutbeCizimiBaslat<T>(durum: CizimDurumu, cizim: () => T): T { return cizimDeposu.run(durum, cizim); }
export function rutbeBulId(id: number | string | null | undefined, ad?: string | null): Rutbe | undefined {
  if (id !== null && id !== undefined && id !== "") {
    const r = sonListe.find((x) => x.id === Number(id));
    if (!r) {
      const d = cizimDeposu.getStore();
      if (d) d.eksik = true;
      console.warn(`[rutbe] ${id} numaralı rütbe önbellekte yok; önbellek tazelenecek.`);
    }
    return r;
  }
  return ad ? sonListe.find((x) => x.name === ad) : undefined;
}
let tazeleme: Promise<void> | null = null;
export function rutbeTazele(): Promise<void> {
  if (!tazeleme) {
    onbellek = null;
    tazeleme = rutbeler().then(() => undefined).finally(() => { tazeleme = null; });
  }
  return tazeleme;
}
// Puana karşılık gelen rütbe: eşiği geçilen en yüksek (liste küçükten büyüğe sıralı). Taban rütbe (0) hep vardır.
export function rutbeBul(puan: number, liste: Rutbe[] = sonListe): Rutbe | undefined {
  let bulunan: Rutbe | undefined;
  for (const r of liste) if (r.min_points <= puan) bulunan = r;
  return bulunan;
}
export function sonrakiRutbe(puan: number, liste: Rutbe[] = sonListe): Rutbe | undefined {
  return liste.find((r) => r.min_points > puan);
}

export const yetkiliMi = (rol: string | undefined | null) => rol === "admin" || rol === "moderator";

// Bir kullanıcı bu ayrıcalığa sahip mi? Yönetici ve moderatör bütün ayrıcalık denetimlerinden muaftır.
export function izinli(kisi: { points: number; rol?: string }, anahtar: AyricalikAnahtari): boolean {
  if (yetkiliMi(kisi.rol)) return true;
  return !!rutbeBul(Number(kisi.points))?.[anahtar];
}

// Kilit kartı için: ayrıcalığı ilk açan rütbe ve ona kaç puan kaldığı (zaten açıksa rutbe null)
export function kilitBilgisi(kisi: { points: number; rol?: string }, anahtar: AyricalikAnahtari) {
  const ay = AYRICALIKLAR.find((a) => a.anahtar === anahtar)!;
  if (izinli(kisi, anahtar)) return { acik: true, ad: ay.ad, rutbe: null as Rutbe | null, kalan: 0 };
  const rutbe = sonListe.find((r) => r[anahtar]) ?? null;
  return { acik: false, ad: ay.ad, rutbe, kalan: rutbe ? Math.max(0, rutbe.min_points - Number(kisi.points)) : 0 };
}

// Günlük oy hakkı: null = sınırsız
export function gunlukOyHakki(kisi: { points: number; rol?: string }): number | null {
  if (yetkiliMi(kisi.rol)) return null;
  return rutbeBul(Number(kisi.points))?.gunluk_oy ?? null;
}
// Sınırsız oy veren ilk rütbe ("... rütbesinde sınırsız" mesajı için)
export const sinirsizOyRutbesi = () => sonListe.find((r) => r.gunluk_oy === null);

// Bir rütbenin bir önceki rütbeye göre YENİ açtıkları. etiket: kilitli kutuda ("Oda açma"), cumle: "Artık: ...".
export function acilanlar(onceki: Rutbe | undefined, rutbe: Rutbe): { etiket: string; cumle: string }[] {
  const liste: { etiket: string; cumle: string }[] = [];
  for (const a of AYRICALIKLAR) {
    if (rutbe[a.anahtar] && !onceki?.[a.anahtar]) liste.push({ etiket: a.ad, cumle: a.acar });
  }
  if (onceki && rutbe.gunluk_oy !== onceki.gunluk_oy) {
    // null (sınırsız) her sayıdan büyüktür; yalnızca artış "açılan" sayılır
    const artti = rutbe.gunluk_oy === null || (onceki.gunluk_oy !== null && rutbe.gunluk_oy > onceki.gunluk_oy);
    if (artti) liste.push(rutbe.gunluk_oy === null
      ? { etiket: "Sınırsız oy", cumle: "günde sınırsız oy verebilirsin" }
      : { etiket: `Günde ${rutbe.gunluk_oy} oy`, cumle: `günde ${rutbe.gunluk_oy} oy verebilirsin` });
  }
  return liste;
}
export function oncekiRutbe(rutbe: Rutbe): Rutbe | undefined {
  const i = sonListe.findIndex((r) => r.id === rutbe.id);
  return i > 0 ? sonListe[i - 1] : undefined;
}

// ---------------------------------------------------------------------------
// Kullanıcı içeriğinde bağlantı: düz metin, HTML'e çevrilirken kaçırılır (XSS yok). Yazarın rütbesi
// "baglanti" ayrıcalığını veriyorsa http(s) adresleri tıklanabilir olur, yoksa düz yazı kalır. Yönetici ve moderatör yazarlar
// rütbeye bakılmadan her zaman bağlantı paylaşır (bütün ayrıcalık denetimlerinden muaftırlar, bkz. izinli()).
// Kullanıcı yalnızca http/https adresi yazabilir; javascript: gibi şemalar zaten bağlantı sayılmaz.
// ---------------------------------------------------------------------------
const kacir = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ADRES = /https?:\/\/[^\s<>"']+/gi;

export function icerikHtml(metin: unknown, yazarRutbeId: number | string | null | undefined, yazarRol?: string | null): string {
  const ham = String(metin ?? "");
  const baglantiVar = yetkiliMi(yazarRol) || !!rutbeBulId(yazarRutbeId)?.baglanti;
  if (!baglantiVar) return kacir(ham);
  let cikti = "", son = 0, e: RegExpExecArray | null;
  ADRES.lastIndex = 0;
  while ((e = ADRES.exec(ham))) {
    let adres = e[0];
    // Cümle sonundaki noktalama bağlantıya dahil olmasın ("bak: https://x.com."). Kapanan ) ve ] ise YALNIZCA adreste eşi
    // olmayan fazlalıksa atılır: "https://tr.wikipedia.org/wiki/Ankara_(il)" bütün kalır (parantez adresin parçası),
    // "(bkz https://a.com)" içindeki ) ise dışarıda kalır (adreste açan ( yok).
    const say = (k: string) => adres.split(k).length - 1;
    let sonek = "";
    for (;;) {
      const son = adres.slice(-1);
      if (/[.,;:!?]/.test(son) || (son === ")" && say(")") > say("(")) || (son === "]" && say("]") > say("["))) {
        sonek = son + sonek;
        adres = adres.slice(0, -1);
      } else break;
    }
    cikti += kacir(ham.slice(son, e.index));
    try {
      const u = new URL(adres);
      if (!/^https?:$/.test(u.protocol) || !u.hostname) throw new Error("geçersiz");
      cikti += `<a class="baglanti" href="${kacir(adres)}" rel="nofollow noopener ugc" target="_blank">${kacir(adres)}</a>`;
    } catch {
      cikti += kacir(adres);
    }
    cikti += kacir(sonek);
    son = e.index + e[0].length;
  }
  return cikti + kacir(ham.slice(son));
}

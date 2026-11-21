// Small helpers shared by the sub-files of the admin panel.
// Yönetim panelinin alt dosyalarının ortak kullandığı küçük yardımcılar.
import type { Request, Response, NextFunction } from "express";
import { sayi } from "../yardimci.ts";

// Admin only: a moderator or a member sees the 403 page (both GET and POST).
// The main gate (yonetim.ts) has already checked "is this a moderator or an admin?"; this is the second, narrower gate.
// Yalnızca admin: moderatör ya da üye 403 sayfasını görür (GET de POST da).
// Ana kapı (yonetim.ts) zaten "moderator ya da admin mi?" diye bakmış olur; bu ikinci, daha dar kapıdır.
export function sadeceAdmin(req: Request, res: Response, next: NextFunction) {
  if (res.locals.kullanici?.rol === "admin") return next();
  res.status(403).render("yonetim/yasak", { sadeceYonetici: true });
}

// Pagination math: from the total record count, work out the page count and the OFFSET for SQL.
// If ?sayfa= is invalid or out of range, it is clamped to the nearest valid page.
// Sayfalama hesabı: toplam kayıttan sayfa sayısı ve SQL'deki OFFSET çıkar.
// ?sayfa= geçersizse ya da sınırı aşıyorsa en yakın geçerli sayfaya çekilir.
export function sayfala(req: Request, toplam: number, boyut = 25) {
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / boyut));
  const sayfa = Math.min(sayi(req.query.sayfa) ?? 1, sayfaSayisi);
  return { sayfa, sayfaSayisi, toplam, boyut, offset: (sayfa - 1) * boyut };
}

// Multiple values from a form (checkboxes with the same name): a single value arrives as a string, several arrive as an array.
// Converts all of them to an array of positive integers, drops duplicates and takes at most 200 items.
// Formdan gelen birden çok değer (aynı adlı checkbox'lar): tek değerde metin, çoğunda dizi gelir.
// Hepsini pozitif tam sayı dizisine çevirir, tekrarları atar, en fazla 200 öğe alır.
export function idListesi(deger: unknown): number[] {
  const ham = Array.isArray(deger) ? deger : deger === undefined ? [] : [deger];
  const idler = ham.map((d) => sayi(d)).filter((n): n is number => n !== null);
  return [...new Set(idler)].slice(0, 200);
}

// Reads the selected values from the query string: if a value is not in the fixed allow list, the default is returned
// Sorgu dizgesindeki seçili değerleri okur: sabit izin listesinde yoksa varsayılanı döner
export function secim<T extends string>(deger: unknown, izinli: readonly T[], varsayilan: T): T {
  return typeof deger === "string" && (izinli as readonly string[]).includes(deger) ? (deger as T) : varsayilan;
}

// Date filter in YYYY-MM-DD format: returned as-is if valid, otherwise empty
// YYYY-AA-GG biçimindeki tarih filtresi: geçerliyse aynen döner, değilse boş
export function tarihFiltresi(deger: unknown): string {
  return typeof deger === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deger) && !Number.isNaN(Date.parse(deger)) ? deger : "";
}

// ---------------------------------------------------------------------------
// Side menu (sidebar). Defined in one place: items the role cannot reach are NOT drawn at all (removed from the list, not hidden in the template).
// Hiding in the menu is not enough: the real protection is in the routes (sadeceAdmin); the menu only shows the user the right options.
//   admin: true   -> only admins see it
//   yakinda: true -> section not built yet; a faded row without a link
//   sayi          -> number badge on the right (pending reports)
// Kenar menü (sidebar). Tek yerde tanımlı: rolün erişemediği öğeler HİÇ çizilmez (şablonda gizlenmez, listeden çıkarılır).
// Menüde gizlemek yetmez: asıl koruma route'larda (sadeceAdmin); menü yalnızca kullanıcıya doğru seçenekleri gösterir.
//   admin: true   -> yalnızca admin görür
//   yakinda: true -> henüz yapılmamış bölüm; soluk, bağlantısız satır
//   sayi          -> sağdaki sayı rozeti (bekleyen şikâyet)
// ---------------------------------------------------------------------------
export type MenuOgesi = { id: string; ad: string; href?: string; ikon: string; admin?: boolean; yakinda?: boolean; sayi?: number };
export type MenuGrubu = { ad: string | null; ogeler: MenuOgesi[] };

export function menuKur(rol: string, bekleyenSikayet: number): MenuGrubu[] {
  const gruplar: MenuGrubu[] = [
    { ad: null, ogeler: [{ id: "bakis", ad: "Bakış", href: "/yonetim", ikon: "izgara" }] },
    { ad: "Moderasyon", ogeler: [
      { id: "sikayetler", ad: "Şikâyetler", href: "/yonetim/sikayetler", ikon: "bayrak", sayi: bekleyenSikayet },
      { id: "yaptirimlar", ad: "Yaptırımlar", href: "/yonetim/yaptirimlar", ikon: "yasak" },
      { id: "filtre", ad: "Otomatik filtre", href: "/yonetim/filtre", ikon: "kalkan" },
    ] },
    // Site sections, in the same order as on the public site: Forum, Chat, Members, Points, Games, Store
    // Site bölümleri, herkese açık sitedeki sırayla: Forum, Sohbet, Üyeler, Puan, Oyunlar, Mağaza
    { ad: "Site bölümleri", ogeler: [
      { id: "forum", ad: "Forum", href: "/yonetim/forum", ikon: "klasor" },
      { id: "sohbet", ad: "Sohbet", href: "/yonetim/sohbet", ikon: "sohbet" },
      { id: "uyeler", ad: "Üyeler", href: "/yonetim/uyeler", ikon: "kisi" },
      { id: "puan", ad: "Puan ve ödüller", href: "/yonetim/puan", ikon: "kupa", admin: true },
      { id: "oyunlar", ad: "Oyunlar", ikon: "kod", yakinda: true },
      { id: "magaza", ad: "Mağaza", ikon: "kutu", yakinda: true },
    ] },
    { ad: "Site", ogeler: [
      { id: "duyurular", ad: "Duyurular", href: "/yonetim/duyurular", ikon: "zil", admin: true },
      { id: "kayit-erisim", ad: "Kayıt ve erişim", href: "/yonetim/kayit-erisim", ikon: "kilit", admin: true },
      { id: "islem-kaydi", ad: "İşlem kaydı", href: "/yonetim/islem-kaydi", ikon: "takvim" },
    ] },
  ];
  return gruplar.map((g) => ({ ...g, ogeler: g.ogeler.filter((o) => !o.admin || rol === "admin") }));
}

// "3 gün", "5 saat", "20 dakika", "kalıcı": remaining time on the ban status badge (days / hours / minutes / permanent)
// "3 gün", "5 saat", "20 dakika", "kalıcı": ban durumu rozetinde kalan süre
export function kalanSure(bitis: Date | string | null | undefined): string {
  if (!bitis) return "kalıcı";
  const ms = new Date(bitis).getTime() - Date.now();
  if (ms <= 0) return "doldu";
  const dk = Math.ceil(ms / 60000);
  if (dk < 60) return `${dk} dakika`;
  const sa = Math.ceil(dk / 60);
  if (sa < 48) return `${sa} saat`;
  return `${Math.ceil(sa / 24)} gün`;
}

// ---------------------------------------------------------------------------
// Confirmation step (dangerous actions: permanent suspension, account closure, bulk delete, closing sessions, bulk notifications).
// A server-side method that does not rely on JavaScript: the first POST has no `onay` field, so the action is NOT performed;
// instead an "are you sure?" page is rendered. The form on that page sends the same fields back (including the reason) as hidden fields
// and adds `onay=1`; the action is really performed on the second POST. This way the reason stays mandatory before the confirmation too.
// Return value: true if the confirmation page was rendered (the route must return immediately), false if confirmation was given.
// Onay adımı (tehlikeli işlemler: kalıcı uzaklaştırma, hesap kapatma, toplu silme, oturumları kapatma, toplu bildirim).
// JavaScript'e güvenmeyen sunucu taraflı yöntem: ilk POST'ta `onay` alanı yoktur, bu yüzden işlem YAPILMAZ;
// bunun yerine "emin misin?" sayfası çizilir. O sayfadaki form aynı alanları (sebep dahil) gizli alanlarla geri
// gönderir ve `onay=1` ekler; ikinci POST'ta işlem gerçekten yapılır. Böylece sebep onaydan önce de zorunlu kalır.
// Dönen değer: onay sayfası çizildiyse true (route hemen return etmeli), onay verilmişse false.
// ---------------------------------------------------------------------------
export function onayIste(
  req: Request, res: Response,
  secenek: { baslik: string; metin: string; buton: string; iptal: string; aktif?: string }
): boolean {
  if (req.body?.onay === "1") return false;
  const alanlar: { ad: string; deger: string }[] = [];
  for (const [ad, deger] of Object.entries(req.body ?? {})) {
    if (ad === "_csrf" || ad === "onay") continue;
    for (const d of Array.isArray(deger) ? deger : [deger]) if (typeof d === "string") alanlar.push({ ad, deger: d });
  }
  res.render("yonetim/onay", { baslik: secenek.baslik, aktif: secenek.aktif ?? "bakis", ...secenek, alanlar, eylemYolu: req.originalUrl.split("?")[0] });
  return true;
}

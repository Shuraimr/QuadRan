// Profile appearance: effects, avatar decorations and colour validation (Figma "11 · Premium: profil efektleri ve renk").
//
// This file holds DATA only: which particle sits where, which decoration goes on which part of the avatar. Drawing is done by
// views/partials/profil-efekt.ejs and avatar-sus.ejs, and motion by public/css/efektler.css (CSS @keyframes).
// Positions are PIXELS relative to the 300×440 card in Figma (BACK-layer particles are scaled to the banner box, FRONT-layer ones to the whole card: user decision, the effect does not go behind the text); the template converts them to percentages, so the ratio is kept however much the card grows or shrinks.
// The SVG strings are CONSTANT texts in this file (nothing from the user goes in), so the template can print them with <%- %>.
//
// Profil görünümü: efektler, avatar süsleri ve renk doğrulaması (Figma "11 · Premium: profil efektleri ve renk").
//
// Bu dosya yalnızca VERİ tutar: hangi parçacık nerede durur, hangi süs avatarın neresine konur. Çizimi
// views/partials/profil-efekt.ejs ve avatar-sus.ejs yapar, hareketi public/css/efektler.css (CSS @keyframes).
// Konumlar Figma'daki 300×440 karta göre PİKSELDİR (ARKA katman parçacıkları banner kutusuna, ÖN katman bütün karta oranlanır: kullanıcı kararı, efekt metnin arkasına girmez); şablon bunları yüzdeye çevirir, kart büyüse küçülse de oranı korunur.
// SVG metinleri bu dosyadaki SABİT metinlerdir (kullanıcıdan hiçbir şey girmez), bu yüzden şablonda <%- %> ile basılabilir.

export const EFEKT_ADLARI: Record<string, string> = {
  cadilar: "Cadılar Bayramı", melek: "Melek", seytan: "Şeytan", kar: "Kar fırtınası", sakura: "Sakura", atesbocegi: "Ateş böcekleri",
  ejderha: "Ejderha",
};
export const SUS_ADLARI: Record<string, string> = {
  cadi_sapkasi: "Cadı şapkası", hale_kanat: "Hale ve kanat", boynuz_kuyruk: "Boynuz ve kuyruk", bere: "Kış bere", kiraz: "Kiraz çiçeği", fener: "Fener",
  ejderha: "Ejderha",
};
// The effect's default colours on the card (Figma). If the person has not picked their own colour, the site's tokens are used, NOT the effect's own colours;
// these are only for the small coloured preview in the effect picker tiles.
// Efektin kartta varsayılan renkleri (Figma). Kişi kendi rengini seçmediyse efektin kendi renkleri DEĞİL, sitenin tokenları kullanılır;
// bunlar yalnızca efekt seçici kutucuklarındaki küçük renkli önizleme için.
export const EFEKT_RENKLERI: Record<string, [string, string]> = {
  cadilar: ["#4b2a6b", "#1b1026"], melek: ["#8fa3e8", "#3b4675"], seytan: ["#7a0f14", "#1a0606"],
  kar: ["#2d4a7a", "#0e1a2e"], sakura: ["#e79bb4", "#3a2433"], atesbocegi: ["#1f3b2e", "#0a1410"],
  ejderha: ["#3a3122", "#121010"],
};

// Dragon (Figma "12 · Premium: Ejderha süsü ve efekti"): since it is a detailed illustration it is a transparent WebP image, not an SVG
// (made with Figma's image generation tool, background made transparent; 560px = still 2x sharp even on the largest avatar).
// The same file is used both for the avatar decoration (it rotates) and for the faint shadow in the effect's banner, so the browser downloads it once.
// Ejderha (Figma "12 · Premium: Ejderha süsü ve efekti"): ayrıntılı illüstrasyon olduğu için SVG değil, şeffaf WebP görseldir
// (Figma'nın görsel üretme aracıyla üretildi, arka planı şeffaflaştırıldı; 560px = en büyük avatarda bile 2x keskin).
// Aynı dosya hem avatar süsünde (döner) hem efektin banner'ındaki soluk gölgede kullanılır, tarayıcı bir kez indirir.
const EJDERHA = "/img/susler/ejderha.webp";
// Auspicious cloud (the curly "xiangyun" of Eastern ornaments); the colour parameter only comes from constants in this file
// Uğurlu bulut (Doğu süslemelerindeki kıvrımlı "xiangyun"); renk parametresi yalnızca bu dosyadaki sabitlerden gelir
const bulut = (renk: string) => `<svg width="150" height="45" viewBox="-14 -4 160 44"><g fill="none" stroke="${renk}" stroke-width="1.6" stroke-linecap="round"><path d="M0 30 H120 M8 30 C2 18 14 6 26 12 C28 2 44 -2 52 8 C58 -4 78 -2 80 12 C92 6 104 14 100 26"/><path d="M26 12 C30 18 40 18 40 12 C40 7 34 6 33 10 M52 8 C54 16 66 18 68 10 C69 4 62 2 61 7 M80 12 C82 20 92 22 94 16"/><path d="M120 30 C130 30 136 24 132 18 C129 14 124 17 126 21 M0 30 C-8 30 -12 24 -8 20 C-5 17 -1 20 -3 23"/></g></svg>`;

export const efektGecerli = (s: unknown): s is string => typeof s === "string" && s in EFEKT_ADLARI;
export const susGecerli = (s: unknown): s is string => typeof s === "string" && s in SUS_ADLARI;
// The server accepts only #rrggbb (it is written into CSS, so no other format is allowed: things like url(), var() cannot get in)
// Sunucu yalnızca #rrggbb kabul eder (CSS'e yazılacağı için başka hiçbir biçime izin yok: url(), var() gibi şeyler giremez)
export const RENK = /^#[0-9a-f]{6}$/i;
export const renkGecerli = (s: unknown): s is string => typeof s === "string" && RENK.test(s);

// ---------------------------------------------------------------------------
// SVG parts. The {ID} placeholder is replaced with a random suffix in the template for every drawing (the card can appear twice on the same page;
// if the same id appears twice the gradient binds to the wrong element).
// SVG parçaları. {ID} yer tutucusu şablonda her çizimde rastgele bir sonekle değişir (aynı sayfada kart iki kez olabilir,
// aynı id iki kez olursa gradyan yanlış öğeye bağlanır).
// ---------------------------------------------------------------------------
const kar = (r: number) => `<svg width="${2 * r}" height="${2 * r}" viewBox="0 0 ${2 * r} ${2 * r}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`;
export const SVG: Record<string, { w: number; h: number; svg: string; tam?: boolean }> = {
  yarasa: { w: 46, h: 22, svg: `<svg width="46" height="22" viewBox="0 0 46 22"><path d="M23 7c1.5-3 3.5-3 4.5-.5C31 3 37 2 46 4c-5 1.5-7.5 5-7.5 10-2.5-2.5-5-2.5-7.5 0-1-2.5-3.5-3.5-5.5-2.5L23 17l-2.5-5.5c-2-1-4.5 0-5.5 2.5-2.5-2.5-5-2.5-7.5 0C7.5 9 5 5.5 0 4c9-2 15-1 18.5 2.5C19.5 4 21.5 4 23 7z" fill="#120818"/></svg>` },
  kabak: { w: 34, h: 30, svg: `<svg width="34" height="30" viewBox="0 0 34 30"><rect x="15" y="0" width="4" height="7" rx="2" fill="#3c6b2a"/><ellipse cx="11" cy="18" rx="10" ry="11" fill="#e8741c"/><ellipse cx="23" cy="18" rx="10" ry="11" fill="#e8741c"/><ellipse cx="17" cy="18" rx="9" ry="12" fill="#f28a2e"/><path d="M9 14l4 4H7zM25 14l4 4h-6zM10 22q7 5 14 0l-2 2-2-1-2 2-2-2-2 2-2-1z" fill="#3a1600"/></svg>` },
  sis: { w: 200, h: 70, svg: `<svg width="200" height="70" viewBox="0 0 200 70"><ellipse cx="100" cy="35" rx="100" ry="35" fill="#cfc6e8"/></svg>` },
  cadi_sapka: { w: 80, h: 62, svg: `<svg width="80" height="62" viewBox="0 0 80 62"><path d="M34 2 L54 44 L20 44 Z" fill="#241433"/><path d="M34 3 Q22 -2 14 10" stroke="#241433" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="40" cy="48" rx="40" ry="10" fill="#2f1b44"/><rect x="23" y="36" width="29" height="6" fill="#e8741c"/></svg>` },
  tuy: { w: 18, h: 30, svg: `<svg width="18" height="30" viewBox="0 0 18 30"><path d="M9 0 C18 8 16 22 9 30 C2 22 0 8 9 0Z" fill="#ffffff"/><path d="M9 4 V29" stroke="#d8dcf0" stroke-width="1"/></svg>` },
  huzme: { w: 80, h: 300, svg: `<svg width="80" height="300" viewBox="0 0 80 300"><defs><linearGradient id="hz-{ID}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient></defs><path d="M30 0h20l30 300H0z" fill="url(#hz-{ID})"/></svg>` },
  parilti: { w: 14, h: 14, svg: `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 0L8.5 5.5 14 7 8.5 8.5 7 14 5.5 8.5 0 7 5.5 5.5z" fill="#fff4c2"/></svg>` },
  hale: { w: 84, h: 26, svg: `<svg width="84" height="26" viewBox="0 0 84 26"><ellipse cx="42" cy="13" rx="38" ry="9" fill="none" stroke="#ffe08a" stroke-width="5"/></svg>` },
  kanat: { w: 54, h: 64, svg: `<svg width="54" height="64" viewBox="0 0 54 64"><path d="M54 40 C40 64 8 62 0 40 C6 42 10 40 12 36 C4 34 2 28 2 22 C8 26 14 24 16 20 C10 16 10 10 12 4 C22 14 40 14 54 26 Z" fill="#ffffff" opacity="0.95"/><path d="M50 32 C38 36 24 34 16 22 M48 40 C34 46 18 44 10 36" stroke="#cfd6f2" stroke-width="1.5" fill="none"/></svg>` },
  kivilcim: { w: 8, h: 8, svg: `<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#ffb347"/></svg>` },
  alev: { w: 300, h: 90, tam: true, svg: `<svg width="300" height="90" viewBox="0 0 300 90" preserveAspectRatio="none"><path d="M0 90 V60 C20 40 30 70 45 40 C55 20 60 55 75 35 C90 10 100 60 115 30 C125 15 135 50 150 25 C165 0 170 55 185 35 C200 15 210 60 225 38 C240 20 250 58 262 40 C275 22 285 55 300 45 V90Z" fill="#c4231b"/><path d="M0 90 V75 C25 60 35 80 55 62 C70 50 80 78 100 60 C120 45 130 80 150 58 C170 40 180 80 200 62 C220 48 230 80 250 62 C270 48 285 78 300 66 V90Z" fill="#ff7a1a"/></svg>` },
  boynuz: { w: 22, h: 30, svg: `<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 30 C4 16 10 6 20 0 C16 10 16 20 20 30 Z" fill="#b3141c"/></svg>` },
  kuyruk: { w: 60, h: 40, svg: `<svg width="60" height="40" viewBox="0 0 60 40"><path d="M2 38 C20 36 30 10 50 12" stroke="#b3141c" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M46 4 L60 12 L46 20 L50 12Z" fill="#b3141c"/></svg>` },
  kar2: { w: 4, h: 4, svg: kar(2) }, kar25: { w: 5, h: 5, svg: kar(2.5) }, kar3: { w: 6, h: 6, svg: kar(3) },
  kar35: { w: 7, h: 7, svg: kar(3.5) }, kar4: { w: 8, h: 8, svg: kar(4) },
  altigen: { w: 16, h: 16, svg: `<svg width="16" height="16" viewBox="0 0 16 16"><g stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"><path d="M8 1v14M1.9 4.5l12.2 7M1.9 11.5l12.2-7"/></g></svg>` },
  birikinti: { w: 300, h: 40, tam: true, svg: `<svg width="300" height="40" viewBox="0 0 300 40" preserveAspectRatio="none"><path d="M0 40 V22 C40 8 80 26 130 16 C180 6 230 24 300 12 V40Z" fill="#ffffff"/></svg>` },
  bere: { w: 92, h: 44, svg: `<svg width="92" height="44" viewBox="0 0 92 44"><path d="M8 36 C10 10 82 10 84 36 Z" fill="#d6e4ff"/><rect x="4" y="30" width="84" height="12" rx="6" fill="#ffffff"/><circle cx="46" cy="8" r="8" fill="#ffffff"/></svg>` },
  yaprak: { w: 16, h: 14, svg: `<svg width="16" height="14" viewBox="0 0 16 14"><path d="M8 14 C0 10 0 2 4 0 C6 0 8 2 8 4 C8 2 10 0 12 0 C16 2 16 10 8 14Z" fill="#ffb7cf"/></svg>` },
  dal: { w: 170, h: 70, svg: `<svg width="170" height="70" viewBox="0 0 170 70"><path d="M170 4 C120 10 90 30 40 40 C30 42 20 50 10 66" stroke="#4a2b2b" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M110 22 C100 6 90 4 80 2" stroke="#4a2b2b" stroke-width="3" fill="none"/><g fill="#ffc2d6"><circle cx="150" cy="10" r="7"/><circle cx="128" cy="18" r="6"/><circle cx="96" cy="30" r="7"/><circle cx="80" cy="6" r="6"/><circle cx="58" cy="38" r="6"/><circle cx="30" cy="48" r="7"/><circle cx="14" cy="62" r="5"/></g><g fill="#ff8fb1"><circle cx="150" cy="10" r="2.5"/><circle cx="96" cy="30" r="2.5"/><circle cx="30" cy="48" r="2.5"/></g></svg>` },
  cicek: { w: 30, h: 30, svg: `<svg width="30" height="30" viewBox="0 0 30 30"><g fill="#ffc2d6"><circle cx="15" cy="7" r="7"/><circle cx="23" cy="13" r="7"/><circle cx="20" cy="23" r="7"/><circle cx="10" cy="23" r="7"/><circle cx="7" cy="13" r="7"/></g><circle cx="15" cy="15" r="4" fill="#ff7aa2"/></svg>` },
  bocek: { w: 8, h: 8, svg: `<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#e9ff8a"/></svg>` },
  ay: { w: 56, h: 56, svg: `<svg width="56" height="56" viewBox="0 0 56 56"><path d="M40 4 A26 26 0 1 0 52 40 A20 20 0 1 1 40 4Z" fill="#f6f1c7"/></svg>` },
  ejderha_halka: { w: 560, h: 560, svg: `<img src="${EJDERHA}" alt="" width="560" height="560" decoding="async">` },
  ejderha_golge: { w: 420, h: 420, svg: `<img src="${EJDERHA}" alt="" width="420" height="420" decoding="async">` },
  bulut: { w: 150, h: 45, svg: bulut("#f1ece0") },
  bulut_altin: { w: 150, h: 45, svg: bulut("#d9b45a") },
  altin: { w: 6, h: 6, svg: `<svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="2.5" fill="#ffd27a"/></svg>` },
  fener: { w: 26, h: 38, svg: `<svg width="26" height="38" viewBox="0 0 26 38"><path d="M13 0 V6" stroke="#5a4a2a" stroke-width="2"/><rect x="5" y="6" width="16" height="4" rx="1" fill="#5a4a2a"/><rect x="4" y="10" width="18" height="22" rx="5" fill="#ffd36b"/><rect x="5" y="32" width="16" height="4" rx="1" fill="#5a4a2a"/></svg>` },
};

// A particle:
//  tur: "gez"   = travels between (x0,y0) → (x1,y1), rotation r0 → r1, opacity 0→1→1→0 (3.6 s loop)
//       "sabit" = swings back and forth between x0,y0 and x1,y1 (oscillation), constant opacity; if nabiz: true the opacity also pulses .55↔1
//  faz (0–3): shifts the animation in 0.9 s steps (negative animation-delay) so the particles do not all start at once
//  op: peak opacity · blur: px blur · parilti: glow colour (drop-shadow)
// Bir parçacık:
//  tur: "gez"   = (x0,y0) → (x1,y1) arası gider, dönüş r0 → r1, opaklık 0→1→1→0 (3,6 sn döngü)
//       "sabit" = x0,y0 ile x1,y1 arasında gidip gelir (salınım), opaklık sabit; nabiz: true ise opaklık da .55↔1 gidip gelir
//  faz (0–3): animasyonu 0,9 sn'lik adımlarla kaydırır (negatif animation-delay), parçacıklar aynı anda başlamasın
//  op: en yüksek opaklık · blur: px bulanıklık · parilti: ışıltı rengi (drop-shadow)
export type Parcacik = {
  svg: keyof typeof SVG; tur: "gez" | "sabit"; x0: number; y0: number; x1?: number; y1?: number; r0?: number; r1?: number;
  faz?: number; op?: number; blur?: number; parilti?: string; nabiz?: boolean; ayna?: boolean;
};
const g = (svg: keyof typeof SVG, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, faz: number, ek: Partial<Parcacik> = {}): Parcacik =>
  ({ svg, tur: "gez", x0, y0, x1, y1, r0, r1, faz, ...ek });
const s = (svg: keyof typeof SVG, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, ek: Partial<Parcacik> = {}): Parcacik =>
  ({ svg, tur: "sabit", x0, y0, x1, y1, r0, r1, ...ek });

type Efekt = { arka: Parcacik[]; on: Parcacik[] };
export const EFEKTLER: Record<string, Efekt> = {
  cadilar: {
    arka: [
      g("sis", -120, 360, 40, 330, 0, 0, 0, { op: .35, blur: 20 }),
      g("sis", 100, 400, 240, 360, 0, 0, 2, { op: .3, blur: 20 }),
      s("kabak", 252, 66, 252, 62, -6, 6, { parilti: "#ff9a3c" }),
      s("kabak", 212, 72, 212, 68, 5, -5, { parilti: "#ff9a3c" }),
    ],
    on: [
      g("yarasa", -50, 60, 320, 8, -10, 10, 0),
      g("yarasa", 320, 120, -60, 30, 10, -8, 2),
      g("yarasa", 140, 140, 330, 20, -14, 4, 1, { op: .8 }),
    ],
  },
  melek: {
    arka: [
      s("huzme", 150, -20, 150, -20, 18, 18, { nabiz: true, op: .55, blur: 6 }),
      s("huzme", 220, -20, 220, -20, 26, 26, { nabiz: true, op: .4, blur: 6, faz: 1 }),
    ],
    on: [
      g("tuy", 210, -30, 250, 300, -30, 60, 0),
      g("tuy", 230, -30, 200, 260, 20, -50, 2, { op: .85 }),
      g("tuy", 240, 60, 350, 430, 10, 90, 1, { op: .7 }),
      g("parilti", 200, 30, 200, 30, 0, 0, 0, { parilti: "#fff1a8" }),
      g("parilti", 120, 70, 120, 70, 0, 0, 1, { parilti: "#fff1a8" }),
      g("parilti", 260, 140, 260, 140, 0, 0, 2, { parilti: "#fff1a8" }),
      g("parilti", 40, 20, 40, 20, 0, 0, 3, { parilti: "#fff1a8" }),
    ],
  },
  seytan: {
    arka: [s("alev", 0, 384, 0, 372, 0, 0, { op: .85, blur: 3, parilti: "#ff4d00" })],
    on: [30, 80, 130, 175, 220, 265, 60, 200].map((x, i) =>
      g("kivilcim", x, 430, x + [20, -20, 15, -15, 20, -20, 10, -10][i], [250, 210, 280, 230, 260, 200, 290, 240][i], 0, 0, [0, 1, 2, 3, 0, 2, 3, 1][i], { parilti: "#ff6a00" })),
  },
  kar: {
    arka: [s("birikinti", 0, 402, 0, 400, 0, 0, { op: .35, blur: 4 })],
    on: [
      ...[20, 70, 110, 160, 205, 250, 280, 45, 135, 230].map((x, i) => {
        const r = [3, 2, 4, 2.5, 3.5, 2, 4, 3, 2.5, 3.5][i];
        const ad = ({ 2: "kar2", 2.5: "kar25", 3: "kar3", 3.5: "kar35", 4: "kar4" } as Record<number, keyof typeof SVG>)[r];
        return g(ad, x, -10, x - 40, [320, 400, 360, 440, 300, 420, 380, 340, 430, 310][i], 0, 0, [0, 1, 2, 3, 0, 2, 1, 3, 2, 0][i], { op: .9, ...(r > 3 ? { blur: 1 } : {}) });
      }),
      g("altigen", 230, 20, 180, 250, 0, 180, 1),
      g("altigen", 90, 100, 40, 420, 0, -180, 3),
    ],
  },
  sakura: {
    arka: [s("dal", 132, -2, 132, 0, 0, 2)],
    on: [260, 220, 180, 280, 140, 240, 200, 100].map((x, i) =>
      g("yaprak", x, [10, 30, 50, 20, 40, 15, 35, 45][i], x + [-160, -180, -200, -170, -190, -210, -220, -165][i], [260, 330, 430, 300, 380, 280, 410, 350][i],
        0, [240, -240, 200, -200, 240, -220, 260, -180][i], [0, 1, 2, 3, 2, 0, 3, 1][i])),
  },
  atesbocegi: {
    arka: [s("ay", 228, 18, 228, 18, 0, 0, { nabiz: true, parilti: "#f6f1c7" })],
    on: [[40, 300], [90, 250], [150, 330], [220, 280], [260, 200], [180, 120], [60, 140], [240, 390], [120, 410], [270, 60]].map(([x, y], i) =>
      g("bocek", x, y, x + (i % 2 ? -21 : 21), y - [30, 40, 50, 35, 45, 30, 50, 40, 35, 45][i], 0, 0, [0, 1, 2, 3, 1, 2, 3, 0, 2, 1][i], { parilti: "#d4ff3a" })),
  },
  // A faint, large dragon drifts slowly through the banner; clouds slide along the card's top/bottom edge, golden sparks rise and fade
  // Banner'ın içinden soluk, büyük ejderha yavaşça süzülür; kartın alt/üst kenarında bulutlar kayar, altın kıvılcımlar yükselip söner
  ejderha: {
    arka: [s("ejderha_golge", 40, -170, 70, -160, -40, -34, { op: .3 })],
    on: [
      s("bulut", -50, 396, -20, 396, 0, 0, { op: .55 }),
      s("bulut_altin", 168, 412, 140, 412, 0, 0, { op: .5, faz: 2 }),
      s("bulut", 186, 6, 160, 6, 0, 0, { op: .4, faz: 1 }),
      ...[30, 95, 150, 210, 260, 120, 230, 60].map((x, i) =>
        g("altin", x, 430, x + [12, -12, 8, -10, 12, -8, 10, -12][i], [240, 200, 280, 220, 260, 300, 190, 270][i], 0, 0, [0, 1, 2, 3, 0, 2, 3, 1][i], { parilti: "#ffc94a", op: .9 })),
    ],
  },
};

// Avatar decorations. Positions are card coordinates relative to the Figma "avatar frame" (100px; avatar 88px + 6px ring, on the card at x=12,y=54);
// here they are recomputed relative to the top-left of the AVATAR IMAGE (88px), so that 88 = 100 units: x = (X-18)/0.88, y = (Y-60)/0.88.
// The template writes this as `cqw` (a percentage of the avatar's width); the decoration stays proportional at every avatar size (24px list, 88px card, 128px profile).
// Avatar süsleri. Konumlar Figma'da "avatar çerçevesi"ne (100px; avatar 88px + 6px halka, kartta x=12,y=54) göre kart koordinatıdır;
// burada AVATAR RESMİNİN (88px) sol-üstüne göre, 88 = 100 birim olacak biçimde yeniden hesaplanmıştır: x = (X-18)/0.88, y = (Y-60)/0.88.
// Şablon bunu `cqw` (avatarın genişliği yüzdesi) olarak yazar; süs her avatar boyutunda (24px liste, 88px kart, 128px profil) orantılı kalır.
const f = (n: number) => Math.round(n * 100) / 100;
const A = (X: number, Y: number) => ({ x: f((X - 18) / 0.88), y: f((Y - 60) / 0.88) });
const bt = (svg: keyof typeof SVG) => ({ w: f(SVG[svg].w / 0.88), h: f(SVG[svg].h / 0.88) });
export type Sus = {
  svg: keyof typeof SVG; x: number; y: number; w: number; h: number; dx: number; dy: number; r0: number; r1: number;
  ayna?: boolean; arka?: boolean; parilti?: string; nabiz?: boolean; kok?: string;
  // rotates continuously around the avatar's centre (instead of swaying); the dragon ring
  // avatarın merkezi çevresinde sürekli döner (sallanmak yerine); ejderha halkası
  don?: boolean;
};
const sus = (svg: keyof typeof SVG, X: number, Y: number, dY: number, r0: number, r1: number, ek: Partial<Sus> = {}): Sus =>
  ({ svg, ...A(X, Y), ...bt(svg), dx: 0, dy: f(dY / 0.88), r0, r1, ...ek });
export const SUSLER: Record<string, Sus[]> = {
  cadi_sapkasi: [sus("cadi_sapka", 22, 12, -4, -5, 5)],
  hale_kanat: [
    sus("hale", 20, 34, -6, 0, 0, { parilti: "#ffd66b" }),
    sus("kanat", -24, 70, 0, -10, 10, { arka: true, kok: "100% 50%" }),
    sus("kanat", 124, 70, 0, 10, -10, { arka: true, ayna: true, kok: "0% 50%" }),
  ],
  boynuz_kuyruk: [
    sus("boynuz", 30, 40, 0, 0, 0, { parilti: "#ff2a2a", nabiz: true }),
    sus("boynuz", 72, 40, 0, 0, 0, { parilti: "#ff2a2a", nabiz: true, ayna: true }),
    sus("kuyruk", 92, 112, 0, -8, 10),
  ],
  bere: [sus("bere", 16, 32, -2, -3, 3)],
  kiraz: [sus("cicek", 82, 52, 0, 0, 20)],
  fener: [sus("fener", 104, 40, 0, -10, 10, { parilti: "#ffc94a", kok: "50% 0%" })],
  // The ring is 2.05 times the avatar; since its middle is empty the avatar stays visible. On small avatars (≤48px) CSS shrinks the ring to 1.6x,
  // so it does not spill over the neighbouring text (efektler.css "Ejderha halkası").
  // Halka avatarın 2,05 katı; ortası boş olduğundan avatar görünür kalır. Küçük avatarlarda (≤48px) CSS halkayı 1,6 kata indirir,
  // komşu yazının üstüne taşmasın (efektler.css "Ejderha halkası").
  ejderha: [{ svg: "ejderha_halka", x: -52.5, y: -52.5, w: 205, h: 205, dx: 0, dy: 0, r0: 0, r1: 0, don: true }],
};

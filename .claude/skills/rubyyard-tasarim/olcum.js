/* rubyyard arayüz ölçümleri.
   Kullanım: yerleşik tarayıcıda oturum açık bir sayfadayken (örn. http://localhost:3000/) bu dosyanın içeriğini
   javascript_tool ile çalıştır, sonra istediğin ölçümü çağır:
     await ulasilabilirlik('/konu/1')          → hedef × ölçek tablosu + menülerde tekrar
     await tasma(['/', '/konu/1', ...])        → yatay taşma (3 ölçek)
     await kokSebep('/ayarlar', 375)           → taşan öğeleri ve genişliklerini listeler
     await cakisma(['/', '/ayarlar', ...])     → sabit öğeler + sahte bildirim çubuğu üst üste biniyor mu
     await cubukArkasi(['/', '/konu/yeni'])    → sayfa dibinde çubukların arkasında kalan düğme/alan
   Hepsi sayfaları görünmez bir iframe'de açar; tarayıcı sekmesini değiştirmez.
   Not: tek javascript_tool çağrısında bu dosyayı tanımla ve en sonda ölçümü await et (son ifadenin değeri döner). */

const OLCEKLER = [[375, 812, 'Telefon'], [1075, 800, 'Tablet'], [1440, 900, 'Masaüstü']];

/* Hedefler: kullanıcı adını kendi oturumuna göre değiştir (Profil). Yeni bölüm eklenince buraya ekle. */
const HEDEFLER = {
  'Akış': /^\/$/, 'Kategoriler': /^\/kategoriler|\?kategori=/, 'Konu aç': /^\/konu\/yeni/, 'Ara': /^\/ara/,
  'Bildirimler': /^\/bildirimler$|bildirim-paneli/, 'Mesajlar': /^\/mesajlar/, 'Sohbet': /^\/sohbet|^\/oda\//,
  'Sıralama': /^\/siralama/, 'Keşfet': /^\/kesfet/, 'Profil': /^\/profil\/shurai/, 'Ayarlar': /^\/ayarlar/,
  'Yönetim': /^\/yonetim/, 'Çıkış': /^\/cikis/,
};
/* Kalıcı arayüz ("krom"): tekrar sayımı yalnızca bunların içinde yapılır */
const KROM = '.ust-cubuk,.kenar-menu,.alt-menu,#avatar-menusu';

async function ac(yol, w, h) {
  const f = document.createElement('iframe');
  f.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;opacity:0;pointer-events:none`;
  document.body.appendChild(f);
  await new Promise(r => { f.onload = r; f.src = yol; });
  await new Promise(r => setTimeout(r, 500));
  return f;
}
function gorunur(d, W, e) {
  for (let p = e; p && p !== d.body; p = p.parentElement) { const s = W.getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') return false; }
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
}
const ad = e => e.tagName.toLowerCase() + '.' + e.className.toString().split(' ').filter(Boolean).slice(0, 2).join('.');

/* 1 = görünür bağlantı/düğme, 2 = görünür bir düğmenin açtığı hesap menüsü içinde, ✗ = yok.
   Sayfa içeriğindeki (main) bağlantılar sayılmaz: soru "arayüzden ulaşılabiliyor mu". */
async function ulasilabilirlik(yol = '/konu/1') {
  const sonuc = {}, tekrar = {};
  for (const [w, h, olcek] of OLCEKLER) {
    const f = await ac(yol, w, h), d = f.contentDocument, W = f.contentWindow;
    const kayit = {}, sayac = {};
    const hedefOf = e => { const href = e.getAttribute('href') || e.getAttribute('action') || e.getAttribute('popovertarget') || ''; return Object.keys(HEDEFLER).filter(k => HEDEFLER[k].test(href)); };
    d.querySelectorAll('a[href],button[popovertarget],form[action],[data-arama-ac]').forEach(e => {
      if (e.closest('[popover]') || !gorunur(d, W, e) || e.closest('main, .govde-iki') || e.matches('.logo')) return;
      const hs = e.hasAttribute('data-arama-ac') ? ['Ara'] : hedefOf(e);
      hs.forEach(k => { kayit[k] = Math.min(kayit[k] || 9, 1); if (e.closest(KROM)) sayac[k] = (sayac[k] || 0) + 1; });
    });
    d.querySelectorAll('button[popovertarget]').forEach(b => {
      if (!gorunur(d, W, b)) return; const p = d.getElementById(b.getAttribute('popovertarget')); if (!p || p.id !== 'avatar-menusu') return;
      p.querySelectorAll('a[href],form[action]').forEach(e => { if (W.getComputedStyle(e).display === 'none') return; hedefOf(e).forEach(k => { kayit[k] = Math.min(kayit[k] || 9, 2); sayac[k] = (sayac[k] || 0) + 1; }); });
    });
    sonuc[olcek] = kayit; tekrar[olcek] = Object.entries(sayac).filter(([, n]) => n > 1).map(([k, n]) => k + '×' + n);
    f.remove();
  }
  const baslik = 'Hedef'.padEnd(12) + OLCEKLER.map(o => o[2].padStart(10)).join('');
  const satirlar = Object.keys(HEDEFLER).map(k => k.padEnd(12) + OLCEKLER.map(o => String(sonuc[o[2]][k] || '✗').padStart(10)).join(''));
  return baslik + '\n' + satirlar.join('\n') + '\n\nMenülerde tekrar (0 olmalı; kategori alt satırları yanlış alarmdır): ' + JSON.stringify(tekrar);
}

async function tasma(yollar) {
  const rapor = [];
  for (const [w, h] of OLCEKLER) for (const s of yollar) {
    const f = await ac(s, w, h), d = f.contentDocument;
    if (d.documentElement.scrollWidth > f.contentWindow.innerWidth) rapor.push(w + ' ' + s + ' → TAŞMA ' + d.documentElement.scrollWidth);
    f.remove();
  }
  return rapor.length ? rapor.join('\n') : 'taşma yok';
}

async function kokSebep(yol, w = 375) {
  const f = await ac(yol, w, 812), d = f.contentDocument, W = f.contentWindow, gen = W.innerWidth;
  const x = [...d.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > gen + 1)
    .map(e => { const s = W.getComputedStyle(e); return ad(e) + ' sağ=' + Math.round(e.getBoundingClientRect().right) + ' gen=' + Math.round(e.getBoundingClientRect().width) + ' ' + s.display + ' gtc=' + s.gridTemplateColumns.slice(0, 30) + ' minW=' + s.minWidth; }).slice(0, 15);
  f.remove(); return x.join('\n') || 'taşan öğe yok';
}

async function cakisma(yollar) {
  const rapor = [];
  for (const [w, h] of OLCEKLER) for (const s of yollar) {
    const f = await ac(s, w, h), d = f.contentDocument, W = f.contentWindow;
    d.querySelectorAll('.cubuk-alani').forEach(x => x.remove());
    const t = d.createElement('div'); t.className = 'cubuk-alani'; t.innerHTML = '<div class="cubuk-bildirim" id="sahte"><span class="cubuk-metin">Deneme bildirimi</span></div>'; d.body.appendChild(t);
    const k = d.querySelector('#toplu-form input[name="id"]'); if (k) { k.checked = true; k.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 400));
    const sabit = [...d.querySelectorAll('body *')].filter(e => {
      if (e.classList.contains('cubuk-alani')) return false; const st = W.getComputedStyle(e);
      if (!/fixed|sticky/.test(st.position) || st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
      if (e.matches('[popover]:not(:popover-open)')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < h;
    });
    sabit.push(d.getElementById('sahte'));
    for (let i = 0; i < sabit.length; i++) for (let j = i + 1; j < sabit.length; j++) {
      if (sabit[i].contains(sabit[j]) || sabit[j].contains(sabit[i])) continue;
      const a = sabit[i].getBoundingClientRect(), b = sabit[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) rapor.push(w + ' ' + s + ': ' + ad(sabit[i]) + ' × ' + ad(sabit[j]) + ' (' + Math.round(ox) + '×' + Math.round(oy) + ')');
    }
    f.remove();
  }
  return rapor.length ? rapor.join('\n') : 'çakışma yok';
}

async function cubukArkasi(yollar) {
  const rapor = [];
  for (const [w, h] of OLCEKLER.slice(0, 2)) for (const s of yollar) {
    const f = await ac(s, w, h), d = f.contentDocument, W = f.contentWindow;
    d.documentElement.style.scrollBehavior = 'auto'; /* yumuşak kaydırma ölçümü bozar */
    W.scrollTo({ top: d.documentElement.scrollHeight, behavior: 'instant' }); await new Promise(r => setTimeout(r, 300));
    const cubuklar = [...d.querySelectorAll('[data-alt-cubuk], .alt-menu')].filter(e => { const st = W.getComputedStyle(e); return /fixed|sticky/.test(st.position) && st.display !== 'none'; }).map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && r.top < h);
    if (!cubuklar.length) { f.remove(); continue; }
    const sinir = Math.min(...cubuklar.map(r => r.top));
    const gizli = [...d.querySelectorAll('a,button,input,textarea,.secici')].filter(e => {
      if (e.closest('[data-alt-cubuk],.alt-menu,.cubuk-alani,[popover],dialog,.kenar-menu')) return false;
      const st = W.getComputedStyle(e); if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0 && r.bottom > sinir + 2 && r.top < h;
    }).map(e => ad(e));
    if (gizli.length) rapor.push(w + ' ' + s + ': ' + gizli.slice(0, 3).join('; '));
    f.remove();
  }
  return rapor.length ? rapor.join('\n') : 'çubukların arkasında kalan öğe yok';
}

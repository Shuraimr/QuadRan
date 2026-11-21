/* rubyyard · a small, dependency-free script. Nothing depends on JS: without this file links and popovers still work. */
/* rubyyard · küçük, bağımlılıksız betik. Hiçbir şey JS'e bağımlı değildir: bu dosya yoksa bağlantılar ve popover'lar yine çalışır. */
(function () {
  "use strict";
  var d = document;

  /* CSS "JS is present" flag: rules tied to the .js class (e.g. hiding the Filter button) apply only if the script runs */
  /* CSS "JS var" bayrağı: .js sınıfına bağlı kurallar (örn. Süz düğmesini gizleme) yalnızca betik çalışıyorsa geçerli olur */
  d.documentElement.classList.add("js");

  /* Is motion reduced? OS preference or "Reduce animations" in Settings. Every animation JS waits for checks this first;
     if reduced, the wait time becomes 0 (the CSS side does the same by zeroing the duration variables). */
  /* Hareket azaltılmış mı? İşletim sistemi tercihi ya da Ayarlar'daki "Animasyonları azalt". JS'in beklediği her animasyon önce buna bakar;
     azaltılmışsa bekleme süresi 0 olur (CSS tarafı aynı şeyi süre değişkenlerini sıfırlayarak yapar). */
  function hareketAzMi() {
    return (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      d.documentElement.hasAttribute("data-az-animasyon");
  }

  function bul(secici, kok) { return (kok || d).querySelector(secici); }
  function hepsi(secici, kok) { return Array.prototype.slice.call((kok || d).querySelectorAll(secici)); }
  function acilabilir(dlg) { return !!dlg && typeof dlg.showModal === "function"; }
  function ac(dlg) { if (acilabilir(dlg) && !dlg.open) dlg.showModal(); return acilabilir(dlg); }
  function kapat(dlg) { if (dlg && dlg.open && typeof dlg.close === "function") dlg.close(); }

  /* Turkish accusative suffix: ayse -> ayse’yi, ahmet -> ahmet’i. (Same rule as `belirtme()` in src/gizlilik.ts.) */
  /* Türkçe belirtme hâli: ayse -> ayse’yi, ahmet -> ahmet’i. (src/gizlilik.ts belirtme() ile aynı kural.) */
  function belirtme(ad) {
    var k = ad.toLocaleLowerCase("tr"), sesli = "aeıioöuü", son = "";
    for (var i = 0; i < k.length; i++) if (sesli.indexOf(k[i]) > -1) son = k[i];
    var ek = !son ? "i" : "aı".indexOf(son) > -1 ? "ı" : "ei".indexOf(son) > -1 ? "i" : "ou".indexOf(son) > -1 ? "u" : "ü";
    return ad + "’" + (sesli.indexOf(k[k.length - 1]) > -1 ? "y" : "") + ek;
  }

  /* Report form: if "Başka bir sebep" (Another reason) is selected the note becomes required (the server demands the same too) */
  /* Şikâyet formu: "Başka bir sebep" seçiliyse not zorunlu olur (sunucu da aynısını ister) */
  function notZorunlu(form) {
    var diger = bul('input[name="sebep"][value="Başka bir sebep"]', form);
    var not = bul('textarea[name="not"]', form);
    if (not) not.required = !!(diger && diger.checked);
  }
  d.addEventListener("change", function (e) {
    var f = e.target && e.target.closest ? e.target.closest(".sikayet-form") : null;
    if (f && e.target.name === "sebep") notZorunlu(f);
  });

  /* ---------- Search window ---------- */
  /* ---------- Arama penceresi ---------- */
  function aramaAc() {
    var dlg = bul("#arama-penceresi");
    if (!acilabilir(dlg)) return false;
    ac(dlg);
    var girdi = bul(".arama-girdi", dlg);
    if (girdi) { girdi.focus(); girdi.select(); }
    return true;
  }

  d.addEventListener("click", function (e) {
    var hedef = e.target && e.target.closest ? e.target : null;
    if (!hedef) return;

    var arama = hedef.closest("[data-arama-ac]");
    if (arama && aramaAc()) { e.preventDefault(); return; }

    var sikayet = hedef.closest("[data-sikayet-ac]");
    if (sikayet) {
      var dlg = bul("#sikayet-penceresi");
      if (acilabilir(dlg)) {
        e.preventDefault();
        /* If the link is inside a ⋮ menu, the menu should not stay open (so it doesn't hang behind the window once it opens) */
        /* Bağlantı bir ⋮ menüsünün içindeyse menü açık kalmasın (pencere açılınca arkada asılı durmasın) */
        var acikMenu = sikayet.closest("[popover]");
        if (acikMenu && acikMenu.hidePopover) { try { acikMenu.hidePopover(); } catch (x) { /* already closed · zaten kapalı */ } }
        var form = bul("form", dlg);
        if (form) {
          form.reset();
          /* The link gives its target through data- attributes: message (data-post-id), user (data-kullanici),
             chat message (data-sohbet-id), private message (data-mesaj-id). All are written to a hidden field; unused ones are emptied. */
          /* Bağlantı hedefini data- alanlarıyla verir: mesaj (data-post-id), kullanıcı (data-kullanici),
             sohbet mesajı (data-sohbet-id), özel mesaj (data-mesaj-id). Hepsi gizli alana yazılır, kullanılmayanlar boşalır. */
          var alanlar = { post_id: "data-post-id", kullanici: "data-kullanici", sohbet_id: "data-sohbet-id", mesaj_id: "data-mesaj-id", oda_mesaj_id: "data-oda-mesaj-id" };
          Object.keys(alanlar).forEach(function (ad) {
            var gizli = bul('input[name="' + ad + '"]', form);
            if (gizli) gizli.value = sikayet.getAttribute(alanlar[ad]) || "";
          });
          /* Target type: CSS checks it to hide "Konu dışı" (Off-topic) for user and private-message reports */
          /* Hedef türü: CSS buna bakıp "Konu dışı"yı kullanıcı ve özel mesaj şikâyetinde gizler */
          dlg.setAttribute("data-hedef", sikayet.getAttribute("data-kullanici") ? "kullanici"
            : sikayet.getAttribute("data-sohbet-id") || sikayet.getAttribute("data-oda-mesaj-id") ? "sohbet" : sikayet.getAttribute("data-mesaj-id") ? "ozel" : "konu");
          var baslik = bul("#sikayet-baslik", dlg);
          if (baslik) {
            baslik.textContent = sikayet.getAttribute("data-baslik") ||
              (sikayet.getAttribute("data-kullanici") ? "Bu kullanıcıyı şikâyet et" : "Bu mesajı şikâyet et");
          }
          /* "Also block <name>" box: do not show it at all if no author was given */
          /* "<ad>’i de engelle" kutusu: yazar verilmediyse hiç gösterme */
          var yazar = sikayet.getAttribute("data-yazar") || "";
          var engelEtiket = bul(".sikayet-engel", form);
          if (engelEtiket) {
            engelEtiket.hidden = !yazar;
            var adYeri = bul("[data-yazar-ad]", engelEtiket);
            if (adYeri) adYeri.textContent = yazar ? belirtme(yazar) : "";
          }
          notZorunlu(form);
        }
        ac(dlg);
        var ilk = bul('input[name="sebep"]', dlg);
        if (ilk) ilk.focus();
      }
      return;
    }

    /* Share: without JS it is a plain link (goes to the item's page). With JS, the share sheet or copying to the clipboard. */
    /* Paylaş: JS yoksa düz bağlantıdır (öğenin sayfasına gider). JS varsa paylaşım menüsü ya da panoya kopyalama. */
    var paylas = hedef.closest("[data-paylas]");
    if (paylas) {
      var adres = paylas.href;
      if (navigator.share) {
        e.preventDefault();
        navigator.share({ title: paylas.getAttribute("data-baslik") || d.title, url: adres }).catch(function () { /* user cancelled · kullanıcı vazgeçti */ });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        e.preventDefault();
        navigator.clipboard.writeText(adres).then(function () {
          var eski = paylas.innerHTML;
          paylas.textContent = "Bağlantı kopyalandı";
          window.setTimeout(function () { paylas.innerHTML = eski; }, 2000);
        }, function () { window.location.href = adres; });
      }
      return;
    }

    var kapatici = hedef.closest("[data-dialog-kapat]");
    if (kapatici) {
      var kdlg = kapatici.closest("dialog");
      /* Without JS the Close link navigates back to the page; if the window can actually close, navigation is unnecessary */
      /* Kapat bağlantısı JS yokken sayfaya döner; pencere gerçekten kapanabiliyorsa gezinme gereksiz */
      if (kdlg && acilabilir(kdlg) && kapatici.tagName === "A") e.preventDefault();
      kapat(kdlg);
    }
  });

  /* Keyboard shortcuts: Ctrl/Cmd+K search, Ctrl/Cmd+, settings */
  /* Klavye kısayolları: Ctrl/Cmd+K arama, Ctrl/Cmd+, ayarlar */
  d.addEventListener("keydown", function (e) {
    var tus = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && tus === "k") {
      /* In the admin panel Ctrl+K opens the panel's own search box (/yonetim/ara), not the site's search window */
      /* Yönetim panelinde Ctrl+K sitenin arama penceresini değil, panelin kendi arama kutusunu (/yonetim/ara) açar */
      var panelAra = bul("[data-yn-ara]");
      if (panelAra) { e.preventDefault(); panelAra.focus(); panelAra.select(); return; }
      var dlg = bul("#arama-penceresi");
      if (!acilabilir(dlg)) return;
      e.preventDefault();
      if (dlg.open) kapat(dlg); else aramaAc();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && tus === ",") {
      var ayar = bul("[data-ayarlar-kisayol]");
      if (ayar && ayar.href) { e.preventDefault(); window.location.href = ayar.href; }
    }
  });

  /* Arrow-key navigation in search results */
  /* Arama sonuçlarında ok tuşlarıyla gezinme */
  var aramaDlg = bul("#arama-penceresi");
  if (aramaDlg) {
    aramaDlg.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var girdi = bul(".arama-girdi", aramaDlg);
      var ogeler = hepsi(".arama-sonuc", aramaDlg);
      if (!ogeler.length) return;
      var i = ogeler.indexOf(d.activeElement);
      var asagi = e.key === "ArrowDown";
      e.preventDefault();
      if (i === -1) { (asagi ? ogeler[0] : ogeler[ogeler.length - 1]).focus(); return; }
      if (asagi) { if (i < ogeler.length - 1) ogeler[i + 1].focus(); }
      else if (i === 0) { if (girdi) girdi.focus(); }
      else { ogeler[i - 1].focus(); }
    });
  }

  /* Close the window when the backdrop is clicked (both where the press started and where it ended must be the backdrop) */
  /* Arka plana tıklayınca pencereyi kapat (basılan ve bırakılan yer ikisi de arka plan olmalı) */
  var basilan = null;
  d.addEventListener("mousedown", function (e) { basilan = e.target; });
  d.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.tagName === "DIALOG" && t.open && basilan === t) kapat(t);
  });

  /* ---------- Position dropdown menus next to their trigger ---------- */
  /* ---------- Açılır menüleri tetikleyicinin yanına yerleştir ---------- */
  var sonTetik = null;
  d.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-menu-ac]") : null;
    if (t) sonTetik = t;
  }, true);
  d.addEventListener("toggle", function (e) {
    var el = e.target;
    if (e.newState !== "open" || !el.classList || !el.classList.contains("acilir-menu-konumlu") || !sonTetik) return;
    var r = sonTetik.getBoundingClientRect();
    var g = el.offsetWidth, y = el.offsetHeight, ek = 8;
    var sol = Math.min(Math.max(ek, r.right - g), window.innerWidth - g - ek);
    var ust = r.bottom + 4;
    if (ust + y > window.innerHeight - ek) ust = Math.max(ek, r.top - y - 4);
    el.style.inset = "auto";
    el.style.margin = "0";
    el.style.left = sol + "px";
    el.style.top = ust + "px";
  }, true);

  /* ---------- Feed category picker (konular.ejs #kategori-secici) ----------
     Without JS the button is a link to the /kategoriler page; if popover is supported it opens the same list.
     On phones the list is a bottom sheet in CSS (we do not set a position); on tablets it sits under the button without overflowing the screen. */
  /* ---------- Akış kategori seçici (konular.ejs #kategori-secici) ----------
     Düğme JS'siz /kategoriler sayfasına giden bir bağlantıdır; popover destekleniyorsa aynı listeyi açar.
     Telefonda liste CSS'te alttan açılan sayfadır (konum vermeyiz); tablette düğmenin altında, ekrandan taşmayacak biçimde durur. */
  d.addEventListener("click", function (e) {
    var dugme = e.target.closest ? e.target.closest("[data-kategori-ac]") : null;
    var liste = d.getElementById("kategori-secici");
    if (!dugme || !liste || !liste.showPopover || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    if (liste.matches(":popover-open")) { liste.hidePopover(); return; }
    liste.showPopover();
    if (window.matchMedia("(max-width: 800px)").matches) { liste.style.inset = ""; liste.style.margin = ""; return; }
    var r = dugme.getBoundingClientRect(), g = liste.offsetWidth, y = liste.offsetHeight;
    liste.style.inset = "auto"; liste.style.margin = "0";
    liste.style.left = Math.max(8, Math.min(r.left, window.innerWidth - g - 8)) + "px";
    liste.style.top = (r.bottom + 6 + y > window.innerHeight - 8 ? Math.max(8, r.top - y - 6) : r.bottom + 6) + "px";
  });

  /* ---------- Notification bars: hide after about 5 seconds ---------- */
  /* ---------- Bildirim çubukları: yaklaşık 5 saniye sonra gizle ---------- */
  hepsi("[data-otomatik-gizle]").forEach(function (cubuk) {
    var zamanlayici = null;
    function baslat() { zamanlayici = window.setTimeout(gizle, 5000); }
    function durdur() { if (zamanlayici) { window.clearTimeout(zamanlayici); zamanlayici = null; } }
    function gizle() {
      /* First a CSS transition to the left (opacity + slide), then display:none when it ends. If motion is reduced, hide without waiting. */
      /* Önce CSS geçişiyle sol (opacity + kayma), geçiş bitince display:none. Hareket azsa beklemeden gizle. */
      cubuk.classList.add("gizleniyor");
      window.setTimeout(function () { cubuk.classList.add("gizli"); }, hareketAzMi() ? 0 : 220);
    }
    cubuk.addEventListener("mouseenter", durdur);
    cubuk.addEventListener("focusin", durdur);
    cubuk.addEventListener("mouseleave", function () { durdur(); baslat(); });
    cubuk.addEventListener("focusout", function () { durdur(); baslat(); });
    baslat();
  });

  /* ---------- Vote "pop" animation ----------
     Voting reloads the page and the address ends with #mesaj-ID (#post-ID). If the previous page has the same path (i.e. we came back here from a vote
     submission, not through a link from another page), the selected vote button does a small "pop". */
  /* ---------- Oy "pop" animasyonu ----------
     Oy verince sayfa yeniden yüklenir ve adres #mesaj-ID ile biter. Önceki sayfa aynı yolsa (yani buraya bir oy
     gönderiminden döndük, başka sayfadan bir bağlantıyla gelmedik) seçili oy düğmesi küçük bir "pop" yapar. */
  (function () {
    if (!/^#mesaj-\d+$/.test(window.location.hash) || hareketAzMi()) return;
    try {
      var onceki = d.referrer ? new URL(d.referrer) : null;
      if (!onceki || onceki.origin !== window.location.origin || onceki.pathname !== window.location.pathname) return;
    } catch (e) { return; }
    var kutu = d.getElementById(window.location.hash.slice(1));
    if (!kutu) return;
    hepsi(".secili-yukari, .secili-asagi", kutu).forEach(function (dugme) {
      dugme.classList.add("oy-pop");
      dugme.addEventListener("animationend", function () { dugme.classList.remove("oy-pop"); }, { once: true });
    });
  })();

  /* =====================================================================
     Selector: a custom dropdown list replacing <select> (progressive enhancement)
     Seçici: <select>'in yerine geçen özel açılır liste (aşamalı geliştirme)
     - The real <select> stays in the DOM (invisible) and is what gets submitted; when a choice is made select.selectedIndex changes and
       'input' + 'change' events are fired, so existing code never notices that anything changed.
     - Without JS, or with data-yerel on the select, nothing happens: the native <select> works.
     - The list opens inside the nearest dialog/popover (or in body if there is none), not next to the trigger, and is put in the browser's
       "top layer" (popover="auto") when possible; so it appears above popovers such as the moderation menu.
     ===================================================================== */
  /* =====================================================================
     Seçici: <select>'in yerine geçen özel açılır liste (aşamalı geliştirme)
     ---------------------------------------------------------------------
     - Gerçek <select> DOM'da kalır (görünmez), forma o gönderilir; seçim yapılınca select.selectedIndex değişir ve
       'input' + 'change' olayları gönderilir, yani mevcut kod hiçbir şeyin değiştiğini fark etmez.
     - JS yoksa ya da select'te data-yerel varsa hiçbir şey olmaz: yerel <select> çalışır.
     - Liste, tetikleyicinin yanında değil en yakın dialog/popover içinde (yoksa body'de) açılır ve mümkünse
       tarayıcının "üst katmanına" (popover="auto") konur; böylece moderasyon menüsü gibi popover'ların da üstünde görünür.
     ===================================================================== */
  var seciciSayac = 0;
  var acikSecici = null; /* only one can be open at a time: { kapat: fn } · aynı anda yalnızca biri açık: { kapat: fn } */
  var TIK_SVG = '<svg class="secici-tik" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var OK_SVG = '<svg class="secici-ok" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var POPOVER_VAR = typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";

  function etiketMetni(sel) {
    if (sel.getAttribute("aria-label")) return sel.getAttribute("aria-label");
    var metin = "";
    Array.prototype.forEach.call(sel.labels || [], function (lbl) {
      /* The label may also contain the select and the selector; do not count their text */
      /* Etiketin içinde select ve seçici de olabilir; onların metnini sayma */
      var kopya = lbl.cloneNode(true);
      hepsi("select, .secici, .secici-liste", kopya).forEach(function (n) { n.remove(); });
      metin += " " + kopya.textContent;
    });
    return metin.replace(/\s+/g, " ").trim();
  }

  function seciciKur(sel) {
    if (sel.multiple || sel.size > 1 || sel.hasAttribute("data-yerel") || sel.getAttribute("data-secici-hazir")) return;
    sel.setAttribute("data-secici-hazir", "1");
    var kimlik = "secici-" + (++seciciSayac);

    var tetik = d.createElement("button");
    tetik.type = "button";
    /* The select's classes (e.g. yn-girdi) are passed on to the trigger too: size/width rules in the admin panel apply automatically */
    /* Select'in sınıfları (örn. yn-girdi) tetikleyiciye de geçer: yönetim panelindeki boyut/genişlik kuralları kendiliğinden uygulanır */
    tetik.className = ("secici " + sel.className).trim();
    tetik.setAttribute("role", "combobox");
    tetik.setAttribute("aria-haspopup", "listbox");
    tetik.setAttribute("aria-expanded", "false");
    tetik.setAttribute("aria-controls", kimlik + "-liste");
    if (sel.getAttribute("aria-labelledby")) tetik.setAttribute("aria-labelledby", sel.getAttribute("aria-labelledby"));
    else { var ad = etiketMetni(sel); if (ad) tetik.setAttribute("aria-label", ad); }
    if (sel.required) tetik.setAttribute("aria-required", "true");
    var degerEl = d.createElement("span");
    degerEl.className = "secici-deger";
    tetik.appendChild(degerEl);
    tetik.insertAdjacentHTML("beforeend", OK_SVG);

    sel.classList.add("secici-yerel");
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
    sel.parentNode.insertBefore(tetik, sel.nextSibling);

    /* the browser closes the panel when the trigger is clicked; the time is kept so the click that follows does not reopen it */
    /* tarayıcı paneli tetikleyiciye tıklanınca kapatır; ardından gelen click yeniden açmasın diye zamanı tutulur */
    var sonKapanis = 0;
    var panel = null, ogeler = [], aktif = -1, kapanis = null, arama = "", aramaZaman = null;
    var host = sel.closest("dialog, [popover]") || d.body;

    function guncelle() {
      var o = sel.options[sel.selectedIndex];
      degerEl.textContent = o ? o.text.trim() : "";
      tetik.classList.toggle("secici-bos", !o || o.value === "");
      tetik.disabled = sel.disabled;
    }
    function gecerliYap() {
      tetik.removeAttribute("aria-invalid");
      var alan = sel.closest(".alan");
      if (alan) alan.classList.remove("hatali");
    }

    function ogeKur() {
      ogeler = [];
      panel.textContent = "";
      var no = 0;
      function ogeEkle(opt, kap) {
        var el = d.createElement("div");
        el.id = kimlik + "-o" + (no++);
        el.className = "secici-oge" + (opt.value === "" ? " secici-oge-bos" : "");
        el.setAttribute("role", "option");
        el.setAttribute("aria-selected", opt.selected ? "true" : "false");
        if (opt.disabled) el.setAttribute("aria-disabled", "true");
        var sp = d.createElement("span");
        sp.textContent = opt.text.trim();
        el.appendChild(sp);
        el.insertAdjacentHTML("beforeend", TIK_SVG);
        kap.appendChild(el);
        ogeler.push({ el: el, opt: opt, metin: sp.textContent.toLocaleLowerCase("tr") });
      }
      Array.prototype.forEach.call(sel.children, function (c) {
        if (c.tagName === "OPTION") ogeEkle(c, panel);
        else if (c.tagName === "OPTGROUP") {
          var g = d.createElement("div");
          g.setAttribute("role", "group");
          var b = d.createElement("div");
          b.className = "secici-grup-ad";
          b.id = kimlik + "-g" + (no++);
          b.textContent = c.label;
          g.setAttribute("aria-labelledby", b.id);
          g.appendChild(b);
          Array.prototype.forEach.call(c.children, function (opt) {
            if (opt.tagName === "OPTION") { ogeEkle(opt, g); if (c.disabled) ogeler[ogeler.length - 1].el.setAttribute("aria-disabled", "true"); }
          });
          panel.appendChild(g);
        }
      });
    }

    function etkin(i) { return i >= 0 && i < ogeler.length && ogeler[i].el.getAttribute("aria-disabled") !== "true"; }
    function aktifYap(i, kaydir) {
      if (!etkin(i)) return;
      if (aktif >= 0 && ogeler[aktif]) ogeler[aktif].el.classList.remove("aktif");
      aktif = i;
      var el = ogeler[i].el;
      el.classList.add("aktif");
      tetik.setAttribute("aria-activedescendant", el.id);
      if (kaydir !== false) {
        /* scrollIntoView may also scroll the page; adjust only the panel's own scroll */
        /* scrollIntoView sayfayı da kaydırabilir; yalnızca panelin kendi kaydırmasını ayarla */
        if (el.offsetTop < panel.scrollTop) panel.scrollTop = el.offsetTop - 6;
        else if (el.offsetTop + el.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = el.offsetTop + el.offsetHeight - panel.clientHeight + 6;
      }
    }
    function sonraki(bas, yon) {
      for (var i = bas + yon; i >= 0 && i < ogeler.length; i += yon) if (etkin(i)) return i;
      return -1;
    }

    function konumla() {
      if (!panel) return;
      var r = tetik.getBoundingClientRect(), bosluk = 8;
      var vw = window.innerWidth, vh = window.innerHeight;
      panel.style.minWidth = r.width + "px";
      panel.style.maxWidth = (vw - 2 * bosluk) + "px";
      panel.style.maxHeight = "320px";
      var h = panel.offsetHeight, w = panel.offsetWidth;
      var altBos = vh - r.bottom - bosluk - 4, ustBos = r.top - bosluk - 4;
      /* If it does not fit below and there is more room above, open upward (flip) */
      /* Aşağıya sığmıyorsa ve yukarısı daha genişse yukarı aç (flip) */
      var yukari = h > altBos && ustBos > altBos;
      var kalan = yukari ? ustBos : altBos;
      if (kalan < 320) { panel.style.maxHeight = Math.max(96, kalan) + "px"; h = panel.offsetHeight; }
      panel.style.top = (yukari ? r.top - 4 - h : r.bottom + 4) + "px";
      panel.style.left = Math.min(Math.max(bosluk, r.left), Math.max(bosluk, vw - w - bosluk)) + "px";
      panel.setAttribute("data-yon", yukari ? "ust" : "alt");
    }
    function olayKonumla(e) { if (panel && !(e && e.target && panel.contains(e.target))) konumla(); }
    function disBasma(e) { if (panel && !panel.contains(e.target) && !tetik.contains(e.target)) kapat(false); }
    function hostKapandi(e) { if (panel && e.newState === "closed" && e.target === host) bitir(); }

    function bitir() {
      /* Remove the panel completely without waiting for the animation */
      /* Animasyon beklemeden paneli tamamen kaldır */
      window.clearTimeout(kapanis); kapanis = null;
      if (!panel) return;
      if (POPOVER_VAR && panel.matches(":popover-open")) { try { panel.hidePopover(); } catch (e) { /* already closed · zaten kapalı */ } }
      panel.remove();
      panel = null; ogeler = []; aktif = -1;
      tetik.removeAttribute("aria-activedescendant");
    }

    function kapat(odakVer) {
      if (!panel || tetik.getAttribute("aria-expanded") !== "true") return;
      tetik.setAttribute("aria-expanded", "false");
      d.removeEventListener("pointerdown", disBasma, true);
      window.removeEventListener("resize", olayKonumla);
      window.removeEventListener("scroll", olayKonumla, true);
      d.removeEventListener("toggle", hostKapandi, true);
      if (acikSecici && acikSecici.tetik === tetik) acikSecici = null;
      panel.classList.remove("acik"); /* CSS: exit transition (--sure-hizli) · CSS: çıkış geçişi (--sure-hizli) */
      kapanis = window.setTimeout(bitir, hareketAzMi() ? 0 : 140);
      if (odakVer) tetik.focus();
    }

    function ac() {
      if (tetik.disabled) return;
      if (acikSecici && acikSecici.tetik !== tetik) acikSecici.kapat(false);
      if (panel) bitir(); /* reopening while the closing animation is still running · kapanış animasyonu sürerken yeniden açılıyor */
      panel = d.createElement("div");
      panel.className = "secici-liste";
      panel.id = kimlik + "-liste";
      panel.setAttribute("role", "listbox");
      panel.setAttribute("aria-label", tetik.getAttribute("aria-label") || etiketMetni(sel));
      ogeKur();
      /* Mouse: focus stays on the trigger (aria-activedescendant requires this) */
      /* Fare: odak tetikleyicide kalsın (aria-activedescendant bunu gerektirir) */
      panel.addEventListener("mousedown", function (e) { e.preventDefault(); });
      panel.addEventListener("click", function (e) {
        var el = e.target.closest ? e.target.closest(".secici-oge") : null;
        if (!el) return;
        for (var i = 0; i < ogeler.length; i++) if (ogeler[i].el === el) { sec(i); return; }
      });
      panel.addEventListener("mousemove", function (e) {
        var el = e.target.closest ? e.target.closest(".secici-oge") : null;
        if (!el) return;
        for (var i = 0; i < ogeler.length; i++) if (ogeler[i].el === el) { if (i !== aktif) aktifYap(i, false); return; }
      });
      host.appendChild(panel);
      if (POPOVER_VAR) {
        /* "auto" popover: Escape and an outside click close the innermost (this) panel first; an outer popover such as moderation stays open.
           (with manual, Escape would close the outer menu too.) */
        /* "auto" popover: Escape ve dışarı tıklama önce en içteki (bu) paneli kapatır; moderasyon gibi dış popover açık kalır.
           (manual olsaydı Escape dış menüyü de kapatırdı.) */
        panel.setAttribute("popover", "auto");
        panel.addEventListener("toggle", function (e) { if (e.newState === "closed") { if (tetik.getAttribute("aria-expanded") === "true") sonKapanis = Date.now(); kapat(false); } });
        panel.showPopover();
      }
      else panel.classList.add("acik-yer");
      tetik.setAttribute("aria-expanded", "true");
      konumla();
      var i0 = sel.selectedIndex >= 0 && etkin(sel.selectedIndex) ? sel.selectedIndex : sonraki(-1, 1);
      aktif = -1;
      aktifYap(i0);
      /* so that the initial state gets painted and the transition plays */
      /* başlangıç durumu çizilsin ki geçiş oynasın */
      void panel.offsetWidth;
      panel.classList.add("acik");
      acikSecici = { tetik: tetik, kapat: kapat };
      d.addEventListener("pointerdown", disBasma, true);
      window.addEventListener("resize", olayKonumla);
      window.addEventListener("scroll", olayKonumla, true);
      d.addEventListener("toggle", hostKapandi, true);
    }

    function sec(i) {
      if (!etkin(i)) return;
      var degisti = sel.selectedIndex !== ogeler[i].opt.index;
      sel.selectedIndex = ogeler[i].opt.index;
      guncelle();
      kapat(true);
      if (!degisti) return;
      gecerliYap();
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      /* Filter forms in the admin panel: submitted automatically when the selection changes */
      /* Yönetim panelindeki süzgeç formları: seçim değişince kendiliğinden gönderilir */
      var f = sel.form;
      if (f && f.classList.contains("yn-filtre")) { if (f.requestSubmit) f.requestSubmit(); else f.submit(); }
    }

    function yazAra(harf) {
      window.clearTimeout(aramaZaman);
      arama += harf.toLocaleLowerCase("tr");
      aramaZaman = window.setTimeout(function () { arama = ""; }, 700);
      /* Repeating the same letter such as "aaa": cycle through the items starting with that letter */
      /* "aaa" gibi aynı harf tekrarı: aynı harfle başlayanlar arasında sırayla dolaş */
      var ayni = arama.split("").every(function (c) { return c === arama[0]; });
      var aranan = ayni ? arama[0] : arama;
      var bas = (ayni && arama.length > 1) || aktif < 0 ? aktif + 1 : aktif;
      for (var k = 0; k < ogeler.length; k++) {
        var i = (bas + k + ogeler.length) % ogeler.length;
        if (etkin(i) && ogeler[i].metin.indexOf(aranan) === 0) { aktifYap(i); return; }
      }
    }

    tetik.addEventListener("click", function () {
      if (Date.now() - sonKapanis < 80) { tetik.focus(); return; }
      if (tetik.getAttribute("aria-expanded") === "true") kapat(true); else ac();
    });
    tetik.addEventListener("keyup", function (e) { if (e.key === " " && tetik.getAttribute("aria-expanded") === "true") e.preventDefault(); });
    tetik.addEventListener("keydown", function (e) {
      var acik = tetik.getAttribute("aria-expanded") === "true";
      var k = e.key;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!acik) {
        if (k === "Enter" || k === " " || k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); ac(); }
        else if (k.length === 1 && k !== " ") { e.preventDefault(); ac(); yazAra(k); }
        return;
      }
      if (k === "ArrowDown") { e.preventDefault(); var a = sonraki(aktif, 1); if (a >= 0) aktifYap(a); }
      else if (k === "ArrowUp") { e.preventDefault(); var y = sonraki(aktif, -1); if (y >= 0) aktifYap(y); }
      else if (k === "Home") { e.preventDefault(); aktifYap(sonraki(-1, 1)); }
      else if (k === "End") { e.preventDefault(); aktifYap(sonraki(ogeler.length, -1)); }
      else if (k === "PageDown") { e.preventDefault(); var pd = sonraki(Math.min(aktif + 5, ogeler.length - 1) + 1, -1); aktifYap(pd >= 0 ? pd : aktif); }
      else if (k === "PageUp") { e.preventDefault(); var pu = sonraki(Math.max(aktif - 5, 0) - 1, 1); aktifYap(pu >= 0 ? pu : aktif); }
      else if (k === "Enter" || (k === " " && !arama)) { e.preventDefault(); sec(aktif); }
      else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); kapat(true); }
      else if (k === "Tab") { kapat(false); }
      else if (k.length === 1) { e.preventDefault(); yazAra(k); }
    });
    /* When focus leaves the trigger (other than via Tab: e.g. the browser tab changed) the list should not stay open */
    /* Odak tetikleyiciden çıkınca (Tab dışında: örn. sekme değişti) liste açık kalmasın */
    tetik.addEventListener("blur", function () { window.setTimeout(function () { if (d.activeElement !== tetik && panel && !panel.contains(d.activeElement)) kapat(false); }, 0); });

    /* When a <label> is clicked or validation focus arrives, the real select gets focus; pass the focus on to the trigger */
    /* <label> tıklanınca ya da doğrulama odağı gelince gerçek select odak alır; odağı tetikleyiciye aktar */
    sel.addEventListener("focus", function () { tetik.focus(); });
    /* "required" validation: for an invisible select the browser bubble does not appear in the right place. Block the bubble, turn the trigger red and focus it. */
    /* "required" doğrulaması: görünmez select için tarayıcı balonu yerinde çıkmaz. Balonu engelle, tetikleyiciyi kırmızı yap ve odakla. */
    sel.addEventListener("invalid", function (e) {
      e.preventDefault();
      tetik.setAttribute("aria-invalid", "true");
      var alan = sel.closest(".alan");
      if (alan) alan.classList.add("hatali");
      if (sel.form && sel.form.querySelector(":invalid") === sel) tetik.focus();
    });
    /* If code changes select.value from outside (or the form is reset) the displayed value should update */
    /* Kod dışarıdan select.value değiştirirse (ya da form sıfırlanırsa) görünen değer güncellensin */
    sel.addEventListener("change", guncelle);
    if (sel.form) sel.form.addEventListener("reset", function () { window.setTimeout(function () { guncelle(); gecerliYap(); }, 0); });
    guncelle();
  }

  /* ---------- Phone top bar: floating state ----------
     When scrolling down passes 64px, data-yuzen is added to <header class="ust-cubuk"> (CSS turns the bar into a floating capsule, katmanlar.css),
     and removed when back near the top (<16px). Two thresholds (64 on, 16 off) prevent flicker: for someone scrolling right at the boundary the bar does not flip back and forth.
     The scroll event is listened to passively and handled at most once per frame via requestAnimationFrame. Without JS the bar always stays fixed (normal). */
  /* ---------- Telefon üst çubuğu: yüzen hâl ----------
     Aşağı kaydırma 64px'i geçince <header class="ust-cubuk">'a data-yuzen eklenir (CSS çubuğu yüzen kapsüle çevirir, katmanlar.css),
     sayfa başına (<16px) dönünce kalkar. İki eşik (64 açar, 16 kapatır) titremeyi önler: tam sınırda kaydıran kişide çubuk gidip gelmez.
     Scroll olayı pasif dinlenir ve requestAnimationFrame ile kare başına en çok bir kez işlenir. JS yoksa çubuk hep sabit (normal) kalır. */
  var ustCubuk = bul(".ust-cubuk"), yuzenBekleyen = false;
  function yuzenGuncelle() {
    yuzenBekleyen = false;
    if (!ustCubuk) return;
    var y = window.pageYOffset || d.documentElement.scrollTop || 0;
    var telefon = window.matchMedia && window.matchMedia("(max-width: 800px)").matches;
    var acik = ustCubuk.hasAttribute("data-yuzen");
    if (telefon && !acik && y > 64) ustCubuk.setAttribute("data-yuzen", "");
    else if ((!telefon || y < 16) && acik) ustCubuk.removeAttribute("data-yuzen");
  }
  if (ustCubuk) {
    window.addEventListener("scroll", function () { if (!yuzenBekleyen) { yuzenBekleyen = true; window.requestAnimationFrame(yuzenGuncelle); } }, { passive: true });
    window.addEventListener("resize", yuzenGuncelle, { passive: true });
    yuzenGuncelle();
  }

  /* ---------- Bottom bar height (--alt-yer) ----------
     Bars pinned to the bottom of the screen (the bottom menu on phones, the selection and decision bars in the panel)
     are marked with data-alt-cubuk. The height taken up by those that are currently visible and touch the bottom of the screen is measured
     and written to <html> as --alt-yer; the notification bar (toast) sits above it, so they never overlap.
     To add a new bottom bar, data-alt-cubuk alone is enough. */
  /* ---------- Alt çubuk yüksekliği (--alt-yer) ----------
     Ekranın altına sabitlenen çubuklar (telefonda alt menü, paneldeki seçim ve karar çubukları)
     data-alt-cubuk ile işaretlenir. O an görünen ve ekranın dibine değenlerin kapladığı yükseklik ölçülüp
     <html>'e --alt-yer olarak yazılır; bildirim çubuğu (toast) bunun üstünde durur, böylece hiçbir zaman üst üste binmez.
     Yeni bir alt çubuk eklemek için yalnızca data-alt-cubuk yeterli. */
  var altBekleyen = false;
  function altYerOlc() {
    altBekleyen = false;
    var yer = 0, h = window.innerHeight;
    hepsi("[data-alt-cubuk]").forEach(function (el) {
      var st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || (st.position !== "fixed" && st.position !== "sticky")) return;
      var r = el.getBoundingClientRect();
      /* Floating bars (like a dock) do not touch the very bottom; those in the bottom zone (last 160px) count */
      /* Yüzen çubuklar (dock gibi) dibe tam değmez; alt bölgede (son 160px) duranlar sayılır */
      if (r.height === 0 || r.bottom < h - 160 || r.top >= h) return;
      yer = Math.max(yer, h - r.top);
    });
    d.documentElement.style.setProperty("--alt-yer", Math.round(yer) + "px");
  }
  function altYerPlanla() { if (!altBekleyen) { altBekleyen = true; window.requestAnimationFrame(altYerOlc); } }
  ["resize", "scroll", "change", "toggle", "transitionend", "animationend"].forEach(function (olay) {
    window.addEventListener(olay, altYerPlanla, { passive: true, capture: true });
  });
  /* measure right away the first time: requestAnimationFrame can be delayed in a background/new tab */
  /* ilk ölçüm hemen: requestAnimationFrame arka plandaki/yeni sekmede gecikebilir */
  altYerOlc();

  hepsi("select").forEach(seciciKur);

  /* The Filter button is hidden only in forms made up solely of selectors; it stays in forms that have a text/date/number box (for people who do not know to press Enter) */
  /* Süz düğmesi yalnızca seçicilerden oluşan formlarda gizlenir; yazı/tarih/sayı kutusu olan formlarda kalır (Enter'a basmayı bilmeyen için) */
  hepsi("form.yn-filtre").forEach(function (f) {
    if (f.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])')) f.classList.add("yn-suz-kalsin");
  });

  /* ---------- Phone: filters collapse ----------
     On narrow screens the filter form used to fill the whole screen. A "Süzgeçler" (Filters) button is placed in front of the form; the form starts closed
     (CSS hides it only at ≤800px, the button is invisible on wide screens). The number of active filters is written on the button so that
     the user notices the list is filtered. Without JS the form is always open. */
  /* ---------- Telefon: süzgeçler katlanır ----------
     Dar ekranda süzgeç formu bütün ekranı kaplıyordu. Formun önüne "Süzgeçler" düğmesi konur; form kapalı başlar
     (CSS yalnızca ≤800px'te gizler, geniş ekranda düğme görünmez). Etkin süzgeç sayısı düğmede yazar ki
     kullanıcı listenin süzülmüş olduğunu fark etsin. JS yoksa form her zaman açıktır. */
  hepsi("form.yn-filtre").forEach(function (f) {
    var etkin = hepsi("input, select", f).filter(function (el) {
      if (el.type === "hidden" || el.type === "submit" || el.type === "checkbox") return false;
      if (el.tagName === "SELECT") return el.selectedIndex > 0;
      return el.value.trim() !== "";
    }).length;
    var dugme = d.createElement("button");
    dugme.type = "button";
    dugme.className = "buton buton-cerceveli yn-filtre-ac";
    dugme.setAttribute("aria-expanded", "false");
    dugme.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8Z"/></svg><span>Süzgeçler</span>' +
      (etkin ? '<b class="yn-filtre-sayi">' + etkin + "</b>" : "");
    f.classList.add("katli");
    f.parentNode.insertBefore(dugme, f);
    dugme.addEventListener("click", function () {
      var acik = f.classList.toggle("katli") === false;
      dugme.setAttribute("aria-expanded", acik ? "true" : "false");
      if (acik) { var ilk = bul("input:not([type=hidden]), .secici", f); if (ilk) ilk.focus(); }
    });
  });

  /* ---------- Settings: highlight the section currently in view ----------
     The Settings sub-rows in the side menu (desktop) and the section tabs on the page (tablet/phone) carry the same links (data-bolum-bag). As the page scrolls,
     the links of the section entering the top third of the screen get aria-current; they are also highlighted immediately on tap. */
  /* ---------- Ayarlar: o an görünen bölümü vurgula ----------
     Kenar menüdeki Ayarlar alt satırları (masaüstü) ve sayfadaki bölüm sekmeleri (tablet/telefon) aynı bağlantıları taşır (data-bolum-bag). Sayfa kaydırıldıkça
     ekranın üst üçte birine giren bölümün bağlantıları aria-current alır; dokununca da hemen vurgulanır. */
  (function () {
    var baglar = hepsi("[data-bolum-bag]");
    if (!baglar.length || !("IntersectionObserver" in window)) return;
    function vurgula(id) {
      baglar.forEach(function (a) {
        var bu = a.getAttribute("href") === "#" + id;
        if (bu) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
        a.classList.toggle("aktif", bu);
      });
    }
    var bolumler = baglar.map(function (a) { return d.getElementById(a.getAttribute("href").slice(1)); })
      .filter(function (b, i, dizi) { return b && dizi.indexOf(b) === i; });
    /* rootMargin: only the "reading band" between 15% and 45% from the top of the screen counts; the section in that band is the active one */
    /* rootMargin: yalnızca ekranın üstten %15–%45 arası "okuma bandı" sayılır; o banttaki bölüm etkindir */
    var gozcu = new IntersectionObserver(function (girdiler) {
      girdiler.forEach(function (g) { if (g.isIntersecting) vurgula(g.target.id); });
    }, { rootMargin: "-15% 0px -55% 0px" });
    bolumler.forEach(function (b) { gozcu.observe(b); });
    /* At the very bottom of the page the last section may never enter the band: highlight the last one when at the bottom */
    /* Sayfanın en altında son bölüm banda hiç giremeyebilir: dipteyken sonuncuyu vurgula */
    window.addEventListener("scroll", function () {
      if (window.innerHeight + window.scrollY >= d.documentElement.scrollHeight - 4) vurgula(bolumler[bolumler.length - 1].id);
    }, { passive: true });
    baglar.forEach(function (a) { a.addEventListener("click", function () { vurgula(a.getAttribute("href").slice(1)); }); });
    if (window.location.hash && d.getElementById(window.location.hash.slice(1))) vurgula(window.location.hash.slice(1));
  })();

  /* ---------- Bulk action: action fields hidden when nothing is selected ----------
     On phones the bulk action box shows only "Hepsini seç" (Select all) until a row is selected; once a selection is made
     it turns into a bar stuck to the bottom of the screen and shows how many items are selected. */
  /* ---------- Toplu işlem: seçim yokken işlem alanları gizli ----------
     Telefonda toplu işlem kutusu, satır seçilene kadar yalnızca "Hepsini seç" gösterir; seçim yapılınca
     ekranın altına yapışan bir çubuğa dönüşür ve kaç öğe seçildiğini yazar. */
  hepsi("#toplu-form").forEach(function (form) {
    var sayac = d.createElement("span");
    sayac.className = "yn-secim-sayi";
    sayac.setAttribute("aria-live", "polite");
    var kutu = bul(".yn-toplu", form);
    if (kutu) kutu.insertBefore(sayac, kutu.children[1] || null);
    function say() {
      var n = hepsi('input[name="id"]:checked', form).length;
      form.classList.toggle("secim-var", n > 0);
      sayac.textContent = n ? n + " seçili" : "";
    }
    form.addEventListener("change", function () { window.setTimeout(say, 0); });
    say();
  });

  /* ---------- New message: search users ----------
     Without JS the button is a link to the /mesajlar/yeni page; with JS the same search opens in a window.
     As you type (after a 250 ms wait) up to 8 people come from the /mesajlar/kisi-ara?q= JSON endpoint. */
  /* ---------- Yeni mesaj: kullanıcı ara ----------
     Düğme JS yokken /mesajlar/yeni sayfasına giden bir bağlantıdır; JS varsa aynı arama pencerede açılır.
     Yazdıkça (250 ms bekleyip) /mesajlar/kisi-ara?q= JSON uç noktasından en fazla 8 kişi gelir. */
  (function () {
    var dlg = bul("#yeni-mesaj-penceresi");
    if (!acilabilir(dlg)) return;
    var girdi = bul("[data-kisi-ara]", dlg), liste = bul("[data-kisi-sonuc]", dlg);
    var zamanlayici = null, sayac = 0;
    function yaz(metin) {
      liste.textContent = "";
      var p = d.createElement("li"); p.className = "kisi-bos"; p.textContent = metin; liste.appendChild(p);
    }
    function goster(kisiler) {
      if (!kisiler.length) { yaz("Eşleşen kullanıcı yok."); return; }
      liste.textContent = "";
      kisiler.forEach(function (k) {
        var li = d.createElement("li"), a = d.createElement("a"), av = d.createElement("span"), ad = d.createElement("strong");
        a.className = "kisi-sonuc"; a.href = "/mesajlar/" + encodeURIComponent(k.username);
        av.className = "avatar avatar-36"; av.textContent = k.username[0];
        ad.textContent = k.username;
        a.appendChild(av); a.appendChild(ad);
        if (k.rutbe) { var r = d.createElement("span"); r.className = "rozet"; r.textContent = k.rutbe; a.appendChild(r); }
        li.appendChild(a); liste.appendChild(li);
      });
    }
    function ara() {
      var q = girdi.value.trim(), benim = ++sayac;
      if (!q) { yaz("Bir kullanıcı adı yazmaya başla."); return; }
      fetch("/mesajlar/kisi-ara?q=" + encodeURIComponent(q), { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : []; })
        /* A late old reply must not overwrite a newer one: only the reply to the latest request is rendered */
        /* Geç gelen eski cevap yenisini ezmesin: yalnızca son isteğin cevabı çizilir */
        .then(function (k) { if (benim === sayac) goster(k); })
        .catch(function () { if (benim === sayac) yaz("Arama şu an yapılamadı."); });
    }
    girdi.addEventListener("input", function () { window.clearTimeout(zamanlayici); zamanlayici = window.setTimeout(ara, 250); });
    d.addEventListener("click", function (e) {
      var dugme = e.target && e.target.closest ? e.target.closest("[data-yeni-mesaj-ac]") : null;
      if (!dugme) return;
      e.preventDefault();
      girdi.value = ""; yaz("Bir kullanıcı adı yazmaya başla.");
      ac(dlg); girdi.focus();
    });
  })();

  /* ---------- Message menu: Copy ----------
     The item is hidden by CSS without JS (it appears once the .js class is set). data-kopyala = a selector pointing to the element that holds the text to copy. */
  /* ---------- Mesaj menüsü: Kopyala ----------
     Öğe JS yokken CSS ile gizlidir (.js sınıfı gelince görünür). data-kopyala = kopyalanacak metnin elemanını gösteren seçici. */
  d.addEventListener("click", function (e) {
    var dugme = e.target && e.target.closest ? e.target.closest("[data-kopyala]") : null;
    if (!dugme) return;
    var kaynak = bul(dugme.getAttribute("data-kopyala"));
    var ad = bul(".acilir-ad", dugme), eski = ad ? ad.textContent : "";
    var menu = dugme.closest("[popover]");
    function bitti(basarili) {
      if (ad) ad.textContent = basarili ? "Kopyalandı" : "Kopyalanamadı";
      window.setTimeout(function () {
        if (ad) ad.textContent = eski;
        if (menu && menu.hidePopover) { try { menu.hidePopover(); } catch (x) { /* closed · kapalı */ } }
      }, hareketAzMi() ? 400 : 700);
    }
    if (!kaynak) { bitti(false); return; }
    var metin = kaynak.textContent.trim();
    /* Fallback for old/insecure contexts or when permission is denied: write into a hidden field, select + copy */
    /* Eski/güvensiz bağlamlarda ya da izin verilmediğinde yedek yol: gizli bir alana yazıp seç + kopyala */
    function yedek() {
      var t = d.createElement("textarea");
      t.value = metin; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      d.body.appendChild(t); t.select();
      var tamam = false;
      try { tamam = d.execCommand("copy"); } catch (x) { tamam = false; }
      d.body.removeChild(t);
      bitti(tamam);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(metin).then(function () { bitti(true); }, yedek);
    else yedek();
  });

  /* ---------- Private rooms: windows, confirmation, invite-people search ----------
     The windows are <dialog>s. Without JS the links in the menu go to /oda/:id/<panel> and the page renders the window OPEN (non-modal);
     with JS that open window is reopened here as modal, and the links open the window without reloading the page. */
  /* ---------- Özel odalar: pencereler, onay, kişi davet araması ----------
     Pencereler <dialog>. JS yokken menüdeki bağlantılar /oda/:id/<panel> adresine gider ve sayfa pencereyi AÇIK (modal olmadan) çizer;
     JS varsa burada o açık pencere modal olarak yeniden açılır, bağlantılar sayfayı yenilemeden pencereyi açar. */
  hepsi("dialog.oda-pencere[open]").forEach(function (dlg) {
    if (!acilabilir(dlg) || dlg.matches(":modal")) return;
    dlg.close(); dlg.showModal();
  });
  /* When the window closes, the address bar goes from the fallback address (/oda/5/uyeler) back to the room's own address */
  /* Pencere kapanınca adres çubuğu yedek adresten (/oda/5/uyeler) odanın kendi adresine dönsün */
  d.addEventListener("close", function (e) {
    var dlg = e.target;
    if (!dlg || !dlg.classList || !dlg.classList.contains("oda-pencere")) return;
    var geri = dlg.getAttribute("data-geri");
    if (geri && window.history && history.replaceState && location.pathname !== geri.split("?")[0]) history.replaceState(null, "", geri);
  }, true);
  d.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("[data-oda-panel]") : null;
    if (!a) return;
    var dlg = bul("#oda-" + a.getAttribute("data-oda-panel"));
    if (!acilabilir(dlg)) return; /* old browser: the link goes to the page · eski tarayıcı: bağlantı sayfaya gider */
    e.preventDefault();
    var menu = a.closest("[popover]");
    if (menu && menu.hidePopover) { try { menu.hidePopover(); } catch (x) { /* closed · kapalı */ } }
    hepsi("dialog.oda-pencere[open]").forEach(kapat); /* tab switch: close the open one first · sekme geçişi: önce açık olanı kapat */
    ac(dlg);
    var girdi = bul("input:not([type=hidden]), textarea", dlg);
    if (girdi && a.getAttribute("data-oda-panel") !== "ayarlar") girdi.focus();
  });
  /* Dangerous or hard-to-undo actions: the form asks using its data-onay text (inline onsubmit is not used because the text may contain user content) */
  /* Tehlikeli ya da geri dönüşü zor işlemler: form data-onay metniyle sorar (metin kullanıcı içeriği içerebildiği için satır içi onsubmit kullanılmaz) */
  d.addEventListener("submit", function (e) {
    var f = e.target;
    var soru = f && f.getAttribute ? f.getAttribute("data-onay") : null;
    if (soru && !window.confirm(soru)) e.preventDefault();
  });
  /* Double-submit protection: tapping twice on a phone or pressing the button again on a slow connection can send the same POST
     twice (the same suspension produced two rows in the audit log). The same form is not resubmitted within 4 s.
     Because of the time limit the form still works on a page reached with "back"; it does not count if the confirmation question was cancelled (defaultPrevented). */
  /* Çift gönderim koruması: telefonda iki kez dokunmak ya da yavaş bağlantıda düğmeye yeniden basmak aynı POST'u
     iki kez yollayabiliyor (işlem kaydına aynı uzaklaştırma iki satır düştü). Aynı form 4 sn içinde yeniden gönderilmez.
     Süre sınırı olduğu için "geri" ile dönülen sayfada form yine çalışır; onay sorusu iptal edildiyse (defaultPrevented) sayılmaz. */
  d.addEventListener("submit", function (e) {
    var f = e.target;
    if (e.defaultPrevented || !f || (f.getAttribute("method") || "").toLowerCase() !== "post") return;
    var simdi = Date.now(), son = Number(f.getAttribute("data-gonderildi") || 0);
    if (simdi - son < 4000) { e.preventDefault(); return; }
    f.setAttribute("data-gonderildi", String(simdi));
  });
  /* Admin › Content "Select all" box: checks all checkboxes on the visible page (without JS they are selected one by one).
     It used to be an inline <script> in the template; moved here because CSP forbids inline scripts. */
  /* Yönetim › İçerik "Hepsini seç" kutusu: görünen sayfadaki bütün onay kutularını işaretler (JS yoksa tek tek seçilir).
     Eskiden şablonda satır içi <script> idi; CSP satır içi betiği yasakladığı için buraya taşındı. */
  hepsi("[data-hepsini-sec]").forEach(function (k) {
    k.addEventListener("change", function () {
      hepsi('#toplu-form input[name="id"]').forEach(function (x) { x.checked = k.checked; });
    });
  });
  /* Search people to invite: as you type, up to 8 people come from /oda/:id/kisi-ara; each row has its own "Davet et" (Invite) form (the CSRF token is read from the list) */
  /* Davet için kişi ara: yazdıkça /oda/:id/kisi-ara'dan en çok 8 kişi gelir; her satırda kendi "Davet et" formu (CSRF belirteci listeden okunur) */
  hepsi("[data-oda-kisi-ara]").forEach(function (girdi) {
    var odaId = girdi.getAttribute("data-oda-kisi-ara");
    var dlg = girdi.closest("dialog"), liste = bul("[data-oda-kisi-sonuc]", dlg);
    var csrf = liste.getAttribute("data-csrf");
    var zamanlayici = null, sayac = 0;
    function yaz(metin) {
      liste.textContent = "";
      var p = d.createElement("li"); p.className = "kisi-bos"; p.textContent = metin; liste.appendChild(p);
    }
    function gizli(ad, deger) {
      var i = d.createElement("input"); i.type = "hidden"; i.name = ad; i.value = deger; return i;
    }
    function goster(kisiler) {
      if (!kisiler.length) { yaz("Davet edilebilecek eşleşen kullanıcı yok."); return; }
      liste.textContent = "";
      kisiler.forEach(function (k) {
        var li = d.createElement("li"), av = d.createElement("span"), ad = d.createElement("strong");
        li.className = "oda-kisi"; av.className = "avatar avatar-36"; av.textContent = k.username[0]; ad.textContent = k.username;
        li.appendChild(av); li.appendChild(ad);
        if (k.rutbe) { var r = d.createElement("span"); r.className = "rozet"; r.textContent = k.rutbe; li.appendChild(r); }
        var f = d.createElement("form"), b = d.createElement("button");
        f.method = "post"; f.action = "/oda/" + odaId + "/davet";
        f.appendChild(gizli("_csrf", csrf)); f.appendChild(gizli("panel", "davet")); f.appendChild(gizli("kullanici", k.username));
        b.className = "buton buton-tonal"; b.type = "submit"; b.textContent = "Davet et";
        f.appendChild(b); li.appendChild(f); liste.appendChild(li);
      });
    }
    function ara() {
      var q = girdi.value.trim(), benim = ++sayac;
      if (!q) { yaz("Bir kullanıcı adı yazmaya başla."); return; }
      fetch("/oda/" + odaId + "/kisi-ara?q=" + encodeURIComponent(q), { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (k) { if (benim === sayac) goster(k); })
        .catch(function () { if (benim === sayac) yaz("Arama şu an yapılamadı."); });
    }
    girdi.addEventListener("input", function () { window.clearTimeout(zamanlayici); zamanlayici = window.setTimeout(ara, 250); });
    /* Enter: run the search immediately instead of reloading the page */
    /* Enter: sayfa yenilemek yerine aramayı hemen yap */
    girdi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); window.clearTimeout(zamanlayici); ara(); } });
  });

  /* ---------- Profile appearance (Settings), custom color picker and member card window (sql/18) ---------- */
  /* ---------- Profil görünümü (Ayarlar), özel renk seçici ve üye kartı penceresi (sql/18) ---------- */

  /* ---------- Crop and position (avatar / banner upload) ----------
     Choosing a file does not upload it; it opens a window. The crop is computed in the browser and sent to the server in the source image's NATURAL pixel coordinates
     (kirp_x, kirp_y, kirp_g, kirp_y2); the server redoes the bounds and ratio checks. If the window cannot open
     (old browser) or the image cannot be decoded, the form is submitted as is: the server crops from the center. */
  /* ---------- Kırp ve konumla (avatar / banner yüklemesi) ----------
     Dosya seçilince yükleme yapılmaz, pencere açılır. Kırpma tarayıcıda hesaplanır ve kaynak görselin DOĞAL piksel koordinatlarında
     sunucuya gider (kirp_x, kirp_y, kirp_g, kirp_y2); sunucu sınır ve oran denetimini yeniden yapar. Pencere açılamazsa
     (eski tarayıcı) ya da görsel çözülemezse form olduğu gibi gönderilir: sunucu ortadan kırpar. */
  (function () {
    var dlg = bul("#kirp-pencere");
    var girdiler = hepsi("input[data-kirp]");
    if (!girdiler.length) return;
    function duz(g) { if (g.files && g.files.length && g.form) g.form.requestSubmit(); }
    if (!dlg || !acilabilir(dlg) || !window.URL || !window.URL.createObjectURL || !window.fetch || !window.FormData) {
      girdiler.forEach(function (g) { g.addEventListener("change", function () { duz(g); }); });
      return;
    }
    var alan = bul(".kirp-alan", dlg), resim = bul(".kirp-resim", dlg), yakin = bul("#kirp-yakin", dlg);
    var hataKutu = bul("#kirp-hata", dlg), kaydet = bul("#kirp-kaydet", dlg), baslik = bul("#kirp-baslik", dlg);
    var kutular = hepsi(".kirp-kutu", dlg);
    var ORAN = 2.2, ORANLAR = { tablet: 3, masaustu: 3.7 };
    var dur = null; /* { girdi, tur, adres, nw, nh, z, ox, oy, aw, ah, kapsa } */

    function tavan(n, en, cok) { return Math.max(en, Math.min(cok, n)); }
    function konum() { var r = bul("input[name=kirp_konum]:checked", dlg); return r ? r.value : "orta"; }

    /* The area size comes from CSS (square or 2.2:1); scale = the smallest scale that makes the image FILL the area × zoom */
    /* Alan boyutu CSS'ten gelir (kare ya da 2,2:1); ölçek = görseli alanı DOLDURACAK en küçük ölçek × yakınlaştırma */
    function olc() {
      dur.aw = alan.clientWidth; dur.ah = alan.clientHeight;
      dur.kapsa = Math.max(dur.aw / dur.nw, dur.ah / dur.nh);
    }
    function olcek() { return dur.kapsa * dur.z; }
    /* To leave no gaps, the image's edge never goes inside the area */
    /* Boşluk bırakmamak için görselin kenarı alanın içine girmez */
    function sinirla() {
      var s = olcek();
      dur.ox = tavan(dur.ox, dur.aw - dur.nw * s, 0);
      dur.oy = tavan(dur.oy, dur.ah - dur.nh * s, 0);
    }
    /* Crop rectangle: the visible part of the area → source pixels. Rounded to integers and clamped inside the image;
       square for avatar, 2.2:1 kept for banner (the server accepts ±1 px / ±2%). */
    /* Kırpma dikdörtgeni: alanın görünen kısmı → kaynak piksel. Tam sayıya yuvarlanır ve görselin içine sıkıştırılır;
       avatarda kare, bannerda 2,2:1 korunur (sunucu ±1 px / ±%2 kabul eder). */
    function kirpma() {
      var s = olcek(), g = Math.round(dur.aw / s), y2;
      g = Math.min(g, dur.nw);
      if (dur.tur === "avatar") { g = Math.min(g, dur.nh); y2 = g; }
      else { y2 = Math.round(g / ORAN); if (y2 > dur.nh) { y2 = dur.nh; g = Math.min(dur.nw, Math.round(y2 * ORAN)); } }
      var x = tavan(Math.round(-dur.ox / s), 0, dur.nw - g), y = tavan(Math.round(-dur.oy / s), 0, dur.nh - y2);
      return { x: x, y: y, g: g, y2: y2 };
    }
    function ciz() {
      sinirla();
      var s = olcek();
      resim.style.transform = "translate(" + dur.ox + "px," + dur.oy + "px) scale(" + s + ")";
      yakin.value = String(Math.round(dur.z * 100));
      var k = kirpma(), kn = konum();
      kutular.forEach(function (kutu) {
        var im = kutu.firstChild, w = kutu.clientWidth, h = kutu.clientHeight;
        if (!im || !w) return;
        var oran = kutu.getAttribute("data-oran"), kh = k.y2, ky = k.y;
        if (oran) {
          /* The phone preview is the whole crop; tablet/desktop show its top/middle/bottom strip (the alignment choice) */
          /* Telefon önizlemesi kırpmanın tamamıdır; tablet/masaüstü onun üst/orta/alt şeridini gösterir (yasla seçimi) */
          kh = oran === "2.2" ? k.y2 : Math.min(k.y2, k.g / Number(oran));
          ky = k.y + (kn === "ust" ? 0 : kn === "alt" ? k.y2 - kh : (k.y2 - kh) / 2);
        }
        var ks = w / k.g;
        kutu.style.height = oran ? (w / Number(oran)) + "px" : "";
        im.style.transform = "translate(" + (-k.x * ks) + "px," + (-ky * ks) + "px) scale(" + ks + ")";
      });
    }
    function yakinlastir(z, cx, cy) {
      var eski = olcek(), p = (cx - dur.ox) / eski, q = (cy - dur.oy) / eski;
      dur.z = tavan(z, 1, 4);
      var yeni = olcek(); dur.ox = cx - p * yeni; dur.oy = cy - q * yeni;
      ciz();
    }
    function hataGoster(m) { hataKutu.textContent = m || ""; hataKutu.hidden = !m; }

    function kapatTemizle() {
      if (!dur) return;
      try { window.URL.revokeObjectURL(dur.adres); } catch (e) { /* negligible · önemsiz */ }
      /* Cancel / Esc: the file selection is reset, no upload happens */
      /* Vazgeç / Esc: dosya seçimi sıfırlanır, yükleme olmaz */
      if (!dur.gonderildi) dur.girdi.value = "";
      resim.removeAttribute("src");
      kutular.forEach(function (k) { if (k.firstChild) k.removeChild(k.firstChild); });
      dur = null;
    }
    dlg.addEventListener("close", kapatTemizle);

    function ac_(girdi) {
      var dosya = girdi.files && girdi.files[0];
      if (!dosya) return;
      var tur = girdi.getAttribute("data-kirp"), adres = window.URL.createObjectURL(dosya);
      var deneme = new Image();
      deneme.onload = function () {
        dur = { girdi: girdi, tur: tur, adres: adres, nw: deneme.naturalWidth, nh: deneme.naturalHeight, z: 1, ox: 0, oy: 0, gonderildi: false };
        dlg.setAttribute("data-tur", tur);
        baslik.textContent = tur === "avatar" ? "Avatarı kırp ve konumla" : "Bannerı kırp ve konumla";
        /* Banner alignment: start with the saved value (middle if none) */
        /* Banner'ın yaslaması: kayıtlı değerle başla (yoksa orta) */
        var kb = tur === "banner" ? bul("[data-gorsel-satiri=banner] .gs-banner[data-konum]") : null;
        var kayitli = kb ? kb.getAttribute("data-konum") : "orta";
        var r = bul("input[name=kirp_konum][value=" + kayitli + "]", dlg) || bul("input[name=kirp_konum][value=orta]", dlg);
        r.checked = true;
        dlg.setAttribute("data-konum", r.value);
        hataGoster("");
        kaydet.disabled = false;
        resim.src = adres; resim.width = dur.nw; resim.height = dur.nh;
        kutular.forEach(function (k) {
          var im = d.createElement("img"); im.src = adres; im.alt = ""; im.width = dur.nw; im.height = dur.nh; im.draggable = false;
          k.appendChild(im);
        });
        ac(dlg);
        olc();
        /* Start: image centered in the area, full coverage */
        /* Başlangıç: görsel alanda ortalı, tam kapsama */
        dur.ox = (dur.aw - dur.nw * olcek()) / 2; dur.oy = (dur.ah - dur.nh * olcek()) / 2;
        ciz();
        alan.focus({ preventScroll: true });
      };
      /* If the browser could not decode it (e.g. a corrupt file): let the server decide and show the error message as a toast */
      /* Tarayıcı çözemediyse (örn. bozuk dosya): sunucu karar versin, hata mesajını toast olarak versin */
      deneme.onerror = function () { window.URL.revokeObjectURL(adres); duz(girdi); };
      deneme.src = adres;
    }
    girdiler.forEach(function (g) { g.addEventListener("change", function () { ac_(g); }); });

    /* Dragging and two fingers: pointer events (mouse, pen and touch use the same code) */
    /* Sürükleme ve iki parmak: pointer events (fare, kalem, dokunmatik aynı kodla) */
    var isaretler = {}, pinch = null;
    function sayi_() { return Object.keys(isaretler).length; }
    alan.addEventListener("pointerdown", function (e) {
      if (!dur) return;
      isaretler[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { alan.setPointerCapture(e.pointerId); } catch (x) { /* negligible · önemsiz */ }
      if (sayi_() === 2) {
        var p = Object.keys(isaretler).map(function (k) { return isaretler[k]; });
        pinch = { aralik: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), z: dur.z };
      }
    });
    alan.addEventListener("pointermove", function (e) {
      if (!dur || !isaretler[e.pointerId]) return;
      var onceki = isaretler[e.pointerId];
      isaretler[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (sayi_() >= 2 && pinch) {
        var p = Object.keys(isaretler).map(function (k) { return isaretler[k]; });
        var a = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        var r = alan.getBoundingClientRect();
        if (pinch.aralik > 0) yakinlastir(pinch.z * a / pinch.aralik, (p[0].x + p[1].x) / 2 - r.left, (p[0].y + p[1].y) / 2 - r.top);
      } else {
        dur.ox += e.clientX - onceki.x; dur.oy += e.clientY - onceki.y; ciz();
      }
    });
    function birak(e) { delete isaretler[e.pointerId]; if (sayi_() < 2) pinch = null; }
    alan.addEventListener("pointerup", birak);
    alan.addEventListener("pointercancel", birak);
    alan.addEventListener("wheel", function (e) {
      if (!dur) return;
      e.preventDefault();
      var r = alan.getBoundingClientRect();
      yakinlastir(dur.z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    yakin.addEventListener("input", function () { if (dur) yakinlastir(Number(yakin.value) / 100, dur.aw / 2, dur.ah / 2); });
    /* Keyboard: arrows pan (Shift: big step), + / − zoom */
    /* Klavye: oklar kaydırır (Shift: büyük adım), + / − yakınlaştırır */
    alan.addEventListener("keydown", function (e) {
      if (!dur) return;
      var adim = e.shiftKey ? 40 : 10, kullanildi = true;
      if (e.key === "ArrowLeft") dur.ox += adim; else if (e.key === "ArrowRight") dur.ox -= adim;
      else if (e.key === "ArrowUp") dur.oy += adim; else if (e.key === "ArrowDown") dur.oy -= adim;
      else if (e.key === "+" || e.key === "=") { yakinlastir(dur.z * 1.1, dur.aw / 2, dur.ah / 2); return e.preventDefault(); }
      else if (e.key === "-" || e.key === "_") { yakinlastir(dur.z / 1.1, dur.aw / 2, dur.ah / 2); return e.preventDefault(); }
      else kullanildi = false;
      if (kullanildi) { e.preventDefault(); ciz(); }
    });
    hepsi("input[name=kirp_konum]", dlg).forEach(function (r) {
      r.addEventListener("change", function () { dlg.setAttribute("data-konum", r.value); if (dur) ciz(); });
    });
    window.addEventListener("resize", function () {
      if (!dur || !dlg.open) return;
      var s0 = olcek(), merkezX = (dur.aw / 2 - dur.ox) / s0, merkezY = (dur.ah / 2 - dur.oy) / s0;
      olc(); var s1 = olcek(); dur.ox = dur.aw / 2 - merkezX * s1; dur.oy = dur.ah / 2 - merkezY * s1; ciz();
    });

    /* Save: the original file + crop info are sent with fetch; on success the page reloads (the toast comes from the server) */
    /* Kaydet: asıl dosya + kırpma bilgisi fetch ile gider; başarıda sayfa yenilenir (toast sunucudan gelir) */
    kaydet.addEventListener("click", function () {
      if (!dur) return;
      var k = kirpma(), girdi = dur.girdi, form = girdi.form, veri = new FormData();
      veri.append("_csrf", bul("input[name=_csrf]", form).value);
      veri.append("dosya", girdi.files[0]);
      veri.append("kirp_x", String(k.x)); veri.append("kirp_y", String(k.y)); veri.append("kirp_g", String(k.g)); veri.append("kirp_y2", String(k.y2));
      if (dur.tur === "banner") veri.append("konum", konum());
      kaydet.disabled = true; hataGoster("");
      window.fetch(form.action, { method: "POST", body: veri, credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(function (yanit) { return yanit.json().then(function (j) { return { ok: yanit.ok, j: j }; }, function () { return { ok: false, j: {} }; }); })
        .then(function (s) {
          if (s.ok && s.j.tamam) { dur.gonderildi = true; window.location.reload(); return; }
          hataGoster(s.j.hata || "Yüklenemedi. Sayfayı yenileyip tekrar dene."); kaydet.disabled = false;
        })
        .catch(function () { hataGoster("Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene."); kaydet.disabled = false; });
    });
  })();

  var HEX = /^#[0-9a-f]{6}$/i;
  function hexHsv(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), f = mx - mn, h = 0;
    if (f) h = mx === r ? ((g - b) / f) % 6 : mx === g ? (b - r) / f + 2 : (r - g) / f + 4;
    return { h: (h * 60 + 360) % 360, s: mx ? f / mx : 0, v: mx };
  }
  function hsvHex(h, s, v) {
    function k(n) { var a = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(a, 4 - a, 1)); }
    function p(x) { var t = Math.round(x * 255).toString(16); return t.length < 2 ? "0" + t : t; }
    return "#" + p(k(5)) + p(k(3)) + p(k(1));
  }

  /* Live preview: when selections change, the card's attributes/variables update instantly (the card is already rendered correctly on the server) */
  /* Canlı önizleme: seçimler değişince kartın öznitelikleri/değişkenleri anında güncellenir (kart sunucuda zaten doğru çizilmiştir) */
  hepsi("[data-profil-gorunum]").forEach(function (bolum) {
    var kart = bul(".pk[data-pk-onizleme]", bolum), form = bul("#pg-form", bolum);
    if (!kart || !form) return;
    var av = bul(".avatar-kart", kart);
    function guncelle() {
      var el = form.elements, efekt = el.efekt.value, sus = el.sus.value;
      kart.setAttribute("data-efekt", efekt);
      hepsi(".ef-grup", kart).forEach(function (g) { g.hidden = g.getAttribute("data-efekt") !== efekt; });
      if (av) { av.setAttribute("data-sus", sus); hepsi(".av-sus-grup", av).forEach(function (g) { g.hidden = g.getAttribute("data-sus") !== sus; }); }
      var kullan = el.renk_kullan.checked;
      ["ana", "vurgu"].forEach(function (ad) {
        var v = el["renk_" + ad].value;
        if (kullan && HEX.test(v)) kart.style.setProperty("--pk-" + ad, v); else kart.style.removeProperty("--pk-" + ad);
      });
      if (kullan && el.renk_gecis.value === "gecis") kart.setAttribute("data-gecis", ""); else kart.removeAttribute("data-gecis");
    }
    form.addEventListener("input", guncelle);
    form.addEventListener("change", guncelle);

    /* HEX field ↔ color input */
    /* HEX alanı ↔ renk girdisi */
    hepsi("[data-renk-hex]", form).forEach(function (hexAlani) {
      var renk = form.elements[hexAlani.getAttribute("data-renk-hex")];
      hexAlani.addEventListener("input", function () {
        var v = hexAlani.value.trim(); if (v && v[0] !== "#") v = "#" + v;
        var gecerli = HEX.test(v);
        hexAlani.classList.toggle("hatali", !!hexAlani.value && !gecerli);
        if (gecerli) { renk.value = v.toLowerCase(); renk.dispatchEvent(new Event("input", { bubbles: true })); }
      });
      renk.addEventListener("input", function () { if (d.activeElement !== hexAlani) hexAlani.value = renk.value; });
    });
    guncelle();
  });

  /* Custom color picker: saturation×brightness square, hue strip, HEX, eyedropper, random, recently used.
     A popover (same surface as the dropdown menu); on phones CSS turns it into a bottom sheet. Without JS the browser's own picker works. */
  /* Özel renk seçici: doygunluk×parlaklık karesi, ton şeridi, HEX, damlalık, rastgele, son kullanılanlar.
     Popover (açılır menüyle aynı yüzey); telefonda CSS onu alttan açılan sayfa yapar. JS yoksa tarayıcının kendi seçicisi çalışır. */
  var panel = null, panelHedef = null, hsv = { h: 0, s: 1, v: 1 };
  var GECMIS = "rubyyard.renkGecmisi";
  function gecmisOku() { try { var g = JSON.parse(window.localStorage.getItem(GECMIS) || "[]"); return Array.isArray(g) ? g.filter(function (x) { return HEX.test(x); }).slice(0, 8) : []; } catch (e) { return []; } }
  function gecmisYaz(hex) { try { var g = gecmisOku().filter(function (x) { return x !== hex; }); g.unshift(hex); window.localStorage.setItem(GECMIS, JSON.stringify(g.slice(0, 8))); } catch (e) { /* localStorage may be disabled · localStorage kapalı olabilir */ } }
  function panelKur() {
    if (panel) return;
    panel = d.createElement("div"); panel.className = "renk-panel"; panel.setAttribute("popover", ""); panel.setAttribute("aria-label", "Renk seçici");
    panel.innerHTML = '<div class="rp-alan" data-rp-alan><span class="rp-tutac"></span></div><div class="rp-ton" data-rp-ton><span class="rp-tutac"></span></div>' +
      '<div class="rp-satir"><input class="renk-hex" data-rp-hex maxlength="7" aria-label="HEX" autocomplete="off" spellcheck="false">' +
      '<button class="buton buton-tonal" type="button" data-rp-damla hidden>Damlalık</button><button class="buton buton-tonal" type="button" data-rp-rastgele>Rastgele</button></div>' +
      '<div><div class="ust-etiket">SON KULLANDIKLARIN</div><div class="rp-onceki" data-rp-onceki></div></div>';
    d.body.appendChild(panel);
    function surukle(oge, fn) {
      oge.addEventListener("pointerdown", function (e) {
        oge.setPointerCapture(e.pointerId); fn(e);
        function tasi(ev) { fn(ev); } function birak() { oge.removeEventListener("pointermove", tasi); oge.removeEventListener("pointerup", birak); }
        oge.addEventListener("pointermove", tasi); oge.addEventListener("pointerup", birak);
      });
    }
    function oran(ev, oge) { var r = oge.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }; }
    surukle(bul("[data-rp-alan]", panel), function (e) { var o = oran(e, bul("[data-rp-alan]", panel)); hsv.s = o.x; hsv.v = 1 - o.y; panelUygula(); });
    surukle(bul("[data-rp-ton]", panel), function (e) { hsv.h = oran(e, bul("[data-rp-ton]", panel)).x * 360; panelUygula(); });
    bul("[data-rp-hex]", panel).addEventListener("input", function (e) {
      var v = e.target.value.trim(); if (v && v[0] !== "#") v = "#" + v;
      if (HEX.test(v)) { hsv = hexHsv(v); panelUygula(true); }
    });
    bul("[data-rp-rastgele]", panel).addEventListener("click", function () { hsv = { h: Math.random() * 360, s: .4 + Math.random() * .5, v: .5 + Math.random() * .5 }; panelUygula(); });
    var damla = bul("[data-rp-damla]", panel);
    if (window.EyeDropper) { damla.hidden = false; damla.addEventListener("click", function () { new window.EyeDropper().open().then(function (s) { hsv = hexHsv(s.sRGBHex); panelUygula(); }).catch(function () { /* cancelled · iptal */ }); }); }
    panel.addEventListener("toggle", function (e) { if (e.newState === "closed" && panelHedef) gecmisYaz(panelHedef.value); });
  }
  function panelCiz(hexAlaniniYaz) {
    var a = bul("[data-rp-alan]", panel), t = bul("[data-rp-ton]", panel);
    a.style.setProperty("--rp-ton", Math.round(hsv.h));
    bul(".rp-tutac", a).style.left = hsv.s * 100 + "%"; bul(".rp-tutac", a).style.top = (1 - hsv.v) * 100 + "%";
    bul(".rp-tutac", t).style.left = hsv.h / 360 * 100 + "%";
    if (hexAlaniniYaz !== true) bul("[data-rp-hex]", panel).value = hsvHex(hsv.h, hsv.s, hsv.v);
  }
  function panelUygula(hexAlanindan) {
    panelCiz(hexAlanindan);
    if (panelHedef) { panelHedef.value = hsvHex(hsv.h, hsv.s, hsv.v); panelHedef.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  function panelAc(girdi) {
    panelKur(); panelHedef = girdi; hsv = hexHsv(girdi.value);
    var onceki = bul("[data-rp-onceki]", panel); onceki.textContent = "";
    var g = gecmisOku();
    if (!g.length) { var bos = d.createElement("span"); bos.className = "ikincil kucuk"; bos.textContent = "Henüz yok."; onceki.appendChild(bos); }
    g.forEach(function (hex) {
      var b = d.createElement("button"); b.type = "button"; b.style.background = hex; b.setAttribute("aria-label", hex);
      b.addEventListener("click", function () { hsv = hexHsv(hex); panelUygula(); });
      onceki.appendChild(b);
    });
    panelCiz();
    var telefon = window.matchMedia && window.matchMedia("(max-width: 800px)").matches;
    if (telefon) { panel.style.inset = ""; panel.style.margin = ""; }
    else {
      var r = (girdi.closest(".renk-dugme") || girdi).getBoundingClientRect(), w = 280, h = 380;
      panel.style.inset = "auto"; panel.style.margin = "0";
      panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
      panel.style.top = (r.bottom + 8 + h > window.innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8) + "px";
    }
    panel.showPopover();
  }
  d.addEventListener("click", function (e) {
    var g = e.target.closest ? e.target.closest("input[data-renk-secici]") : null;
    if (!g || !d.createElement("div").showPopover) return;
    e.preventDefault(); panelAc(g);
  });

  /* Member card window: the author name/avatar (data-uye-karti) opens the card in a popover if JS is present; otherwise the link goes to the profile.
     Desktop/tablet: a small card next to the name; phone: BOTTOM SHEET: a 44px Close at the top right, and the handle can really be dragged
     (closes if released >=80px down, snaps back if less). The open/close slide is a CSS transition (efektler.css); only the dragging is here. */
  /* Üye kartı penceresi: yazar adı/avatarı (data-uye-karti) JS varsa kartı popover'da açar; yoksa bağlantı profile gider.
     Masaüstü/tablette adın yanında küçük kart; telefonda ALTTAN SAYFA: sağ üstte 44px Kapat, tutamaç gerçekten sürüklenir
     (aşağı >=80px bırakılırsa kapanır, azsa yerine döner). Açılış/kapanış kayması CSS geçişidir (efektler.css), burada yalnızca sürükleme var. */
  var kartPop = null;
  var KART_KAPAT = '<button type="button" class="uye-karti-kapat" aria-label="Kapat"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
  var KART_TUTAMAC = '<div class="uye-karti-tutamac" aria-hidden="true"></div>';
  function kartDoldur(icerik) { if (kartPop) kartPop.innerHTML = icerik + KART_KAPAT + KART_TUTAMAC; }
  function kartKur() {
    kartPop = d.createElement("div"); kartPop.className = "uye-karti"; kartPop.setAttribute("popover", ""); kartPop.setAttribute("aria-label", "Üye kartı");
    d.body.appendChild(kartPop);
    kartPop.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".uye-karti-kapat")) kartPop.hidePopover();
    });
    /* Drag-to-close: pointer events route mouse, touch and pen through the same code. The transition is turned off while dragging (so it follows the finger exactly),
       and on release the inline style is removed: the CSS transition then plays either the closing slide or the snap back. */
    /* Sürükle-kapat: pointer olayları fareyi, dokunmayı ve kalemi aynı koddan geçirir. Sürerken geçiş kapatılır (parmağı birebir izlesin),
       bırakınca satır içi stil silinir: CSS geçişi ya kapanış kaymasını ya da yerine dönmeyi oynatır. */
    var bas = null, dy = 0;
    kartPop.addEventListener("pointerdown", function (e) {
      if (!e.target.closest || !e.target.closest(".uye-karti-tutamac")) return;
      bas = e.clientY; dy = 0;
      try { e.target.setPointerCapture(e.pointerId); } catch (x) { /* even if capture fails, dragging still works (events reach the page) · yakalanamazsa da sürükleme çalışır (olaylar sayfaya gelir) */ }
      kartPop.style.transition = "none";
    });
    kartPop.addEventListener("pointermove", function (e) {
      if (bas === null) return;
      dy = Math.max(0, e.clientY - bas);
      kartPop.style.transform = "translateY(" + dy + "px)";
    });
    function birak() {
      if (bas === null) return;
      var kapan = dy >= 80;
      bas = null;
      kartPop.style.transition = ""; kartPop.style.transform = "";
      if (kapan) kartPop.hidePopover();
    }
    kartPop.addEventListener("pointerup", birak);
    kartPop.addEventListener("pointercancel", birak);
  }
  d.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("[data-uye-karti]") : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!d.createElement("div").showPopover) return;
    e.preventDefault();
    if (!kartPop) kartKur();
    kartDoldur('<div class="uye-karti-yukleniyor">Yükleniyor…</div>');
    var telefon = window.matchMedia && window.matchMedia("(max-width: 800px)").matches, r = a.getBoundingClientRect();
    if (kartPop.matches(":popover-open")) kartPop.hidePopover();
    kartPop.style.transform = ""; kartPop.style.transition = "";
    /* position comes from CSS: a sheet sitting at the bottom of the screen */
    /* konumu CSS verir: ekranın altına oturan sayfa */
    if (telefon) { kartPop.style.inset = ""; kartPop.style.margin = ""; }
    else {
      kartPop.style.inset = "auto"; kartPop.style.margin = "0";
      kartPop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 316)) + "px";
      kartPop.style.top = Math.max(8, Math.min(r.bottom + 8, window.innerHeight - 460)) + "px";
    }
    kartPop.showPopover();
    fetch("/profil/" + encodeURIComponent(a.getAttribute("data-uye-karti")) + "/kart", { credentials: "same-origin", headers: { Accept: "text/html" } })
      .then(function (y) { if (!y.ok) throw new Error("hata"); return y.text(); })
      .then(function (html) { kartDoldur(html); })
      .catch(function () { kartPop.hidePopover(); window.location.href = a.getAttribute("href"); });
  });
  /* Ruby reward window (partials/yakut-odul.ejs): the server renders it as <dialog open> (visible without JS too, "Tamam" is a form method=dialog).
     Here it is made modal (backdrop, focus lock, Esc) and the amount is counted up from 0. If motion is reduced the number stays directly at the final value. */
  /* Yakut ödül penceresi (partials/yakut-odul.ejs): sunucu <dialog open> olarak çizer (JS'siz de görünür, "Tamam" form method=dialog).
     Burada modal yapılır (karartma, odak kilidi, Esc) ve miktar 0'dan saydırılır. Hareket azaltılmışsa sayı doğrudan son değerde kalır. */
  hepsi("dialog[data-yakut-odul]").forEach(function (dlg) {
    if (acilabilir(dlg) && dlg.open) { dlg.removeAttribute("open"); dlg.showModal(); }
    var say = bul("[data-say]", dlg);
    if (!say || hareketAzMi()) return;
    var hedef = parseInt(say.getAttribute("data-say"), 10) || 0, sure = 900, bas = null;
    say.textContent = "0";
    function adim(t) {
      if (bas === null) bas = t;
      var o = Math.min(1, (t - bas) / sure), e = 1 - Math.pow(1 - o, 3); /* slows down as it stops · yavaşlayarak durur */
      say.textContent = Math.round(hedef * e).toLocaleString("tr-TR");
      if (o < 1) requestAnimationFrame(adim);
    }
    requestAnimationFrame(adim);
  });
  /* ======================================================================
     Comment attachments and external link confirmation (sql/23). All of it is progressive enhancement: without JS the photo link opens the file, the YouTube box
     and external links go to the /cikis page, and the reply form is submitted as a normal multipart form.
     ====================================================================== */
  /* ======================================================================
     Yorum ekleri ve dış bağlantı onayı (sql/23). Hepsi aşamalı geliştirme: JS yoksa fotoğraf bağlantısı dosyayı açar, YouTube kutusu
     ve dış bağlantılar /cikis sayfasına gider, cevap formu normal multipart gönderilir.
     ====================================================================== */
  function guvenliAdres(u) { try { var x = new URL(u, location.href); return /^https?:$/.test(x.protocol) && x.hostname ? x : null; } catch (e) { return null; } }

  /* ---------- External link confirmation: "You are leaving rubyyard" ----------
     A bottom sheet on phones, a centered window on large screens (CSS: .cikis-penceresi). "Do not ask again for <domain> in this session" is written to sessionStorage
     (gone when the tab closes); if storage is unavailable (private window etc.) it silently asks every time, via try/catch. */
  /* ---------- Dış bağlantı onayı: "rubyyard'dan ayrılıyorsun" ----------
     Telefonda alttan sayfa, büyük ekranda ortada pencere (CSS: .cikis-penceresi). "Bu oturumda <alan> için tekrar sorma" sessionStorage'a yazılır
     (sekme kapanınca gider); depo kullanılamazsa (gizli pencere vb.) try/catch ile sessizce her seferinde sorulur. */
  var IZIN_ANAHTARI = "rubyyard.cikisIzin";
  function izinliAlanlar() { try { return JSON.parse(sessionStorage.getItem(IZIN_ANAHTARI) || "[]") || []; } catch (e) { return []; } }
  function alanIzniVer(alan) { try { var l = izinliAlanlar(); if (l.indexOf(alan) < 0) l.push(alan); sessionStorage.setItem(IZIN_ANAHTARI, JSON.stringify(l)); } catch (e) { /* no storage: asked every time · depo yok: her seferinde sorulur */ } }
  function yeniSekme(adres) { var w = window.open(adres, "_blank", "noopener,noreferrer"); if (!w) location.href = adres; }
  var cikisDlg = null;
  function cikisPenceresi(url) {
    if (!acilabilir(d.createElement("dialog"))) { location.href = "/cikis?u=" + encodeURIComponent(url.href); return; }
    if (!cikisDlg) {
      cikisDlg = d.createElement("dialog"); cikisDlg.className = "cikis-penceresi"; cikisDlg.setAttribute("aria-labelledby", "cikis-baslik");
      d.body.appendChild(cikisDlg);
      /* closes when the backdrop is tapped */
      /* karartmaya dokununca kapanır */
      cikisDlg.addEventListener("click", function (e) { if (e.target === cikisDlg) kapat(cikisDlg); });
    }
    var alan = url.hostname.replace(/^www\./, "");
    cikisDlg.textContent = "";
    var kap = d.createElement("div"); kap.className = "cikis-ic";
    var h = d.createElement("h2"); h.id = "cikis-baslik"; h.textContent = "rubyyard’dan ayrılıyorsun";
    var kutu = d.createElement("div"); kutu.className = "cikis-alan";
    var b = d.createElement("strong"); b.textContent = alan;
    var tam = d.createElement("span"); tam.textContent = url.href;
    kutu.appendChild(b); kutu.appendChild(tam);
    var uyari = d.createElement("div"); uyari.className = "bilgi-notu cikis-uyari";
    uyari.textContent = "Görünen yazı ile adres farklıysa dikkat et. Başka sitelerin içeriğinden rubyyard sorumlu değildir.";
    var onay = d.createElement("label"); onay.className = "cikis-onay";
    var kutucuk = d.createElement("input"); kutucuk.type = "checkbox";
    var onayMetin = d.createElement("span"); onayMetin.textContent = "Bu oturumda " + alan + " için tekrar sorma";
    onay.appendChild(kutucuk); onay.appendChild(onayMetin);
    var eylem = d.createElement("div"); eylem.className = "cikis-eylem";
    var vazgec = d.createElement("button"); vazgec.type = "button"; vazgec.className = "buton buton-cerceveli"; vazgec.textContent = "Vazgeç";
    var git = d.createElement("a"); git.className = "buton buton-birincil"; git.textContent = "Siteye git"; git.href = url.href;
    git.target = "_blank"; git.rel = "nofollow ugc noopener noreferrer";
    vazgec.addEventListener("click", function () { kapat(cikisDlg); });
    git.addEventListener("click", function () { if (kutucuk.checked) alanIzniVer(alan); kapat(cikisDlg); });
    eylem.appendChild(vazgec); eylem.appendChild(git);
    kap.appendChild(h); kap.appendChild(kutu); kap.appendChild(uyari); kap.appendChild(onay); kap.appendChild(eylem);
    cikisDlg.appendChild(kap);
    ac(cikisDlg);
    git.focus();
  }
  d.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[data-dis-baglanti]") : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    var url = guvenliAdres(a.getAttribute("data-dis-baglanti"));
    if (!url) return; /* if invalid, the /cikis page shows 400 · geçersizse /cikis sayfası 400 gösterir */
    e.preventDefault();
    if (izinliAlanlar().indexOf(url.hostname.replace(/^www\./, "")) > -1) yeniSekme(url.href); else cikisPenceresi(url);
  });
  /* On the /cikis page "Vazgeç" (Cancel): returns to the page we came from (if there is history), otherwise the link goes to the feed */
  /* /cikis sayfasında "Vazgeç": gelinen sayfaya döner (geçmiş varsa), yoksa bağlantı olarak akışa gider */
  d.addEventListener("click", function (e) {
    var g = e.target.closest ? e.target.closest("a[data-geri]") : null;
    if (g && history.length > 1 && !e.defaultPrevented) { e.preventDefault(); history.back(); }
  });

  /* ---------- YouTube card: pressing play creates the iframe (a request goes out only then) ---------- */
  /* ---------- YouTube kartı: oynat'a basınca iframe (dışarıya istek ancak o zaman gider) ---------- */
  d.addEventListener("click", function (e) {
    var k = e.target.closest ? e.target.closest("[data-yt-oynat]") : null;
    if (!k || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var id = k.getAttribute("data-yt-oynat");
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    e.preventDefault();
    var kutu = d.createElement("div"); kutu.className = "yt-oynatici";
    var f = d.createElement("iframe");
    f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1";
    f.title = "YouTube videosu"; f.allow = "autoplay; encrypted-media; picture-in-picture"; f.allowFullscreen = true;
    f.referrerPolicy = "strict-origin-when-cross-origin";
    kutu.appendChild(f);
    k.parentNode.replaceChild(kutu, k);
  });

  /* ---------- Full-screen photo viewer ---------- */
  /* ---------- Tam ekran fotoğraf görüntüleyici ---------- */
  var gor = null, gorListe = [], gorSira = 0;
  var GOR_IKON = {
    kapat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    sol: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    sag: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
  };
  function gorGoster() {
    var img = bul("img", gor), say = bul(".gor-sayac", gor);
    img.src = gorListe[gorSira].href;
    img.alt = "Fotoğraf " + (gorSira + 1) + " / " + gorListe.length;
    say.textContent = gorListe.length > 1 ? (gorSira + 1) + " / " + gorListe.length : "";
    hepsi(".gor-gez", gor).forEach(function (b) { b.hidden = gorListe.length < 2; });
  }
  function gorGit(adim) { gorSira = (gorSira + adim + gorListe.length) % gorListe.length; gorGoster(); }
  d.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[data-ek-gor]") : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var bulanik = a.closest(".ek-bulanik");
    /* the viewer does not open while +18 is blurred */
    /* +18 bulanıkken görüntüleyici açılmaz */
    if (bulanik) { var onay = bul(".ek-nsfw-onay", bulanik); if (onay && !onay.checked) { e.preventDefault(); return; } }
    if (!acilabilir(d.createElement("dialog"))) return; /* without support the link opens the file · destek yoksa bağlantı dosyayı açar */
    e.preventDefault();
    if (!gor) {
      gor = d.createElement("dialog"); gor.className = "ek-gorunturu"; gor.setAttribute("aria-label", "Fotoğraf görüntüleyici");
      gor.innerHTML = '<img alt=""><button type="button" class="gor-kapat" aria-label="Kapat">' + GOR_IKON.kapat + '</button>' +
        '<button type="button" class="gor-gez gor-onceki" aria-label="Önceki fotoğraf">' + GOR_IKON.sol + '</button>' +
        '<button type="button" class="gor-gez gor-sonraki" aria-label="Sonraki fotoğraf">' + GOR_IKON.sag + '</button><span class="gor-sayac" aria-live="polite"></span>';
      d.body.appendChild(gor);
      gor.addEventListener("click", function (ev) {
        var t = ev.target;
        if (t.closest(".gor-kapat") || t === gor) kapat(gor);
        else if (t.closest(".gor-onceki")) gorGit(-1);
        else if (t.closest(".gor-sonraki")) gorGit(1);
      });
      gor.addEventListener("keydown", function (ev) {
        if (ev.key === "ArrowLeft" && gorListe.length > 1) { ev.preventDefault(); gorGit(-1); }
        else if (ev.key === "ArrowRight" && gorListe.length > 1) { ev.preventDefault(); gorGit(1); }
      });
    }
    var grup = a.getAttribute("data-ek-gor");
    gorListe = hepsi('a[data-ek-gor]').filter(function (x) { return x.getAttribute("data-ek-gor") === grup; });
    gorSira = Math.max(0, gorListe.indexOf(a));
    gorGoster(); ac(gor);
    var kb = bul(".gor-kapat", gor); if (kb) kb.focus();
  });

  /* ---------- Custom video player (comment attachments, Figma 15) ----------
     Progressive enhancement: the <video controls> in the template works as is without JS. Here `controls` is removed and our own interface is added.
     State classes live on the box (CSS looks at them): oy-ilk (never played), oy-gizli (controls hidden), oy-bekliyor, oy-hata-durum, oy-tam. */
  /* ---------- Özel video oynatıcı (yorum ekleri, Figma 15) ----------
     Aşamalı geliştirme: şablondaki <video controls> JS'siz aynen çalışır. Burada `controls` kaldırılır ve kendi arayüzümüz eklenir.
     Durum sınıfları kutuda durur (CSS bunlara bakar): oy-ilk (hiç oynatılmadı), oy-gizli (kontroller saklı), oy-bekliyor, oy-hata-durum, oy-tam. */
  var OY_IKON_BAS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var OY_HOPARLOR = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
  var OY_IKON = {
    oynat: OY_IKON_BAS + '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/></svg>',
    duraklat: OY_IKON_BAS + '<rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>',
    ses: OY_IKON_BAS + OY_HOPARLOR + '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>',
    sessiz: OY_IKON_BAS + OY_HOPARLOR + '<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>',
    tam: OY_IKON_BAS + '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    tamCik: OY_IKON_BAS + '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>',
    pip: OY_IKON_BAS + '<path d="M2 10h6V4"/><path d="m2 4 6 6"/><path d="M21 10V7a2 2 0 0 0-2-2h-7"/><path d="M3 14v2a2 2 0 0 0 2 2h3"/><rect x="12" y="14" width="10" height="7" rx="1"/></svg>',
    geri: OY_IKON_BAS + '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    ileri: OY_IKON_BAS + '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
    onay: OY_IKON_BAS + '<path d="M20 6 9 17l-5-5"/></svg>',
    uyari: OY_IKON_BAS + '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
    indir: OY_IKON_BAS + '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>'
  };
  var OY_HIZLAR = [0.5, 0.75, 1, 1.25, 1.5, 2];
  var oyAnahtar = "rubyyard-video"; /* localStorage key: {hiz (speed), ses (volume)} · localStorage anahtarı: {hiz, ses} */

  /* In a private window/blocked site localStorage can throw: every access is in try/catch, otherwise it works with defaults */
  /* Gizli pencerede/engellenmiş sitede localStorage atabilir: her erişim try/catch'te, yoksa varsayılanlarla çalışılır */
  function oyOku() { try { return JSON.parse(window.localStorage.getItem(oyAnahtar)) || {}; } catch (e) { return {}; } }
  function oyYaz(k, deger) { try { var o = oyOku(); o[k] = deger; window.localStorage.setItem(oyAnahtar, JSON.stringify(o)); } catch (e) { /* if it cannot be stored it stays for this session · saklanamazsa bu oturumda kalır */ } }
  function oySure(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var sa = Math.floor(s / 3600), dk = Math.floor((s % 3600) / 60), sn = s % 60;
    return (sa ? sa + ":" + (dk < 10 ? "0" : "") : "") + dk + ":" + (sn < 10 ? "0" : "") + sn;
  }
  function oyHizYaz(h) { return String(h).replace(".", ",") + "×"; }

  function videoOynatici(kutu) {
    var v = bul("video", kutu);
    if (!v || kutu.hasAttribute("data-oy-hazir")) return;
    kutu.setAttribute("data-oy-hazir", "1");
    v.removeAttribute("controls"); v.controls = false;
    /* Touch: the layout changes in CSS via (pointer: coarse); the behavior in JS (tap to show/hide, double tap) follows it */
    /* Dokunmatik: yerleşim CSS'te (pointer: coarse) ile değişir; davranış (dokununca aç/kapa, çift dokunma) JS'te buna göre */
    var dokunmatik = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    var pipVar = !!(d.pictureInPictureEnabled && v.requestPictureInPicture);
    var kaynak = v.currentSrc || v.getAttribute("src") || "";

    kutu.classList.add("oy", "oy-ilk");
    kutu.tabIndex = 0; kutu.setAttribute("role", "group"); kutu.setAttribute("aria-label", "Video oynatıcı");
    kutu.insertAdjacentHTML("beforeend",
      '<div class="oy-orta">' +
        '<button type="button" class="oy-atla oy-atla-geri" data-oy="geri" aria-label="10 saniye geri">' + OY_IKON.geri + '<span>10</span></button>' +
        '<button type="button" class="oy-buyuk oy-oynat" data-oy="oynat" aria-label="Oynat">' + OY_IKON.oynat + '</button>' +
        '<button type="button" class="oy-atla oy-atla-ileri" data-oy="ileri" aria-label="10 saniye ileri">' + OY_IKON.ileri + '<span>10</span></button>' +
      '</div>' +
      '<span class="oy-sure-cip">0:00</span>' +
      '<div class="oy-bekle" aria-hidden="true"></div>' +
      '<div class="oy-hata" hidden role="alert">' + OY_IKON.uyari + '<p>Bu video oynatılamıyor</p>' +
        '<a class="oy-indir" download href="' + kaynak.replace(/"/g, "&quot;") + '">' + OY_IKON.indir + '<span>Dosyayı indir</span></a></div>' +
      '<div class="oy-menu" role="menu" aria-label="Oynatma hızı" hidden></div>' +
      '<div class="oy-cubuk">' +
        '<button type="button" class="oy-dugme oy-oynat" data-oy="oynat" aria-label="Oynat">' + OY_IKON.oynat + '</button>' +
        '<span class="oy-zaman">0:00 / 0:00</span>' +
        '<div class="oy-ilerleme" role="slider" tabindex="0" aria-label="Video konumu" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00 / 0:00">' +
          '<span class="oy-iz"><span class="oy-yuk"></span><span class="oy-oyn"></span></span><span class="oy-tut"></span><span class="oy-ipucu" aria-hidden="true">0:00</span>' +
        '</div>' +
        '<div class="oy-ses"><button type="button" class="oy-dugme" data-oy="sessiz" aria-label="Sesi kapat">' + OY_IKON.ses + '</button>' +
          '<input type="range" class="oy-ses-kay" min="0" max="1" step="0.05" value="1" aria-label="Ses düzeyi"></div>' +
        '<button type="button" class="oy-hiz" data-oy="hiz" aria-label="Hız" aria-haspopup="menu" aria-expanded="false">1×</button>' +
        (pipVar ? '<button type="button" class="oy-dugme oy-pip" data-oy="pip" aria-label="Resim içinde resim">' + OY_IKON.pip + '</button>' : '') +
        '<button type="button" class="oy-dugme" data-oy="tam" aria-label="Tam ekran">' + OY_IKON.tam + '</button>' +
      '</div>' +
      '<div class="oy-ince" aria-hidden="true"><span></span></div>' +
      '<span class="oy-dalga" hidden></span>');

    var cubuk = bul(".oy-cubuk", kutu), ilerleme = bul(".oy-ilerleme", kutu), ipucu = bul(".oy-ipucu", kutu);
    var zamanYazi = bul(".oy-zaman", kutu), sureCip = bul(".oy-sure-cip", kutu), hata = bul(".oy-hata", kutu);
    var menu = bul(".oy-menu", kutu), hizDugme = bul(".oy-hiz", kutu), sesKay = bul(".oy-ses-kay", kutu), dalga = bul(".oy-dalga", kutu);
    var sesDugme = bul('[data-oy="sessiz"]', kutu), tamDugme = bul('[data-oy="tam"]', kutu);
    var oynatDugmeler = hepsi(".oy-oynat", kutu);

    /* ---- While +18 is blurred the player is fully disabled: click (CSS pointer-events) + keyboard focus (inert) ---- */
    /* ---- +18 bulanıkken oynatıcı tamamen devre dışı: tıklama (CSS pointer-events) + klavye odağı (inert) ---- */
    var bulanik = kutu.closest(".ek-bulanik");
    if (bulanik) {
      var nsfwOnay = bul(".ek-nsfw-onay", bulanik);
      var nsfwEsitle = function () { kutu.inert = !!nsfwOnay && !nsfwOnay.checked; };
      if (nsfwOnay) nsfwOnay.addEventListener("change", nsfwEsitle);
      nsfwEsitle();
    }

    /* ---- Saved speed and volume ---- */
    /* ---- Kayıtlı hız ve ses düzeyi ---- */
    var kayit = oyOku();
    if (OY_HIZLAR.indexOf(kayit.hiz) > -1) { v.defaultPlaybackRate = kayit.hiz; v.playbackRate = kayit.hiz; }
    if (typeof kayit.ses === "number" && kayit.ses >= 0 && kayit.ses <= 1) v.volume = kayit.ses;

    /* ---- Show controls / hide after 2.5 s of inactivity ---- */
    /* ---- Kontrolleri göster / 2,5 sn hareketsizlikte sakla ---- */
    var gizleZaman = 0;
    function menuAcikMi() { return !menu.hidden; }
    function klavyeOdagi() {
      try { return kutu.matches(":focus-visible") || !!kutu.querySelector(":focus-visible"); } catch (e) { return false; }
    }
    function gizle() {
      /* always visible while paused, while a menu is open and while keyboard focus is inside */
      /* duraklatılmışken, menü açıkken ve klavye odağındayken hep görünür */
      if (v.paused || menuAcikMi() || klavyeOdagi()) return;
      kutu.classList.add("oy-gizli");
    }
    function goster() {
      kutu.classList.remove("oy-gizli");
      window.clearTimeout(gizleZaman);
      if (!v.paused) gizleZaman = window.setTimeout(gizle, dokunmatik ? 3000 : 2500);
    }

    /* ---- State updates ---- */
    /* ---- Durum güncelleme ---- */
    function oynatDurumu() {
      var oynuyor = !v.paused;
      oynatDugmeler.forEach(function (b) {
        b.innerHTML = oynuyor ? OY_IKON.duraklat : OY_IKON.oynat;
        b.setAttribute("aria-label", oynuyor ? "Duraklat" : "Oynat");
      });
    }
    function konumGuncelle() {
      var sure = isFinite(v.duration) ? v.duration : 0;
      var oran = sure ? Math.min(1, v.currentTime / sure) : 0;
      kutu.style.setProperty("--oyn", (oran * 100) + "%");
      var yazi = oySure(v.currentTime) + " / " + oySure(sure);
      zamanYazi.textContent = yazi;
      ilerleme.setAttribute("aria-valuemax", String(Math.floor(sure)));
      ilerleme.setAttribute("aria-valuenow", String(Math.floor(v.currentTime)));
      ilerleme.setAttribute("aria-valuetext", yazi);
    }
    function yuklenenGuncelle() {
      var sure = isFinite(v.duration) ? v.duration : 0, son = 0;
      if (sure && v.buffered.length) {
        /* End of the range containing the playback position: the correct "loaded" line for chunked loading */
        /* Oynatma noktasını içeren aralığın sonu: parça parça yüklemede doğru "yüklenen" çizgisi */
        for (var i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= son) son = v.buffered.end(i);
        }
      }
      kutu.style.setProperty("--yuk", (sure ? Math.min(100, son / sure * 100) : 0) + "%");
    }
    function sesGuncelle() {
      var kapali = v.muted || v.volume === 0;
      sesDugme.innerHTML = kapali ? OY_IKON.sessiz : OY_IKON.ses;
      sesDugme.setAttribute("aria-label", kapali ? "Sesi aç" : "Sesi kapat");
      sesKay.value = v.muted ? 0 : v.volume;
    }
    function sureGuncelle() { sureCip.textContent = oySure(v.duration); konumGuncelle(); }

    v.addEventListener("loadedmetadata", sureGuncelle);
    v.addEventListener("durationchange", sureGuncelle);
    v.addEventListener("timeupdate", konumGuncelle);
    v.addEventListener("progress", yuklenenGuncelle);
    v.addEventListener("timeupdate", yuklenenGuncelle);
    v.addEventListener("volumechange", function () { sesGuncelle(); if (!v.muted) oyYaz("ses", v.volume); });
    v.addEventListener("ratechange", function () { hizDugme.textContent = oyHizYaz(v.playbackRate); oyYaz("hiz", v.playbackRate); });
    v.addEventListener("play", function () {
      kutu.classList.remove("oy-ilk");
      /* Only one video at a time on the page: when one starts the others stop */
      /* Sayfada aynı anda tek video: biri başlayınca diğerleri durur */
      hepsi("video").forEach(function (o) { if (o !== v && !o.paused) o.pause(); });
      oynatDurumu(); goster();
    });
    v.addEventListener("pause", function () { oynatDurumu(); goster(); });
    v.addEventListener("waiting", function () { kutu.classList.add("oy-bekliyor"); });
    v.addEventListener("seeking", function () { if (v.readyState < 3) kutu.classList.add("oy-bekliyor"); });
    ["playing", "canplay", "seeked"].forEach(function (a) { v.addEventListener(a, function () { kutu.classList.remove("oy-bekliyor"); }); });
    function hataGoster() {
      kutu.classList.remove("oy-bekliyor");
      kutu.classList.add("oy-hata-durum");
      hata.hidden = false;
    }
    v.addEventListener("error", hataGoster);
    if (v.error) hataGoster();

    /* ---- Actions ---- */
    /* ---- Eylemler ---- */
    function oynatDuraklat() { if (v.paused) { var s = v.play(); if (s && s.catch) s.catch(function () { /* autoplay block etc.: pass silently · otomatik oynatma engeli vb.: sessizce geç */ }); } else v.pause(); }
    function atla(sn) {
      if (!isFinite(v.duration)) return;
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + sn));
    }
    function sesAyarla(x) { v.muted = false; v.volume = Math.max(0, Math.min(1, x)); }
    function tamEkranMi() { return d.fullscreenElement === kutu || d.webkitFullscreenElement === kutu; }
    function tamEkran() {
      if (tamEkranMi()) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
      if (kutu.requestFullscreen) kutu.requestFullscreen().catch(function () {});
      else if (kutu.webkitRequestFullscreen) kutu.webkitRequestFullscreen();
      /* iPhone Safari: only the video's own full screen exists */
      /* iPhone Safari: yalnızca videonun kendi tam ekranı var */
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    }
    function tamDurumu() {
      var t = tamEkranMi();
      kutu.classList.toggle("oy-tam", t);
      tamDugme.innerHTML = t ? OY_IKON.tamCik : OY_IKON.tam;
      tamDugme.setAttribute("aria-label", t ? "Tam ekrandan çık" : "Tam ekran");
    }
    d.addEventListener("fullscreenchange", tamDurumu);
    d.addEventListener("webkitfullscreenchange", tamDurumu);

    function menuKapat(odakVer) {
      if (menu.hidden) return;
      menu.hidden = true; hizDugme.setAttribute("aria-expanded", "false");
      if (odakVer) hizDugme.focus();
    }
    function menuAc() {
      menu.innerHTML = "";
      OY_HIZLAR.forEach(function (h) {
        var b = d.createElement("button"); b.type = "button"; b.className = "oy-menu-oge"; b.setAttribute("role", "menuitemradio");
        var secili = h === v.playbackRate;
        b.setAttribute("aria-checked", secili ? "true" : "false"); b.setAttribute("data-hiz", String(h));
        b.innerHTML = '<span class="oy-onay">' + (secili ? OY_IKON.onay : "") + '</span><span>' + oyHizYaz(h) + '</span>';
        menu.appendChild(b);
      });
      menu.hidden = false; hizDugme.setAttribute("aria-expanded", "true");
      var s = bul('[aria-checked="true"]', menu) || bul(".oy-menu-oge", menu); if (s) s.focus();
    }
    d.addEventListener("pointerdown", function (e) {
      if (!menu.hidden && !(e.target.closest && (e.target.closest(".oy-menu") || e.target.closest(".oy-hiz")) && kutu.contains(e.target))) menuKapat(false);
    });

    /* Ripple effect: a ring growing at the tapped point + "+10 s" on double tap */
    /* Dalga efekti: çift dokunmada dokunulan noktada büyüyen halka + "+10 sn" */
    var dalgaZaman = 0;
    function dalgaGoster(x, y, sn) {
      var r = kutu.getBoundingClientRect();
      dalga.hidden = false;
      dalga.textContent = (sn > 0 ? "+" : "−") + Math.abs(sn) + " sn";
      dalga.style.left = (x - r.left) + "px"; dalga.style.top = (y - r.top) + "px";
      dalga.classList.remove("oy-dalga-ac"); void dalga.offsetWidth; /* replay the animation from the start · animasyonu baştan oynat */
      dalga.classList.add("oy-dalga-ac");
      window.clearTimeout(dalgaZaman);
      dalgaZaman = window.setTimeout(function () { dalga.hidden = true; }, hareketAzMi() ? 500 : 650);
    }

    /* ---- Buttons ---- */
    /* ---- Düğmeler ---- */
    kutu.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-oy]") : null;
      if (b && kutu.contains(b)) {
        var is = b.getAttribute("data-oy");
        if (is === "oynat") oynatDuraklat();
        else if (is === "geri") atla(-10);
        else if (is === "ileri") atla(10);
        else if (is === "sessiz") { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; }
        else if (is === "tam") tamEkran();
        else if (is === "hiz") { if (menu.hidden) menuAc(); else menuKapat(false); }
        else if (is === "pip") {
          if (d.pictureInPictureElement === v) d.exitPictureInPicture().catch(function () {});
          else v.requestPictureInPicture().catch(function () {});
        }
        goster(); return;
      }
      var oge = e.target.closest ? e.target.closest(".oy-menu-oge") : null;
      if (oge) { v.playbackRate = Number(oge.getAttribute("data-hiz")); menuKapat(true); }
    });
    sesKay.addEventListener("input", function () { sesAyarla(Number(sesKay.value)); });

    /* ---- Tapping / clicking the surface ---- */
    /* ---- Yüzeye dokunma / tıklama ---- */
    var sonDokunus = 0, sonYari = 0, bekleyen = 0;
    kutu.addEventListener("pointerup", function (e) {
      if (e.button !== 0 || kutu.classList.contains("oy-hata-durum")) return;
      if (e.target.closest("button, a, input, .oy-cubuk, .oy-menu")) return; /* only the empty surface · yalnızca boş yüzey */
      menuKapat(false);
      if (e.pointerType === "mouse" || e.pointerType === "pen") { oynatDuraklat(); goster(); return; }
      var r = kutu.getBoundingClientRect(), yari = (e.clientX - r.left) < r.width / 2 ? -1 : 1, simdi = Date.now();
      if (simdi - sonDokunus < 300 && yari === sonYari) {
        /* Double tap: the single tap's pending "show/hide controls" action is cancelled, left half goes back, right half goes forward */
        /* Çift dokunma: tek dokunuşun bekleyen "kontrolleri aç/kapa" işlemi iptal, sol yarı geri, sağ yarı ileri */
        window.clearTimeout(bekleyen); sonDokunus = 0;
        atla(10 * yari); dalgaGoster(e.clientX, e.clientY, 10 * yari); goster();
        return;
      }
      sonDokunus = simdi; sonYari = yari;
      bekleyen = window.setTimeout(function () {
        if (kutu.classList.contains("oy-gizli")) goster();
        else if (!v.paused) { window.clearTimeout(gizleZaman); kutu.classList.add("oy-gizli"); }
        else goster();
      }, 300);
    });
    kutu.addEventListener("dblclick", function (e) {
      if (e.target.closest("button, a, input, .oy-cubuk, .oy-menu")) return;
      if (!dokunmatik) tamEkran();
    });
    ["pointermove", "pointerdown"].forEach(function (a) {
      kutu.addEventListener(a, function (e) { if (e.pointerType === "mouse") goster(); });
    });
    kutu.addEventListener("focusin", goster);
    /* when focus leaves, the timer restarts */
    /* odak çıkınca sayaç yeniden başlar */
    kutu.addEventListener("focusout", function () { goster(); });

    /* ---- Progress bar: click, drag, time hint on hover ---- */
    /* ---- İlerleme çubuğu: tıkla, sürükle, üzerine gelince zaman ipucu ---- */
    var surukleme = false;
    function oranAl(e) { var r = ilerleme.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
    function ipucuKonumla(e) {
      var r = ilerleme.getBoundingClientRect(), oran = oranAl(e);
      ipucu.textContent = oySure(oran * (isFinite(v.duration) ? v.duration : 0));
      var yar = ipucu.offsetWidth / 2, x = oran * r.width;
      ipucu.style.left = Math.max(yar, Math.min(r.width - yar, x)) + "px"; /* so it does not overflow the box · kutudan taşmasın */
    }
    function konumaGit(e) { if (isFinite(v.duration)) v.currentTime = oranAl(e) * v.duration; }
    ilerleme.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      surukleme = true; ilerleme.setPointerCapture(e.pointerId); konumaGit(e); ipucuKonumla(e);
      kutu.classList.add("oy-suruk"); e.preventDefault();
    });
    ilerleme.addEventListener("pointermove", function (e) { ipucuKonumla(e); if (surukleme) konumaGit(e); });
    function surukBitir() { surukleme = false; kutu.classList.remove("oy-suruk"); }
    ilerleme.addEventListener("pointerup", surukBitir);
    ilerleme.addEventListener("pointercancel", surukBitir);

    /* ---- Keyboard (while the player has focus) ---- */
    /* ---- Klavye (oynatıcı odaktayken) ---- */
    kutu.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key, ele = true;
      if (k === "Escape" && !menu.hidden) { menuKapat(true); e.preventDefault(); return; }
      if (!menu.hidden && e.target.closest(".oy-menu")) {
        /* Inside the speed menu navigate with up/down; Space/Enter are left to the button's own click */
        /* Hız menüsü içinde yukarı/aşağı ile gezin; Boşluk/Enter düğmenin kendi tıklamasına kalır */
        var ogeler = hepsi(".oy-menu-oge", menu), i = ogeler.indexOf(d.activeElement);
        if (k === "ArrowDown") { ogeler[(i + 1) % ogeler.length].focus(); e.preventDefault(); }
        else if (k === "ArrowUp") { ogeler[(i - 1 + ogeler.length) % ogeler.length].focus(); e.preventDefault(); }
        return;
      }
      /* Do not break the button's own Space/Enter activation */
      /* Düğmenin kendi Boşluk/Enter etkinleştirmesini bozma */
      if ((k === " " || k === "Enter") && e.target.closest("button, a")) return;
      /* the slider's own arrow keys */
      /* kaydırıcının kendi okları */
      if (e.target.closest(".oy-ses-kay") && (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight")) return;
      if (k === " " || k === "k" || k === "K") oynatDuraklat();
      else if (k === "ArrowLeft") atla(-5);
      else if (k === "ArrowRight") atla(5);
      else if (k === "j" || k === "J") atla(-10);
      else if (k === "l" || k === "L") atla(10);
      else if (k === "ArrowUp") sesAyarla(v.volume + 0.1);
      else if (k === "ArrowDown") sesAyarla(v.volume - 0.1);
      else if (k === "m" || k === "M") v.muted = !v.muted;
      else if (k === "f" || k === "F") tamEkran();
      else if (k === "Home") { if (e.target.closest(".oy-ilerleme")) v.currentTime = 0; else ele = false; }
      else if (k === "End") { if (e.target.closest(".oy-ilerleme") && isFinite(v.duration)) v.currentTime = v.duration; else ele = false; }
      else if (k.length === 1 && k >= "0" && k <= "9" && isFinite(v.duration)) v.currentTime = v.duration * Number(k) / 10;
      else ele = false;
      /* page scrolling is prevented only for handled keys */
      /* sayfa kaydırması yalnızca işlenen tuşlarda engellenir */
      if (ele) { e.preventDefault(); goster(); }
    });

    /* Initial state */
    /* İlk durum */
    hizDugme.textContent = oyHizYaz(v.playbackRate);
    oynatDurumu(); sesGuncelle(); sureGuncelle(); yuklenenGuncelle();
  }
  hepsi(".ek-video").forEach(videoOynatici);

  /* ---------- Reply form: attachment picking, preview, link chip, submission with progress ---------- */
  /* ---------- Cevap formu: ek seçme, önizleme, bağlantı çipi, ilerlemeli gönderim ---------- */
  var RESIM_SINIR = 10 * 1024 * 1024, VIDEO_SINIR = 50 * 1024 * 1024, EN_COK_RESIM = 6;
  var CIP_IKON = {
    youtube: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>',
    github: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
    video: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>'
  };
  var YT_RE = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s"'<>]*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
  var GH_RE = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i;
  var GH_ADSIZ = ["features", "sponsors", "orgs", "settings", "marketplace", "topics", "about", "pricing", "login", "join"];
  function boyutYazi(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }

  hepsi("form[data-ek-form]").forEach(function (form) {
    var metin = bul("[data-ek-metin]", form), onizleme = bul("[data-ek-onizleme]", form), hata = bul("[data-ek-hata]", form);
    var nsfwSatir = bul("[data-ek-nsfw]", form), gonder = bul("[data-ek-gonder]", form);
    var resimGirdi = bul("[data-ek-resim]", form), videoGirdi = bul("[data-ek-video]", form);
    var cip = bul("[data-ek-baglanti-cip]", form), cipIkon = bul("[data-cip-ikon]", form), cipMetin = bul("[data-cip-metin]", form), kartKapali = bul("[data-kart-kapali]", form);
    var secili = []; /* { dosya (file), tur (type), url (preview object URL) } · { dosya, tur, url (önizleme nesne adresi) } */
    var gonderiyor = false;

    function hataGoster(m) { if (!hata) return; if (m) { hata.textContent = m; hata.hidden = false; } else { hata.hidden = true; hata.textContent = ""; } }
    function yenile() {
      onizleme.textContent = "";
      secili.forEach(function (s, i) {
        var oge = d.createElement("div"); oge.className = "ek-onizleme-oge" + (s.tur === "video" ? " ek-onizleme-video" : "");
        if (s.tur === "resim") { var im = d.createElement("img"); im.src = s.url; im.alt = ""; oge.appendChild(im); }
        else {
          var ik = d.createElement("span"); ik.className = "ek-video-ikon"; ik.innerHTML = CIP_IKON.video;
          var bo = d.createElement("span"); bo.className = "ek-video-boyut"; bo.textContent = boyutYazi(s.dosya.size);
          oge.appendChild(ik); oge.appendChild(bo);
        }
        oge.title = s.dosya.name;
        var yz = d.createElement("span"); yz.className = "ek-yuzde"; yz.setAttribute("data-yuzde", ""); oge.appendChild(yz);
        var sil = d.createElement("button"); sil.type = "button"; sil.className = "ek-sil"; sil.setAttribute("aria-label", "Eki kaldır: " + s.dosya.name); sil.textContent = "×";
        sil.addEventListener("click", function () {
          if (gonderiyor) return;
          try { if (s.url) URL.revokeObjectURL(s.url); } catch (e) { /* negligible · önemsiz */ }
          secili.splice(secili.indexOf(s), 1); yenile(); hataGoster("");
        });
        oge.appendChild(sil); onizleme.appendChild(oge);
      });
      onizleme.hidden = !secili.length;
      /* the +18 box only when there is an attachment (always visible without JS) */
      /* +18 kutusu yalnızca ek varken (JS'siz hep görünür) */
      if (nsfwSatir) nsfwSatir.hidden = !secili.length;
    }
    if (nsfwSatir) nsfwSatir.hidden = true;

    function resimEkle(liste) {
      hataGoster("");
      if (secili.some(function (s) { return s.tur === "video"; })) { hataGoster("Bir yoruma fotoğraf ya da video eklenebilir, ikisi birden eklenemez."); return; }
      Array.prototype.forEach.call(liste, function (f) {
        if (secili.length >= EN_COK_RESIM) { hataGoster("Bir yoruma en fazla " + EN_COK_RESIM + " fotoğraf eklenebilir."); return; }
        if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { hataGoster("Yalnızca JPG, PNG, WebP ve GIF fotoğraf eklenebilir."); return; }
        if (f.size > RESIM_SINIR) { hataGoster("Fotoğraf en fazla 10 MB olabilir: " + f.name); return; }
        secili.push({ dosya: f, tur: "resim", url: URL.createObjectURL(f) });
      });
      yenile();
    }
    function videoEkle(f) {
      hataGoster("");
      if (secili.some(function (s) { return s.tur === "resim"; })) { hataGoster("Bir yoruma fotoğraf ya da video eklenebilir, ikisi birden eklenemez."); return; }
      if (!/^video\/(mp4|webm)$/.test(f.type)) { hataGoster("Yalnızca MP4 ve WebM video eklenebilir."); return; }
      if (f.size > VIDEO_SINIR) { hataGoster("Video en fazla 50 MB olabilir."); return; }
      secili = [{ dosya: f, tur: "video", url: "" }];
      yenile();
    }
    /* Selected files are kept in our own array; the input is emptied right away (so the same file can be selected again) and FormData is built by hand on submit */
    /* Seçilen dosyalar kendi dizimizde tutulur; girdi hemen boşaltılır (aynı dosya yeniden seçilebilsin) ve gönderimde FormData elle kurulur */
    if (resimGirdi) resimGirdi.addEventListener("change", function () { resimEkle(resimGirdi.files); resimGirdi.value = ""; });
    if (videoGirdi) videoGirdi.addEventListener("change", function () { if (videoGirdi.files[0]) videoEkle(videoGirdi.files[0]); videoGirdi.value = ""; });

    /* Link preview chip: only for those with the link privilege (the server already renders the card accordingly) */
    /* Bağlantı önizleme çipi: yalnızca bağlantı ayrıcalığı olanda (sunucu kartı zaten ona göre çizer) */
    function cipGuncelle() {
      if (!cip || form.getAttribute("data-baglanti") !== "1") return;
      if (kartKapali && kartKapali.value === "1") { cip.hidden = true; return; }
      var m = metin.value, y = YT_RE.exec(m), g = null, gm = GH_RE.exec(m);
      if (gm && GH_ADSIZ.indexOf(gm[1].toLowerCase()) < 0) g = gm;
      if (!y && !g) { cip.hidden = true; return; }
      var yazi, ikon;
      if (y && (!g || m.indexOf(y[0]) <= m.indexOf(g[0]))) { yazi = "YouTube videosu"; ikon = CIP_IKON.youtube; }
      else { yazi = g[1] + " / " + g[2].replace(/\.git$/, ""); ikon = CIP_IKON.github; }
      cipIkon.innerHTML = ikon; cipMetin.textContent = yazi; cip.hidden = false;
    }
    if (metin) { metin.addEventListener("input", cipGuncelle); cipGuncelle(); }
    var cipKapat = bul("[data-cip-kapat]", form);
    if (cipKapat) cipKapat.addEventListener("click", function () { if (kartKapali) kartKapali.value = "1"; cip.hidden = true; });

    /* Submission: with attachments, XHR (percent per frame); otherwise the form goes as usual */
    /* Gönderim: ek varsa XHR (kare başına yüzde); yoksa form normal gider */
    form.addEventListener("submit", function (e) {
      if (gonderiyor) { e.preventDefault(); return; }
      if (!secili.length) {
        if (!metin.value.trim()) { e.preventDefault(); hataGoster("Cevap boş olamaz."); metin.focus(); }
        return;
      }
      /* old browser: files cannot be sent since they are not in the input; luckily this path almost never occurs */
      /* eski tarayıcı: dosyalar girdide olmadığı için gönderilemez; neyse ki bu yol neredeyse yok */
      if (!window.FormData || !window.XMLHttpRequest) return;
      e.preventDefault();
      hataGoster("");
      var fd = new FormData();
      ["_csrf", "kart_kapali"].forEach(function (ad) { var g = bul('[name="' + ad + '"]', form); if (g) fd.append(ad, g.value); });
      fd.append("content", metin.value);
      var nsfw = bul('input[name="nsfw"]', form); if (nsfw && nsfw.checked) fd.append("nsfw", "1");
      secili.forEach(function (s) { fd.append(s.tur === "video" ? "video" : "resimler", s.dosya, s.dosya.name); });
      gonderiyor = true; form.classList.add("ek-gonderiyor");
      var eskiYazi = gonder ? gonder.textContent : "";
      if (gonder) { gonder.disabled = true; gonder.textContent = "Gönderiliyor…"; }
      function bitir() { gonderiyor = false; form.classList.remove("ek-gonderiyor"); if (gonder) { gonder.disabled = false; gonder.textContent = eskiYazi; } hepsi("[data-yuzde]", form).forEach(function (y) { y.textContent = ""; }); }
      var x = new XMLHttpRequest();
      x.open("POST", form.getAttribute("action"));
      x.setRequestHeader("Accept", "application/json");
      x.upload.onprogress = function (ev) {
        if (!ev.lengthComputable) return;
        /* 100% is reached when the server finishes its work (redirect) */
        /* %100 sunucu işini bitirince (yönlendirme) */
        var yuzde = Math.min(99, Math.round(ev.loaded / ev.total * 100)) + "%";
        hepsi("[data-yuzde]", form).forEach(function (y) { y.textContent = yuzde; });
      };
      x.onload = function () {
        var j = null; try { j = JSON.parse(x.responseText); } catch (er) { /* not JSON · JSON değil */ }
        if (x.status === 200 && j && typeof j.yonlendir === "string" && j.yonlendir.charAt(0) === "/" && j.yonlendir.charAt(1) !== "/") {
          /* The browser does not reload the same page (only the # differs): refreshed by hand so the new reply shows */
          /* Aynı sayfa (yalnızca # farklıysa) tarayıcı yeniden yüklemez: yeni cevap görünsün diye elle yenilenir */
          var hedef = new URL(j.yonlendir, location.href), ayni = hedef.pathname === location.pathname && hedef.search === location.search;
          location.href = hedef.href; if (ayni) location.reload();
          return;
        }
        bitir();
        hataGoster(j && j.hata ? j.hata : "Gönderilemedi. Sayfayı yenileyip tekrar dene (yazdığın metni kopyalamayı unutma).");
      };
      x.onerror = function () { bitir(); hataGoster("Bağlantı koptu, gönderilemedi. İnternetini kontrol edip tekrar dene."); };
      x.send(fd);
    });
  });

  /* ---------- 429 countdown (views/partials/durum-icerik.ejs) ----------
     The server writes the remaining time with data-geri-sayim="saniye" (seconds); it drops every second, at zero it writes "Şimdi tekrar deneyebilirsin" (You can try again now) and
     the hidden "Şimdi tekrar dene" (Try again now) link (data-geri-sayim-bitti) becomes visible. Without JS the plain time and link written by the server remain. */
  /* ---------- 429 geri sayımı (views/partials/durum-icerik.ejs) ----------
     Sunucu kalan süreyi data-geri-sayim="saniye" ile yazar; her saniye düşer, sıfırda "Şimdi tekrar deneyebilirsin" yazar ve
     gizli tutulan "Şimdi tekrar dene" bağlantısı (data-geri-sayim-bitti) görünür. JS yoksa sunucunun yazdığı düz süre ve bağlantı kalır. */
  hepsi("[data-geri-sayim]").forEach(function (kutu) {
    var kalan = parseInt(kutu.getAttribute("data-geri-sayim"), 10);
    var deger = bul("[data-geri-sayim-deger]", kutu);
    var bagli = hepsi("[data-geri-sayim-bitti]");
    if (!deger || !(kalan > 0)) return;
    bagli.forEach(function (a) { a.hidden = true; });
    var sayac = window.setInterval(function () {
      kalan--;
      if (kalan <= 0) {
        window.clearInterval(sayac);
        kutu.textContent = "Şimdi tekrar deneyebilirsin";
        bagli.forEach(function (a) { a.hidden = false; });
        return;
      }
      deger.textContent = Math.floor(kalan / 60) + ":" + (kalan % 60 < 10 ? "0" : "") + (kalan % 60);
    }, 1000);
  });

  /* ---------- Connection strip (offline / back online) ----------
     When the browser fires the "offline" event a yellow strip appears right under the top bar; on "online" it turns green and disappears after 2 s.
     role="status": the screen reader announces it, it does not steal focus. Under "Reduce animations" there is no transition (the CSS duration variables are zeroed, the wait is 0 too). */
  /* ---------- Bağlantı şeridi (çevrimdışı / yeniden bağlandı) ----------
     Tarayıcı "offline" olayını verince üst çubuğun hemen altında sarı şerit çıkar; "online" olunca yeşile döner ve 2 sn sonra kalkar.
     role="status": ekran okuyucu duyurur, odağı çalmaz. "Animasyonları azalt"ta geçiş yok (CSS süre değişkenleri 0'lanır, bekleme de 0). */
  var baglantiSeridi = null, baglantiZamanlayici = 0;
  function baglantiSeridiAl() {
    if (baglantiSeridi && baglantiSeridi.isConnected) return baglantiSeridi;
    baglantiSeridi = d.createElement("div");
    baglantiSeridi.className = "cevrimdisi-serit";
    baglantiSeridi.setAttribute("role", "status");
    var ust = bul(".ust-cubuk");
    if (ust && ust.parentNode) ust.parentNode.insertBefore(baglantiSeridi, ust.nextSibling);
    else d.body.insertBefore(baglantiSeridi, d.body.firstChild);
    return baglantiSeridi;
  }
  function baglantiYaz(geri, ikon, yazi) {
    var el = baglantiSeridiAl();
    window.clearTimeout(baglantiZamanlayici);
    el.classList.remove("gizleniyor");
    el.classList.toggle("geri", geri);
    el.innerHTML = ikon + "<span></span>";
    el.lastChild.textContent = yazi;
    return el;
  }
  var svgBas = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var wifiYokSvg = svgBas + '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/></svg>';
  var onaySvg = svgBas + '<path d="M20 6 9 17l-5-5"/></svg>';
  window.addEventListener("offline", function () {
    baglantiYaz(false, wifiYokSvg, "Bağlantı yok · gördüklerin güncel olmayabilir");
  });
  window.addEventListener("online", function () {
    /* if we were never offline (e.g. the page was just opened) do not show the strip */
    /* hiç çevrimdışı olunmadıysa (ör. sayfa yeni açıldı) şerit gösterme */
    if (!baglantiSeridi || !baglantiSeridi.isConnected) return;
    var el = baglantiYaz(true, onaySvg, "Yeniden bağlandın");
    var bekle = hareketAzMi() ? 0 : 200;
    baglantiZamanlayici = window.setTimeout(function () {
      el.classList.add("gizleniyor");
      baglantiZamanlayici = window.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, bekle);
    }, 2000);
  });
  if (navigator.onLine === false) baglantiYaz(false, wifiYokSvg, "Bağlantı yok · gördüklerin güncel olmayabilir");

  /* ---------- Service worker (public/sw.js): only for the offline page ----------
     Registers in a secure context (https or localhost); it does not register over http on a LAN IP, which is fine (the strip still works). */
  /* ---------- Service worker (public/sw.js): yalnızca çevrimdışı sayfası için ----------
     Güvenli bağlamda (https ya da localhost) kaydolur; LAN IP'sinde http üzerinden kayıt olmaz, sorun değil (şerit yine çalışır). */
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(function () { /* if it does not register there is no offline page, the site works normally · kayıt olmazsa çevrimdışı sayfası yok, site normal çalışır */ });
  }
})();

/* QuadRan · küçük, bağımlılıksız betik. Hiçbir şey JS'e bağımlı değildir: bu dosya yoksa bağlantılar ve popover'lar yine çalışır. */
(function () {
  "use strict";
  var d = document;

  /* CSS "JS var" bayrağı: .js sınıfına bağlı kurallar (örn. Süz düğmesini gizleme) yalnızca betik çalışıyorsa geçerli olur */
  d.documentElement.classList.add("js");

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

  /* Türkçe belirtme hâli: ayse -> ayse’yi, ahmet -> ahmet’i. (src/gizlilik.ts belirtme() ile aynı kural.) */
  function belirtme(ad) {
    var k = ad.toLocaleLowerCase("tr"), sesli = "aeıioöuü", son = "";
    for (var i = 0; i < k.length; i++) if (sesli.indexOf(k[i]) > -1) son = k[i];
    var ek = !son ? "i" : "aı".indexOf(son) > -1 ? "ı" : "ei".indexOf(son) > -1 ? "i" : "ou".indexOf(son) > -1 ? "u" : "ü";
    return ad + "’" + (sesli.indexOf(k[k.length - 1]) > -1 ? "y" : "") + ek;
  }

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
        /* Bağlantı bir ⋮ menüsünün içindeyse menü açık kalmasın (pencere açılınca arkada asılı durmasın) */
        var acikMenu = sikayet.closest("[popover]");
        if (acikMenu && acikMenu.hidePopover) { try { acikMenu.hidePopover(); } catch (x) { /* zaten kapalı */ } }
        var form = bul("form", dlg);
        if (form) {
          form.reset();
          /* Bağlantı hedefini data- alanlarıyla verir: mesaj (data-post-id), kullanıcı (data-kullanici),
             sohbet mesajı (data-sohbet-id), özel mesaj (data-mesaj-id). Hepsi gizli alana yazılır, kullanılmayanlar boşalır. */
          var alanlar = { post_id: "data-post-id", kullanici: "data-kullanici", sohbet_id: "data-sohbet-id", mesaj_id: "data-mesaj-id", oda_mesaj_id: "data-oda-mesaj-id" };
          Object.keys(alanlar).forEach(function (ad) {
            var gizli = bul('input[name="' + ad + '"]', form);
            if (gizli) gizli.value = sikayet.getAttribute(alanlar[ad]) || "";
          });
          /* Hedef türü: CSS buna bakıp "Konu dışı"yı kullanıcı ve özel mesaj şikâyetinde gizler */
          dlg.setAttribute("data-hedef", sikayet.getAttribute("data-kullanici") ? "kullanici"
            : sikayet.getAttribute("data-sohbet-id") || sikayet.getAttribute("data-oda-mesaj-id") ? "sohbet" : sikayet.getAttribute("data-mesaj-id") ? "ozel" : "konu");
          var baslik = bul("#sikayet-baslik", dlg);
          if (baslik) {
            baslik.textContent = sikayet.getAttribute("data-baslik") ||
              (sikayet.getAttribute("data-kullanici") ? "Bu kullanıcıyı şikâyet et" : "Bu mesajı şikâyet et");
          }
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

    /* Paylaş: JS yoksa düz bağlantıdır (öğenin sayfasına gider). JS varsa paylaşım menüsü ya da panoya kopyalama. */
    var paylas = hedef.closest("[data-paylas]");
    if (paylas) {
      var adres = paylas.href;
      if (navigator.share) {
        e.preventDefault();
        navigator.share({ title: paylas.getAttribute("data-baslik") || d.title, url: adres }).catch(function () { /* kullanıcı vazgeçti */ });
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
      /* Kapat bağlantısı JS yokken sayfaya döner; pencere gerçekten kapanabiliyorsa gezinme gereksiz */
      if (kdlg && acilabilir(kdlg) && kapatici.tagName === "A") e.preventDefault();
      kapat(kdlg);
    }
  });

  /* Klavye kısayolları: Ctrl/Cmd+K arama, Ctrl/Cmd+, ayarlar */
  d.addEventListener("keydown", function (e) {
    var tus = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && tus === "k") {
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

  /* Arka plana tıklayınca pencereyi kapat (basılan ve bırakılan yer ikisi de arka plan olmalı) */
  var basilan = null;
  d.addEventListener("mousedown", function (e) { basilan = e.target; });
  d.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.tagName === "DIALOG" && t.open && basilan === t) kapat(t);
  });

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

  /* ---------- Bildirim çubukları: yaklaşık 5 saniye sonra gizle ---------- */
  hepsi("[data-otomatik-gizle]").forEach(function (cubuk) {
    var zamanlayici = null;
    function baslat() { zamanlayici = window.setTimeout(gizle, 5000); }
    function durdur() { if (zamanlayici) { window.clearTimeout(zamanlayici); zamanlayici = null; } }
    function gizle() {
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
     Seçici: <select>'in yerine geçen özel açılır liste (aşamalı geliştirme)
     ---------------------------------------------------------------------
     - Gerçek <select> DOM'da kalır (görünmez), forma o gönderilir; seçim yapılınca select.selectedIndex değişir ve
       'input' + 'change' olayları gönderilir, yani mevcut kod hiçbir şeyin değiştiğini fark etmez.
     - JS yoksa ya da select'te data-yerel varsa hiçbir şey olmaz: yerel <select> çalışır.
     - Liste, tetikleyicinin yanında değil en yakın dialog/popover içinde (yoksa body'de) açılır ve mümkünse
       tarayıcının "üst katmanına" (popover="auto") konur; böylece moderasyon menüsü gibi popover'ların da üstünde görünür.
     ===================================================================== */
  var seciciSayac = 0;
  var acikSecici = null; /* aynı anda yalnızca biri açık: { kapat: fn } */
  var TIK_SVG = '<svg class="secici-tik" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var OK_SVG = '<svg class="secici-ok" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var POPOVER_VAR = typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";

  function etiketMetni(sel) {
    if (sel.getAttribute("aria-label")) return sel.getAttribute("aria-label");
    var metin = "";
    Array.prototype.forEach.call(sel.labels || [], function (lbl) {
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

    var sonKapanis = 0; /* tarayıcı paneli tetikleyiciye tıklanınca kapatır; ardından gelen click yeniden açmasın diye zamanı tutulur */
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
      /* Animasyon beklemeden paneli tamamen kaldır */
      window.clearTimeout(kapanis); kapanis = null;
      if (!panel) return;
      if (POPOVER_VAR && panel.matches(":popover-open")) { try { panel.hidePopover(); } catch (e) { /* zaten kapalı */ } }
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
      panel.classList.remove("acik"); /* CSS: çıkış geçişi (--sure-hizli) */
      kapanis = window.setTimeout(bitir, hareketAzMi() ? 0 : 140);
      if (odakVer) tetik.focus();
    }

    function ac() {
      if (tetik.disabled) return;
      if (acikSecici && acikSecici.tetik !== tetik) acikSecici.kapat(false);
      if (panel) bitir(); /* kapanış animasyonu sürerken yeniden açılıyor */
      panel = d.createElement("div");
      panel.className = "secici-liste";
      panel.id = kimlik + "-liste";
      panel.setAttribute("role", "listbox");
      panel.setAttribute("aria-label", tetik.getAttribute("aria-label") || etiketMetni(sel));
      ogeKur();
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
      void panel.offsetWidth; /* başlangıç durumu çizilsin ki geçiş oynasın */
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
      /* Yönetim panelindeki süzgeç formları: seçim değişince kendiliğinden gönderilir */
      var f = sel.form;
      if (f && f.classList.contains("yn-filtre")) { if (f.requestSubmit) f.requestSubmit(); else f.submit(); }
    }

    function yazAra(harf) {
      window.clearTimeout(aramaZaman);
      arama += harf.toLocaleLowerCase("tr");
      aramaZaman = window.setTimeout(function () { arama = ""; }, 700);
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
    /* Odak tetikleyiciden çıkınca (Tab dışında: örn. sekme değişti) liste açık kalmasın */
    tetik.addEventListener("blur", function () { window.setTimeout(function () { if (d.activeElement !== tetik && panel && !panel.contains(d.activeElement)) kapat(false); }, 0); });

    /* <label> tıklanınca ya da doğrulama odağı gelince gerçek select odak alır; odağı tetikleyiciye aktar */
    sel.addEventListener("focus", function () { tetik.focus(); });
    /* "required" doğrulaması: görünmez select için tarayıcı balonu yerinde çıkmaz. Balonu engelle, tetikleyiciyi kırmızı yap ve odakla. */
    sel.addEventListener("invalid", function (e) {
      e.preventDefault();
      tetik.setAttribute("aria-invalid", "true");
      var alan = sel.closest(".alan");
      if (alan) alan.classList.add("hatali");
      if (sel.form && sel.form.querySelector(":invalid") === sel) tetik.focus();
    });
    /* Kod dışarıdan select.value değiştirirse (ya da form sıfırlanırsa) görünen değer güncellensin */
    sel.addEventListener("change", guncelle);
    if (sel.form) sel.form.addEventListener("reset", function () { window.setTimeout(function () { guncelle(); gecerliYap(); }, 0); });
    guncelle();
  }

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
  altYerOlc(); /* ilk ölçüm hemen: requestAnimationFrame arka plandaki/yeni sekmede gecikebilir */

  hepsi("select").forEach(seciciKur);

  /* Süz düğmesi yalnızca seçicilerden oluşan formlarda gizlenir; yazı/tarih/sayı kutusu olan formlarda kalır (Enter'a basmayı bilmeyen için) */
  hepsi("form.yn-filtre").forEach(function (f) {
    if (f.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])')) f.classList.add("yn-suz-kalsin");
  });

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
    /* rootMargin: yalnızca ekranın üstten %15–%45 arası "okuma bandı" sayılır; o banttaki bölüm etkindir */
    var gozcu = new IntersectionObserver(function (girdiler) {
      girdiler.forEach(function (g) { if (g.isIntersecting) vurgula(g.target.id); });
    }, { rootMargin: "-15% 0px -55% 0px" });
    bolumler.forEach(function (b) { gozcu.observe(b); });
    /* Sayfanın en altında son bölüm banda hiç giremeyebilir: dipteyken sonuncuyu vurgula */
    window.addEventListener("scroll", function () {
      if (window.innerHeight + window.scrollY >= d.documentElement.scrollHeight - 4) vurgula(bolumler[bolumler.length - 1].id);
    }, { passive: true });
    baglar.forEach(function (a) { a.addEventListener("click", function () { vurgula(a.getAttribute("href").slice(1)); }); });
    if (window.location.hash && d.getElementById(window.location.hash.slice(1))) vurgula(window.location.hash.slice(1));
  })();

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
        if (menu && menu.hidePopover) { try { menu.hidePopover(); } catch (x) { /* kapalı */ } }
      }, hareketAzMi() ? 400 : 700);
    }
    if (!kaynak) { bitti(false); return; }
    var metin = kaynak.textContent.trim();
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

  /* ---------- Özel odalar: pencereler, onay, kişi davet araması ----------
     Pencereler <dialog>. JS yokken menüdeki bağlantılar /oda/:id/<panel> adresine gider ve sayfa pencereyi AÇIK (modal olmadan) çizer;
     JS varsa burada o açık pencere modal olarak yeniden açılır, bağlantılar sayfayı yenilemeden pencereyi açar. */
  hepsi("dialog.oda-pencere[open]").forEach(function (dlg) {
    if (!acilabilir(dlg) || dlg.matches(":modal")) return;
    dlg.close(); dlg.showModal();
  });
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
    if (!acilabilir(dlg)) return; /* eski tarayıcı: bağlantı sayfaya gider */
    e.preventDefault();
    var menu = a.closest("[popover]");
    if (menu && menu.hidePopover) { try { menu.hidePopover(); } catch (x) { /* kapalı */ } }
    hepsi("dialog.oda-pencere[open]").forEach(kapat); /* sekme geçişi: önce açık olanı kapat */
    ac(dlg);
    var girdi = bul("input:not([type=hidden]), textarea", dlg);
    if (girdi && a.getAttribute("data-oda-panel") !== "ayarlar") girdi.focus();
  });
  /* Tehlikeli ya da geri dönüşü zor işlemler: form data-onay metniyle sorar (metin kullanıcı içeriği içerebildiği için satır içi onsubmit kullanılmaz) */
  d.addEventListener("submit", function (e) {
    var f = e.target;
    var soru = f && f.getAttribute ? f.getAttribute("data-onay") : null;
    if (soru && !window.confirm(soru)) e.preventDefault();
  });
  /* Yönetim › İçerik "Hepsini seç" kutusu: görünen sayfadaki bütün onay kutularını işaretler (JS yoksa tek tek seçilir).
     Eskiden şablonda satır içi <script> idi; CSP satır içi betiği yasakladığı için buraya taşındı. */
  hepsi("[data-hepsini-sec]").forEach(function (k) {
    k.addEventListener("change", function () {
      hepsi('#toplu-form input[name="id"]').forEach(function (x) { x.checked = k.checked; });
    });
  });
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
    /* Enter: sayfa yenilemek yerine aramayı hemen yap */
    girdi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); window.clearTimeout(zamanlayici); ara(); } });
  });

  /* ---------- Profil görünümü (Ayarlar), özel renk seçici ve üye kartı penceresi (sql/18) ---------- */

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

    /* Alan boyutu CSS'ten gelir (kare ya da 2,2:1); ölçek = görseli alanı DOLDURACAK en küçük ölçek × yakınlaştırma */
    function olc() {
      dur.aw = alan.clientWidth; dur.ah = alan.clientHeight;
      dur.kapsa = Math.max(dur.aw / dur.nw, dur.ah / dur.nh);
    }
    function olcek() { return dur.kapsa * dur.z; }
    /* Boşluk bırakmamak için görselin kenarı alanın içine girmez */
    function sinirla() {
      var s = olcek();
      dur.ox = tavan(dur.ox, dur.aw - dur.nw * s, 0);
      dur.oy = tavan(dur.oy, dur.ah - dur.nh * s, 0);
    }
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
      try { window.URL.revokeObjectURL(dur.adres); } catch (e) { /* önemsiz */ }
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
        /* Başlangıç: görsel alanda ortalı, tam kapsama */
        dur.ox = (dur.aw - dur.nw * olcek()) / 2; dur.oy = (dur.ah - dur.nh * olcek()) / 2;
        ciz();
        alan.focus({ preventScroll: true });
      };
      /* Tarayıcı çözemediyse (örn. bozuk dosya): sunucu karar versin, hata mesajını toast olarak versin */
      deneme.onerror = function () { window.URL.revokeObjectURL(adres); duz(girdi); };
      deneme.src = adres;
    }
    girdiler.forEach(function (g) { g.addEventListener("change", function () { ac_(g); }); });

    /* Sürükleme ve iki parmak: pointer events (fare, kalem, dokunmatik aynı kodla) */
    var isaretler = {}, pinch = null;
    function sayi_() { return Object.keys(isaretler).length; }
    alan.addEventListener("pointerdown", function (e) {
      if (!dur) return;
      isaretler[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { alan.setPointerCapture(e.pointerId); } catch (x) { /* önemsiz */ }
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

  /* Özel renk seçici: doygunluk×parlaklık karesi, ton şeridi, HEX, damlalık, rastgele, son kullanılanlar.
     Popover (açılır menüyle aynı yüzey); telefonda CSS onu alttan açılan sayfa yapar. JS yoksa tarayıcının kendi seçicisi çalışır. */
  var panel = null, panelHedef = null, hsv = { h: 0, s: 1, v: 1 };
  var GECMIS = "quadran.renkGecmisi";
  function gecmisOku() { try { var g = JSON.parse(window.localStorage.getItem(GECMIS) || "[]"); return Array.isArray(g) ? g.filter(function (x) { return HEX.test(x); }).slice(0, 8) : []; } catch (e) { return []; } }
  function gecmisYaz(hex) { try { var g = gecmisOku().filter(function (x) { return x !== hex; }); g.unshift(hex); window.localStorage.setItem(GECMIS, JSON.stringify(g.slice(0, 8))); } catch (e) { /* localStorage kapalı olabilir */ } }
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
    if (window.EyeDropper) { damla.hidden = false; damla.addEventListener("click", function () { new window.EyeDropper().open().then(function (s) { hsv = hexHsv(s.sRGBHex); panelUygula(); }).catch(function () { /* iptal */ }); }); }
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
    /* Sürükle-kapat: pointer olayları fareyi, dokunmayı ve kalemi aynı koddan geçirir. Sürerken geçiş kapatılır (parmağı birebir izlesin),
       bırakınca satır içi stil silinir: CSS geçişi ya kapanış kaymasını ya da yerine dönmeyi oynatır. */
    var bas = null, dy = 0;
    kartPop.addEventListener("pointerdown", function (e) {
      if (!e.target.closest || !e.target.closest(".uye-karti-tutamac")) return;
      bas = e.clientY; dy = 0;
      try { e.target.setPointerCapture(e.pointerId); } catch (x) { /* yakalanamazsa da sürükleme çalışır (olaylar sayfaya gelir) */ }
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
    if (telefon) { kartPop.style.inset = ""; kartPop.style.margin = ""; }  /* konumu CSS verir: ekranın altına oturan sayfa */
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
      var o = Math.min(1, (t - bas) / sure), e = 1 - Math.pow(1 - o, 3); /* yavaşlayarak durur */
      say.textContent = Math.round(hedef * e).toLocaleString("tr-TR");
      if (o < 1) requestAnimationFrame(adim);
    }
    requestAnimationFrame(adim);
  });
  /* ======================================================================
     Yorum ekleri ve dış bağlantı onayı (sql/23). Hepsi aşamalı geliştirme: JS yoksa fotoğraf bağlantısı dosyayı açar, YouTube kutusu
     ve dış bağlantılar /cikis sayfasına gider, cevap formu normal multipart gönderilir.
     ====================================================================== */
  function guvenliAdres(u) { try { var x = new URL(u, location.href); return /^https?:$/.test(x.protocol) && x.hostname ? x : null; } catch (e) { return null; } }

  /* ---------- Dış bağlantı onayı: "QuadRan'dan ayrılıyorsun" ----------
     Telefonda alttan sayfa, büyük ekranda ortada pencere (CSS: .cikis-penceresi). "Bu oturumda <alan> için tekrar sorma" sessionStorage'a yazılır
     (sekme kapanınca gider); depo kullanılamazsa (gizli pencere vb.) try/catch ile sessizce her seferinde sorulur. */
  var IZIN_ANAHTARI = "quadran.cikisIzin";
  function izinliAlanlar() { try { return JSON.parse(sessionStorage.getItem(IZIN_ANAHTARI) || "[]") || []; } catch (e) { return []; } }
  function alanIzniVer(alan) { try { var l = izinliAlanlar(); if (l.indexOf(alan) < 0) l.push(alan); sessionStorage.setItem(IZIN_ANAHTARI, JSON.stringify(l)); } catch (e) { /* depo yok: her seferinde sorulur */ } }
  function yeniSekme(adres) { var w = window.open(adres, "_blank", "noopener,noreferrer"); if (!w) location.href = adres; }
  var cikisDlg = null;
  function cikisPenceresi(url) {
    if (!acilabilir(d.createElement("dialog"))) { location.href = "/cikis?u=" + encodeURIComponent(url.href); return; }
    if (!cikisDlg) {
      cikisDlg = d.createElement("dialog"); cikisDlg.className = "cikis-penceresi"; cikisDlg.setAttribute("aria-labelledby", "cikis-baslik");
      d.body.appendChild(cikisDlg);
      cikisDlg.addEventListener("click", function (e) { if (e.target === cikisDlg) kapat(cikisDlg); }); /* karartmaya dokununca kapanır */
    }
    var alan = url.hostname.replace(/^www\./, "");
    cikisDlg.textContent = "";
    var kap = d.createElement("div"); kap.className = "cikis-ic";
    var h = d.createElement("h2"); h.id = "cikis-baslik"; h.textContent = "QuadRan’dan ayrılıyorsun";
    var kutu = d.createElement("div"); kutu.className = "cikis-alan";
    var b = d.createElement("strong"); b.textContent = alan;
    var tam = d.createElement("span"); tam.textContent = url.href;
    kutu.appendChild(b); kutu.appendChild(tam);
    var uyari = d.createElement("div"); uyari.className = "bilgi-notu cikis-uyari";
    uyari.textContent = "Görünen yazı ile adres farklıysa dikkat et. Başka sitelerin içeriğinden QuadRan sorumlu değildir.";
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
    if (!url) return; /* geçersizse /cikis sayfası 400 gösterir */
    e.preventDefault();
    if (izinliAlanlar().indexOf(url.hostname.replace(/^www\./, "")) > -1) yeniSekme(url.href); else cikisPenceresi(url);
  });
  /* /cikis sayfasında "Vazgeç": gelinen sayfaya döner (geçmiş varsa), yoksa bağlantı olarak akışa gider */
  d.addEventListener("click", function (e) {
    var g = e.target.closest ? e.target.closest("a[data-geri]") : null;
    if (g && history.length > 1 && !e.defaultPrevented) { e.preventDefault(); history.back(); }
  });

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
    if (bulanik) { var onay = bul(".ek-nsfw-onay", bulanik); if (onay && !onay.checked) { e.preventDefault(); return; } } /* +18 bulanıkken görüntüleyici açılmaz */
    if (!acilabilir(d.createElement("dialog"))) return; /* destek yoksa bağlantı dosyayı açar */
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
    var secili = []; /* { dosya, tur, url (önizleme nesne adresi) } */
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
          try { if (s.url) URL.revokeObjectURL(s.url); } catch (e) { /* önemsiz */ }
          secili.splice(secili.indexOf(s), 1); yenile(); hataGoster("");
        });
        oge.appendChild(sil); onizleme.appendChild(oge);
      });
      onizleme.hidden = !secili.length;
      if (nsfwSatir) nsfwSatir.hidden = !secili.length; /* +18 kutusu yalnızca ek varken (JS'siz hep görünür) */
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
    /* Seçilen dosyalar kendi dizimizde tutulur; girdi hemen boşaltılır (aynı dosya yeniden seçilebilsin) ve gönderimde FormData elle kurulur */
    if (resimGirdi) resimGirdi.addEventListener("change", function () { resimEkle(resimGirdi.files); resimGirdi.value = ""; });
    if (videoGirdi) videoGirdi.addEventListener("change", function () { if (videoGirdi.files[0]) videoEkle(videoGirdi.files[0]); videoGirdi.value = ""; });

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

    /* Gönderim: ek varsa XHR (kare başına yüzde); yoksa form normal gider */
    form.addEventListener("submit", function (e) {
      if (gonderiyor) { e.preventDefault(); return; }
      if (!secili.length) {
        if (!metin.value.trim()) { e.preventDefault(); hataGoster("Cevap boş olamaz."); metin.focus(); }
        return;
      }
      if (!window.FormData || !window.XMLHttpRequest) return; /* eski tarayıcı: dosyalar girdide olmadığı için gönderilemez; neyse ki bu yol neredeyse yok */
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
        var yuzde = Math.min(99, Math.round(ev.loaded / ev.total * 100)) + "%"; /* %100 sunucu işini bitirince (yönlendirme) */
        hepsi("[data-yuzde]", form).forEach(function (y) { y.textContent = yuzde; });
      };
      x.onload = function () {
        var j = null; try { j = JSON.parse(x.responseText); } catch (er) { /* JSON değil */ }
        if (x.status === 200 && j && typeof j.yonlendir === "string" && j.yonlendir.charAt(0) === "/" && j.yonlendir.charAt(1) !== "/") {
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
})();

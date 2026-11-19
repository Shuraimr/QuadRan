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
          var alanlar = { post_id: "data-post-id", kullanici: "data-kullanici", sohbet_id: "data-sohbet-id", mesaj_id: "data-mesaj-id" };
          Object.keys(alanlar).forEach(function (ad) {
            var gizli = bul('input[name="' + ad + '"]', form);
            if (gizli) gizli.value = sikayet.getAttribute(alanlar[ad]) || "";
          });
          /* Hedef türü: CSS buna bakıp "Konu dışı"yı kullanıcı ve özel mesaj şikâyetinde gizler */
          dlg.setAttribute("data-hedef", sikayet.getAttribute("data-kullanici") ? "kullanici"
            : sikayet.getAttribute("data-sohbet-id") ? "sohbet" : sikayet.getAttribute("data-mesaj-id") ? "ozel" : "konu");
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
    if (kapatici) { kapat(kapatici.closest("dialog")); }
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

  /* ---------- Alt çubuk yüksekliği (--alt-yer) ----------
     Ekranın altına sabitlenen çubuklar (telefonda alt menü, tablette ayar dock'u, paneldeki seçim ve karar çubukları)
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
     Sol menü (masaüstü) ve alttaki dock (tablet) aynı bağlantıları taşır (data-bolum-bag). Sayfa kaydırıldıkça
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
})();

/* QuadRan · küçük, bağımlılıksız betik. Hiçbir şey JS'e bağımlı değildir: bu dosya yoksa bağlantılar ve popover'lar yine çalışır. */
(function () {
  "use strict";
  var d = document;

  function bul(secici, kok) { return (kok || d).querySelector(secici); }
  function hepsi(secici, kok) { return Array.prototype.slice.call((kok || d).querySelectorAll(secici)); }
  function acilabilir(dlg) { return !!dlg && typeof dlg.showModal === "function"; }
  function ac(dlg) { if (acilabilir(dlg) && !dlg.open) dlg.showModal(); return acilabilir(dlg); }
  function kapat(dlg) { if (dlg && dlg.open && typeof dlg.close === "function") dlg.close(); }

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
          var baslik = bul("#sikayet-baslik", dlg);
          if (baslik) {
            baslik.textContent = sikayet.getAttribute("data-baslik") ||
              (sikayet.getAttribute("data-kullanici") ? "Bu kullanıcıyı şikâyet et" : "Bu mesajı şikâyet et");
          }
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
      cubuk.classList.add("gizleniyor");
      window.setTimeout(function () { cubuk.classList.add("gizli"); }, 300);
    }
    cubuk.addEventListener("mouseenter", durdur);
    cubuk.addEventListener("focusin", durdur);
    cubuk.addEventListener("mouseleave", function () { durdur(); baslat(); });
    cubuk.addEventListener("focusout", function () { durdur(); baslat(); });
    baslat();
  });
})();

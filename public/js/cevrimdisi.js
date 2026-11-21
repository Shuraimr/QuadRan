/* Script for the offline page (the service worker keeps this in its cache too). An inline script would hit the CSP, hence a separate file.
   When the connection returns the page reloads itself; the address it reloads is the one the person was trying to reach (the service worker shows this page at that same address). */
/* Çevrimdışı sayfasının betiği (service worker bunu da önbellekte tutar). Satır içi betik CSP'ye takılır, bu yüzden ayrı dosya.
   Bağlantı gelince sayfa kendiliğinden yenilenir; yenilenen adres, kişinin gitmeye çalıştığı adrestir (service worker aynı adreste gösterir). */
(function () {
  "use strict";
  var son = document.getElementById("son-deneme");
  /* If the page was opened directly at /cevrimdisi (while online), reloading would return to the same page; go to the feed instead */
  /* Sayfa doğrudan /cevrimdisi adresinde açıldıysa (çevrimiçiyken) yenilemek aynı sayfaya döner; bunun yerine akışa gidilir */
  function don() { if (location.pathname === "/cevrimdisi") location.href = "/"; else location.reload(); }
  var zaman = Date.now();
  function yaz() {
    if (!son) return;
    var sn = Math.round((Date.now() - zaman) / 1000);
    son.textContent = "Bağlantı bekleniyor · son deneme " + (sn < 10 ? "az önce" : sn < 60 ? sn + " sn önce" : Math.floor(sn / 60) + " dk önce");
  }
  function dene() {
    zaman = Date.now(); yaz();
    /* There is no /cevrimdisi.json; any light request that can reach the network will do: HEAD /sw.js (the service worker file always exists) */
    /* /cevrimdisi.json yok; ağa gidebilen hafif bir istek yeter: HEAD /sw.js (service worker dosyası her zaman var) */
    fetch("/sw.js", { method: "HEAD", cache: "no-store" }).then(don).catch(function () { /* still offline · hâlâ çevrimdışı */ });
  }
  window.addEventListener("online", don);
  var dugme = document.getElementById("tekrar-dene");
  if (dugme) dugme.addEventListener("click", function (e) { e.preventDefault(); dene(); });
  window.setInterval(yaz, 5000);
  window.setInterval(dene, 15000);
})();

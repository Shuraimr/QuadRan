/* rubyyard service worker: only for the offline page.
   Why so narrow? If we cached pages, people would see stale content (a deleted topic, old points). So NOTHING else is cached:
   navigation requests go through the normal network; only on a NETWORK ERROR is the ready-made offline page shown.
   The offline page must be self-sufficient: its styles are inside the page, its script is /js/cevrimdisi.js; both are kept in the cache here. */
/* rubyyard service worker: yalnızca çevrimdışı sayfası için.
   Neden bu kadar dar? Sayfaları önbelleğe alırsak kişi eski içerik görür (silinmiş konu, eski puan). Bu yüzden başka HİÇBİR ŞEY
   önbelleğe alınmaz: gezinme isteği normal ağdan gider; yalnızca AĞ HATASI olursa hazır çevrimdışı sayfası gösterilir.
   Çevrimdışı sayfası kendi başına yetmeli: stil sayfanın içinde, betiği /js/cevrimdisi.js; ikisi de burada önbellekte tutulur. */
var SURUM = "rubyyard-cevrimdisi-v2"; /* bump when the offline page changes: the old cache is deleted · çevrimdışı sayfası değişince artır: eski önbellek silinir */
var DOSYALAR = ["/cevrimdisi", "/js/cevrimdisi.js"];

self.addEventListener("install", function (olay) {
  olay.waitUntil(caches.open(SURUM).then(function (onbellek) { return onbellek.addAll(DOSYALAR); }).then(function () { return self.skipWaiting(); }));
});

/* Delete the caches of old versions and take over open pages immediately */
/* Eski sürümlerin önbelleklerini sil ve açık sayfaları hemen devral */
self.addEventListener("activate", function (olay) {
  olay.waitUntil(
    caches.keys().then(function (adlar) { return Promise.all(adlar.filter(function (a) { return a !== SURUM; }).map(function (a) { return caches.delete(a); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (olay) {
  var istek = olay.request;
  if (istek.method !== "GET") return;
  var yol = new URL(istek.url).pathname;
  /* The offline page's own files: network first (to stay fresh), cache if that fails */
  /* Çevrimdışı sayfasının kendi dosyaları: önce ağ (güncel kalsın), olmazsa önbellek */
  if (DOSYALAR.indexOf(yol) > -1 && yol !== "/cevrimdisi") {
    olay.respondWith(fetch(istek).then(function (c) { var kopya = c.clone(); caches.open(SURUM).then(function (o) { o.put(istek, kopya); }); return c; })
      .catch(function () { return caches.match(istek); }));
    return;
  }
  /* If a navigation (page open) request gets a network error, show the offline page; if a response arrives (even 404, 500) it is shown as-is */
  /* Gezinme (sayfa açma) isteği ağ hatası verirse çevrimdışı sayfası; yanıt gelirse (404, 500 dahil) olduğu gibi gösterilir */
  if (istek.mode === "navigate") {
    olay.respondWith(fetch(istek).catch(function () { return caches.match("/cevrimdisi"); }));
  }
});

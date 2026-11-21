/* QuadRan service worker: yalnızca çevrimdışı sayfası için.
   Neden bu kadar dar? Sayfaları önbelleğe alırsak kişi eski içerik görür (silinmiş konu, eski puan). Bu yüzden başka HİÇBİR ŞEY
   önbelleğe alınmaz: gezinme isteği normal ağdan gider; yalnızca AĞ HATASI olursa hazır çevrimdışı sayfası gösterilir.
   Çevrimdışı sayfası kendi başına yetmeli: stil sayfanın içinde, betiği /js/cevrimdisi.js; ikisi de burada önbellekte tutulur. */
var SURUM = "quadran-cevrimdisi-v2"; /* çevrimdışı sayfası değişince artır: eski önbellek silinir */
var DOSYALAR = ["/cevrimdisi", "/js/cevrimdisi.js"];

self.addEventListener("install", function (olay) {
  olay.waitUntil(caches.open(SURUM).then(function (onbellek) { return onbellek.addAll(DOSYALAR); }).then(function () { return self.skipWaiting(); }));
});

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
  /* Çevrimdışı sayfasının kendi dosyaları: önce ağ (güncel kalsın), olmazsa önbellek */
  if (DOSYALAR.indexOf(yol) > -1 && yol !== "/cevrimdisi") {
    olay.respondWith(fetch(istek).then(function (c) { var kopya = c.clone(); caches.open(SURUM).then(function (o) { o.put(istek, kopya); }); return c; })
      .catch(function () { return caches.match(istek); }));
    return;
  }
  /* Gezinme (sayfa açma) isteği ağ hatası verirse çevrimdışı sayfası; yanıt gelirse (404, 500 dahil) olduğu gibi gösterilir */
  if (istek.mode === "navigate") {
    olay.respondWith(fetch(istek).catch(function () { return caches.match("/cevrimdisi"); }));
  }
});

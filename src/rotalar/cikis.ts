// External link confirmation: GET /cikis?u=<address>. All external links in user content come here (src/rutbe.ts disBaglantiHtml);
// if JS is on, rubyyard.js shows the same confirmation in a dialog, this page is the no-JS path.
// Only http/https is accepted (javascript:, data: etc. get 400). An address that goes to our own domain is redirected directly.
// There is no "open redirect" risk: this page does not redirect by itself, the person presses "Go to site";
// it only redirects if it is our own domain, and that is inside our own site.
// Dış bağlantı onayı: GET /cikis?u=<adres>. Kullanıcı içeriğindeki bütün dış bağlantılar buraya gelir (src/rutbe.ts disBaglantiHtml);
// JS varsa rubyyard.js aynı onayı pencerede gösterir, bu sayfa JS'siz yoldur.
// Yalnızca http/https kabul edilir (javascript:, data: vb. 400). Kendi alan adımıza giden adres doğrudan yönlendirilir.
// "Açık yönlendirme" (open redirect) riski yok: bu sayfa kendiliğinden yönlendirmez, kişi "Siteye git"e basar;
// yalnızca kendi alan adımızsa yönlendirilir, o da kendi sitemizin içidir.
import express from "express";
import { geriAdres } from "../yardimci.ts";

export const cikis = express.Router();

cikis.get("/cikis", (req, res) => {
  const ham = typeof req.query.u === "string" ? req.query.u : "";
  let url: URL | null = null;
  try { if (ham.length <= 2000) url = new URL(ham); } catch { /* invalid · geçersiz */ }
  if (!url || !/^https?:$/.test(url.protocol) || !url.hostname) {
    return void res.status(400).render("cikis", { hata: true, adres: "", alan: "", geri: geriAdres(req, "/") });
  }
  if (url.host.toLowerCase() === String(req.get("host") ?? "").toLowerCase()) return void res.redirect(url.href);
  // The domain is shown in lowercase; punycode (xn--) names are left as they are, like in the browser, and the user also sees the full address
  // Alan adı büyük gösterilir; punycode (xn--) adlar tarayıcıdaki gibi olduğu gibi bırakılır, kullanıcı tam adresi de görür
  res.render("cikis", { hata: false, adres: url.href, alan: url.hostname.replace(/^www\./, ""), geri: geriAdres(req, "/") });
});

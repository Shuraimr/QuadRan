// Dış bağlantı onayı: GET /cikis?u=<adres>. Kullanıcı içeriğindeki bütün dış bağlantılar buraya gelir (src/rutbe.ts disBaglantiHtml);
// JS varsa quadran.js aynı onayı pencerede gösterir, bu sayfa JS'siz yoldur.
// Yalnızca http/https kabul edilir (javascript:, data: vb. 400). Kendi alan adımıza giden adres doğrudan yönlendirilir.
// "Açık yönlendirme" (open redirect) riski yok: bu sayfa kendiliğinden yönlendirmez, kişi "Siteye git"e basar;
// yalnızca kendi alan adımızsa yönlendirilir, o da kendi sitemizin içidir.
import express from "express";
import { geriAdres } from "../yardimci.ts";

export const cikis = express.Router();

cikis.get("/cikis", (req, res) => {
  const ham = typeof req.query.u === "string" ? req.query.u : "";
  let url: URL | null = null;
  try { if (ham.length <= 2000) url = new URL(ham); } catch { /* geçersiz */ }
  if (!url || !/^https?:$/.test(url.protocol) || !url.hostname) {
    return void res.status(400).render("cikis", { hata: true, adres: "", alan: "", geri: geriAdres(req, "/") });
  }
  if (url.host.toLowerCase() === String(req.get("host") ?? "").toLowerCase()) return void res.redirect(url.href);
  // Alan adı büyük gösterilir; punycode (xn--) adlar tarayıcıdaki gibi olduğu gibi bırakılır, kullanıcı tam adresi de görür
  res.render("cikis", { hata: false, adres: url.href, alan: url.hostname.replace(/^www\./, ""), geri: geriAdres(req, "/") });
});

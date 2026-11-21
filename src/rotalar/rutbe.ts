// Ranks page: GET /rutbeler (public). Each rank's threshold and the privileges it unlocks, the "you are here" marker
// and the "How are points earned?" card (values are read from the point rules in the admin panel).
// Rütbeler sayfası: GET /rutbeler (herkese açık). Her rütbenin eşiği ve açtığı ayrıcalıklar, "sen buradasın" işareti
// ve "Puan nasıl kazanılır?" kartı (değerler yönetici panelindeki puan kurallarından okunur).
import express from "express";
import { puanKurallari } from "../ayarlar.ts";
import { rutbeler, rutbeBul, acilanlar } from "../rutbe.ts";

export const rutbeRotasi = express.Router();

rutbeRotasi.get("/rutbeler", async (req, res) => {
  const liste = await rutbeler();
  const k = res.locals.kullanici;
  const simdiki = k ? rutbeBul(Number(k.points), liste) : undefined;
  // In each rank, "newly unlocked" is computed against the previous one; for the base rank (nothing unlocked) it stays empty
  // Her rütbede "yeni açılanlar" bir öncekine göre hesaplanır; taban rütbede (hiçbir şey açılmıyor) boş kalır
  const satirlar = liste.map((r, i) => ({ ...r, acilan: i === 0 ? [] : acilanlar(liste[i - 1], r), simdiki: simdiki?.id === r.id }));
  res.render("rutbeler", { satirlar, puan: await puanKurallari(), simdiki, aktifMenu: "siralama" });
});

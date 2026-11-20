// /premium: şimdilik yer tutucu. Gerçek ödeme YOK; premium yönetici tarafından panelden verilir (yonetim-kullanici.ts).
// Sayfa kişinin KENDİ kartını (premium özellikleri seçili hâliyle değil, şu anki hâliyle) gösterir ve Ayarlar'a yönlendirir.
import express from "express";
import { pool } from "../db.ts";
import { girisGerekli, profilGorunumSutunlari, rutbeSutunlari } from "../yardimci.ts";
import { premiumMu } from "../premium.ts";

export const premiumRotasi = express.Router();

premiumRotasi.get("/premium", girisGerekli("Premium için giriş yapman gerekiyor."), async (_req, res) => {
  const k = res.locals.kullanici;
  const [[u]]: any = await pool.query(
    `SELECT users.username, users.bio, users.created_at, users.premium_bitis, ${rutbeSutunlari("users")}, ${profilGorunumSutunlari("users")} FROM users WHERE users.id = ?`, [k.id]);
  res.render("premium", { u, premium: premiumMu(k), aktifMenu: "ayarlar" });
});

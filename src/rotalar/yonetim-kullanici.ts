// Yönetim paneli: Üyeler (liste, üye kartı, roller) ve üye üzerindeki işlemler.
// Liste ve kartı moderatör de açar: kartta yalnızca uyarı ve (yalnızca "uye" rolündekilere) uzaklaştırma yapabilir.
// Rol, puan, rozet, geçici şifre, oturumları kapatma ve hesap kapatma yalnızca admin (route'larda sadeceAdmin).
import express from "express";
import { randomInt } from "node:crypto";
import { pool } from "../db.ts";
import { sifreHashle } from "../sifre.ts";
import {
  bildir, sayi, metin, geriAdres, rutbeSutunlari, banliSql, likeKac, puanEkle, rozetVer, bildirimGonder,
} from "../yardimci.ts";
import { denetim } from "../denetim.ts";
import { kullaniciGetir, islemHatasi, banla, banKaldir, BAN_SURELERI } from "../islemler.ts";
import { yaptirimGecmisi, BAN_EYLEMLERI } from "../yaptirim.ts";
import { sadeceAdmin, sayfala, secim, onayIste } from "./yonetim-ortak.ts";

export const yonetimKullanici = express.Router();

const ROLLER = ["hepsi", "admin", "moderator", "uye"] as const;
const SIRALAR: Record<string, string> = {
  id: "users.id", kullanici: "users.username", rol: "roles.name", puan: "users.points",
  kayit: "users.created_at", gorulme: "users.last_seen_at",
};

// ---------------------------------------------------------------------------
// Liste: /yonetim/uyeler?q=&rol=&banli=&silinmis=&kayit=24s&sirala=&yon=&sayfa=
// WHERE parçaları koddaki sabit metinlerdir; kullanıcıdan gelen değerler hep parametre dizisine (?) girer.
// ORDER BY için sütun adı kullanıcıdan alınmaz: SIRALAR tablosundan seçilir (izin listesi).
// E-posta: yalnızca admin görür ve arar (moderatör için kişisel veri gerekmiyor).
// ---------------------------------------------------------------------------
yonetimKullanici.get("/yonetim/uyeler", async (req, res) => {
  const admin = res.locals.kullanici.rol === "admin";
  const q = metin(req.query.q).slice(0, 64);
  const rol = secim(req.query.rol, ROLLER, "hepsi");
  const banli = secim(req.query.banli, ["hepsi", "evet", "hayir"] as const, "hepsi");
  const silinmis = secim(req.query.silinmis, ["gizle", "goster", "sadece"] as const, "gizle");
  const kayit = secim(req.query.kayit, ["hepsi", "24s"] as const, "hepsi");
  const sirala = secim(req.query.sirala, Object.keys(SIRALAR) as readonly string[], kayit === "24s" ? "kayit" : "id");
  const yon = secim(req.query.yon, ["asc", "desc"] as const, "desc");

  const kosullar: string[] = ["1 = 1"];
  const p: unknown[] = [];
  if (q) {
    if (admin) { kosullar.push("(users.username LIKE ? OR users.email LIKE ?)"); p.push(likeKac(q), likeKac(q)); }
    else { kosullar.push("users.username LIKE ?"); p.push(likeKac(q)); }
  }
  if (rol !== "hepsi") { kosullar.push("roles.name = ?"); p.push(rol); }
  if (banli === "evet") kosullar.push(banliSql("users"));
  if (banli === "hayir") kosullar.push(`NOT ${banliSql("users")}`);
  if (silinmis === "gizle") kosullar.push("users.deleted_at IS NULL");
  if (silinmis === "sadece") kosullar.push("users.deleted_at IS NOT NULL");
  if (kayit === "24s") kosullar.push("users.created_at >= NOW() - INTERVAL 24 HOUR");
  const nerede = kosullar.join(" AND ");

  const [[{ n }]]: any = await pool.query(`SELECT COUNT(*) AS n FROM users JOIN roles ON roles.id = users.role_id WHERE ${nerede}`, p);
  const sf = sayfala(req, Number(n));
  const [kullanicilar]: any = await pool.query(
    `SELECT users.id, users.username, users.email, users.points, users.created_at, users.last_seen_at, users.deleted_at,
            users.banned_until, ${banliSql("users")} AS banli, roles.name AS rol, ${rutbeSutunlari("users")}
       FROM users JOIN roles ON roles.id = users.role_id
      WHERE ${nerede}
      ORDER BY ${SIRALAR[sirala]} ${yon === "asc" ? "ASC" : "DESC"}, users.id DESC
      LIMIT ? OFFSET ?`,
    [...p, sf.boyut, sf.offset]
  );

  res.render("yonetim/uyeler", {
    baslik: "Üyeler", aktif: "uyeler", kullanicilar, sf, admin,
    qs: { q, rol, banli, silinmis, kayit, sirala, yon }, yol: "/yonetim/uyeler",
    filtreli: !!(q || rol !== "hepsi" || banli !== "hepsi" || silinmis !== "gizle" || kayit !== "hepsi"),
  });
});

// ---------------------------------------------------------------------------
// Roller (yalnızca admin): yönetici ve moderatörlerin listesi + rol değiştirme.
// Bu route "/:id" kalıbından ÖNCE tanımlı olmalı; yoksa "roller" bir üye numarası sanılır.
// ---------------------------------------------------------------------------
yonetimKullanici.get("/yonetim/uyeler/roller", sadeceAdmin, async (req, res) => {
  const [yetkililer]: any = await pool.query(
    `SELECT users.id, users.username, users.last_seen_at, users.created_at, roles.name AS rol
       FROM users JOIN roles ON roles.id = users.role_id
      WHERE users.deleted_at IS NULL AND roles.name IN ('admin', 'moderator')
      ORDER BY roles.name, users.username`
  );
  const [roller]: any = await pool.query("SELECT name FROM roles ORDER BY id");
  for (const y of yetkililer) y.engel = await islemHatasi(res.locals.kullanici, await kullaniciGetir(y.id));
  res.render("yonetim/roller", { baslik: "Üyeler", aktif: "uyeler", yetkililer, roller });
});

// ---------------------------------------------------------------------------
// Üye kartı: /yonetim/uyeler/:id?sekme=ozet|icerik|sikayet|yaptirim|islem
// ---------------------------------------------------------------------------
const SEKMELER = ["ozet", "icerik", "sikayet", "yaptirim", "islem"] as const;

yonetimKullanici.get("/yonetim/uyeler/:id", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const yapan = res.locals.kullanici;
  const admin = yapan.rol === "admin";
  const sekme = secim(req.query.sekme, SEKMELER, "ozet");

  const [satirlar]: any = await pool.query(
    `SELECT users.id, users.username, users.email, users.bio, users.points, users.created_at, users.last_seen_at, users.deleted_at,
            users.banned_at, users.banned_until, users.ban_reason, ${banliSql("users")} AS banli,
            roles.name AS rol, ${rutbeSutunlari("users")}
       FROM users JOIN roles ON roles.id = users.role_id WHERE users.id = ?`,
    [id]
  );
  const k = satirlar[0];
  if (!k) return next();

  const [[ist]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM topics WHERE user_id = ? AND deleted_at IS NULL) AS konu,
            (SELECT COUNT(*) FROM posts WHERE user_id = ? AND deleted_at IS NULL) AS mesaj,
            (SELECT COUNT(*) FROM chat_messages WHERE user_id = ? AND deleted_at IS NULL) AS sohbet,
            (SELECT COALESCE(SUM(post_votes.value), 0) FROM post_votes JOIN posts ON posts.id = post_votes.post_id WHERE posts.user_id = ?) AS oy,
            (SELECT COUNT(*) FROM reports WHERE reported_user_id = ?
                OR post_id IN (SELECT id FROM posts WHERE user_id = ?)
                OR chat_message_id IN (SELECT id FROM chat_messages WHERE user_id = ?)
                OR message_id IN (SELECT id FROM messages WHERE sender_id = ?)
                OR room_message_id IN (SELECT id FROM room_messages WHERE user_id = ?)) AS sikayet`,
    [id, id, id, id, id, id, id, id, id]
  );
  for (const s in ist) ist[s] = Number(ist[s]);

  // Sekmeye göre yalnızca gereken veri çekilir
  const veri: Record<string, any> = {};
  if (sekme === "ozet") {
    const [konular]: any = await pool.query("SELECT id, title, created_at FROM topics WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 5", [id]);
    const [mesajlar]: any = await pool.query("SELECT id, content, topic_id, created_at FROM posts WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 5", [id]);
    const yaptirimlar = await yaptirimGecmisi(id, undefined, 5);
    // "Son olaylar" zaman çizelgesi: üç kaynağı tek listede birleştirip tarihe göre sıralarız
    const olaylar = [
      ...konular.map((t: any) => ({ zaman: t.created_at, tur: "konu", metin: "Konu açtı: " + t.title, link: "/konu/" + t.id })),
      ...mesajlar.map((m: any) => ({ zaman: m.created_at, tur: "mesaj", metin: "Mesaj yazdı: " + m.content, link: `/konu/${m.topic_id}#mesaj-${m.id}` })),
      ...yaptirimlar.map((y: any) => ({ zaman: y.created_at, tur: "yaptirim", eylem: y.eylem, aktor: y.aktor, ayrinti: y.ayrinti })),
    ].sort((a, b) => new Date(b.zaman).getTime() - new Date(a.zaman).getTime()).slice(0, 8);
    veri.olaylar = olaylar;
    [veri.rozetler] = (await pool.query(
      `SELECT badges.id, badges.name FROM user_badges JOIN badges ON badges.id = user_badges.badge_id WHERE user_badges.user_id = ? ORDER BY user_badges.earned_at`, [id])) as any;
  } else if (sekme === "icerik") {
    [veri.konular] = (await pool.query("SELECT id, title, created_at, deleted_at FROM topics WHERE user_id = ? ORDER BY id DESC LIMIT 20", [id])) as any;
    [veri.mesajlar] = (await pool.query("SELECT id, content, created_at, deleted_at, topic_id FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 20", [id])) as any;
    [veri.sohbet] = (await pool.query("SELECT id, content, created_at, deleted_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 20", [id])) as any;
  } else if (sekme === "sikayet") {
    // Hakkındaki şikâyetler: kişinin kendisi, konu mesajları, sohbet ve özel mesajları (özel mesajın İÇERİĞİ gösterilmez)
    [veri.hakkinda] = (await pool.query(
      `SELECT reports.id, reports.hedef_tur, reports.sebep, reports.durum, reports.created_at, bildiren.username AS bildiren
         FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id
        WHERE reports.reported_user_id = ?
           OR reports.post_id IN (SELECT id FROM posts WHERE user_id = ?)
           OR reports.chat_message_id IN (SELECT id FROM chat_messages WHERE user_id = ?)
           OR reports.message_id IN (SELECT id FROM messages WHERE sender_id = ?)
           OR reports.room_message_id IN (SELECT id FROM room_messages WHERE user_id = ?)
        ORDER BY reports.id DESC LIMIT 30`, [id, id, id, id, id])) as any;
    [veri.yaptigi] = (await pool.query(
      `SELECT reports.id, reports.hedef_tur, reports.sebep, reports.durum, reports.created_at FROM reports WHERE reporter_id = ? ORDER BY id DESC LIMIT 30`, [id])) as any;
  } else if (sekme === "yaptirim") {
    veri.yaptirimlar = await yaptirimGecmisi(id, undefined, 50);
  } else {
    // İşlem kaydı sekmesi: admin bu kişiye yapılan ve bu kişinin yaptığı işlemleri görür; moderatör yalnızca kendi işlemlerini
    [veri.islemler] = (await pool.query(
      `SELECT audit_log.id, audit_log.eylem, audit_log.hedef_tur, audit_log.hedef_id, audit_log.ayrinti, audit_log.created_at, users.username AS aktor
         FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
        WHERE ((audit_log.hedef_tur = 'kullanici' AND audit_log.hedef_id = ?) ${admin ? "OR audit_log.actor_id = ?" : ""})
          ${admin ? "" : "AND audit_log.actor_id = ?"}
        ORDER BY audit_log.id DESC LIMIT 40`,
      admin ? [id, id] : [id, yapan.id])) as any;
  }

  // Admin: rozet seçenekleri ve rol listesi (işlem panelinin formları için)
  let rozetler: any[] = veri.rozetler ?? [], tumRozetler: any[] = [], roller: any[] = [];
  if (admin) {
    if (sekme !== "ozet") [rozetler] = (await pool.query(
      `SELECT badges.id, badges.name FROM user_badges JOIN badges ON badges.id = user_badges.badge_id WHERE user_badges.user_id = ? ORDER BY user_badges.earned_at`, [id])) as any;
    [tumRozetler] = (await pool.query("SELECT id, name FROM badges ORDER BY name")) as any;
    [roller] = (await pool.query("SELECT name FROM roles ORDER BY id")) as any;
  }

  // Bu yetkili bu üyeye hangi işlemleri yapabilir? (kendisi, yönetici ve moderatörler için moderatör yapamaz)
  const hedef = await kullaniciGetir(id);
  const banHatasi = await islemHatasi(yapan, hedef, true);
  const islemEngeli = await islemHatasi(yapan, hedef); // son yönetici kuralı olmadan (uyarı, ban kaldırma, rol vb. için)

  // Uzaklaştırma başlığı: kim, ne zaman, toplam kaç gün (ban satırı kullanıcıda, "kim" işlem kaydında)
  let banBilgi: any = null;
  if (k.banli) {
    const [[son]]: any = await pool.query(
      `SELECT users.username AS aktor FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
        WHERE audit_log.eylem IN (?) AND ((audit_log.hedef_tur = 'kullanici' AND audit_log.hedef_id = ?) OR JSON_EXTRACT(audit_log.ayrinti, '$.kullanici_id') = ?)
        ORDER BY audit_log.id DESC LIMIT 1`, [BAN_EYLEMLERI, id, id]);
    const gun = k.banned_until ? Math.max(1, Math.round((new Date(k.banned_until).getTime() - new Date(k.banned_at).getTime()) / 86_400_000)) : null;
    banBilgi = { aktor: son?.aktor ?? null, gun };
  }

  res.render("yonetim/uye", {
    baslik: "Üye kartı", geri: { ad: "Üyeler", href: "/yonetim/uyeler" }, aktif: "uyeler", k, ist, sekme, veri, rozetler, tumRozetler, roller, banBilgi,
    izin: {
      uyar: !k.deleted_at && !islemEngeli,
      ban: !k.deleted_at && !banHatasi,
      banKaldir: k.banli && !islemEngeli,
      adminIslem: admin && !k.deleted_at && !islemEngeli,
      kapat: admin && !k.deleted_at && !banHatasi,
    },
    banHatasi, islemEngeli, sureler: BAN_SURELERI, admin,
  });
});

// ---------------------------------------------------------------------------
// İşlemler. Hepsi POST + CSRF (ara katman). Sonuç toast olarak gösterilip detay sayfasına dönülür.
// ---------------------------------------------------------------------------
const detay = (id: number) => `/yonetim/uyeler/${id}`;

// Rol değiştir (yalnızca admin)
yonetimKullanici.post("/yonetim/uyeler/:id/rol", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const yeniRol = metin(req.body.rol);
  const hedef = await kullaniciGetir(id);
  const [roller]: any = await pool.query("SELECT id FROM roles WHERE name = ?", [yeniRol]);
  let hata = !roller[0] ? "Geçersiz rol." : null;
  hata ??= await islemHatasi(res.locals.kullanici, hedef, yeniRol !== "admin"); // admin düşürülüyorsa son yönetici korunur
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesabın rolü değiştirilemez.";
  if (!hata && hedef!.rol === yeniRol) hata = "Kullanıcı zaten bu rolde.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(geriAdres(req, detay(id))); }

  await pool.query("UPDATE users SET role_id = ? WHERE id = ?", [roller[0].id, id]);
  await denetim(req, res, "kullanici.rol", "kullanici", id, { eski: hedef!.rol, yeni: yeniRol });
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: `Rolün değiştirildi: ${yeniRol}`, link: "/profil/" + hedef!.username });
  bildir(req, "basari", `${hedef!.username} artık ${yeniRol}.`);
  res.redirect(geriAdres(req, detay(id)));
});

// Puan ayarla (yalnızca admin): +/- fark ve zorunlu sebep
yonetimKullanici.post("/yonetim/uyeler/:id/puan", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const fark = Number(metin(req.body.fark));
  const sebep = metin(req.body.sebep);
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef);
  if (!hata && (!Number.isInteger(fark) || fark === 0 || Math.abs(fark) > 100000)) hata = "Puan farkı 0 olmayan, en fazla 100.000 büyüklüğünde bir tam sayı olmalı.";
  if (!hata && (sebep.length < 3 || sebep.length > 200)) hata = "Sebep 3 ile 200 karakter arasında olmalı.";
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesabın puanı değiştirilemez.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(geriAdres(req, detay(id))); }

  // Önceki/sonraki puan puanEkle'nin kilit altında okuduğu değerlerden gelir: ayrı SELECT'ler başka bir işlemin araya girmesiyle yanlış kayıt yazabilirdi.
  const { eski: onceki, yeni: sonraki } = await puanEkle(id, fark, "duzeltme"); // puan sıfırın altına inmez; geçmişe "düzeltme" olarak yazılır
  await denetim(req, res, "kullanici.puan", "kullanici", id, { fark, sebep, onceki, sonraki });
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: `Puanın yönetici tarafından ${fark > 0 ? "+" : ""}${fark} değiştirildi: ${sebep}`, link: "/profil/" + hedef!.username });
  bildir(req, "basari", `Puan ${onceki} → ${sonraki} oldu.`);
  res.redirect(geriAdres(req, detay(id)));
});

// Uyar (admin ve moderatör): üyeye "moderasyon" bildirimi gider (sebep içinde), işlem kaydına yazılır.
// Moderatör yalnızca "uye" rolündekileri uyarabilir (islemHatasi). Şikâyetten bağımsız, doğrudan uyarıdır.
yonetimKullanici.post("/yonetim/uyeler/:id/uyar", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const sebep = metin(req.body.sebep);
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef);
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesap uyarılamaz.";
  if (!hata && (sebep.length < 3 || sebep.length > 200)) hata = "Uyarı sebebi 3 ile 200 karakter arasında olmalı.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(geriAdres(req, detay(id))); }
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: `Moderatörler seni uyardı: ${sebep}. Lütfen topluluk kurallarına dikkat et.`, link: "/profil/" + hedef!.username });
  // yazar + kullanici_id: Yaptırım geçmişi bu kaydı kişiye bağlar (src/yaptirim.ts)
  await denetim(req, res, "kullanici.uyar", "kullanici", id, { yazar: hedef!.username, kullanici_id: id, sebep });
  bildir(req, "basari", `${hedef!.username} uyarıldı.`);
  res.redirect(geriAdres(req, detay(id)));
});

// Ban (admin ve moderatör; moderatör yalnızca "uye" rolündekini banlar, kurallar islemler.ts'te).
// Kalıcı ban onay sayfasından geçer; sebep her zaman zorunlu (banla() kontrol eder, burada onaydan ÖNCE de bakıyoruz).
yonetimKullanici.post("/yonetim/uyeler/:id/ban", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const sebep = metin(req.body.sebep);
  const sure = metin(req.body.sure);
  if (sure === "kalici" && sebep.length >= 1) {
    if (onayIste(req, res, { baslik: "Kalıcı uzaklaştırma", metin: `Bu üye kalıcı olarak uzaklaştırılacak ve oturumu kapanacak. Sebep: “${sebep}”. Onaylıyor musun?`, buton: "Evet, kalıcı uzaklaştır", iptal: detay(id), aktif: "uyeler" })) return;
  }
  const sonuc = await banla(res.locals.kullanici, id, sure, sebep);
  if (sonuc.hata) { bildir(req, "hata", sonuc.hata); return res.redirect(geriAdres(req, detay(id))); }
  await denetim(req, res, "kullanici.ban", "kullanici", id, { yazar: sonuc.hedef!.username, kullanici_id: id, sure: sonuc.etiket, sebep, kaynak: "üye kartı" });
  bildir(req, "basari", `${sonuc.hedef!.username} uzaklaştırıldı (${sonuc.etiket}).`);
  res.redirect(geriAdres(req, detay(id)));
});

yonetimKullanici.post("/yonetim/uyeler/:id/ban-kaldir", async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const sonuc = await banKaldir(res.locals.kullanici, id);
  if (sonuc.hata) { bildir(req, "hata", sonuc.hata); return res.redirect(geriAdres(req, detay(id))); }
  await denetim(req, res, "kullanici.ban_kaldir", "kullanici", id, { yazar: sonuc.hedef!.username, kullanici_id: id, kaynak: "panel" });
  bildir(req, "basari", `${sonuc.hedef!.username} için uzaklaştırma kaldırıldı.`);
  res.redirect(geriAdres(req, detay(id)));
});

// Bütün oturumlarını kapat (yalnızca admin): oturum_surumu 1 artar, oturum.ts her istekte karşılaştırır, açık oturumlar düşer.
// Tehlikeli sayılır: sebep zorunlu + onay sayfası; sebep işlem kaydına ve üyenin bildirimine gider.
yonetimKullanici.post("/yonetim/uyeler/:id/oturumlari-kapat", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const sebep = metin(req.body.sebep);
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef);
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesabın oturumu yok.";
  if (!hata && (sebep.length < 3 || sebep.length > 200)) hata = "Sebep 3 ile 200 karakter arasında olmalı.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(geriAdres(req, detay(id))); }
  if (onayIste(req, res, { baslik: "Bütün oturumları kapat", metin: `${hedef!.username} bütün cihazlardaki oturumlarından çıkarılacak. Sebep: “${sebep}”. Onaylıyor musun?`, buton: "Evet, oturumları kapat", iptal: detay(id), aktif: "uyeler" })) return;
  await pool.query("UPDATE users SET oturum_surumu = oturum_surumu + 1 WHERE id = ?", [id]);
  await denetim(req, res, "kullanici.oturum_kapat", "kullanici", id, { yazar: hedef!.username, kullanici_id: id, sebep });
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: `Bütün oturumların yönetici tarafından kapatıldı. Sebep: ${sebep}`, link: "/giris" });
  bildir(req, "basari", `${hedef!.username} kullanıcısının bütün oturumları kapatıldı.`);
  res.redirect(geriAdres(req, detay(id)));
});

// Rozet ver / al (yalnızca admin)
yonetimKullanici.post("/yonetim/uyeler/:id/rozet-ver", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const hedef = await kullaniciGetir(id);
  const [rozetler]: any = await pool.query("SELECT id, name FROM badges WHERE id = ?", [sayi(req.body.badge_id)]);
  const hata = !hedef ? "Kullanıcı bulunamadı." : hedef.silindi ? "Kapatılmış hesaba rozet verilemez." : !rozetler[0] ? "Rozet bulunamadı." : null;
  if (hata) { bildir(req, "hata", hata); return res.redirect(geriAdres(req, detay(id))); }
  const [var_]: any = await pool.query("SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?", [id, rozetler[0].id]);
  if (var_[0]) { bildir(req, "hata", "Kullanıcı bu rozete zaten sahip."); return res.redirect(geriAdres(req, detay(id))); }
  await rozetVer(id, rozetler[0].name); // bildirimi de gönderir
  await denetim(req, res, "kullanici.rozet_ver", "kullanici", id, { rozet: rozetler[0].name });
  bildir(req, "basari", `“${rozetler[0].name}” rozeti verildi.`);
  res.redirect(geriAdres(req, detay(id)));
});

yonetimKullanici.post("/yonetim/uyeler/:id/rozet-al", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const [rozetler]: any = await pool.query("SELECT id, name FROM badges WHERE id = ?", [sayi(req.body.badge_id)]);
  if (!rozetler[0]) { bildir(req, "hata", "Rozet bulunamadı."); return res.redirect(geriAdres(req, detay(id))); }
  // Rozet silme + rozet puanını geri alma TEK transaction'da: yarım kalırsa rozet gider ama puan kalırdı.
  // Geri alınan miktar o günkü puan_rozet ayarından değil points_log'daki "hâlâ açık" miktardan gelir
  // (SUM('rozet') + SUM('rozet_geri') bu rozet için); ayar sonradan değişmiş olabilir.
  const baglanti = await pool.getConnection();
  let silindi = false;
  try {
    await baglanti.beginTransaction();
    await baglanti.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [id]); // eşzamanlı iki "rozet al" aynı puanı iki kez düşmesin
    const [sonuc]: any = await baglanti.query("DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?", [id, rozetler[0].id]);
    silindi = sonuc.affectedRows > 0;
    if (silindi) {
      const [[acik]]: any = await baglanti.query(
        "SELECT COALESCE(SUM(miktar), 0) AS n FROM points_log WHERE user_id = ? AND sebep IN ('rozet', 'rozet_geri') AND ilgili_id = ?",
        [id, rozetler[0].id]);
      if (Number(acik.n) > 0) await puanEkle(id, -Number(acik.n), "rozet_geri", rozetler[0].id, baglanti);
    }
    await baglanti.commit();
  } catch (hata) {
    await baglanti.rollback();
    throw hata;
  } finally {
    baglanti.release();
  }
  if (!silindi) { bildir(req, "hata", "Kullanıcıda bu rozet yok."); return res.redirect(geriAdres(req, detay(id))); }
  await denetim(req, res, "kullanici.rozet_al", "kullanici", id, { rozet: rozetler[0].name });
  bildir(req, "basari", `“${rozetler[0].name}” rozeti geri alındı.`);
  res.redirect(geriAdres(req, detay(id)));
});

// Hesabı kapat (yalnızca admin): /hesap/sil ile aynı yumuşak silme. Kullanıcı adını yazarak onaylanır.
yonetimKullanici.post("/yonetim/uyeler/:id/hesap-kapat", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef, true);
  if (!hata && hedef!.silindi) hata = "Hesap zaten kapatılmış.";
  if (!hata && metin(req.body.onay_ad) !== hedef!.username) hata = "Onay için kullanıcı adını tam olarak yazmalısın.";
  const sebep = metin(req.body.sebep);
  if (!hata && (sebep.length < 3 || sebep.length > 200)) hata = "Hesabı kapatmak için 3 ile 200 karakter arasında bir sebep yazmalısın.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(geriAdres(req, detay(id))); }
  // Kullanıcı adını yazarak onay + (aşağıdaki) onay sayfası: iki adım. Bildirim, hesap kapanmadan önce yazılır.
  if (onayIste(req, res, { baslik: "Hesabı kapat", metin: `${hedef!.username} hesabı kapatılacak (kullanıcı adı ve e-posta anonimleşir, giriş yapamaz). Sebep: “${sebep}”. Onaylıyor musun?`, buton: "Evet, hesabı kapat", iptal: detay(id), aktif: "uyeler" })) return;
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: `Hesabın yönetici tarafından kapatıldı. Sebep: ${sebep}`, link: "/" });

  // Kullanıcı adı ve e-posta değişir ki aynısı tekrar kayıt olabilsin (hesap/sil ile aynı kural)
  await pool.query(
    `UPDATE users SET deleted_at = NOW(), username = CONCAT('silinmis_', id), email = CONCAT('silinmis_', id, '@quadran.invalid'),
            bio = NULL, avatar_url = NULL, banner_url = NULL, password_hash = '' WHERE id = ?`,
    [id]
  );
  await denetim(req, res, "kullanici.hesap_kapat", "kullanici", id, { eski_ad: hedef!.username, sebep });
  bildir(req, "basari", `${hedef!.username} hesabı kapatıldı.`);
  res.redirect(geriAdres(req, detay(id)));
});

// Şifreyi sıfırla (yalnızca admin): rastgele geçici şifre üretilir ve BİR KEZ gösterilir.
// Şifre ne veritabanına düz yazılır, ne işlem kaydına, ne de oturuma; yalnızca bu yanıtın gövdesinde görünür.
const ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // 0/O, 1/l/I gibi karışanlar yok
yonetimKullanici.post("/yonetim/uyeler/:id/sifre-sifirla", sadeceAdmin, async (req, res, next) => {
  const id = sayi(req.params.id);
  if (!id) return next();
  const hedef = await kullaniciGetir(id);
  let hata = await islemHatasi(res.locals.kullanici, hedef);
  if (!hata && hedef!.silindi) hata = "Kapatılmış hesabın şifresi sıfırlanamaz.";
  if (hata) { bildir(req, "hata", hata); return res.redirect(geriAdres(req, detay(id))); }

  let gecici = "";
  for (let i = 0; i < 12; i++) gecici += ALFABE[randomInt(ALFABE.length)]; // randomInt: güvenli rastgele (Math.random değil)
  // oturum_surumu + 1: kullanıcının açık oturumları düşer, geçici şifreyle yeniden girmesi gerekir
  await pool.query("UPDATE users SET password_hash = ?, oturum_surumu = oturum_surumu + 1 WHERE id = ?", [await sifreHashle(gecici), id]);
  // Bekleyen "şifremi unuttum" bağlantıları da ölür
  await pool.query("UPDATE password_resets SET used_at = COALESCE(used_at, NOW()) WHERE user_id = ?", [id]);
  await denetim(req, res, "kullanici.sifre_sifirla", "kullanici", id, { kullanici: hedef!.username });
  await bildirimGonder({ alan: id, yapan: null, tur: "moderasyon", metin: "Şifren yönetici tarafından sıfırlandı. Giriş yaptıktan sonra şifreni değiştir.", link: "/hesap/sifre" });

  res.set("Cache-Control", "no-store"); // tarayıcı/ara önbellek geçici şifreyi saklamasın
  res.render("yonetim/gecici-sifre", { baslik: "Geçici şifre", aktif: "uyeler", k: hedef, gecici });
});

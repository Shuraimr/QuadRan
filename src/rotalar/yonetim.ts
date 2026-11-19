// Yönetim paneli (/yonetim). Bilgi mimarisi (kenar menü) ve yetki matrisi için docs/AKTARIM.md "Yönetim paneli" bölümüne bak.
//
//   Bakış                    /yonetim                          moderatör + admin
//   Moderasyon               /yonetim/sikayetler, yaptirimlar, filtre   (filtre: moderatör görür, admin düzenler)
//   Site bölümleri           /yonetim/forum, sohbet, uyeler, puan (yalnızca admin)
//   Site                     /yonetim/duyurular, kayit-erisim (yalnızca admin), islem-kaydi (moderatör yalnızca kendi işlemlerini görür)
//
// İki kapı: aşağıdaki use() "moderatör ya da admin mi?" diye bakar; sadeceAdmin (yonetim-ortak.ts) daha dar kapıdır.
// Menüde bir öğeyi gizlemek yetmez, her yalnızca-admin route'ta sadeceAdmin da var.
import express from "express";
import { pool } from "../db.ts";
import { girisGerekli, banliSql, metin, sayi, likeKac } from "../yardimci.ts";
import { EYLEM_ETIKETLERI } from "../denetim.ts";
import { hedefOnizleme, TUR_ETIKET } from "../sikayet.ts";
import { sayfala, tarihFiltresi, menuKur, kalanSure } from "./yonetim-ortak.ts";
import { yonetimKullanici } from "./yonetim-kullanici.ts";
import { yonetimIcerik } from "./yonetim-icerik.ts";
import { yonetimSikayet } from "./yonetim-sikayet.ts";
import { yonetimSite } from "./yonetim-site.ts";

export const yonetim = express.Router();

yonetim.use("/yonetim", girisGerekli("Yönetim paneli için giriş yapman gerekiyor."), async (req, res, next) => {
  const rol = res.locals.kullanici?.rol;
  if (!["admin", "moderator"].includes(rol)) return res.status(403).render("yonetim/yasak", {});
  // Kenar çubuğundaki bekleyen şikâyet sayısı (oturum.ts staff için zaten hesapladı)
  const bekleyen = res.locals.bekleyenSikayet ?? 0;
  res.locals.bekleyenSikayet = bekleyen;
  res.locals.menu = menuKur(rol, bekleyen);
  res.locals.kalanSure = kalanSure;
  // yUrl("/yonetim/forum", {q:"", durum:"aktif"}, {sayfa: 2}) -> "/yonetim/forum?durum=aktif&sayfa=2" (boş değerler atılır)
  res.locals.yUrl = (yol: string, qs: Record<string, unknown>, ek: Record<string, unknown> = {}) => {
    const girdi = Object.entries({ ...qs, ...ek }).filter(([, v]) => v !== "" && v !== null && v !== undefined);
    return yol + (girdi.length ? "?" + new URLSearchParams(girdi.map(([a, b]) => [a, String(b)])).toString() : "");
  };
  res.locals.eylemEtiketleri = EYLEM_ETIKETLERI;
  next();
});

// ---------------------------------------------------------------------------
// Eski adresler (yer imleri, eski bağlantılar): 301 ile yenisine. Sorgu dizgesi korunur. Yalnızca GET:
// POST yönlendirmesi veriyi kaybettirir, o formlar zaten yeni adreslere gider.
// ---------------------------------------------------------------------------
const sorgu = (req: express.Request) => { const i = req.originalUrl.indexOf("?"); return i === -1 ? "" : req.originalUrl.slice(i); };
const tasi = (eski: string, yeni: string) => yonetim.get(eski, (req, res) => res.redirect(301, yeni + sorgu(req)));
tasi("/yonetim/kullanicilar", "/yonetim/uyeler");
tasi("/yonetim/ayarlar", "/yonetim/duyurular");
tasi("/yonetim/icerik/kategoriler", "/yonetim/forum/kategoriler");
tasi("/yonetim/icerik/rutbeler", "/yonetim/puan/rutbeler");
tasi("/yonetim/icerik/rozetler", "/yonetim/puan/rozetler");
yonetim.get("/yonetim/kullanicilar/:id", (req, res) => res.redirect(301, `/yonetim/uyeler/${encodeURIComponent(req.params.id)}` + sorgu(req)));
yonetim.get("/yonetim/icerik", (req, res) => {
  // Eski ?tur=konu|mesaj|sohbet, yeni adreslerden birine gider (tur parametresi artık adreste)
  const tur = req.query.tur;
  const hedef = tur === "mesaj" ? "/yonetim/forum/mesajlar" : tur === "sohbet" ? "/yonetim/sohbet" : "/yonetim/forum";
  const q = new URLSearchParams(sorgu(req).slice(1)); q.delete("tur");
  res.redirect(301, hedef + (q.size ? "?" + q.toString() : ""));
});

yonetim.use(yonetimKullanici);
yonetim.use(yonetimIcerik);
yonetim.use(yonetimSikayet);
yonetim.use(yonetimSite);

// ---------------------------------------------------------------------------
// Pano
// ---------------------------------------------------------------------------
const yerelTarih = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Son 30 günün günlük sayısı (kayıt olmayan günler 0). tablo koddaki sabit bir ad.
async function gunluk(tablo: "users" | "topics" | "posts", silinmisHaric: boolean) {
  const [satirlar]: any = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS gun, COUNT(*) AS n FROM ${tablo}
      WHERE created_at >= CURDATE() - INTERVAL 29 DAY ${silinmisHaric ? "AND deleted_at IS NULL" : ""} GROUP BY gun`
  );
  const harita = new Map<string, number>(satirlar.map((s: any) => [s.gun, Number(s.n)]));
  const veri = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const gun = yerelTarih(d);
    veri.push({ gun, n: harita.get(gun) ?? 0 });
  }
  return { veri, toplam: veri.reduce((a, b) => a + b.n, 0), en: Math.max(1, ...veri.map((v) => v.n)) };
}

yonetim.get("/yonetim", async (req, res) => {
  const admin = res.locals.kullanici.rol === "admin";
  const [[t]]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS kullanici,
            (SELECT COUNT(*) FROM topics WHERE deleted_at IS NULL) AS konu,
            (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL) AS mesaj,
            (SELECT COUNT(*) FROM chat_messages WHERE deleted_at IS NULL) AS sohbet,
            (SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL) AS ozel,
            (SELECT COUNT(*) FROM reports WHERE durum = 'bekliyor') AS sikayet,
            (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND ${banliSql("users")}) AS banli,
            (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND ${banliSql("users")}
                AND banned_until IS NOT NULL AND banned_until <= NOW() + INTERVAL 24 HOUR) AS yaklasan_ban,
            (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 24 HOUR) AS yeni_hesap`
  );
  for (const k in t) t[k] = Number(t[k]);
  const [cevrimici]: any = await pool.query(
    "SELECT username FROM users WHERE deleted_at IS NULL AND last_seen_at >= NOW() - INTERVAL 5 MINUTE ORDER BY username");
  const [kategoriler]: any = await pool.query(
    `SELECT categories.id, categories.name, COUNT(topics.id) AS konu,
            (SELECT COUNT(*) FROM posts JOIN topics t2 ON t2.id = posts.topic_id WHERE t2.category_id = categories.id AND posts.deleted_at IS NULL) AS mesaj
       FROM categories LEFT JOIN topics ON topics.category_id = categories.id AND topics.deleted_at IS NULL
      GROUP BY categories.id ORDER BY konu DESC, categories.name LIMIT 5`
  );
  for (const c of kategoriler) { c.konu = Number(c.konu); c.mesaj = Number(c.mesaj); }

  const [bekleyenler]: any = await pool.query(
    `SELECT reports.id, reports.hedef_tur, reports.sebep, reports.created_at, bildiren.username AS bildiren,
            ${"COALESCE(reports.post_id, reports.reported_user_id, reports.chat_message_id, reports.message_id)"} AS hedef_id
       FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id
      WHERE reports.durum = 'bekliyor' ORDER BY reports.id DESC LIMIT 5`
  );
  for (const b of bekleyenler) b.hedef = await hedefOnizleme(b.hedef_tur, b.hedef_id);

  // Moderatör yalnızca kendi son işlemlerini görür (işlem kaydıyla aynı kural), admin hepsini
  const [sonIslemler]: any = await pool.query(
    `SELECT audit_log.id, audit_log.eylem, audit_log.hedef_tur, audit_log.hedef_id, audit_log.created_at, users.username AS aktor
       FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id
      ${admin ? "" : "WHERE audit_log.actor_id = ?"} ORDER BY audit_log.id DESC LIMIT 8`,
    admin ? [] : [res.locals.kullanici.id]
  );

  res.render("yonetim/bakis", {
    baslik: "Bakış", aktif: "bakis", t, cevrimici, kategoriler, bekleyenler, sonIslemler, turEtiket: TUR_ETIKET,
    grafikler: {
      yeniKullanici: await gunluk("users", true),
      yeniMesaj: await gunluk("posts", true),
    },
  });
});

// ---------------------------------------------------------------------------
// Panel araması (Ctrl+K ve üst çubuktaki kutu): /yonetim/ara?q=
// Gruplar: üyeler (kullanıcı adı; e-postayı yalnızca admin arar), konular (başlık), şikâyet (#numara).
// ---------------------------------------------------------------------------
yonetim.get("/yonetim/ara", async (req, res) => {
  const admin = res.locals.kullanici.rol === "admin";
  const q = metin(req.query.q).slice(0, 100);
  let uyeler: any[] = [], konular: any[] = [], sikayetler: any[] = [];
  if (q) {
    [uyeler] = (await pool.query(
      `SELECT users.id, users.username, roles.name AS rol, users.deleted_at, ${banliSql("users")} AS banli
         FROM users JOIN roles ON roles.id = users.role_id
        WHERE ${admin ? "(users.username LIKE ? OR users.email LIKE ?)" : "users.username LIKE ?"}
        ORDER BY users.username LIMIT 10`,
      admin ? [likeKac(q), likeKac(q)] : [likeKac(q)]
    )) as any;
    [konular] = (await pool.query(
      `SELECT topics.id, topics.title, topics.deleted_at, categories.name AS kategori FROM topics
         JOIN categories ON categories.id = topics.category_id WHERE topics.title LIKE ? ORDER BY topics.id DESC LIMIT 10`,
      [likeKac(q)]
    )) as any;
    const no = q.match(/^#?(\d{1,10})$/);
    if (no) {
      [sikayetler] = (await pool.query(
        `SELECT reports.id, reports.hedef_tur, reports.sebep, reports.durum, reports.created_at, bildiren.username AS bildiren
           FROM reports JOIN users bildiren ON bildiren.id = reports.reporter_id WHERE reports.id = ?`,
        [Number(no[1])]
      )) as any;
    }
  }
  res.render("yonetim/ara", { baslik: "Ara", aktif: "bakis", q, uyeler, konular, sikayetler, turEtiket: TUR_ETIKET });
});

// ---------------------------------------------------------------------------
// İşlem kaydı: /yonetim/islem-kaydi?eylem=&aktor=&hedef_tur=&hedef_id=&bas=&son=&q=&sayfa=
// Admin hepsini görür; moderatör YALNIZCA kendi yaptığı işlemleri görür (başkasının işlemi sorguya hiç girmez).
// ---------------------------------------------------------------------------
yonetim.get("/yonetim/islem-kaydi", async (req, res) => {
  const k = res.locals.kullanici;
  const admin = k.rol === "admin";
  const eylem = metin(req.query.eylem).slice(0, 64);
  const aktor = admin ? metin(req.query.aktor).slice(0, 32) : "";
  const hedefTur = metin(req.query.hedef_tur).slice(0, 32);
  const hedefId = metin(req.query.hedef_id).replace(/\D/g, "").slice(0, 10);
  const bas = tarihFiltresi(req.query.bas);
  const son = tarihFiltresi(req.query.son);
  const q = metin(req.query.q).slice(0, 100);

  const kosullar: string[] = ["1 = 1"];
  const p: unknown[] = [];
  if (!admin) { kosullar.push("audit_log.actor_id = ?"); p.push(k.id); }
  if (eylem) { kosullar.push("audit_log.eylem = ?"); p.push(eylem); }
  if (aktor) { kosullar.push("users.username LIKE ?"); p.push(likeKac(aktor)); }
  if (hedefTur) { kosullar.push("audit_log.hedef_tur = ?"); p.push(hedefTur); }
  if (hedefId) { kosullar.push("audit_log.hedef_id = ?"); p.push(Number(hedefId)); }
  if (bas) { kosullar.push("audit_log.created_at >= ?"); p.push(bas); }
  if (son) { kosullar.push("audit_log.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); p.push(son); }
  if (q) { kosullar.push("CAST(audit_log.ayrinti AS CHAR) LIKE ?"); p.push(likeKac(q)); }
  const nerede = kosullar.join(" AND ");

  const govde = "FROM audit_log LEFT JOIN users ON users.id = audit_log.actor_id";
  const [[{ n }]]: any = await pool.query(`SELECT COUNT(*) AS n ${govde} WHERE ${nerede}`, p);
  const sf = sayfala(req, Number(n), 50);
  const [kayitlar]: any = await pool.query(
    `SELECT audit_log.id, audit_log.eylem, audit_log.hedef_tur, audit_log.hedef_id, audit_log.ayrinti, audit_log.ip, audit_log.created_at,
            users.username AS aktor ${govde} WHERE ${nerede} ORDER BY audit_log.id DESC LIMIT ? OFFSET ?`,
    [...p, sf.boyut, sf.offset]
  );
  // Süzgeç seçenekleri de aynı kurala uyar: moderatör yalnızca kendi kullandığı eylemleri görür
  const [eylemler]: any = await pool.query(`SELECT DISTINCT eylem FROM audit_log ${admin ? "" : "WHERE actor_id = ?"} ORDER BY eylem`, admin ? [] : [k.id]);
  const [turler]: any = await pool.query(`SELECT DISTINCT hedef_tur FROM audit_log WHERE hedef_tur IS NOT NULL ${admin ? "" : "AND actor_id = ?"} ORDER BY hedef_tur`, admin ? [] : [k.id]);

  res.render("yonetim/islem-kaydi", {
    baslik: "İşlem kaydı", aktif: "islem-kaydi", kayitlar, sf, eylemler: eylemler.map((e: any) => e.eylem), turler: turler.map((t: any) => t.hedef_tur),
    qs: { eylem, aktor, hedef_tur: hedefTur, hedef_id: hedefId, bas, son, q }, yol: "/yonetim/islem-kaydi", admin,
    filtreli: !!(eylem || aktor || hedefTur || hedefId || bas || son || q),
  });
});

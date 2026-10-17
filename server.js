const express = require('express');
const initSqlJs = require('sql.js');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

// ─── .env YÜKLEYİCİ (harici bağımlılık gerektirmez) ─────────────────
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const icerik = fs.readFileSync(envPath, 'utf8');
    icerik.split(/\r?\n/).forEach((satir) => {
      const t = satir.trim();
      if (!t || t.startsWith('#')) return;
      const idx = t.indexOf('=');
      if (idx === -1) return;
      const anahtar = t.slice(0, idx).trim();
      if (!anahtar) return;
      let deger = t.slice(idx + 1).trim();
      if ((deger.startsWith('"') && deger.endsWith('"')) || (deger.startsWith("'") && deger.endsWith("'"))) {
        deger = deger.slice(1, -1);
      }
      if (process.env[anahtar] === undefined) process.env[anahtar] = deger;
    });
  } catch (err) {
    console.error('  ⚠️  .env okunamadı:', err.message);
  }
}
loadEnvFile();

const app = express();
app.disable('x-powered-by');

// ─── KONFİGÜRASYON ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1'; // Güvenlik: varsayılan olarak sadece bu bilgisayar
const APP_PASSWORD = (process.env.APP_PASSWORD || '').trim();
const AUTH_ENABLED = APP_PASSWORD.length > 0;
const DB_PATH = path.join(__dirname, 'emanet.db');
const YEDEK_DIR = path.join(__dirname, 'yedekler');
const BIRIM_FIYAT_VARSAYILAN = 15;
const VARSAYILAN_URUNLER = [
  { ad: 'Lahmacun', ikon: '🥙', fiyat: 15 },
  { ad: 'Kıymalı Pide', ikon: '🫓', fiyat: 15 },
  { ad: 'Kaşarlı Pide', ikon: '🧀', fiyat: 15 },
  { ad: 'Karışık Pide', ikon: '🍕', fiyat: 15 },
  { ad: 'Diğer', ikon: '📦', fiyat: 15 }
];

// ── Varsayılan stok malzemeleri (ad, birim, kritik seviye)
// Miktarlar 0 başlar; gerçek stok arayüzdeki "+ Giriş" ile girilir.
const VARSAYILAN_MALZEMELER = [
  { ad: 'Un', birim: 'kg', kritik: 10 },
  { ad: 'Maya', birim: 'kg', kritik: 0.5 },
  { ad: 'Tuz', birim: 'kg', kritik: 1 },
  { ad: 'Şeker', birim: 'kg', kritik: 0.5 },
  { ad: 'Su', birim: 'L', kritik: 5 },
  { ad: 'Sıvı yağ', birim: 'L', kritik: 2 },
  { ad: 'Kıyma', birim: 'kg', kritik: 3 },
  { ad: 'Soğan', birim: 'kg', kritik: 2 },
  { ad: 'Domates', birim: 'kg', kritik: 2 },
  { ad: 'Yeşil biber', birim: 'kg', kritik: 1 },
  { ad: 'Salça', birim: 'kg', kritik: 1 },
  { ad: 'Maydanoz', birim: 'demet', kritik: 3 },
  { ad: 'Kaşar peyniri', birim: 'kg', kritik: 2 },
  { ad: 'Sucuk', birim: 'kg', kritik: 1 },
  { ad: 'Tereyağı', birim: 'kg', kritik: 1 },
  { ad: 'Baharat', birim: 'kg', kritik: 0.5 }
];

// ── Varsayılan reçeteler: 1 adet ürün başına malzeme miktarı (kg / L / demet)
// Kaynak: yaygın ev/fırın tarifleri (lahmacun iç harcı ~%50 kıyma; 1 kg kıyma ≈ 20 pide).
const VARSAYILAN_RECETELER = {
  'Lahmacun': [
    { ad: 'Un', miktar: 0.045 }, { ad: 'Maya', miktar: 0.001 }, { ad: 'Tuz', miktar: 0.001 },
    { ad: 'Şeker', miktar: 0.0005 }, { ad: 'Su', miktar: 0.03 }, { ad: 'Sıvı yağ', miktar: 0.004 },
    { ad: 'Kıyma', miktar: 0.033 }, { ad: 'Soğan', miktar: 0.01 }, { ad: 'Domates', miktar: 0.017 },
    { ad: 'Yeşil biber', miktar: 0.005 }, { ad: 'Salça', miktar: 0.003 }, { ad: 'Maydanoz', miktar: 0.07 },
    { ad: 'Baharat', miktar: 0.001 }
  ],
  'Kıymalı Pide': [
    { ad: 'Un', miktar: 0.14 }, { ad: 'Maya', miktar: 0.003 }, { ad: 'Tuz', miktar: 0.0025 },
    { ad: 'Şeker', miktar: 0.001 }, { ad: 'Su', miktar: 0.085 }, { ad: 'Sıvı yağ', miktar: 0.006 },
    { ad: 'Kıyma', miktar: 0.05 }, { ad: 'Soğan', miktar: 0.02 }, { ad: 'Domates', miktar: 0.025 },
    { ad: 'Yeşil biber', miktar: 0.015 }, { ad: 'Salça', miktar: 0.005 }, { ad: 'Baharat', miktar: 0.001 }
  ],
  'Kaşarlı Pide': [
    { ad: 'Un', miktar: 0.14 }, { ad: 'Maya', miktar: 0.003 }, { ad: 'Tuz', miktar: 0.0025 },
    { ad: 'Şeker', miktar: 0.001 }, { ad: 'Su', miktar: 0.085 }, { ad: 'Sıvı yağ', miktar: 0.006 },
    { ad: 'Kaşar peyniri', miktar: 0.08 }, { ad: 'Tereyağı', miktar: 0.005 }
  ],
  'Karışık Pide': [
    { ad: 'Un', miktar: 0.14 }, { ad: 'Maya', miktar: 0.003 }, { ad: 'Tuz', miktar: 0.0025 },
    { ad: 'Şeker', miktar: 0.001 }, { ad: 'Su', miktar: 0.085 }, { ad: 'Sıvı yağ', miktar: 0.006 },
    { ad: 'Kıyma', miktar: 0.035 }, { ad: 'Kaşar peyniri', miktar: 0.04 }, { ad: 'Sucuk', miktar: 0.02 },
    { ad: 'Domates', miktar: 0.015 }, { ad: 'Yeşil biber', miktar: 0.01 }, { ad: 'Salça', miktar: 0.004 },
    { ad: 'Baharat', miktar: 0.001 }
  ]
};

// İlk kurulumda örnek malzemeleri ve reçeteleri yükle (yalnızca stok boşken, bir kez)
function varsayilanStokVeReceteKur() {
  if (queryOne("SELECT 1 AS v FROM ayarlar WHERE anahtar = 'stok_kurulum_v1'")) return;
  const mevcut = queryOne('SELECT COUNT(*) AS c FROM stok');
  if (mevcut && mevcut.c > 0) return; // kullanıcının kendi verisi var, dokunmayalım

  const idHaritasi = {};
  VARSAYILAN_MALZEMELER.forEach((m) => {
    runSql('INSERT INTO stok (ad, birim, miktar, kritik) VALUES (?, ?, 0, ?)', [m.ad, m.birim, yuvarla(m.kritik)]);
    const row = queryOne('SELECT MAX(id) AS id FROM stok');
    if (row) idHaritasi[m.ad] = row.id;
  });

  // Yalnızca kullanıcının ürün listesinde bulunan ürünler için reçete ekle
  const urunler = urunleriGetir().map((u) => u.ad);
  let receteSayisi = 0;
  Object.keys(VARSAYILAN_RECETELER).forEach((urun) => {
    if (!urunler.includes(urun)) return;
    VARSAYILAN_RECETELER[urun].forEach((k) => {
      const stokId = idHaritasi[k.ad];
      if (stokId) {
        db.run('INSERT INTO recete (urun_turu, stok_id, miktar) VALUES (?, ?, ?)', [urun, stokId, yuvarla(k.miktar)]);
        receteSayisi++;
      }
    });
  });

  runSql("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES ('stok_kurulum_v1', '1')");
  console.log(`  📦 Varsayılan stok kuruldu: ${VARSAYILAN_MALZEMELER.length} malzeme, ${receteSayisi} reçete kalemi.`);
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════════
//  KİMLİK DOĞRULAMA (Opsiyonel - .env içine APP_PASSWORD yazınca aktif olur)
// ═══════════════════════════════════════════════════════════════════════
const AUTH_COOKIE = 'emanet_auth';
const SESSION_TOKEN = AUTH_ENABLED ? crypto.randomBytes(24).toString('hex') : null;
const oturumlar = new Map(); // token -> { kullanici, rol }

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((parca) => {
    const idx = parca.indexOf('=');
    if (idx === -1) return;
    const k = parca.slice(0, idx).trim();
    if (!k) return;
    out[k] = decodeURIComponent(parca.slice(idx + 1).trim());
  });
  return out;
}

// ── Kullanıcı / rol yardımcıları ────────────────────────────────────
function kullaniciSayisi() {
  try {
    const r = queryOne('SELECT COUNT(*) AS c FROM kullanicilar WHERE aktif = 1');
    return r ? r.c : 0;
  } catch (e) { return 0; }
}

function authGerekliMi() {
  return AUTH_ENABLED || kullaniciSayisi() > 0;
}

function sifreHash(sifre) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(sifre), salt, 64).toString('hex');
  return `${salt}:${h}`;
}

function sifreDogrula(sifre, kayit) {
  try {
    const [salt, h] = String(kayit).split(':');
    if (!salt || !h) return false;
    const test = crypto.scryptSync(String(sifre), salt, 64);
    const gercek = Buffer.from(h, 'hex');
    return test.length === gercek.length && crypto.timingSafeEqual(test, gercek);
  } catch (e) { return false; }
}

function oturumRolu(req) {
  if (!authGerekliMi()) return 'admin';
  if (kullaniciSayisi() > 0) {
    const o = oturumlar.get(parseCookies(req)[AUTH_COOKIE]);
    return o ? o.rol : null;
  }
  return parseCookies(req)[AUTH_COOKIE] === SESSION_TOKEN ? 'admin' : null;
}

function isAuthorized(req) {
  if (!authGerekliMi()) return true;
  if (kullaniciSayisi() > 0) return oturumlar.has(parseCookies(req)[AUTH_COOKIE]);
  return parseCookies(req)[AUTH_COOKIE] === SESSION_TOKEN;
}

function kullaniciAdi(req) {
  if (kullaniciSayisi() > 0) {
    const o = oturumlar.get(parseCookies(req)[AUTH_COOKIE]);
    return o ? o.kullanici : 'bilinmeyen';
  }
  return 'yonetici';
}

// Yalnızca yöneticinin erişebileceği uçlar için
function rolGerekli(rol) {
  return (req, res, next) => {
    const r = oturumRolu(req);
    if (!r) return res.status(401).json({ error: 'Yetkisiz. Giriş yapmalısınız.' });
    if (rol === 'admin' && r !== 'admin') {
      return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekir.' });
    }
    next();
  };
}

// Şifre/kullanıcı korumasının durumu
app.get('/api/auth-durum', (req, res) => {
  res.json({
    authRequired: authGerekliMi(),
    authorized: isAuthorized(req),
    kullaniciGerekli: kullaniciSayisi() > 0,
    rol: oturumRolu(req)
  });
});

// Giriş
app.post('/api/login', (req, res) => {
  if (!authGerekliMi()) return res.json({ success: true, rol: 'admin' });
  const body = req.body || {};
  const sifre = body.sifre ? String(body.sifre) : '';
  const kullanici = body.kullanici ? String(body.kullanici).trim() : '';

  if (kullaniciSayisi() > 0) {
    const u = queryOne('SELECT * FROM kullanicilar WHERE kullanici = ? AND aktif = 1', [kullanici]);
    if (u && sifreDogrula(sifre, u.sifre_hash)) {
      const token = crypto.randomBytes(24).toString('hex');
      oturumlar.set(token, { kullanici: u.kullanici, rol: u.rol });
      res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
      islemKaydet(u.kullanici, 'giris', 'Giriş yapıldı');
      return res.json({ success: true, rol: u.rol });
    }
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }

  if (AUTH_ENABLED) {
    const a = Buffer.from(sifre);
    const b = Buffer.from(APP_PASSWORD);
    const esit = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (esit) {
      res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
      return res.json({ success: true, rol: 'admin' });
    }
    return res.status(401).json({ error: 'Şifre hatalı.' });
  }
  return res.json({ success: true, rol: 'admin' });
});

// Çıkış
app.post('/api/auth-cikis', (req, res) => {
  const token = parseCookies(req)[AUTH_COOKIE];
  if (token) oturumlar.delete(token);
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ success: true });
});

// Bu noktadan sonraki tüm /api uçları korumalıdır
app.use('/api', (req, res, next) => {
  if (isAuthorized(req)) return next();
  return res.status(401).json({ error: 'Yetkisiz. Giriş yapmalısınız.' });
});

// ─── SQLite Veritabanı (sql.js) ─────────────────────────────────────
let db;
let saveInterval;

function saveDatabase() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('DB kaydetme hatası:', err);
  }
}

// Yardımcı SQL fonksiyonları
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSql(sql, params = []) {
  if (params.length > 0) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  } else {
    db.run(sql);
  }
  saveDatabase();
}

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Sorgu parametrelerinden tarih aralığı çıkar (yoksa içinde bulunulan ay)
function tarihAraligi(q) {
  const gecerli = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t || '');
  let baslangic = (q || {}).baslangic;
  let bitis = (q || {}).bitis;
  if (!gecerli(baslangic) || !gecerli(bitis)) {
    const bugun = getLocalDateString();
    baslangic = bugun.slice(0, 8) + '01';
    bitis = bugun;
  }
  if (baslangic > bitis) [baslangic, bitis] = [bitis, baslangic];
  return { baslangic, bitis };
}

// Detaylı dönem raporu: kâr/zarar özeti + ürün/gider/gün/müşteri/saat dökümleri
function detayliRapor(baslangic, bitis) {
  const aralik = [baslangic, bitis];

  // Ürün bazlı döküm
  const urunHam = queryAll(`
    SELECT urun_turu,
           COALESCE(SUM(adet),0) AS adet,
           COUNT(*) AS siparis,
           COALESCE(SUM(adet * COALESCE(birim_fiyat,0)),0) AS ciro,
           COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' THEN adet * COALESCE(birim_fiyat,0) ELSE 0 END),0) AS tahsil
    FROM siparisler
    WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
    GROUP BY urun_turu`, aralik);

  const stokVar = stokAktif();
  const urunler = urunHam.map((u) => {
    const maliyetBirim = stokVar ? urunMaliyet(u.urun_turu) : 0;
    const maliyet = yuvarla(maliyetBirim * (u.adet || 0));
    const kar = yuvarla((u.ciro || 0) - maliyet);
    return {
      urun_turu: u.urun_turu, adet: yuvarla(u.adet), siparis: u.siparis,
      ciro: yuvarla(u.ciro), tahsil: yuvarla(u.tahsil), maliyet, kar,
      marj: u.ciro > 0 ? Math.round((kar / u.ciro) * 1000) / 10 : 0
    };
  }).sort((a, b) => b.kar - a.kar);

  // Giderler (kategori bazlı)
  const giderKategorileri = queryAll(`
    SELECT kategori, COUNT(*) AS adet, COALESCE(SUM(miktar),0) AS toplam
    FROM giderler WHERE tarih BETWEEN ? AND ?
    GROUP BY kategori ORDER BY toplam DESC`, aralik)
    .map((g) => ({ kategori: g.kategori || 'Diğer', adet: g.adet, toplam: yuvarla(g.toplam) }));
  const giderToplam = yuvarla(giderKategorileri.reduce((t, g) => t + g.toplam, 0));
  const giderMalzeme = yuvarla(giderKategorileri
    .filter((g) => g.kategori === 'Malzeme Alımı')
    .reduce((t, g) => t + g.toplam, 0));

  // Gün gün döküm
  const gunHam = queryAll(`
    SELECT date(cikis_zamani) AS gun, COUNT(*) AS siparis,
           COALESCE(SUM(adet),0) AS adet,
           COALESCE(SUM(adet * COALESCE(birim_fiyat,0)),0) AS ciro,
           COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' THEN adet * COALESCE(birim_fiyat,0) ELSE 0 END),0) AS tahsil
    FROM siparisler
    WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
    GROUP BY gun ORDER BY gun`, aralik);
  const gunGiderHam = queryAll(`
    SELECT tarih AS gun, COALESCE(SUM(miktar),0) AS gider
    FROM giderler WHERE tarih BETWEEN ? AND ? GROUP BY tarih`, aralik);
  const gunGiderMap = {};
  gunGiderHam.forEach((g) => { gunGiderMap[g.gun] = g.gider; });
  const gunler = gunHam.map((g) => ({
    gun: g.gun, siparis: g.siparis, adet: yuvarla(g.adet),
    ciro: yuvarla(g.ciro), tahsil: yuvarla(g.tahsil),
    gider: yuvarla(gunGiderMap[g.gun] || 0)
  }));

  // Müşteri dökümü
  const musteriler = queryAll(`
    SELECT musteri_adi, telefon, COUNT(*) AS siparis,
           COALESCE(SUM(adet),0) AS adet,
           COALESCE(SUM(adet * COALESCE(birim_fiyat,0)),0) AS ciro,
           COALESCE(SUM(CASE WHEN odeme_durumu != 'Ödendi' THEN adet * COALESCE(birim_fiyat,0) ELSE 0 END),0) AS bekleyen
    FROM siparisler
    WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
    GROUP BY telefon, musteri_adi ORDER BY ciro DESC LIMIT 50`, aralik)
    .map((m) => ({ ...m, adet: yuvarla(m.adet), ciro: yuvarla(m.ciro), bekleyen: yuvarla(m.bekleyen) }));

  // Saatlik yoğunluk
  const saatHam = queryAll(`
    SELECT strftime('%H', cikis_zamani) AS saat, COUNT(*) AS siparis, COALESCE(SUM(adet),0) AS adet
    FROM siparisler
    WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
    GROUP BY saat ORDER BY saat`, aralik);
  const saatMap = {};
  saatHam.forEach((s) => { saatMap[s.saat] = s; });
  const saatlik = [];
  for (let h = 0; h < 24; h++) {
    const k = String(h).padStart(2, '0');
    saatlik.push(saatMap[k] || { saat: k, siparis: 0, adet: 0 });
  }

  // Teslim edilen siparişler (satır satır)
  const tamamlananlar = queryAll(`
    SELECT * FROM siparisler
    WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
    ORDER BY cikis_zamani ASC`, aralik).map((s) => ({
      id: s.id, musteri_adi: s.musteri_adi, telefon: s.telefon, urun_turu: s.urun_turu,
      adet: s.adet, birim_fiyat: s.birim_fiyat,
      tutar: yuvarla((s.adet || 0) * (s.birim_fiyat || 0)),
      odeme_durumu: s.odeme_durumu, odeme_tipi: s.odeme_tipi || '',
      cikis_zamani: s.cikis_zamani, giris_zamani: s.giris_zamani
    }));

  // Özet
  const ciro = yuvarla(urunler.reduce((t, u) => t + u.ciro, 0));
  const tahsil = yuvarla(urunler.reduce((t, u) => t + u.tahsil, 0));
  const malzemeMaliyeti = yuvarla(urunler.reduce((t, u) => t + u.maliyet, 0));
  const brutKar = yuvarla(ciro - malzemeMaliyeti);
  // Stok takibi açıkken malzeme alımları "maliyet" olarak zaten sayılır; çift saymamak için hariç tutulur.
  const giderDiger = yuvarla(stokVar ? (giderToplam - giderMalzeme) : giderToplam);
  // Nakit/Kart kırılımı + siparişsiz POS satışları (maliyetsiz gelir → doğrudan net kâra eklenir)
  const odemeKirilim = queryOne(`
    SELECT ${KART_TUTAR_SQL} AS kart, ${NAKIT_TUTAR_SQL} AS nakit
    FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?`, aralik);
  const posSatisRow = queryOne(
    `SELECT COALESCE(SUM(tutar), 0) AS toplam FROM pos_satis WHERE tarih BETWEEN ? AND ?`, aralik);
  const posSatis = yuvarla(posSatisRow ? posSatisRow.toplam : 0);
  const netKar = yuvarla(brutKar - giderDiger + posSatis);
  const siparisSayisi = urunler.reduce((t, u) => t + (u.siparis || 0), 0);
  const toplamAdet = yuvarla(urunler.reduce((t, u) => t + u.adet, 0));

  return {
    baslangic, bitis,
    isletme_adi: ayarGetir('isletme_adi', 'Fırın'),
    stok_aktif: stokVar,
    ozet: {
      siparis_sayisi: siparisSayisi, toplam_adet: toplamAdet,
      ciro, tahsil, bekleyen: yuvarla(ciro - tahsil),
      tahsil_nakit: yuvarla(odemeKirilim?.nakit || 0),
      tahsil_kart: yuvarla(odemeKirilim?.kart || 0),
      pos_satis: posSatis,
      malzeme_maliyeti: malzemeMaliyeti, brut_kar: brutKar,
      brut_marj: ciro > 0 ? Math.round((brutKar / ciro) * 1000) / 10 : 0,
      gider_toplam: giderToplam, gider_malzeme: giderMalzeme, gider_diger: giderDiger,
      net_kar: netKar,
      net_marj: ciro > 0 ? Math.round((netKar / ciro) * 1000) / 10 : 0,
      ortalama_sepet: siparisSayisi > 0 ? yuvarla(ciro / siparisSayisi) : 0
    },
    urunler, giderKategorileri, gunler, musteriler, saatlik, tamamlananlar
  };
}

// ─── AYARLAR (birim fiyat & ürün listesi) ───────────────────────────
function ayarGetir(anahtar, varsayilan) {
  const row = queryOne('SELECT deger FROM ayarlar WHERE anahtar = ?', [anahtar]);
  return row && row.deger !== null && row.deger !== undefined ? row.deger : varsayilan;
}

function ayarKaydet(anahtar, deger) {
  runSql(
    `INSERT INTO ayarlar (anahtar, deger) VALUES (?, ?)
     ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger`,
    [anahtar, String(deger)]
  );
}

function birimFiyatGetir() {
  const v = parseFloat(ayarGetir('birim_fiyat', String(BIRIM_FIYAT_VARSAYILAN)));
  return Number.isFinite(v) && v >= 0 ? v : BIRIM_FIYAT_VARSAYILAN;
}

function urunleriGetir() {
  try {
    const parsed = JSON.parse(ayarGetir('urunler', JSON.stringify(VARSAYILAN_URUNLER)));
    if (Array.isArray(parsed) && parsed.length > 0) {
      const temiz = parsed
        .filter((u) => u && typeof u.ad === 'string' && u.ad.trim())
        .map((u) => {
          const f = parseFloat(u.fiyat);
          return {
            ad: u.ad.trim(),
            ikon: (u.ikon ? String(u.ikon) : '📦'),
            fiyat: Number.isFinite(f) && f >= 0 ? f : BIRIM_FIYAT_VARSAYILAN
          };
        });
      if (temiz.length > 0) return temiz;
    }
  } catch (e) {}
  return VARSAYILAN_URUNLER;
}

// Bir ürünün güncel birim fiyatını döner (yoksa genel birim fiyat/varsayılan)
function urunFiyatGetir(ad) {
  const u = urunleriGetir().find((x) => x.ad === ad);
  if (u) return u.fiyat;
  return birimFiyatGetir();
}

// Miktarları 3 ondalığa yuvarla (kayan nokta gürültüsünü engeller)
function yuvarla(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

// Sipariş tamamlanınca ilgili reçetedeki malzemeleri stoktan otomatik düş
function receteDus(siparisId, urunTuru, adet) {
  try {
    const kalemler = queryAll(`
      SELECT r.stok_id, r.miktar, s.ad AS stok_ad
      FROM recete r JOIN stok s ON s.id = r.stok_id
      WHERE r.urun_turu = ?`, [urunTuru]);
    let dokunulan = false;
    kalemler.forEach((k) => {
      const dusulen = yuvarla((k.miktar || 0) * adet);
      if (dusulen <= 0) return;
      const stokRow = queryOne('SELECT miktar FROM stok WHERE id = ?', [k.stok_id]);
      if (!stokRow) return;
      const yeni = yuvarla((stokRow.miktar || 0) - dusulen);
      db.run('UPDATE stok SET miktar = ? WHERE id = ?', [yeni, k.stok_id]);
      db.run('INSERT INTO stok_hareketleri (stok_id, tip, miktar, aciklama, otomatik) VALUES (?, ?, ?, ?, 1)',
        [k.stok_id, 'cikis', dusulen, `Sipariş #${siparisId} (${adet} ${urunTuru})`]);
      dokunulan = true;
    });
    if (dokunulan) saveDatabase();
  } catch (e) {
    console.error('Reçete düşüm hatası:', e.message);
  }
}

// Stok takibi açık mı? (ayarlardan kapatılabilir; varsayılan: açık)
function stokAktif() {
  return ayarGetir('stok_aktif', '1') === '1';
}

// Ürün başına malzeme (iç maliyet) tutarı — reçeteden hesaplanır
function urunMaliyet(urunTuru) {
  try {
    const kalemler = queryAll(`
      SELECT r.miktar, s.birim_maliyet
      FROM recete r JOIN stok s ON s.id = r.stok_id
      WHERE r.urun_turu = ?`, [urunTuru]);
    return yuvarla(kalemler.reduce((t, k) => t + (k.miktar || 0) * (k.birim_maliyet || 0), 0));
  } catch (e) {
    return 0;
  }
}

// Şablon doldurucu: {anahtar} yer tutucularını verilerle değiştirir
function sablonDoldur(sablon, veri) {
  return String(sablon || '').replace(/\{(\w+)\}/g, (m, k) =>
    veri[k] !== undefined && veri[k] !== null ? String(veri[k]) : m);
}

// İşlem günlüğü (denetim izi)
function islemKaydet(kullanici, islem, detay) {
  try {
    db.run('INSERT INTO islem_log (kullanici, islem, detay) VALUES (?, ?, ?)',
      [kullanici || 'sistem', islem || '', detay ? String(detay).slice(0, 300) : '']);
  } catch (e) {}
}

// Mesaj gönderim kaydı (giden/gelen)
function mesajKaydet(veri) {
  try {
    db.run('INSERT INTO mesaj_log (telefon, musteri_adi, urun_turu, mesaj, durum, hata, yon) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [veri.telefon || '', veri.musteri_adi || '', veri.urun_turu || '',
       String(veri.mesaj || '').slice(0, 2000), veri.durum || 'gonderildi',
       veri.hata || '', veri.yon || 'giden']);
  } catch (e) {}
}

// Kritik seviyeye inen malzemeler için işletme sahibine WhatsApp uyarısı
async function kritikStokUyar() {
  try {
    if (ayarGetir('kritik_uyari', '1') !== '1') return;
    const sahip = String(ayarGetir('sahip_telefon', '')).replace(/\D/g, '');
    if (sahip.length < 10) return;
    if (waStatus !== 'connected' || !waClient) return;
    const dusukler = queryAll('SELECT ad, miktar, birim, kritik FROM stok WHERE miktar <= kritik');
    if (dusukler.length === 0) return;
    const son = parseInt(ayarGetir('son_kritik_uyari', '0'), 10) || 0;
    if (Date.now() - son < 60 * 60 * 1000) return; // saatte en fazla bir uyarı
    const satirlar = dusukler.map((s) => `• ${s.ad}: ${s.miktar} ${s.birim} (kritik: ${s.kritik})`).join('\n');
    const mesaj = `⚠️ Stok uyarısı (${ayarGetir('isletme_adi', 'Fırın')}):\nŞu malzemeler kritik seviyede:\n${satirlar}\n\nLütfen sipariş verin. 🙏`;
    await waMesajGonder(sahip, mesaj);
    ayarKaydet('son_kritik_uyari', String(Date.now()));
    mesajKaydet({ telefon: sahip, mesaj, yon: 'giden', durum: 'gonderildi' });
    console.log('  ⚠️  Kritik stok uyarısı gönderildi.');
  } catch (e) {
    console.error('  ⚠️  Kritik stok uyarısı gönderilemedi:', e.message);
  }
}

// ─── GÜNLÜK YEDEK ───────────────────────────────────────────────────
function gunlukYedekAl() {
  try {
    if (!fs.existsSync(YEDEK_DIR)) fs.mkdirSync(YEDEK_DIR, { recursive: true });
    const ad = `emanet-${getLocalDateString()}.db`;
    const hedef = path.join(YEDEK_DIR, ad);
    if (!fs.existsSync(hedef)) {
      fs.writeFileSync(hedef, Buffer.from(db.export()));
      console.log(`  🗄️  Günlük yedek alındı → yedekler/${ad}`);
    }
    // 30 günden eski yedekleri temizle
    const esik = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fs.readdirSync(YEDEK_DIR)
      .filter((f) => f.startsWith('emanet-') && f.endsWith('.db'))
      .forEach((f) => {
        const m = f.match(/emanet-(\d{4}-\d{2}-\d{2})\.db/);
        if (!m) return;
        const zaman = new Date(m[1] + 'T00:00:00').getTime();
        if (!Number.isNaN(zaman) && zaman < esik) {
          try { fs.unlinkSync(path.join(YEDEK_DIR, f)); } catch (e) {}
        }
      });
  } catch (err) {
    console.error('  ⚠️  Yedekleme hatası:', err.message);
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    try {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
      console.log('  💾 Mevcut veritabanı yüklendi.');
    } catch (err) {
      console.error('  ⚠️  Veritabanı okunamadı, yeni oluşturuluyor...');
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('  💾 Yeni veritabanı oluşturuldu.');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS siparisler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      musteri_adi TEXT NOT NULL,
      telefon TEXT NOT NULL,
      urun_turu TEXT NOT NULL,
      adet INTEGER DEFAULT 0,
      durum TEXT DEFAULT 'Fırında',
      odeme_durumu TEXT DEFAULT 'Bekliyor',
      giris_zamani DATETIME DEFAULT (datetime('now', 'localtime')),
      cikis_zamani DATETIME,
      created_date DATE DEFAULT (date('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ayarlar (
      anahtar TEXT PRIMARY KEY,
      deger TEXT
    )
  `);

  // ── Stok takip tablosu (malzemeler)
  db.run(`
    CREATE TABLE IF NOT EXISTS stok (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad TEXT NOT NULL,
      birim TEXT DEFAULT 'adet',
      miktar REAL DEFAULT 0,
      kritik REAL DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ── Stok hareketleri (giriş/çıkış kayıtları)
  db.run(`
    CREATE TABLE IF NOT EXISTS stok_hareketleri (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stok_id INTEGER NOT NULL,
      tip TEXT NOT NULL,
      miktar REAL NOT NULL,
      aciklama TEXT,
      otomatik INTEGER DEFAULT 0,
      zaman DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ── Reçete (ürün başına malzeme miktarı)
  db.run(`
    CREATE TABLE IF NOT EXISTS recete (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      urun_turu TEXT NOT NULL,
      stok_id INTEGER NOT NULL,
      miktar REAL NOT NULL
    )
  `);

  // ── Giderler (kasa)
  db.run(`
    CREATE TABLE IF NOT EXISTS giderler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aciklama TEXT NOT NULL,
      miktar REAL NOT NULL,
      kategori TEXT DEFAULT 'Diğer',
      tarih DATE DEFAULT (date('now', 'localtime')),
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ── POS / kart tahsilatı takibi
  // pos_z: gün sonunda POS ekranından okunan Z raporu toplamı (mutabakat girişi)
  db.run(`
    CREATE TABLE IF NOT EXISTS pos_z (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tarih DATE DEFAULT (date('now', 'localtime')),
      tutar REAL NOT NULL,
      aciklama TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  // pos_satis: siparişle alakasız POS'tan yapılan satışlar (pide üstü, ayran vb.) — kasaya gelir yazılır
  db.run(`
    CREATE TABLE IF NOT EXISTS pos_satis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tarih DATE DEFAULT (date('now', 'localtime')),
      tutar REAL NOT NULL,
      aciklama TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Eski veritabanları için migration: odeme_durumu kolonu
  const kolonlar = queryAll('PRAGMA table_info(siparisler)');
  if (!kolonlar.some((k) => k.name === 'odeme_durumu')) {
    db.run(`ALTER TABLE siparisler ADD COLUMN odeme_durumu TEXT DEFAULT 'Bekliyor'`);
    console.log('  🔧 Veritabanı güncellendi: odeme_durumu kolonu eklendi.');
  }
  // Migration: ürün bazlı fiyat için birim_fiyat kolonu (tamamlanınca doldurulur)
  if (!kolonlar.some((k) => k.name === 'birim_fiyat')) {
    db.run(`ALTER TABLE siparisler ADD COLUMN birim_fiyat REAL`);
    db.run(`UPDATE siparisler SET birim_fiyat = ? WHERE birim_fiyat IS NULL`, [BIRIM_FIYAT_VARSAYILAN]);
    console.log('  🔧 Veritabanı güncellendi: birim_fiyat kolonu eklendi (eski kayıtlar 15 TL).');
  }

  // ── Migration (v1.5): ek kolonlar
  const stokKolonlar = queryAll('PRAGMA table_info(stok)');
  if (!stokKolonlar.some((k) => k.name === 'birim_maliyet')) {
    db.run(`ALTER TABLE stok ADD COLUMN birim_maliyet REAL DEFAULT 0`);
    console.log('  🔧 stok.birim_maliyet kolonu eklendi.');
  }
  if (!stokKolonlar.some((k) => k.name === 'tedarikci')) {
    db.run(`ALTER TABLE stok ADD COLUMN tedarikci TEXT DEFAULT ''`);
  }
  if (!kolonlar.some((k) => k.name === 'grup_no')) {
    db.run(`ALTER TABLE siparisler ADD COLUMN grup_no TEXT`);
  }
  if (!kolonlar.some((k) => k.name === 'notlar')) {
    db.run(`ALTER TABLE siparisler ADD COLUMN notlar TEXT`);
  }
  // ── Migration (v1.6.2): ödeme tipi (Nakit / Kart)
  if (!kolonlar.some((k) => k.name === 'odeme_tipi')) {
    db.run(`ALTER TABLE siparisler ADD COLUMN odeme_tipi TEXT DEFAULT ''`);
    console.log('  🔧 Veritabanı güncellendi: odeme_tipi kolonu eklendi.');
  }

  // ── v1.5 tabloları
  db.run(`
    CREATE TABLE IF NOT EXISTS mesaj_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefon TEXT, musteri_adi TEXT, urun_turu TEXT, mesaj TEXT,
      durum TEXT DEFAULT 'gonderildi', hata TEXT,
      yon TEXT DEFAULT 'giden',
      zaman DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS islem_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kullanici TEXT, islem TEXT, detay TEXT,
      zaman DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS kullanicilar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kullanici TEXT NOT NULL UNIQUE,
      sifre_hash TEXT NOT NULL,
      rol TEXT DEFAULT 'personel',
      aktif INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Varsayılan ayarlar
  const VARSAYILAN_AYARLAR = {
    birim_fiyat: String(BIRIM_FIYAT_VARSAYILAN),
    urunler: JSON.stringify(VARSAYILAN_URUNLER),
    isletme_adi: 'Fırın',
    sahip_telefon: '',
    kritik_uyari: '1',
    stok_aktif: '1',
    oto_cevap: '1',
    hazirlik_dk: '15',
    mesaj_sablonu: 'Sayın {musteri}, getirmiş olduğunuz iç malzeme ile hazırlanan {adet} adet {urun} fırınımızdan taze çıkmıştır, hazırdır. Toplam hamur ve işçilik bedeli {tutar} TL\'dir. Ödeyip teslim alabilirsiniz. Afiyet olsun! 🔥'
  };
  Object.keys(VARSAYILAN_AYARLAR).forEach((k) => {
    if (!queryOne('SELECT 1 AS v FROM ayarlar WHERE anahtar = ?', [k])) {
      runSql('INSERT INTO ayarlar (anahtar, deger) VALUES (?, ?)', [k, VARSAYILAN_AYARLAR[k]]);
    }
  });

  // İlk kurulum: örnek malzemeler + reçeteler (yalnızca stok boşsa)
  varsayilanStokVeReceteKur();

  saveDatabase();
  saveInterval = setInterval(saveDatabase, 10000);
  gunlukYedekAl();
}

// ═══════════════════════════════════════════════════════════════════════
//  WHATSAPP WEB.JS ENTEGRASYONU
// ═══════════════════════════════════════════════════════════════════════

let waClient = null;
let waStatus = 'initializing'; // initializing | qr | connected | disconnected | error
let waQrDataUrl = null;
let waInfo = null;
let waErrorMessage = null;
let waDetectedBrowser = null;

// Yeniden bağlanma durumu
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 15;
let kapaniyor = false;

// Tarayıcı adayları (başarısız olan atlanır, sırayla denenir)
let waBrowserCandidates = [];
let waBrowserIndex = 0;

// Sistemde kurulu Chromium tabanlı tarayıcıları (Chrome / Edge / Brave) bul.
// Hepsi bir liste halinde döner; biri açılmazsa sıradaki denenir.
function getBrowserCandidates() {
  const list = [];
  const ekle = (p) => { if (p && fs.existsSync(p) && !list.includes(p)) list.push(p); };

  ekle(process.env.PUPPETEER_EXECUTABLE_PATH);
  ekle(process.env.CHROME_PATH);

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    [
      // Google Chrome
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      // Microsoft Edge (Windows 10/11 standart)
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      // Brave Browser
      path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ].forEach(ekle);
  } else if (process.platform === 'linux') {
    [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ].forEach(ekle);
  } else if (process.platform === 'darwin') {
    [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    ].forEach(ekle);
  }

  // Hiçbiri bulunamazsa puppeteer'ın kendi Chromium'unu dene (null = varsayılan)
  if (list.length === 0) list.push(null);
  return list;
}

// Bağlantı koptuğunda artarak tekrar deneme planla
function scheduleReconnect() {
  if (kapaniyor || reconnectTimer) return;
  if (reconnectAttempts >= MAX_RECONNECT) {
    waStatus = 'error';
    waErrorMessage = 'WhatsApp bağlantısı kurulamadı. İnterneti kontrol edip "Tekrar Dene" butonuna basın.';
    console.error('  ❌ Yeniden bağlanma denemeleri tükendi. Manuel "Tekrar Dene" gerekiyor.');
    return;
  }
  const gecikme = Math.min(60000, 5000 * (reconnectAttempts + 1));
  reconnectAttempts++;
  console.log(`  🔄 WhatsApp ${Math.round(gecikme / 1000)} sn sonra yeniden denenecek (deneme ${reconnectAttempts}/${MAX_RECONNECT})...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (kapaniyor) return;
    await destroyWaClient();
    initWhatsApp();
  }, gecikme);
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function destroyWaClient() {
  if (waClient) {
    try { await waClient.destroy().catch(() => {}); } catch (e) {}
    waClient = null;
  }
}

// Belirli bir tarayıcı adayıyla WhatsApp istemcisini başlat
function startWaClient() {
  const browserPath = waBrowserCandidates[waBrowserIndex] || null;
  waDetectedBrowser = browserPath ? path.basename(browserPath) : 'Puppeteer Chromium';
  const toplam = waBrowserCandidates.length;

  console.log(`  📱 WhatsApp başlatılıyor... (tarayıcı ${waBrowserIndex + 1}/${toplam}: ${waDetectedBrowser})`);

  const puppeteerConfig = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu'
    ]
  };
  if (browserPath) puppeteerConfig.executablePath = browserPath;

  waClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '.wwebjs_auth')
    }),
    puppeteer: puppeteerConfig
  });

  // QR kodu oluşturulduğunda
  waClient.on('qr', async (qr) => {
    waStatus = 'qr';
    waErrorMessage = null;
    reconnectAttempts = 0;
    waBrowserIndex = 0;
    clearReconnect();
    try {
      waQrDataUrl = await qrcode.toDataURL(qr, {
        width: 280,
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' }
      });
      console.log('  📱 QR kod oluşturuldu - tarayıcıdan okutun!');
    } catch (err) {
      console.error('  QR oluşturma hatası:', err);
    }
  });

  // Bağlantı hazır
  waClient.on('ready', () => {
    waStatus = 'connected';
    waQrDataUrl = null;
    waErrorMessage = null;
    reconnectAttempts = 0;
    waBrowserIndex = 0;
    clearReconnect();
    waInfo = waClient.info;
    const numara = waInfo?.wid?.user || 'Bilinmiyor';
    console.log(`  ✅ WhatsApp bağlandı! Numara: ${numara}`);
  });

  // Kimlik doğrulandı (QR tekrar gerekmez)
  waClient.on('authenticated', () => {
    console.log('  🔐 WhatsApp oturumu doğrulandı (kayıtlı oturum).');
  });

  // Gelen mesajlara otomatik cevap (durum sorgusu)
  waClient.on('message', async (msg) => {
    try {
      if (msg.fromMe || !msg.from || !msg.from.endsWith('@c.us')) return;
      const from = msg.from.split('@')[0];
      const govde = (msg.body || '').trim();
      mesajKaydet({ telefon: from, mesaj: govde, yon: 'gelen', durum: 'alindi' });
      if (ayarGetir('oto_cevap', '1') !== '1') return;
      const yerel = from.replace(/^90/, '');
      const bekleyen = queryAll(
        `SELECT musteri_adi, urun_turu FROM siparisler
         WHERE durum = 'Fırında' AND (telefon = ? OR telefon = ?)
         ORDER BY giris_zamani ASC`, [yerel, from]);
      let cevap;
      if (bekleyen.length > 0) {
        const satirlar = bekleyen.map((s) => `• ${s.musteri_adi}: ${s.urun_turu}`).join('\n');
        cevap = `Merhaba! 🔥 Şu an fırında bekleyen siparişiniz:\n${satirlar}\n\nHazır olunca buradan haber vereceğiz. İyi günler!`;
      } else {
        const borclu = queryAll(
          `SELECT urun_turu, adet FROM siparisler
           WHERE durum = 'Tamamlandı' AND odeme_durumu != 'Ödendi' AND telefon = ?
           ORDER BY cikis_zamani DESC LIMIT 5`, [yerel]);
        if (borclu.length > 0) {
          const satirlar = borclu.map((s) => `• ${s.adet} adet ${s.urun_turu}`).join('\n');
          cevap = `Merhaba! Ödenmemiş siparişiniz görünüyor:\n${satirlar}\nÖdeme için teşekkür ederiz. 🙏`;
        } else {
          cevap = 'Merhaba! 👋 Sipariş vermek için adınızı, telefon numaranızı ve ürün türünü yazabilirsiniz. Afiyet olsun! 🔥';
        }
      }
      await waMesajGonder(from, cevap);
      mesajKaydet({ telefon: from, mesaj: cevap, yon: 'giden', durum: 'gonderildi' });
    } catch (e) {
      console.error('  ⚠️  Otomatik cevap gönderilemedi:', e.message);
    }
  });

  // Kimlik doğrulama hatası
  waClient.on('auth_failure', (msg) => {
    waStatus = 'error';
    waErrorMessage = 'Kimlik doğrulama hatası: ' + msg;
    console.error('  ❌ WhatsApp kimlik doğrulama hatası:', msg);
    scheduleReconnect();
  });

  // Bağlantı kesildi
  waClient.on('disconnected', (reason) => {
    waStatus = 'disconnected';
    waInfo = null;
    waErrorMessage = 'Bağlantı kesildi: ' + reason;
    console.log('  ⚠️  WhatsApp bağlantısı kesildi:', reason);
    scheduleReconnect();
  });

  waClient.initialize().catch(async (err) => {
    console.error(`  ❌ WhatsApp başlatılamadı (${waDetectedBrowser}):`, err.message);
    await destroyWaClient();
    if (kapaniyor) return;

    // Bu tarayıcı çalışmadı → sıradaki adayı dene
    if (waBrowserIndex + 1 < waBrowserCandidates.length) {
      waBrowserIndex++;
      const sonraki = waBrowserCandidates[waBrowserIndex];
      console.log(`  ↪️  Farklı tarayıcı deneniyor: ${sonraki ? path.basename(sonraki) : 'Puppeteer Chromium'}`);
      setTimeout(() => { if (!kapaniyor) startWaClient(); }, 1500);
    } else {
      waStatus = 'error';
      waErrorMessage = 'WhatsApp başlatılamadı: ' + err.message;
      console.log('  💡 Chrome veya Microsoft Edge kurulu olduğundan emin olun.');
      console.log('     Sorun sürerse arayüzdeki "Bağlantıyı Kes" ile oturumu sıfırlayıp tekrar deneyin.');
      scheduleReconnect();
    }
  });
}

function initWhatsApp() {
  // Test/geliştirme için WhatsApp'ı kapatma anahtarı (normalde kullanılmaz)
  if (process.env.WA_DISABLE === '1') {
    waStatus = 'disabled';
    waErrorMessage = null;
    console.log('  📴 WhatsApp devre dışı (WA_DISABLE=1).');
    return;
  }
  waStatus = 'initializing';
  waErrorMessage = null;
  waQrDataUrl = null;
  waBrowserCandidates = getBrowserCandidates();
  waBrowserIndex = 0;
  console.log(`  🌐 Bulunan tarayıcı sayısı: ${waBrowserCandidates.length}`);
  startWaClient();
}

// ─── WHATSAPP API ENDPOINT'LERİ ─────────────────────────────────────

// WhatsApp durumu
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: waStatus,
    qr: waQrDataUrl,
    error: waErrorMessage,
    browser: waDetectedBrowser,
    info: waStatus === 'connected' ? {
      number: waInfo?.wid?.user || null,
      name: waInfo?.pushname || null
    } : null
  });
});

// Ortak WhatsApp gönderim yardımcısı (numara temizleme + gönderim)
async function waMesajGonder(telefon, mesaj) {
  if (waStatus !== 'connected' || !waClient) {
    throw new Error('WhatsApp bağlı değil!');
  }
  let cleanPhone = String(telefon).replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
  if (!cleanPhone.startsWith('90')) cleanPhone = '90' + cleanPhone;
  const sentMsg = await waClient.sendMessage(`${cleanPhone}@c.us`, mesaj, { waitUntilMsgSent: true });
  if (!sentMsg) {
    throw new Error(`WhatsApp mesajı iletemedi. Numara (+${cleanPhone}) WhatsApp'ta kayıtlı olmayabilir.`);
  }
  return { cleanPhone, msgId: sentMsg.id?._serialized || sentMsg.id?.id || 'OK' };
}

// WhatsApp mesaj gönder
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { telefon, mesaj, siparis_id } = req.body || {};

    if (!telefon || !mesaj) {
      return res.status(400).json({ error: 'Telefon ve mesaj zorunludur.' });
    }

    if (waStatus !== 'connected' || !waClient) {
      return res.status(400).json({
        error: 'WhatsApp bağlı değil!',
        status: waStatus
      });
    }

    console.log('  📤 Mesaj gönderiliyor...');
    const r = await waMesajGonder(telefon, mesaj);
    const sp = siparis_id
      ? queryOne('SELECT musteri_adi, urun_turu FROM siparisler WHERE id = ?', [parseInt(siparis_id, 10)])
      : null;
    mesajKaydet({
      telefon: r.cleanPhone, musteri_adi: sp ? sp.musteri_adi : '', urun_turu: sp ? sp.urun_turu : '',
      mesaj, durum: 'gonderildi', yon: 'giden'
    });
    console.log(`  ✅ Mesaj başarıyla iletildi → +${r.cleanPhone}`);
    res.json({ success: true, message: 'Mesaj başarıyla gönderildi!', messageId: r.msgId });
  } catch (err) {
    console.error('  ❌ Mesaj gönderme hatası:', err.message);
    const b = req.body || {};
    mesajKaydet({
      telefon: String(b.telefon || '').replace(/\D/g, ''), mesaj: b.mesaj,
      durum: 'hata', hata: err.message, yon: 'giden'
    });
    res.status(500).json({ error: 'Mesaj gönderilemedi: ' + err.message });
  }
});

// WhatsApp yeniden bağlan
app.post('/api/whatsapp/reconnect', async (req, res) => {
  try {
    clearReconnect();
    reconnectAttempts = 0;
    await destroyWaClient();
    waStatus = 'initializing';
    waQrDataUrl = null;
    waInfo = null;
    waErrorMessage = null;
    setTimeout(() => {
      if (!kapaniyor) initWhatsApp();
    }, 1000);
    res.json({ success: true, message: 'WhatsApp yeniden başlatılıyor...' });
  } catch (err) {
    res.status(500).json({ error: 'Yeniden bağlanma hatası: ' + err.message });
  }
});

// WhatsApp bağlantısını kes (Logout)
app.post('/api/whatsapp/logout', async (req, res) => {
  try {
    clearReconnect();
    reconnectAttempts = 0;
    if (waClient) {
      if (waStatus === 'connected') {
        await waClient.logout().catch(() => {});
      }
      await destroyWaClient();
    }

    // .wwebjs_auth klasörünü temizleme
    const sessionPath = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      } catch (e) {
        console.error('Session path temizlenemedi:', e.message);
      }
    }

    waStatus = 'disconnected';
    waQrDataUrl = null;
    waInfo = null;
    waErrorMessage = null;

    // Temizlendikten sonra sıfırdan yeniden başlatıyoruz ki yeni QR kod oluşturabilsin
    setTimeout(() => {
      initWhatsApp();
    }, 1000);

    res.json({ success: true, message: 'WhatsApp bağlantısı kesildi ve oturum temizlendi.' });
  } catch (err) {
    res.status(500).json({ error: 'Bağlantı kesme hatası: ' + err.message });
  }
});

// ─── SİPARİŞ API ENDPOINT'LERİ ─────────────────────────────────────

// 1) Yeni sipariş ekle
app.post('/api/siparis', (req, res) => {
  try {
    const { musteri_adi, telefon, urun_turu } = req.body || {};
    if (!musteri_adi || !telefon || !urun_turu) {
      return res.status(400).json({ error: 'Tüm alanlar zorunludur.' });
    }
    const isim = String(musteri_adi).trim();
    if (isim.length < 2 || isim.length > 60) {
      return res.status(400).json({ error: 'Müşteri adı 2-60 karakter olmalıdır.' });
    }
    const telefonTemiz = String(telefon).replace(/\s/g, '');
    if (!/^\d{10}$/.test(telefonTemiz)) {
      return res.status(400).json({ error: 'Telefon numarası 10 hane olmalıdır (başında 0 olmadan).' });
    }
    const gecerliUrunler = urunleriGetir().map((u) => u.ad);
    if (!gecerliUrunler.includes(urun_turu)) {
      return res.status(400).json({ error: 'Geçersiz ürün türü.' });
    }
    runSql(`INSERT INTO siparisler (musteri_adi, telefon, urun_turu) VALUES (?, ?, ?)`,
      [isim, telefonTemiz, urun_turu]);
    // Not: sql.js 'export()' çağrısı bağlantıyı yeniden açtığı için last_insert_rowid sıfırlanır.
    // Bu yüzden MAX(id) kullanıyoruz.
    const row = queryOne('SELECT MAX(id) AS id FROM siparisler');
    res.json({ success: true, id: row ? row.id : null, message: 'Sipariş başarıyla eklendi.' });
  } catch (err) {
    console.error('Sipariş ekleme hatası:', err);
    res.status(500).json({ error: 'Sipariş eklenirken bir hata oluştu.' });
  }
});

// 2) Aktif siparişleri getir
app.get('/api/siparisler/aktif', (req, res) => {
  try {
    res.json(queryAll(`SELECT * FROM siparisler WHERE durum = 'Fırında' ORDER BY giris_zamani ASC`));
  } catch (err) {
    console.error('Aktif siparişler hatası:', err);
    res.status(500).json({ error: 'Siparişler yüklenirken hata oluştu.' });
  }
});

// 3) Siparişi tamamla
app.put('/api/siparis/:id/tamamla', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Geçersiz sipariş.' });
    }
    const adet = parseInt((req.body || {}).adet, 10);
    if (!Number.isInteger(adet) || adet < 1 || adet > 999) {
      return res.status(400).json({ error: 'Geçerli bir adet giriniz (1-999).' });
    }
    const siparis = queryOne('SELECT * FROM siparisler WHERE id = ?', [id]);
    if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    if (siparis.durum !== 'Fırında') return res.status(400).json({ error: 'Bu sipariş zaten tamamlanmış.' });

    runSql(`UPDATE siparisler SET durum = 'Tamamlandı', adet = ?, birim_fiyat = ?, cikis_zamani = datetime('now', 'localtime') WHERE id = ?`,
      [adet, urunFiyatGetir(siparis.urun_turu), id]);
    const guncellenmis = queryOne('SELECT * FROM siparisler WHERE id = ?', [id]);
    const tutar = (guncellenmis.adet || 0) * (guncellenmis.birim_fiyat || 0);
    // Reçetedeki malzemeleri stoktan düş (stok takibi açıksa)
    if (stokAktif()) receteDus(id, siparis.urun_turu, adet);
    const dusukStok = stokAktif()
      ? queryAll('SELECT ad FROM stok WHERE miktar <= kritik').map((s) => s.ad)
      : [];
    islemKaydet(kullaniciAdi(req), 'siparis-tamamla', `#${id} ${siparis.urun_turu} ${adet} adet`);
    // Kritik stok varsa işletme sahibine otomatik WhatsApp uyarısı (arka planda)
    if (stokAktif()) kritikStokUyar();
    res.json({
      success: true, siparis: guncellenmis, tutar, dusuk_stok: dusukStok,
      birim_maliyet: stokAktif() ? urunMaliyet(siparis.urun_turu) : 0,
      message: 'Sipariş tamamlandı.'
    });
  } catch (err) {
    console.error('Sipariş tamamlama hatası:', err);
    res.status(500).json({ error: 'Sipariş tamamlanırken hata oluştu.' });
  }
});

// 4) Ödeme durumunu değiştir (Bekliyor / Ödendi) — ödeme tipi de ( Nakit / Kart ) beraberinde gelebilir
app.put('/api/siparis/:id/odeme', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Geçersiz sipariş.' });
    }
    const odeme = (req.body || {}).odeme_durumu;
    if (!['Bekliyor', 'Ödendi'].includes(odeme)) {
      return res.status(400).json({ error: 'Geçersiz ödeme durumu.' });
    }
    const siparis = queryOne('SELECT * FROM siparisler WHERE id = ?', [id]);
    if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı.' });

    // Ödeme tipi: ödeme alındıysa Nakit/Kart seçilmeli; geri alınırken tip temizlenir
    const gonderenTip = ((req.body || {}).odeme_tipi || '').trim();
    let tip = '';
    if (odeme === 'Ödendi') {
      tip = ['Nakit', 'Kart'].includes(gonderenTip) ? gonderenTip : '';
      if (!tip) return res.status(400).json({ error: 'Ödeme tipi seçiniz (Nakit / Kart).' });
    }
    runSql('UPDATE siparisler SET odeme_durumu = ?, odeme_tipi = ? WHERE id = ?', [odeme, tip, id]);
    islemKaydet(kullaniciAdi(req), 'odeme-guncelle',
      `#${id} ${odeme}${tip ? ' (' + tip + ')' : ''}`);
    res.json({ success: true, siparis: queryOne('SELECT * FROM siparisler WHERE id = ?', [id]) });
  } catch (err) {
    console.error('Ödeme güncelleme hatası:', err);
    res.status(500).json({ error: 'Ödeme durumu güncellenemedi.' });
  }
});

// 5) Günlük rapor (teslim edilenleri ÇIKIŞ tarihine göre sayar)
app.get('/api/rapor/gunluk', (req, res) => {
  try {
    const bugun = getLocalDateString();

    const urunRapor = queryAll(`
      SELECT urun_turu, SUM(adet) as toplam_adet, COUNT(*) as siparis_sayisi,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) as ciro
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) = ?
      GROUP BY urun_turu
      ORDER BY ciro DESC`, [bugun]);

    const toplamRow = queryOne(`
      SELECT COALESCE(SUM(adet), 0) as toplam_adet,
             COUNT(*) as toplam_siparis,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) as toplam_ciro,
             COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) as tahsil_ciro,
             COALESCE(SUM(CASE WHEN odeme_durumu != 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) as bekleyen_ciro
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) = ?`, [bugun]);

    const tamamlananlar = queryAll(`
      SELECT * FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) = ?
      ORDER BY cikis_zamani DESC`, [bugun]);

    res.json({ tarih: bugun, urunRapor, toplam: toplamRow, tamamlananlar, birim_fiyat: birimFiyatGetir() });
  } catch (err) {
    console.error('Rapor hatası:', err);
    res.status(500).json({ error: 'Rapor yüklenirken hata oluştu.' });
  }
});

// 6) Tarih aralığı raporu
app.get('/api/rapor/aralik', (req, res) => {
  try {
    const tarihRegex = /^\d{4}-\d{2}-\d{2}$/;
    let { baslangic, bitis } = req.query;
    if (!tarihRegex.test(baslangic || '') || !tarihRegex.test(bitis || '')) {
      return res.status(400).json({ error: 'Geçerli tarih giriniz (YYYY-AA-GG).' });
    }
    if (baslangic > bitis) [baslangic, bitis] = [bitis, baslangic];

    const urunRapor = queryAll(`
      SELECT urun_turu, SUM(adet) as toplam_adet, COUNT(*) as siparis_sayisi,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) as ciro
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
      GROUP BY urun_turu
      ORDER BY ciro DESC`, [baslangic, bitis]);

    const toplamRow = queryOne(`
      SELECT COALESCE(SUM(adet), 0) as toplam_adet,
             COUNT(*) as toplam_siparis,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) as toplam_ciro,
             COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) as tahsil_ciro,
             COALESCE(SUM(CASE WHEN odeme_durumu != 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) as bekleyen_ciro
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?`, [baslangic, bitis]);

    const gunler = queryAll(`
      SELECT date(cikis_zamani) as gun, COUNT(*) as siparis_sayisi, COALESCE(SUM(adet), 0) as toplam_adet,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) as ciro
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
      GROUP BY gun ORDER BY gun ASC`, [baslangic, bitis]);

    const tamamlananlar = queryAll(`
      SELECT * FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
      ORDER BY cikis_zamani DESC`, [baslangic, bitis]);

    res.json({ baslangic, bitis, urunRapor, toplam: toplamRow, gunler, tamamlananlar, birim_fiyat: birimFiyatGetir() });
  } catch (err) {
    console.error('Aralık raporu hatası:', err);
    res.status(500).json({ error: 'Rapor yüklenirken hata oluştu.' });
  }
});

// 7) Siparişi sil
app.delete('/api/siparis/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Geçersiz sipariş.' });
    }
    const siparis = queryOne('SELECT * FROM siparisler WHERE id = ?', [id]);
    if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    runSql('DELETE FROM siparisler WHERE id = ?', [id]);
    res.json({ success: true, message: 'Sipariş silindi.' });
  } catch (err) {
    console.error('Sipariş silme hatası:', err);
    res.status(500).json({ error: 'Sipariş silinirken hata oluştu.' });
  }
});

// ─── AYAR API ENDPOINT'LERİ ─────────────────────────────────────────

app.get('/api/ayarlar', (req, res) => {
  res.json({
    birim_fiyat: birimFiyatGetir(),
    urunler: urunleriGetir(),
    isletme_adi: ayarGetir('isletme_adi', 'Fırın'),
    sahip_telefon: ayarGetir('sahip_telefon', ''),
    kritik_uyari: ayarGetir('kritik_uyari', '1') === '1',
    stok_aktif: stokAktif(),
    oto_cevap: ayarGetir('oto_cevap', '1') === '1',
    hazirlik_dk: parseInt(ayarGetir('hazirlik_dk', '15'), 10) || 15,
    mesaj_sablonu: ayarGetir('mesaj_sablonu', '')
  });
});

app.put('/api/ayarlar', rolGerekli('admin'), (req, res) => {
  try {
    const b = req.body || {};
    const { birim_fiyat, urunler, isletme_adi, sahip_telefon, kritik_uyari, stok_aktif, oto_cevap, hazirlik_dk, mesaj_sablonu } = b;

    if (birim_fiyat !== undefined) {
      const f = parseFloat(birim_fiyat);
      if (!Number.isFinite(f) || f < 0 || f > 100000) {
        return res.status(400).json({ error: 'Geçersiz birim fiyat.' });
      }
      ayarKaydet('birim_fiyat', f);
    }

    if (urunler !== undefined) {
      if (!Array.isArray(urunler)) {
        return res.status(400).json({ error: 'Ürün listesi geçersiz.' });
      }
      const temiz = urunler
        .map((u) => {
          const f = parseFloat(u && u.fiyat);
          return {
            ad: String((u && u.ad) || '').trim(),
            ikon: (u && u.ikon ? String(u.ikon).trim() : '') || '📦',
            fiyat: Number.isFinite(f) && f >= 0 && f <= 100000 ? f : BIRIM_FIYAT_VARSAYILAN
          };
        })
        .filter((u) => u.ad.length > 0 && u.ad.length <= 40);
      if (temiz.length === 0) {
        return res.status(400).json({ error: 'En az bir ürün olmalıdır.' });
      }
      if (temiz.length > 30) {
        return res.status(400).json({ error: 'En fazla 30 ürün tanımlanabilir.' });
      }
      ayarKaydet('urunler', JSON.stringify(temiz));
    }

    if (isletme_adi !== undefined) {
      ayarKaydet('isletme_adi', String(isletme_adi).trim().slice(0, 40) || 'Fırın');
    }
    if (sahip_telefon !== undefined) {
      const t = String(sahip_telefon).replace(/\D/g, '');
      if (t && t.length !== 10 && t.length !== 11 && t.length !== 12) {
        return res.status(400).json({ error: 'Sahip telefonu geçersiz (örn. 05xx xxx xx xx).' });
      }
      ayarKaydet('sahip_telefon', t);
    }
    if (kritik_uyari !== undefined) ayarKaydet('kritik_uyari', kritik_uyari ? '1' : '0');
    if (stok_aktif !== undefined) {
      ayarKaydet('stok_aktif', stok_aktif ? '1' : '0');
      islemKaydet(kullaniciAdi(req), 'stok-durum', stok_aktif ? 'Stok takibi açıldı' : 'Stok takibi kapatıldı');
    }
    if (oto_cevap !== undefined) ayarKaydet('oto_cevap', oto_cevap ? '1' : '0');
    if (hazirlik_dk !== undefined) {
      const h = parseInt(hazirlik_dk, 10);
      if (Number.isFinite(h) && h >= 1 && h <= 600) ayarKaydet('hazirlik_dk', String(h));
    }
    if (mesaj_sablonu !== undefined) ayarKaydet('mesaj_sablonu', String(mesaj_sablonu).slice(0, 1200));

    islemKaydet(kullaniciAdi(req), 'ayar-guncelle', 'Ayarlar güncellendi');
    res.json({
      success: true,
      birim_fiyat: birimFiyatGetir(),
      urunler: urunleriGetir(),
      isletme_adi: ayarGetir('isletme_adi', 'Fırın'),
      sahip_telefon: ayarGetir('sahip_telefon', ''),
      kritik_uyari: ayarGetir('kritik_uyari', '1') === '1',
      stok_aktif: stokAktif(),
      oto_cevap: ayarGetir('oto_cevap', '1') === '1',
      hazirlik_dk: parseInt(ayarGetir('hazirlik_dk', '15'), 10) || 15,
      mesaj_sablonu: ayarGetir('mesaj_sablonu', '')
    });
  } catch (err) {
    console.error('Ayar kaydetme hatası:', err);
    res.status(500).json({ error: 'Ayarlar kaydedilemedi.' });
  }
});

// ─── TAMAMLANAN SİPARİŞLER (isim/telefon aramalı) ───────────────────
app.get('/api/siparisler/tamamlanan', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    let sql = `SELECT * FROM siparisler WHERE durum = 'Tamamlandı'`;
    const params = [];
    if (q) {
      sql += ` AND (musteri_adi LIKE ? OR telefon LIKE ?)`;
      params.push(`%${q}%`, `%${q.replace(/\s/g, '')}%`);
    } else {
      const tarih = /^\d{4}-\d{2}-\d{2}$/.test(req.query.tarih || '') ? req.query.tarih : getLocalDateString();
      sql += ` AND date(cikis_zamani) = ?`;
      params.push(tarih);
    }
    sql += ` ORDER BY cikis_zamani DESC LIMIT 200`;
    res.json(queryAll(sql, params));
  } catch (err) {
    console.error('Tamamlanan siparişler hatası:', err);
    res.status(500).json({ error: 'Liste yüklenemedi.' });
  }
});

// ─── STOK API ───────────────────────────────────────────────────────
app.get('/api/stok', (req, res) => {
  try {
    const liste = queryAll('SELECT * FROM stok ORDER BY ad COLLATE NOCASE ASC')
      .map((r) => ({ ...r, dusuk: (r.miktar || 0) <= (r.kritik || 0) }));
    res.json(liste);
  } catch (err) {
    console.error('Stok listesi hatası:', err);
    res.status(500).json({ error: 'Stok yüklenemedi.' });
  }
});

app.post('/api/stok', (req, res) => {
  try {
    const { ad, birim, miktar, kritik, birim_maliyet, tedarikci } = req.body || {};
    const adT = String(ad || '').trim();
    if (adT.length < 1 || adT.length > 50) {
      return res.status(400).json({ error: 'Malzeme adı 1-50 karakter olmalıdır.' });
    }
    const m = parseFloat(miktar);
    const k = parseFloat(kritik);
    const bm = parseFloat(birim_maliyet);
    const miktarV = Number.isFinite(m) && m >= 0 ? yuvarla(m) : 0;
    const kritikV = Number.isFinite(k) && k >= 0 ? yuvarla(k) : 0;
    const bmV = Number.isFinite(bm) && bm >= 0 ? bm : 0;
    const tedT = String(tedarikci || '').trim().slice(0, 60);
    const birimT = String(birim || 'adet').trim().slice(0, 15) || 'adet';
    runSql('INSERT INTO stok (ad, birim, miktar, kritik, birim_maliyet, tedarikci) VALUES (?, ?, ?, ?, ?, ?)', [adT, birimT, miktarV, kritikV, bmV, tedT]);
    const row = queryOne('SELECT MAX(id) AS id FROM stok');
    if (miktarV > 0) {
      runSql('INSERT INTO stok_hareketleri (stok_id, tip, miktar, aciklama) VALUES (?, ?, ?, ?)',
        [row.id, 'giris', miktarV, 'Başlangıç stoğu']);
    }
    res.json({ success: true, id: row ? row.id : null, message: 'Malzeme eklendi.' });
  } catch (err) {
    console.error('Stok ekleme hatası:', err);
    res.status(500).json({ error: 'Malzeme eklenemedi.' });
  }
});

app.put('/api/stok/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Geçersiz malzeme.' });
    if (!queryOne('SELECT id FROM stok WHERE id = ?', [id])) {
      return res.status(404).json({ error: 'Malzeme bulunamadı.' });
    }
    const { ad, birim, kritik, birim_maliyet, tedarikci } = req.body || {};
    const adT = String(ad || '').trim();
    if (adT.length < 1 || adT.length > 50) return res.status(400).json({ error: 'Malzeme adı 1-50 karakter olmalıdır.' });
    const k = parseFloat(kritik);
    const kritikV = Number.isFinite(k) && k >= 0 ? k : 0;
    const bm = parseFloat(birim_maliyet);
    const bmV = Number.isFinite(bm) && bm >= 0 ? bm : 0;
    const tedT = String(tedarikci || '').trim().slice(0, 60);
    const birimT = String(birim || 'adet').trim().slice(0, 15) || 'adet';
    runSql('UPDATE stok SET ad = ?, birim = ?, kritik = ?, birim_maliyet = ?, tedarikci = ? WHERE id = ?', [adT, birimT, kritikV, bmV, tedT, id]);
    res.json({ success: true, message: 'Malzeme güncellendi.' });
  } catch (err) {
    console.error('Stok güncelleme hatası:', err);
    res.status(500).json({ error: 'Malzeme güncellenemedi.' });
  }
});

app.delete('/api/stok/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Geçersiz malzeme.' });
    db.run('DELETE FROM stok WHERE id = ?', [id]);
    db.run('DELETE FROM stok_hareketleri WHERE stok_id = ?', [id]);
    db.run('DELETE FROM recete WHERE stok_id = ?', [id]);
    saveDatabase();
    res.json({ success: true, message: 'Malzeme silindi.' });
  } catch (err) {
    console.error('Stok silme hatası:', err);
    res.status(500).json({ error: 'Malzeme silinemedi.' });
  }
});

app.post('/api/stok/:id/hareket', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Geçersiz malzeme.' });
    const stok = queryOne('SELECT * FROM stok WHERE id = ?', [id]);
    if (!stok) return res.status(404).json({ error: 'Malzeme bulunamadı.' });
    const g = req.body || {};
    const tip = ['giris', 'cikis', 'fire'].includes(g.tip) ? g.tip : 'giris';
    const miktar = parseFloat(g.miktar);
    if (!Number.isFinite(miktar) || miktar <= 0 || miktar > 1000000) {
      return res.status(400).json({ error: 'Geçerli bir miktar giriniz.' });
    }
    const miktarY = yuvarla(miktar);
    const yon = tip === 'giris' ? 1 : -1;
    const yeni = yuvarla((stok.miktar || 0) + yon * miktarY);
    const varsayilanAc = tip === 'giris' ? 'Manuel giriş' : (tip === 'fire' ? 'Fire / zayi' : 'Manuel çıkış');
    const aciklama = String(g.aciklama || varsayilanAc).slice(0, 120);

    db.run('UPDATE stok SET miktar = ? WHERE id = ?', [yeni, id]);

    // Alım tutarı girildiyse: kasaya otomatik gider + malzeme alış fiyatını güncelle
    let gider = null;
    let yeniMaliyet = null;
    const tutar = parseFloat(g.tutar);
    if (tip === 'giris' && Number.isFinite(tutar) && tutar > 0) {
      gider = tutar;
      yeniMaliyet = yuvarla(tutar / miktarY);
      db.run('UPDATE stok SET birim_maliyet = ? WHERE id = ?', [yeniMaliyet, id]);
      db.run('INSERT INTO giderler (aciklama, miktar, kategori, tarih) VALUES (?, ?, ?, ?)',
        [`${stok.ad} alımı (${miktarY} ${stok.birim})`, gider, 'Malzeme Alımı', getLocalDateString()]);
    }

    db.run('INSERT INTO stok_hareketleri (stok_id, tip, miktar, aciklama) VALUES (?, ?, ?, ?)', [id, tip, miktarY, aciklama]);
    saveDatabase();
    islemKaydet(kullaniciAdi(req), 'stok-hareket', `${stok.ad} ${tip} ${miktarY} ${stok.birim}`);
    const guncel = queryOne('SELECT * FROM stok WHERE id = ?', [id]);
    res.json({
      success: true,
      stok: { ...guncel, dusuk: (guncel.miktar || 0) <= (guncel.kritik || 0) },
      gider, birim_maliyet: yeniMaliyet,
      message: 'Stok güncellendi.'
    });
  } catch (err) {
    console.error('Stok hareket hatası:', err);
    res.status(500).json({ error: 'Stok güncellenemedi.' });
  }
});

app.get('/api/stok/hareketler', (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const rows = queryAll(`
      SELECT h.*, s.ad AS stok_ad, s.birim
      FROM stok_hareketleri h LEFT JOIN stok s ON s.id = h.stok_id
      ORDER BY h.id DESC LIMIT ?`, [limit]);
    res.json(rows);
  } catch (err) {
    console.error('Hareket listesi hatası:', err);
    res.status(500).json({ error: 'Hareketler yüklenemedi.' });
  }
});

// ─── REÇETE API ─────────────────────────────────────────────────────
app.get('/api/recete', (req, res) => {
  try {
    const rows = queryAll(`
      SELECT r.urun_turu, r.stok_id, r.miktar, s.ad AS stok_ad, s.birim
      FROM recete r LEFT JOIN stok s ON s.id = r.stok_id
      ORDER BY r.urun_turu ASC`);
    res.json(rows);
  } catch (err) {
    console.error('Reçete listesi hatası:', err);
    res.status(500).json({ error: 'Reçeteler yüklenemedi.' });
  }
});

app.put('/api/recete/:urun', (req, res) => {
  try {
    const urun = String(req.params.urun || '').trim();
    if (!urunleriGetir().some((u) => u.ad === urun)) {
      return res.status(400).json({ error: 'Geçersiz ürün.' });
    }
    const kalemler = (req.body || {}).kalemler;
    if (!Array.isArray(kalemler)) return res.status(400).json({ error: 'Reçete geçersiz.' });
    db.run('DELETE FROM recete WHERE urun_turu = ?', [urun]);
    let sayi = 0;
    kalemler.forEach((k) => {
      const stokId = parseInt(k && k.stok_id, 10);
      const mik = parseFloat(k && k.miktar);
      if (Number.isInteger(stokId) && Number.isFinite(mik) && mik > 0 && mik <= 100000) {
        db.run('INSERT INTO recete (urun_turu, stok_id, miktar) VALUES (?, ?, ?)', [urun, stokId, yuvarla(mik)]);
        sayi++;
      }
    });
    saveDatabase();
    res.json({ success: true, message: `Reçete kaydedildi (${sayi} malzeme).` });
  } catch (err) {
    console.error('Reçete kaydetme hatası:', err);
    res.status(500).json({ error: 'Reçete kaydedilemedi.' });
  }
});

// ─── GİDER / KASA API ───────────────────────────────────────────────
app.get('/api/giderler', rolGerekli('admin'), (req, res) => {
  try {
    let { baslangic, bitis } = req.query;
    const gecerli = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t || '');
    let sql = 'SELECT * FROM giderler';
    const params = [];
    if (gecerli(baslangic) && gecerli(bitis)) {
      if (baslangic > bitis) [baslangic, bitis] = [bitis, baslangic];
      sql += ' WHERE tarih BETWEEN ? AND ?';
      params.push(baslangic, bitis);
    }
    sql += ' ORDER BY tarih DESC, id DESC LIMIT 300';
    const liste = queryAll(sql, params);
    const toplam = liste.reduce((t, g) => t + (g.miktar || 0), 0);
    res.json({ liste, toplam });
  } catch (err) {
    console.error('Gider listesi hatası:', err);
    res.status(500).json({ error: 'Giderler yüklenemedi.' });
  }
});

app.post('/api/giderler', rolGerekli('admin'), (req, res) => {
  try {
    const { aciklama, miktar, kategori, tarih } = req.body || {};
    const acT = String(aciklama || '').trim();
    if (acT.length < 1 || acT.length > 80) return res.status(400).json({ error: 'Açıklama 1-80 karakter olmalıdır.' });
    const m = parseFloat(miktar);
    if (!Number.isFinite(m) || m <= 0 || m > 100000000) return res.status(400).json({ error: 'Geçerli bir tutar giriniz.' });
    const tarihT = /^\d{4}-\d{2}-\d{2}$/.test(tarih || '') ? tarih : getLocalDateString();
    const katT = String(kategori || 'Diğer').trim().slice(0, 30) || 'Diğer';
    runSql('INSERT INTO giderler (aciklama, miktar, kategori, tarih) VALUES (?, ?, ?, ?)', [acT, m, katT, tarihT]);
    res.json({ success: true, message: 'Gider eklendi.' });
  } catch (err) {
    console.error('Gider ekleme hatası:', err);
    res.status(500).json({ error: 'Gider eklenemedi.' });
  }
});

app.delete('/api/giderler/:id', rolGerekli('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Geçersiz gider.' });
    runSql('DELETE FROM giderler WHERE id = ?', [id]);
    res.json({ success: true, message: 'Gider silindi.' });
  } catch (err) {
    console.error('Gider silme hatası:', err);
    res.status(500).json({ error: 'Gider silinemedi.' });
  }
});

app.get('/api/kasa', rolGerekli('admin'), (req, res) => {
  try {
    let { baslangic, bitis } = req.query;
    const gecerli = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t || '');
    if (!gecerli(baslangic) || !gecerli(bitis)) {
      const bugun = getLocalDateString();
      baslangic = bugun.slice(0, 8) + '01';
      bitis = bugun;
    }
    if (baslangic > bitis) [baslangic, bitis] = [bitis, baslangic];
    const ciro = queryOne(`
      SELECT
        COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) as gelir,
        COALESCE(SUM(CASE WHEN odeme_durumu != 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) as bekleyen,
        COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) as ciro,
        COUNT(*) as siparis_sayisi,
        COALESCE(SUM(adet), 0) as toplam_adet
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?`, [baslangic, bitis]);
    const giderRow = queryOne(`SELECT COALESCE(SUM(miktar), 0) as gider FROM giderler WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis]);
    const gider = giderRow ? giderRow.gider : 0;
    const kirilim = queryOne(`
      SELECT ${KART_TUTAR_SQL} as kart, ${NAKIT_TUTAR_SQL} as nakit
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?`, [baslangic, bitis]);
    const posSatisRow = queryOne(`SELECT COALESCE(SUM(tutar), 0) as toplam FROM pos_satis WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis]);
    const posSatis = yuvarla(posSatisRow ? posSatisRow.toplam : 0);
    // pos_satis: siparişsiz POS satışları — gelir olarak net kâra eklenir
    res.json({
      baslangic, bitis,
      gelir: ciro.gelir, bekleyen: ciro.bekleyen, ciro: ciro.ciro,
      gelir_nakit: yuvarla(kirilim?.nakit || 0),
      gelir_kart: yuvarla(kirilim?.kart || 0),
      pos_satis: posSatis,
      siparis_sayisi: ciro.siparis_sayisi, toplam_adet: ciro.toplam_adet,
      gider, net: (ciro.gelir || 0) + posSatis - (gider || 0)
    });
  } catch (err) {
    console.error('Kasa hatası:', err);
    res.status(500).json({ error: 'Kasa hesaplanamadı.' });
  }
});

// ─── EK RAPORLAR (kârlılık / müşteri / saatlik / aylık kasa) ────────
// ─── POS / KART TAHSLAT TAKİBİ ──────────────────────────────────────

// Ödeme tipi kırılımı için ortak SQL parçaları (Nakit / Kart)
const KART_TUTAR_SQL = `COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' AND odeme_tipi = 'Kart' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0)`;
const NAKIT_TUTAR_SQL = `COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' AND odeme_tipi = 'Nakit' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0)`;

// POS mutabakatı: gün sonunda POS ekranındaki (Z raporu) kart toplamı girilir; sistem
// kendi kart tahsilatı + siparişsiz POS satışları ile karşılaştırır, farkı gösterir.
app.get('/api/pos/mutabakat', rolGerekli('admin'), (req, res) => {
  try {
    const { baslangic, bitis } = tarihAraligi(req.query);
    const kRow = queryOne(`
      SELECT ${KART_TUTAR_SQL} AS kart, ${NAKIT_TUTAR_SQL} AS nakit
      FROM siparisler WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?`,
      [baslangic, bitis]);
    const kartSiparissiz = queryOne(
      `SELECT COALESCE(SUM(tutar), 0) AS toplam FROM pos_satis WHERE tarih BETWEEN ? AND ?`,
      [baslangic, bitis]);
    const zKayit = queryAll(
      `SELECT id, tarih, tutar, aciklama FROM pos_z WHERE tarih BETWEEN ? AND ? ORDER BY tarih, id`,
      [baslangic, bitis]);
    const zToplam = yuvarla(zKayit.reduce((t, z) => t + (z.tutar || 0), 0));
    const sistemKart = yuvarla((kRow?.kart || 0) + (kartSiparissiz?.toplam || 0));
    res.json({
      baslangic, bitis,
      sistem_kart: sistemKart,
      sistem_kart_siparis: yuvarla(kRow?.kart || 0),       // siparişlerden kart tahsilatı
      sistem_kart_siparissiz: yuvarla(kartSiparissiz?.toplam || 0), // siparişsiz POS satışları
      sistem_nakit: yuvarla(kRow?.nakit || 0),
      pos_z: zToplam,
      z_kayitlari: zKayit,
      fark: yuvarla(sistemKart - zToplam)
    });
  } catch (err) {
    console.error('POS mutabakat hatası:', err);
    res.status(500).json({ error: 'POS mutabakatı hesaplanamadı.' });
  }
});

// Z raporu tutarı gir (mutabakat için)
app.post('/api/pos/z', rolGerekli('admin'), (req, res) => {
  try {
    const tutar = parseFloat((req.body || {}).tutar);
    const aciklama = ((req.body || {}).aciklama || '').trim().slice(0, 120);
    const tarih = ((req.body || {}).tarih || getLocalDateString());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
      return res.status(400).json({ error: 'Geçerli tarih giriniz (YYYY-AA-GG).' });
    }
    if (!Number.isFinite(tutar) || tutar <= 0) {
      return res.status(400).json({ error: 'Geçerli bir Z tutarı giriniz.' });
    }
    runSql('INSERT INTO pos_z (tarih, tutar, aciklama) VALUES (?, ?, ?)', [tarih, tutar, aciklama]);
    islemKaydet(kullaniciAdi(req), 'pos-z-gir', `${tarih}: ${yuvarla(tutar)} ₺`);
    res.json({ success: true, message: 'Z raporu tutarı kaydedildi.' });
  } catch (err) {
    console.error('POS Z kayıt hatası:', err);
    res.status(500).json({ error: 'Z raporu kaydedilemedi.' });
  }
});

app.delete('/api/pos/z/:id', rolGerekli('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Geçersiz kayıt.' });
    runSql('DELETE FROM pos_z WHERE id = ?', [id]);
    islemKaydet(kullaniciAdi(req), 'pos-z-sil', `#${id}`);
    res.json({ success: true, message: 'Z kaydı silindi.' });
  } catch (err) {
    console.error('POS Z silme hatası:', err);
    res.status(500).json({ error: 'Z kaydı silinemedi.' });
  }
});

// Siparişsiz POS satışı (pide üstü, ayran vb.) — kayıtlar mutabakata ve kasa kart toplamına dahil edilir
app.post('/api/pos/satis', rolGerekli('admin'), (req, res) => {
  try {
    const tutar = parseFloat((req.body || {}).tutar);
    const aciklama = ((req.body || {}).aciklama || '').trim().slice(0, 120);
    const tarih = ((req.body || {}).tarih || getLocalDateString());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
      return res.status(400).json({ error: 'Geçerli tarih giriniz (YYYY-AA-GG).' });
    }
    if (!Number.isFinite(tutar) || tutar <= 0) {
      return res.status(400).json({ error: 'Geçerli bir tutar giriniz.' });
    }
    runSql('INSERT INTO pos_satis (tarih, tutar, aciklama) VALUES (?, ?, ?)', [tarih, tutar, aciklama || 'POS satışı']);
    islemKaydet(kullaniciAdi(req), 'pos-satis-ekle', `${tarih}: ${yuvarla(tutar)} ₺`);
    res.json({ success: true, message: 'POS satışı kaydedildi.' });
  } catch (err) {
    console.error('POS satış kayıt hatası:', err);
    res.status(500).json({ error: 'POS satışı kaydedilemedi.' });
  }
});

app.delete('/api/pos/satis/:id', rolGerekli('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Geçersiz kayıt.' });
    runSql('DELETE FROM pos_satis WHERE id = ?', [id]);
    islemKaydet(kullaniciAdi(req), 'pos-satis-sil', `#${id}`);
    res.json({ success: true, message: 'POS satışı silindi.' });
  } catch (err) {
    console.error('POS satış silme hatası:', err);
    res.status(500).json({ error: 'POS satışı silinemedi.' });
  }
});

app.get('/api/rapor/karlilik', rolGerekli('admin'), (req, res) => {
  try {
    const { baslangic, bitis } = tarihAraligi(req.query);
    const urunler = queryAll(`
      SELECT urun_turu,
             COALESCE(SUM(adet), 0) AS toplam_adet,
             COUNT(*) AS siparis_sayisi,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) AS ciro
      FROM siparisler
      WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
      GROUP BY urun_turu`, [baslangic, bitis]);
    const liste = urunler.map((u) => {
      const maliyetBirim = urunMaliyet(u.urun_turu);
      const maliyet = yuvarla(maliyetBirim * (u.toplam_adet || 0));
      const kar = yuvarla((u.ciro || 0) - maliyet);
      return {
        ...u,
        maliyet_birim: maliyetBirim,
        maliyet,
        kar,
        marj: u.ciro > 0 ? Math.round((kar / u.ciro) * 1000) / 10 : 0
      };
    }).sort((a, b) => b.kar - a.kar);
    const toplam = liste.reduce(
      (t, u) => ({ ciro: yuvarla(t.ciro + u.ciro), maliyet: yuvarla(t.maliyet + u.maliyet), kar: yuvarla(t.kar + u.kar) }),
      { ciro: 0, maliyet: 0, kar: 0 });
    toplam.marj = toplam.ciro > 0 ? yuvarla((toplam.kar / toplam.ciro) * 100) : 0;
    res.json({ baslangic, bitis, liste, toplam });
  } catch (err) {
    console.error('Kârlılık raporu hatası:', err);
    res.status(500).json({ error: 'Kârlılık raporu yüklenemedi.' });
  }
});

app.get('/api/rapor/musteriler', rolGerekli('admin'), (req, res) => {
  try {
    const { baslangic, bitis } = tarihAraligi(req.query);
    const liste = queryAll(`
      SELECT musteri_adi, telefon,
             COUNT(*) AS siparis_sayisi,
             COALESCE(SUM(adet), 0) AS toplam_adet,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) AS ciro,
             COALESCE(SUM(CASE WHEN odeme_durumu != 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) AS bekleyen
      FROM siparisler
      WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
      GROUP BY telefon, musteri_adi
      ORDER BY ciro DESC LIMIT 100`, [baslangic, bitis]);
    res.json({ baslangic, bitis, liste });
  } catch (err) {
    console.error('Müşteri raporu hatası:', err);
    res.status(500).json({ error: 'Müşteri raporu yüklenemedi.' });
  }
});

app.get('/api/rapor/saatlik', rolGerekli('admin'), (req, res) => {
  try {
    const { baslangic, bitis } = tarihAraligi(req.query);
    const rows = queryAll(`
      SELECT strftime('%H', cikis_zamani) AS saat,
             COUNT(*) AS siparis_sayisi,
             COALESCE(SUM(adet), 0) AS toplam_adet
      FROM siparisler
      WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
      GROUP BY saat ORDER BY saat`, [baslangic, bitis]);
    const harita = {};
    rows.forEach((r) => { harita[r.saat] = r; });
    const liste = [];
    for (let h = 0; h < 24; h++) {
      const k = String(h).padStart(2, '0');
      liste.push(harita[k] || { saat: k, siparis_sayisi: 0, toplam_adet: 0 });
    }
    res.json({ baslangic, bitis, liste });
  } catch (err) {
    console.error('Saatlik rapor hatası:', err);
    res.status(500).json({ error: 'Saatlik rapor yüklenemedi.' });
  }
});

app.get('/api/kasa/aylik', rolGerekli('admin'), (req, res) => {
  try {
    const { baslangic, bitis } = tarihAraligi(req.query);
    const gelir = queryAll(`
      SELECT date(cikis_zamani) AS gun,
             COALESCE(SUM(CASE WHEN odeme_durumu = 'Ödendi' THEN adet * COALESCE(birim_fiyat, 0) ELSE 0 END), 0) AS gelir,
             COALESCE(SUM(adet * COALESCE(birim_fiyat, 0)), 0) AS ciro
      FROM siparisler
      WHERE durum = 'Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?
      GROUP BY gun`, [baslangic, bitis]);
    const gider = queryAll(`
      SELECT tarih AS gun, COALESCE(SUM(miktar), 0) AS gider
      FROM giderler WHERE tarih BETWEEN ? AND ? GROUP BY tarih`, [baslangic, bitis]);
    const harita = {};
    gelir.forEach((g) => { harita[g.gun] = { gun: g.gun, gelir: g.gelir, ciro: g.ciro, gider: 0 }; });
    gider.forEach((g) => {
      if (!harita[g.gun]) harita[g.gun] = { gun: g.gun, gelir: 0, ciro: 0, gider: 0 };
      harita[g.gun].gider = g.gider;
    });
    const gunler = Object.values(harita)
      .map((g) => ({ ...g, net: yuvarla((g.gelir || 0) - (g.gider || 0)) }))
      .sort((a, b) => a.gun.localeCompare(b.gun));
    res.json({ baslangic, bitis, gunler });
  } catch (err) {
    console.error('Aylık kasa hatası:', err);
    res.status(500).json({ error: 'Aylık kasa yüklenemedi.' });
  }
});

// Detaylı dönem raporu (kâr/zarar + tüm dökümler) — PDF ve CSV dışa aktarmanın kaynağı
app.get('/api/rapor/detayli', rolGerekli('admin'), (req, res) => {
  try {
    const { baslangic, bitis } = tarihAraligi(req.query);
    res.json(detayliRapor(baslangic, bitis));
  } catch (err) {
    console.error('Detaylı rapor hatası:', err);
    res.status(500).json({ error: 'Detaylı rapor yüklenemedi.' });
  }
});

// ─── CSV DIŞA AKTARMA ───────────────────────────────────────────────
function csvHucre(deger) {
  const s = deger === null || deger === undefined ? '' : String(deger);
  return '"' + s.replace(/"/g, '""') + '"';
}

app.get('/api/disa-aktar/:tur', rolGerekli('admin'), (req, res) => {
  try {
    const tur = req.params.tur;
    let basliklar, satirlar, ad;
    if (tur === 'siparisler') {
      basliklar = ['id', 'musteri_adi', 'telefon', 'urun_turu', 'adet', 'birim_fiyat', 'tutar', 'durum', 'odeme_durumu', 'odeme_tipi', 'giris_zamani', 'cikis_zamani'];
      satirlar = queryAll('SELECT * FROM siparisler ORDER BY id DESC LIMIT 5000')
        .map((r) => [r.id, r.musteri_adi, r.telefon, r.urun_turu, r.adet, r.birim_fiyat,
          yuvarla((r.adet || 0) * (r.birim_fiyat || 0)), r.durum, r.odeme_durumu, r.odeme_tipi || '', r.giris_zamani, r.cikis_zamani]);
      ad = 'siparisler';
    } else if (tur === 'giderler') {
      basliklar = ['id', 'tarih', 'kategori', 'aciklama', 'miktar'];
      satirlar = queryAll('SELECT * FROM giderler ORDER BY id DESC LIMIT 5000')
        .map((r) => [r.id, r.tarih, r.kategori, r.aciklama, r.miktar]);
      ad = 'giderler';
    } else if (tur === 'stok') {
      basliklar = ['id', 'ad', 'birim', 'miktar', 'kritik', 'birim_maliyet', 'tedarikci', 'stok_degeri'];
      satirlar = queryAll('SELECT * FROM stok ORDER BY ad COLLATE NOCASE')
        .map((r) => [r.id, r.ad, r.birim, r.miktar, r.kritik, r.birim_maliyet, r.tedarikci,
          yuvarla((r.miktar || 0) * (r.birim_maliyet || 0))]);
      ad = 'stok';
    } else if (tur === 'karlilik') {
      // Özet (kâr/zarar) + ürün bazlı döküm
      const { baslangic, bitis } = tarihAraligi(req.query);
      const r = detayliRapor(baslangic, bitis);
      const o = r.ozet;
      const satir = (...h) => h.map(csvHucre).join(';');
      const parcalar = [];
      parcalar.push(satir(`${r.isletme_adi} — KÂRLILIK RAPORU`));
      parcalar.push(satir(`Dönem: ${baslangic} → ${bitis}`));
      parcalar.push('');
      parcalar.push(satir('Sipariş Sayısı', o.siparis_sayisi, 'Toplam Adet', o.toplam_adet));
      parcalar.push(satir('Ciro', o.ciro, 'Tahsil Edilen', o.tahsil, 'Bekleyen', o.bekleyen));
      parcalar.push(satir('Tahsil - Nakit', o.tahsil_nakit, 'Tahsil - Kart', o.tahsil_kart, 'POS Satışı (Siparişsiz)', o.pos_satis));
      parcalar.push(satir('Malzeme Maliyeti', o.malzeme_maliyeti, 'Brüt Kâr', o.brut_kar, 'Brüt Marj %', o.brut_marj));
      parcalar.push(satir('Diğer Giderler', o.gider_diger, 'Toplam Gider', o.gider_toplam));
      parcalar.push(satir('NET KÂR / ZARAR', o.net_kar, 'Net Marj %', o.net_marj));
      parcalar.push('');
      parcalar.push(satir('Ürün', 'Adet', 'Sipariş', 'Ciro', 'Tahsil', 'Maliyet', 'Kâr', 'Marj (%)'));
      r.urunler.forEach((u) => parcalar.push(satir(u.urun_turu, u.adet, u.siparis, u.ciro, u.tahsil, u.maliyet, u.kar, u.marj)));
      const csvKarlilik = '\uFEFF' + parcalar.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="karlilik-${baslangic}_${bitis}.csv"`);
      return res.send(csvKarlilik);
    } else if (tur === 'detayli') {
      // Kâr/zarar + tüm dökümleri içeren çok bölümlü detaylı rapor
      const { baslangic, bitis } = tarihAraligi(req.query);
      const r = detayliRapor(baslangic, bitis);
      const o = r.ozet;
      const satir = (...h) => h.map(csvHucre).join(';');
      const bosluk = '';
      const bolum = (b) => ['', satir(String(b).toUpperCase())].join('\r\n');
      const parcalar = [];
      parcalar.push(satir(`${r.isletme_adi} — DETAYLI RAPOR`));
      parcalar.push(satir(`Dönem: ${r.baslangic} → ${r.bitis}`));
      parcalar.push(satir(`Oluşturma: ${getLocalDateString()}`));
      parcalar.push(bosluk);
      parcalar.push(bolum('ÖZET (KÂR / ZARAR)'));
      parcalar.push(satir('Alan', 'Değer'));
      parcalar.push(satir('Sipariş Sayısı', o.siparis_sayisi));
      parcalar.push(satir('Toplam Adet', o.toplam_adet));
      parcalar.push(satir('Ciro (Satış)', o.ciro));
      parcalar.push(satir('Tahsil Edilen', o.tahsil));
      parcalar.push(satir('Tahsil - Nakit', o.tahsil_nakit));
      parcalar.push(satir('Tahsil - Kart', o.tahsil_kart));
      parcalar.push(satir('POS Satışı (Siparişsiz)', o.pos_satis));
      parcalar.push(satir('Bekleyen Ödeme', o.bekleyen));
      parcalar.push(satir('Malzeme Maliyeti', o.malzeme_maliyeti));
      parcalar.push(satir('Brüt Kâr', o.brut_kar));
      parcalar.push(satir('Brüt Marj (%)', o.brut_marj));
      parcalar.push(satir('Diğer Giderler', o.gider_diger));
      parcalar.push(satir('Toplam Gider', o.gider_toplam));
      parcalar.push(satir('NET KÂR / ZARAR', o.net_kar));
      parcalar.push(satir('Net Marj (%)', o.net_marj));
      parcalar.push(satir('Ortalama Sepet', o.ortalama_sepet));
      parcalar.push(bolum('ÜRÜN BAZLI KÂRLILIK'));
      parcalar.push(satir('Ürün', 'Adet', 'Sipariş', 'Ciro', 'Tahsil', 'Maliyet', 'Kâr', 'Marj (%)'));
      r.urunler.forEach((u) => parcalar.push(satir(u.urun_turu, u.adet, u.siparis, u.ciro, u.tahsil, u.maliyet, u.kar, u.marj)));
      parcalar.push(bolum('GİDERLER (KATEGORİ)'));
      parcalar.push(satir('Kategori', 'Adet', 'Toplam'));
      if (r.giderKategorileri.length) r.giderKategorileri.forEach((g) => parcalar.push(satir(g.kategori, g.adet, g.toplam)));
      else parcalar.push(satir('(Kayıt yok)', '', ''));
      parcalar.push(bolum('GÜN GÜN DÖKÜM'));
      parcalar.push(satir('Tarih', 'Sipariş', 'Adet', 'Ciro', 'Tahsil', 'Gider'));
      r.gunler.forEach((g) => parcalar.push(satir(g.gun, g.siparis, g.adet, g.ciro, g.tahsil, g.gider)));
      parcalar.push(bolum('MÜŞTERİLER (ciroya göre)'));
      parcalar.push(satir('Müşteri', 'Telefon', 'Sipariş', 'Adet', 'Ciro', 'Bekleyen'));
      r.musteriler.forEach((m) => parcalar.push(satir(m.musteri_adi, m.telefon, m.siparis, m.adet, m.ciro, m.bekleyen)));
      parcalar.push(bolum('SAATLİK YOĞUNLUK'));
      parcalar.push(satir('Saat', 'Sipariş', 'Adet'));
      r.saatlik.filter((s) => s.siparis > 0).forEach((s) => parcalar.push(satir(s.saat + ':00', s.siparis, s.adet)));
      parcalar.push(bolum('TESLİM EDİLEN SİPARİŞLER'));
      parcalar.push(satir('id', 'Müşteri', 'Telefon', 'Ürün', 'Adet', 'Birim Fiyat', 'Tutar', 'Ödeme', 'Tip', 'Çıkış'));
      r.tamamlananlar.forEach((s) => parcalar.push(satir(s.id, s.musteri_adi, s.telefon, s.urun_turu, s.adet, s.birim_fiyat, s.tutar, s.odeme_durumu, s.odeme_tipi, s.cikis_zamani)));
      const csvDetay = '\uFEFF' + parcalar.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="detayli-rapor-${baslangic}_${bitis}.csv"`);
      return res.send(csvDetay);
    } else if (tur === 'pos-mutabakat') {
      // POS mutabakat dökümü: sistem kart tahsilatı vs girilen Z raporu tutarları
      const { baslangic, bitis } = tarihAraligi(req.query);
      const satir = (...h) => h.map(csvHucre).join(';');
      const parcalar = [];
      parcalar.push(satir('POS MUTABAKAT RAPORU'));
      parcalar.push(satir(`Dönem: ${baslangic} → ${bitis}`));
      parcalar.push('');
      parcalar.push(satir('Tarih', 'Sipariş Kart Tahsilatı', 'Siparişsiz POS Satışı', 'Sistem Kart Toplamı', 'POS Z Raporu', 'Fark'));
      // Gün gün hesapla (mutabakat endpoint'indeki mantığın aynısı)
      const gunler = new Set([
        ...queryAll(`SELECT DISTINCT date(cikis_zamani) AS g FROM siparisler WHERE durum='Tamamlandı' AND date(cikis_zamani) BETWEEN ? AND ?`, [baslangic, bitis]).map((r) => r.g),
        ...queryAll(`SELECT DISTINCT tarih AS g FROM pos_satis WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis]).map((r) => r.g),
        ...queryAll(`SELECT DISTINCT tarih AS g FROM pos_z WHERE tarih BETWEEN ? AND ?`, [baslangic, bitis]).map((r) => r.g)
      ].filter(Boolean));
      [...gunler].sort().forEach((gun) => {
        const siparisKart = yuvarla(queryOne(`
          SELECT ${KART_TUTAR_SQL} AS t FROM siparisler
          WHERE durum = 'Tamamlandı' AND date(cikis_zamani) = ?`, [gun])?.t || 0);
        const siparissiz = yuvarla(queryOne(
          `SELECT COALESCE(SUM(tutar),0) AS t FROM pos_satis WHERE tarih = ?`, [gun])?.t || 0);
        const z = yuvarla(queryOne(
          `SELECT COALESCE(SUM(tutar),0) AS t FROM pos_z WHERE tarih = ?`, [gun])?.t || 0);
        const sistem = yuvarla(siparisKart + siparissiz);
        parcalar.push(satir(gun, siparisKart, siparissiz, sistem, z, yuvarla(sistem - z)));
      });
      const csvPos = '\uFEFF' + parcalar.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pos-mutabakat-${baslangic}_${bitis}.csv"`);
      return res.send(csvPos);
    } else {
      return res.status(400).json({ error: 'Geçersiz dışa aktarma türü.' });
    }
    const csv = '\uFEFF' + [basliklar.map(csvHucre).join(';')]
      .concat(satirlar.map((s) => s.map(csvHucre).join(';')))
      .join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ad}-${getLocalDateString()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Dışa aktarma hatası:', err);
    res.status(500).json({ error: 'Dışa aktarma başarısız.' });
  }
});

// ─── YEDEK YÖNETİMİ ─────────────────────────────────────────────────
app.get('/api/yedekler', rolGerekli('admin'), (req, res) => {
  try {
    if (!fs.existsSync(YEDEK_DIR)) return res.json([]);
    const liste = fs.readdirSync(YEDEK_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = fs.statSync(path.join(YEDEK_DIR, f));
        return { dosya: f, boyut: st.size, zaman: st.mtime };
      })
      .sort((a, b) => new Date(b.zaman) - new Date(a.zaman));
    res.json(liste);
  } catch (err) {
    console.error('Yedek listesi hatası:', err);
    res.status(500).json({ error: 'Yedekler listelenemedi.' });
  }
});

app.post('/api/yedek/al', rolGerekli('admin'), (req, res) => {
  try {
    if (!fs.existsSync(YEDEK_DIR)) fs.mkdirSync(YEDEK_DIR, { recursive: true });
    const ad = `manuel-${getLocalDateString()}-${Date.now()}.db`;
    fs.writeFileSync(path.join(YEDEK_DIR, ad), Buffer.from(db.export()));
    islemKaydet(kullaniciAdi(req), 'yedek-al', ad);
    res.json({ success: true, dosya: ad, message: 'Yedek alındı.' });
  } catch (err) {
    console.error('Yedek alma hatası:', err);
    res.status(500).json({ error: 'Yedek alınamadı.' });
  }
});

app.get('/api/yedek/indir', rolGerekli('admin'), (req, res) => {
  try {
    const dosya = path.basename(String(req.query.dosya || ''));
    const tam = path.join(YEDEK_DIR, dosya);
    if (!dosya || !fs.existsSync(tam)) return res.status(404).json({ error: 'Yedek bulunamadı.' });
    res.download(tam, dosya);
  } catch (err) {
    console.error('Yedek indirme hatası:', err);
    res.status(500).json({ error: 'Yedek indirilemedi.' });
  }
});

app.post('/api/yedek/yukle', rolGerekli('admin'), express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
  try {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 100) {
      return res.status(400).json({ error: 'Geçersiz yedek dosyası.' });
    }
    if (!buf.slice(0, 15).toString('latin1').startsWith('SQLite format 3')) {
      return res.status(400).json({ error: 'Bu dosya geçerli bir veritabanı yedeği değil.' });
    }
    if (!fs.existsSync(YEDEK_DIR)) fs.mkdirSync(YEDEK_DIR, { recursive: true });
    // Geri yükleme öncesi mevcut durumu kurtarma yedeği olarak sakla
    fs.writeFileSync(path.join(YEDEK_DIR, `geri-yukleme-oncesi-${Date.now()}.db`), Buffer.from(db.export()));
    try { db.close(); } catch (e) {}
    const SQL = await initSqlJs();
    db = new SQL.Database(buf);
    saveDatabase();
    islemKaydet(kullaniciAdi(req), 'yedek-yukle', `${buf.length} bayt`);
    res.json({ success: true, message: 'Yedek başarıyla geri yüklendi. Sayfayı yenileyin.' });
  } catch (err) {
    console.error('Yedek yükleme hatası:', err);
    res.status(500).json({ error: 'Yedek yüklenemedi: ' + err.message });
  }
});

// ─── MESAJ GEÇMİŞİ & DENETİM İZİ ────────────────────────────────────
app.get('/api/mesajlar', rolGerekli('admin'), (req, res) => {
  try {
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit, 10) || 100));
    res.json(queryAll('SELECT * FROM mesaj_log ORDER BY id DESC LIMIT ?', [limit]));
  } catch (err) {
    console.error('Mesaj geçmişi hatası:', err);
    res.status(500).json({ error: 'Mesaj geçmişi yüklenemedi.' });
  }
});

app.get('/api/loglar', rolGerekli('admin'), (req, res) => {
  try {
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit, 10) || 100));
    res.json(queryAll('SELECT * FROM islem_log ORDER BY id DESC LIMIT ?', [limit]));
  } catch (err) {
    console.error('İşlem logu hatası:', err);
    res.status(500).json({ error: 'İşlem kayıtları yüklenemedi.' });
  }
});

// ─── KULLANICI / ROL YÖNETİMİ ───────────────────────────────────────
app.get('/api/kullanicilar', rolGerekli('admin'), (req, res) => {
  try {
    res.json(queryAll('SELECT id, kullanici, rol, aktif, created_at FROM kullanicilar ORDER BY id'));
  } catch (err) {
    res.status(500).json({ error: 'Kullanıcılar yüklenemedi.' });
  }
});

app.post('/api/kullanicilar', rolGerekli('admin'), (req, res) => {
  try {
    const { kullanici, sifre, rol } = req.body || {};
    const k = String(kullanici || '').trim();
    if (k.length < 3 || k.length > 30) return res.status(400).json({ error: 'Kullanıcı adı 3-30 karakter olmalıdır.' });
    if (String(sifre || '').length < 4) return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır.' });
    if (queryOne('SELECT id FROM kullanicilar WHERE kullanici = ?', [k])) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten mevcut.' });
    }
    const rolT = kullaniciSayisi() === 0 ? 'admin' : (['admin', 'personel'].includes(rol) ? rol : 'personel');
    runSql('INSERT INTO kullanicilar (kullanici, sifre_hash, rol) VALUES (?, ?, ?)', [k, sifreHash(sifre), rolT]);
    islemKaydet(kullaniciAdi(req), 'kullanici-ekle', `${k} (${rolT})`);
    res.json({
      success: true,
      ilkKullanici: kullaniciSayisi() === 1,
      message: 'Kullanıcı eklendi.'
    });
  } catch (err) {
    console.error('Kullanıcı ekleme hatası:', err);
    res.status(500).json({ error: 'Kullanıcı eklenemedi.' });
  }
});

app.put('/api/kullanicilar/:id', rolGerekli('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const u = queryOne('SELECT * FROM kullanicilar WHERE id = ?', [id]);
    if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const { sifre, rol, aktif } = req.body || {};
    if (sifre !== undefined) {
      if (String(sifre).length < 4) return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır.' });
      runSql('UPDATE kullanicilar SET sifre_hash = ? WHERE id = ?', [sifreHash(sifre), id]);
    }
    if (rol !== undefined && ['admin', 'personel'].includes(rol)) {
      runSql('UPDATE kullanicilar SET rol = ? WHERE id = ?', [rol, id]);
    }
    if (aktif !== undefined) runSql('UPDATE kullanicilar SET aktif = ? WHERE id = ?', [aktif ? 1 : 0, id]);
    islemKaydet(kullaniciAdi(req), 'kullanici-guncelle', u.kullanici);
    res.json({ success: true, message: 'Kullanıcı güncellendi.' });
  } catch (err) {
    console.error('Kullanıcı güncelleme hatası:', err);
    res.status(500).json({ error: 'Kullanıcı güncellenemedi.' });
  }
});

app.delete('/api/kullanicilar/:id', rolGerekli('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const u = queryOne('SELECT * FROM kullanicilar WHERE id = ?', [id]);
    if (!u) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    const adminSay = queryOne("SELECT COUNT(*) AS c FROM kullanicilar WHERE rol = 'admin' AND aktif = 1");
    if (u.rol === 'admin' && adminSay && adminSay.c <= 1) {
      return res.status(400).json({ error: 'Son yönetici silinemez.' });
    }
    runSql('DELETE FROM kullanicilar WHERE id = ?', [id]);
    islemKaydet(kullaniciAdi(req), 'kullanici-sil', u.kullanici);
    res.json({ success: true, message: 'Kullanıcı silindi.' });
  } catch (err) {
    console.error('Kullanıcı silme hatası:', err);
    res.status(500).json({ error: 'Kullanıcı silinemedi.' });
  }
});

// Sağlık kontrolü
app.get('/api/health', (req, res) => {
  res.json({ ok: true, zaman: new Date().toISOString() });
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────
async function gracefulShutdown() {
  console.log('\n  💾 Veritabanı kaydediliyor...');
  kapaniyor = true;
  clearReconnect();
  if (saveInterval) clearInterval(saveInterval);
  saveDatabase();
  if (waClient) {
    console.log('  📱 WhatsApp kapatılıyor...');
    await waClient.destroy().catch(() => {});
  }
  console.log('  ✅ Her şey kaydedildi. Güle güle!');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ─── TARAYICIYI AÇ (baslat.bat OPEN_BROWSER=1 verir) ────────────────
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      // 'start' bir cmd komutudur; boş başlık ("") şart.
      exec(`start "" "${url}"`, { shell: 'cmd.exe', windowsHide: true });
    } else if (process.platform === 'darwin') {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
    console.log(`  🌐 Tarayıcı açılıyor: ${url}`);
  } catch (err) {
    console.error('  ⚠️  Tarayıcı açılamadı:', err.message);
  }
}

// ─── SUNUCUYU BAŞLAT ─────────────────────────────────────────────────
initDatabase().then(() => {
  const server = app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════╗');
    console.log('  ║   🔥 Emanet Lahmacun/Pide Takip Sistemi Aktif!           ║');
    console.log(`  ║   📍 http://localhost:${PORT}`);
    console.log('  ║   💾 Veritabanı: emanet.db                               ║');
    console.log('  ╠══════════════════════════════════════════════════════════╣');
    console.log('  ║   📱 WhatsApp bağlantısı başlatılıyor...                 ║');
    console.log('  ║   🌐 Tarayıcıda QR kodu görünecek, telefondan okutun.   ║');
    console.log('  ╚══════════════════════════════════════════════════════════╝');
    console.log('');

    console.log(`  🔒 Sunucu adresi: ${HOST}:${PORT}`);
    if (AUTH_ENABLED) {
      console.log('  🔐 Şifre koruması: AKTİF');
    } else if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
      console.log('  ⚠️  Şifre koruması kapalı ve sunucu ağa açık! Güvenlik için .env içine APP_PASSWORD ekleyin.');
    }

    // Tarayıcıyı aç (baslat.bat OPEN_BROWSER=1 ile başlatır)
    if (process.env.OPEN_BROWSER === '1') {
      openBrowser(`http://localhost:${PORT}`);
    }

    // WhatsApp'ı sunucu başladıktan sonra başlat
    initWhatsApp();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('');
      console.error(`  ❌ ${PORT} portu zaten kullanımda!`);
      console.error('     Başka bir kopya çalışıyor olabilir veya port başka bir program tarafından kullanılıyor.');
      console.error('     Çözüm: .env dosyasına PORT=3001 yazıp tekrar deneyin.');
      console.error('');
    } else {
      console.error('  ❌ Sunucu başlatılamadı:', err.message);
    }
    process.exit(1);
  });
}).catch(err => {
  console.error('Veritabanı başlatılamadı:', err);
  process.exit(1);
});

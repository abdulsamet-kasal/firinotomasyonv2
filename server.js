const express = require('express');
const initSqlJs = require('sql.js');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'emanet.db');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── SQLite Veritabanı (sql.js) ─────────────────────────────────────
let db;

function saveDatabase() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('DB kaydetme hatası:', err);
  }
}

let saveInterval;

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
      giris_zamani DATETIME DEFAULT (datetime('now', 'localtime')),
      cikis_zamani DATETIME,
      created_date DATE DEFAULT (date('now', 'localtime'))
    )
  `);
  saveDatabase();
  saveInterval = setInterval(saveDatabase, 10000);
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

// ═══════════════════════════════════════════════════════════════════════
//  WHATSAPP WEB.JS ENTEGRASYONU
// ═══════════════════════════════════════════════════════════════════════

let waClient = null;
let waStatus = 'initializing'; // initializing | qr | connected | disconnected | error
let waQrDataUrl = null;
let waInfo = null;
let waErrorMessage = null;
let waDetectedBrowser = null;

// Sistemde kurulu Chromium tabanlı tarayıcıyı (Chrome / Edge / Brave) bul
function getBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const candidates = [
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
    ];

    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        return p;
      }
    }
  } else if (process.platform === 'linux') {
    const linuxCandidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];
    for (const p of linuxCandidates) {
      if (fs.existsSync(p)) return p;
    }
  } else if (process.platform === 'darwin') {
    const macCandidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    ];
    for (const p of macCandidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

function initWhatsApp() {
  console.log('  📱 WhatsApp başlatılıyor...');
  waStatus = 'initializing';
  waErrorMessage = null;

  const browserPath = getBrowserExecutablePath();
  waDetectedBrowser = browserPath ? path.basename(browserPath) : 'Puppeteer Varsayılan';

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

  if (browserPath) {
    console.log(`  🌐 Tarayıcı otomatik algılandı: ${browserPath}`);
    puppeteerConfig.executablePath = browserPath;
  } else {
    console.log('  ⚠️ Sistemde Chrome/Edge bulunamadı, Puppeteer varsayılanı denenecek...');
  }

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
    waInfo = waClient.info;
    const numara = waInfo?.wid?.user || 'Bilinmiyor';
    console.log(`  ✅ WhatsApp bağlandı! Numara: ${numara}`);
  });

  // Kimlik doğrulandı (QR tekrar gerekmez)
  waClient.on('authenticated', () => {
    console.log('  🔐 WhatsApp oturumu doğrulandı (kayıtlı oturum).');
  });

  // Kimlik doğrulama hatası
  waClient.on('auth_failure', (msg) => {
    waStatus = 'error';
    waErrorMessage = 'Kimlik doğrulama hatası: ' + msg;
    console.error('  ❌ WhatsApp kimlik doğrulama hatası:', msg);
  });

  // Bağlantı kesildi
  waClient.on('disconnected', (reason) => {
    waStatus = 'disconnected';
    waInfo = null;
    waErrorMessage = 'Bağlantı kesildi: ' + reason;
    console.log('  ⚠️  WhatsApp bağlantısı kesildi:', reason);
  });

  waClient.initialize().catch(err => {
    waStatus = 'error';
    waErrorMessage = err.message;
    console.error('  ❌ WhatsApp başlatılamadı:', err.message);
    if (!browserPath) {
      console.log('  💡 Puppeteer/Chromium veya Google Chrome / Microsoft Edge kurulu olduğundan emin olun.');
    }
  });
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

// WhatsApp mesaj gönder
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { telefon, mesaj } = req.body;

    if (!telefon || !mesaj) {
      return res.status(400).json({ error: 'Telefon ve mesaj zorunludur.' });
    }

    if (waStatus !== 'connected' || !waClient) {
      return res.status(400).json({
        error: 'WhatsApp bağlı değil!',
        status: waStatus
      });
    }

    // Telefon numarasını temizle (sadece rakamlar)
    let cleanPhone = telefon.toString().replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
    if (!cleanPhone.startsWith('90')) cleanPhone = '90' + cleanPhone;

    console.log(`  🔍 WhatsApp alıcı hazırlanıyor: +${cleanPhone}...`);

    let targetChatId = `${cleanPhone}@c.us`;

    console.log(`  📤 Mesaj gönderiliyor → ${targetChatId}`);
    const sentMsg = await waClient.sendMessage(targetChatId, mesaj, {
      waitUntilMsgSent: true
    });

    if (!sentMsg) {
      console.error(`  ❌ Mesaj iletilemedi: ${cleanPhone}`);
      return res.status(400).json({
        error: `WhatsApp mesajı iletemedi. Numara (+${cleanPhone}) WhatsApp'ta kayıtlı olmayabilir.`
      });
    }

    const msgId = sentMsg.id?._serialized || sentMsg.id?.id || 'OK';
    console.log(`  ✅ Mesaj başarıyla iletildi → +${cleanPhone} (Ack: ${sentMsg.ack || 1})`);
    res.json({ success: true, message: 'Mesaj başarıyla gönderildi!', messageId: msgId });
  } catch (err) {
    console.error('  ❌ Mesaj gönderme hatası:', err);
    res.status(500).json({ error: 'Mesaj gönderilemedi: ' + err.message });
  }
});

// WhatsApp yeniden bağlan
app.post('/api/whatsapp/reconnect', async (req, res) => {
  try {
    if (waClient) {
      await waClient.destroy().catch(() => {});
    }
    waStatus = 'initializing';
    waQrDataUrl = null;
    waInfo = null;
    waErrorMessage = null;
    setTimeout(() => {
      initWhatsApp();
    }, 1000);
    res.json({ success: true, message: 'WhatsApp yeniden başlatılıyor...' });
  } catch (err) {
    res.status(500).json({ error: 'Yeniden bağlanma hatası: ' + err.message });
  }
});

// WhatsApp bağlantısını kes (Logout)
app.post('/api/whatsapp/logout', async (req, res) => {
  try {
    if (waClient) {
      if (waStatus === 'connected') {
        await waClient.logout().catch(() => {});
      }
      await waClient.destroy().catch(() => {});
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
    const { musteri_adi, telefon, urun_turu } = req.body;
    if (!musteri_adi || !telefon || !urun_turu) {
      return res.status(400).json({ error: 'Tüm alanlar zorunludur.' });
    }
    const telefonTemiz = telefon.replace(/\s/g, '');
    if (!/^\d{10}$/.test(telefonTemiz)) {
      return res.status(400).json({ error: 'Telefon numarası 10 hane olmalıdır (başında 0 olmadan).' });
    }
    runSql(`INSERT INTO siparisler (musteri_adi, telefon, urun_turu) VALUES (?, ?, ?)`,
      [musteri_adi.trim(), telefonTemiz, urun_turu]);
    const row = queryOne('SELECT MAX(id) as id FROM siparisler');
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
    const id = parseInt(req.params.id);
    const { adet } = req.body;
    if (!adet || adet < 1) {
      return res.status(400).json({ error: 'Geçerli bir adet giriniz.' });
    }
    const siparis = queryOne('SELECT * FROM siparisler WHERE id = ?', [id]);
    if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    if (siparis.durum !== 'Fırında') return res.status(400).json({ error: 'Bu sipariş zaten tamamlanmış.' });

    runSql(`UPDATE siparisler SET durum = 'Tamamlandı', adet = ?, cikis_zamani = datetime('now', 'localtime') WHERE id = ?`, [adet, id]);
    const guncellenmis = queryOne('SELECT * FROM siparisler WHERE id = ?', [id]);
    res.json({ success: true, siparis: guncellenmis, message: 'Sipariş tamamlandı.' });
  } catch (err) {
    console.error('Sipariş tamamlama hatası:', err);
    res.status(500).json({ error: 'Sipariş tamamlanırken hata oluştu.' });
  }
});

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 4) Günlük rapor
app.get('/api/rapor/gunluk', (req, res) => {
  try {
    const bugun = getLocalDateString();

    const urunRapor = queryAll(`
      SELECT urun_turu, SUM(adet) as toplam_adet, COUNT(*) as siparis_sayisi
      FROM siparisler WHERE durum = 'Tamamlandı' AND created_date = ?
      GROUP BY urun_turu`, [bugun]);

    const toplamRow = queryOne(`
      SELECT COALESCE(SUM(adet), 0) as toplam_adet, COUNT(*) as toplam_siparis
      FROM siparisler WHERE durum = 'Tamamlandı' AND created_date = ?`, [bugun]);

    const tamamlananlar = queryAll(`
      SELECT * FROM siparisler WHERE durum = 'Tamamlandı' AND created_date = ?
      ORDER BY cikis_zamani DESC`, [bugun]);

    res.json({ tarih: bugun, urunRapor, toplam: toplamRow, tamamlananlar });
  } catch (err) {
    console.error('Rapor hatası:', err);
    res.status(500).json({ error: 'Rapor yüklenirken hata oluştu.' });
  }
});

// 5) Siparişi sil
app.delete('/api/siparis/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const siparis = queryOne('SELECT * FROM siparisler WHERE id = ?', [id]);
    if (!siparis) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    runSql('DELETE FROM siparisler WHERE id = ?', [id]);
    res.json({ success: true, message: 'Sipariş silindi.' });
  } catch (err) {
    console.error('Sipariş silme hatası:', err);
    res.status(500).json({ error: 'Sipariş silinirken hata oluştu.' });
  }
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────
async function gracefulShutdown() {
  console.log('\n  💾 Veritabanı kaydediliyor...');
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

// ─── SUNUCUYU BAŞLAT ─────────────────────────────────────────────────
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║   🔥 Emanet Lahmacun/Pide Takip Sistemi Aktif!         ║
  ║   📍 http://localhost:${PORT}                             ║
  ║   💾 Veritabanı: emanet.db                              ║
  ╠══════════════════════════════════════════════════════════╣
  ║   📱 WhatsApp bağlantısı başlatılıyor...                ║
  ║   🌐 Tarayıcıda QR kodu görünecek, telefondan okutun.  ║
  ╚══════════════════════════════════════════════════════════╝
    `);

    // WhatsApp'ı sunucu başladıktan sonra başlat
    initWhatsApp();
  });
}).catch(err => {
  console.error('Veritabanı başlatılamadı:', err);
  process.exit(1);
});

// ─── Emanet Lahmacun/Pide Takip Sistemi - Frontend ───────────────────

const API_BASE = '';
let BIRIM_FIYAT = 15;              // TL / adet (genel varsayılan / eski ayar)
let URUNLER = [
  { ad: 'Lahmacun', ikon: '🥙', fiyat: 15 },
  { ad: 'Kıymalı Pide', ikon: '🫓', fiyat: 15 },
  { ad: 'Kaşarlı Pide', ikon: '🧀', fiyat: 15 },
  { ad: 'Karışık Pide', ikon: '🍕', fiyat: 15 },
  { ad: 'Diğer', ikon: '📦', fiyat: 15 }
];
let urunEmoji = {};
let urunFiyatMap = {};             // ürün adı -> birim fiyat
let aktifUrunMap = {};             // sipariş id -> ürün adı (tutar hesabı için)

// ─── OTURUM / GÜN DURUMU ────────────────────────────────────────────
let sessionAktif = false;
let gunAktif = false;
let refreshTimer = null;
let oncekiAktifSayi = null;
let raporVerisi = null;
let raporModu = 'gunluk';
let audioCtx = null;

// ─── API SARMALAYICI (401 → giriş ekranı) ───────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    girisEkraniGoster();
    throw new Error('UNAUTHORIZED');
  }
  return res;
}

// ─── KİMLİK DOĞRULAMA ARAYÜZÜ ───────────────────────────────────────
function girisEkraniGoster() {
  const el = document.getElementById('login-overlay');
  if (el) el.classList.remove('hidden');
}

function girisEkraniGizle() {
  const el = document.getElementById('login-overlay');
  if (el) el.classList.add('hidden');
}

// Aktif kullanıcının rolü (personel ise finans/ayar bölümleri gizlenir)
let ROL = 'admin';

function uygulaRol() {
  const adminMi = ROL === 'admin';
  ['tab-kasa', 'tab-karlilik'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !adminMi);
  });
  ['ayar-kullanicilar-kutu', 'ayar-yedek-kutu', 'ayar-log-kutu'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !adminMi);
  });
  const aktif = document.querySelector('main > div:not(.hidden)');
  if (!adminMi && aktif && ['panel-kasa', 'panel-karlilik'].includes(aktif.id)) switchTab('main');
}

async function girisYap() {
  const kullaniciEl = document.getElementById('login-kullanici');
  const input = document.getElementById('login-sifre');
  const hata = document.getElementById('login-hata');
  if (hata) hata.classList.add('hidden');
  const govde = { sifre: input ? input.value : '' };
  if (kullaniciEl && !kullaniciEl.classList.contains('hidden')) govde.kullanici = kullaniciEl.value.trim();
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde)
    });
    const data = await res.json();
    if (data.success) {
      ROL = data.rol || 'admin';
      uygulaRol();
      girisEkraniGizle();
      if (input) input.value = '';
      if (kullaniciEl) kullaniciEl.value = '';
      await baslangicAkisi();
    } else {
      if (hata) { hata.textContent = data.error || 'Giriş başarısız.'; hata.classList.remove('hidden'); }
    }
  } catch (err) {
    if (hata) { hata.textContent = 'Sunucu bağlantı hatası.'; hata.classList.remove('hidden'); }
  }
}

async function authKontrol() {
  try {
    const res = await fetch(`${API_BASE}/api/auth-durum`);
    const data = await res.json();
    ROL = data.rol || 'admin';
    const kullaniciEl = document.getElementById('login-kullanici');
    if (kullaniciEl) kullaniciEl.classList.toggle('hidden', !data.kullaniciGerekli);
    const aciklama = document.getElementById('login-aciklama');
    if (aciklama) aciklama.textContent = data.kullaniciGerekli
      ? 'Kullanıcı adı ve şifrenizle giriş yapın.'
      : 'Bu sistem şifre ile korunuyor.';
    if (data.authRequired && !data.authorized) {
      girisEkraniGoster();
      return false;
    }
    girisEkraniGizle();
    uygulaRol();
    return true;
  } catch (err) {
    return true; // sunucu yoksa normal akış devam etsin
  }
}

// ─── WHATSAPP DURUM TAKİBİ ─────────────────────────────────────────
let waConnected = false;
let waPollingInterval = null;

async function whatsappDurumKontrol() {
  try {
    const res = await apiFetch(`${API_BASE}/api/whatsapp/status`);
    const data = await res.json();

    const stateInit = document.getElementById('wa-state-init');
    const stateQr = document.getElementById('wa-state-qr');
    const stateConnected = document.getElementById('wa-state-connected');
    const stateError = document.getElementById('wa-state-error');
    const badgeDot = document.getElementById('wa-badge-dot');
    const badgeText = document.getElementById('wa-badge-text');
    const baslatUyari = document.getElementById('wa-baslat-uyari');
    const btnLogout = document.getElementById('btn-wa-logout');

    // Hepsini gizle
    stateInit.classList.add('hidden');
    stateQr.classList.add('hidden');
    stateConnected.classList.add('hidden');
    stateError.classList.add('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');

    switch (data.status) {
      case 'initializing':
        stateInit.classList.remove('hidden');
        badgeDot.className = 'w-2.5 h-2.5 bg-amber-400 rounded-full live-pulse';
        badgeText.textContent = 'WA Başlatılıyor';
        badgeText.className = 'text-amber-400 text-sm font-medium';
        baslatUyari?.classList.add('hidden');
        waConnected = false;
        break;

      case 'qr':
        stateQr.classList.remove('hidden');
        if (data.qr) {
          document.getElementById('wa-qr-img').src = data.qr;
        }
        badgeDot.className = 'w-2.5 h-2.5 bg-amber-400 rounded-full live-pulse';
        badgeText.textContent = 'QR Bekliyor';
        badgeText.className = 'text-amber-400 text-sm font-medium';
        baslatUyari?.classList.remove('hidden');
        waConnected = false;
        break;

      case 'connected':
        stateConnected.classList.remove('hidden');
        const infoText = data.info?.name
          ? `${data.info.name} (+90${data.info.number})`
          : `+90${data.info?.number || ''}`;
        document.getElementById('wa-connected-info').textContent = infoText;
        badgeDot.className = 'w-2.5 h-2.5 bg-wa-500 rounded-full';
        badgeText.textContent = `WA Bağlı`;
        badgeText.className = 'text-wa-500 text-sm font-medium';
        baslatUyari?.classList.add('hidden');
        if (btnLogout) btnLogout.classList.remove('hidden');
        waConnected = true;
        break;

      case 'disconnected':
        stateError.classList.remove('hidden');
        const errDiscEl = document.getElementById('wa-error-text');
        if (errDiscEl) {
          if (data.error) {
            errDiscEl.textContent = data.error;
            errDiscEl.classList.remove('hidden');
          } else {
            errDiscEl.classList.add('hidden');
          }
        }
        badgeDot.className = 'w-2.5 h-2.5 bg-red-400 rounded-full live-pulse';
        badgeText.textContent = 'WA Yeniden Bağlanıyor';
        badgeText.className = 'text-red-400 text-sm font-medium';
        baslatUyari?.classList.remove('hidden');
        waConnected = false;
        break;

      case 'error':
        stateError.classList.remove('hidden');
        const errEl = document.getElementById('wa-error-text');
        if (errEl) {
          if (data.error) {
            errEl.textContent = data.error;
            errEl.classList.remove('hidden');
          } else {
            errEl.classList.add('hidden');
          }
        }
        badgeDot.className = 'w-2.5 h-2.5 bg-red-400 rounded-full';
        badgeText.textContent = 'WA Hata';
        badgeText.className = 'text-red-400 text-sm font-medium';
        baslatUyari?.classList.remove('hidden');
        waConnected = false;
        break;
    }
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('WA durum kontrolü hatası:', err);
  }
}

async function whatsappOturumuKapat() {
  if (!confirm('WhatsApp bağlantısını kesmek ve oturumu kapatmak istediğinize emin misiniz?')) return;
  showToast('Bağlantı kesiliyor...', 'info');
  try {
    const res = await apiFetch(`${API_BASE}/api/whatsapp/logout`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('WhatsApp bağlantısı kesildi ve oturum temizlendi!', 'success');
      whatsappDurumKontrol();
    } else {
      showToast(data.error || 'Bağlantı kesilemedi!', 'error');
    }
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Bağlantı kesme hatası oluştu!', 'error');
  }
}

async function whatsappYenidenBaglan() {
  showToast('WhatsApp yeniden bağlanıyor...', 'info');
  try {
    await apiFetch(`${API_BASE}/api/whatsapp/reconnect`, { method: 'POST' });
    setTimeout(whatsappDurumKontrol, 2000);
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Yeniden bağlanma hatası!', 'error');
  }
}

// WhatsApp durumunu her 3 saniyede kontrol et
function startWaPolling() {
  whatsappDurumKontrol();
  if (waPollingInterval) clearInterval(waPollingInterval);
  waPollingInterval = setInterval(whatsappDurumKontrol, 3000);
}

// ─── AYARLAR (birim fiyat & ürünler) ────────────────────────────────
let AYARLAR = {};

async function ayarlariYukle() {
  try {
    const res = await apiFetch(`${API_BASE}/api/ayarlar`);
    const data = await res.json();
    AYARLAR = data || {};
    if (typeof data.birim_fiyat === 'number') BIRIM_FIYAT = data.birim_fiyat;
    if (Array.isArray(data.urunler) && data.urunler.length > 0) URUNLER = data.urunler;
    urunHaritasiniKur();
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Ayarlar yüklenemedi:', err);
  }
}

// Ürün emoji + fiyat haritalarını kur
function urunHaritasiniKur() {
  urunEmoji = {};
  urunFiyatMap = {};
  URUNLER.forEach((u) => {
    urunEmoji[u.ad] = u.ikon || '📦';
    urunFiyatMap[u.ad] = (typeof u.fiyat === 'number' && u.fiyat >= 0) ? u.fiyat : BIRIM_FIYAT;
  });
  seciliUrunFiyatiniGuncelle();
}

// Bir ürünün güncel birim fiyatı
function urunBirimFiyat(ad) {
  return typeof urunFiyatMap[ad] === 'number' ? urunFiyatMap[ad] : BIRIM_FIYAT;
}

// Formda seçili ürünün fiyatını göster
function seciliUrunFiyatiniGuncelle() {
  const el = document.getElementById('form-birim-fiyat');
  if (!el) return;
  const sec = document.getElementById('urun-turu');
  const ad = sec ? sec.value : '';
  el.textContent = (ad && urunFiyatMap[ad] !== undefined) ? `${urunBirimFiyat(ad)} ₺` : '— ₺';
}

function urunSecenekleriniDoldur() {
  const select = document.getElementById('urun-turu');
  if (!select) return;
  const mevcut = select.value;
  select.innerHTML = '';
  const ilk = document.createElement('option');
  ilk.value = '';
  ilk.disabled = true;
  ilk.selected = true;
  ilk.textContent = 'Ürün seçiniz...';
  select.appendChild(ilk);
  URUNLER.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u.ad;
    opt.textContent = `${u.ikon || '📦'} ${u.ad}`;
    select.appendChild(opt);
  });
  if (URUNLER.some((u) => u.ad === mevcut)) select.value = mevcut;
  seciliUrunFiyatiniGuncelle();
}

function ayarModalAc() {
  const liste = document.getElementById('ayar-urunler-list');
  liste.innerHTML = '';
  URUNLER.forEach((u) => ayarUrunSatiriEkle(u.ikon, u.ad, u.fiyat));
  // İşletme & bildirim alanları
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('ayar-isletme-adi', AYARLAR.isletme_adi || 'Fırın');
  set('ayar-sahip-telefon', AYARLAR.sahip_telefon || '');
  set('ayar-hazirlik-dk', AYARLAR.hazirlik_dk || 15);
  set('ayar-mesaj-sablonu', AYARLAR.mesaj_sablonu || '');
  const kritik = document.getElementById('ayar-kritik-uyari');
  if (kritik) kritik.checked = AYARLAR.kritik_uyari !== false;
  const oto = document.getElementById('ayar-oto-cevap');
  if (oto) oto.checked = AYARLAR.oto_cevap !== false;

  const modal = document.getElementById('settings-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (ROL === 'admin') { kullanicilariYukle(); yedekleriYukle(); loglariYukle(); }
}

function ayarModalKapat() {
  const modal = document.getElementById('settings-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function ayarUrunSatiriEkle(ikon = '', ad = '', fiyat = BIRIM_FIYAT) {
  const liste = document.getElementById('ayar-urunler-list');
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2';

  const ikonInp = document.createElement('input');
  ikonInp.type = 'text';
  ikonInp.className = 'ayar-ikon w-14 px-2 py-2.5 bg-dark-800 border border-dark-600/50 rounded-lg text-center text-lg';
  ikonInp.maxLength = 4;
  ikonInp.value = ikon || '';
  ikonInp.placeholder = '📦';

  const adInp = document.createElement('input');
  adInp.type = 'text';
  adInp.className = 'ayar-ad flex-1 min-w-0 px-3 py-2.5 bg-dark-800 border border-dark-600/50 rounded-lg text-gray-100';
  adInp.maxLength = 40;
  adInp.value = ad || '';
  adInp.placeholder = 'Ürün adı';

  const fiyatWrap = document.createElement('div');
  fiyatWrap.className = 'relative flex-shrink-0';
  const fiyatInp = document.createElement('input');
  fiyatInp.type = 'number';
  fiyatInp.className = 'ayar-fiyat w-24 px-2 py-2.5 pr-7 bg-dark-800 border border-dark-600/50 rounded-lg text-gray-100 text-right';
  fiyatInp.min = '0';
  fiyatInp.step = '0.5';
  fiyatInp.value = (typeof fiyat === 'number' && fiyat >= 0) ? fiyat : BIRIM_FIYAT;
  const birim = document.createElement('span');
  birim.className = 'absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 text-sm pointer-events-none';
  birim.textContent = '₺';
  fiyatWrap.appendChild(fiyatInp);
  fiyatWrap.appendChild(birim);

  const sil = document.createElement('button');
  sil.type = 'button';
  sil.className = 'btn-press w-10 h-10 flex-shrink-0 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400';
  sil.textContent = '✕';
  sil.addEventListener('click', () => row.remove());

  row.appendChild(ikonInp);
  row.appendChild(adInp);
  row.appendChild(fiyatWrap);
  row.appendChild(sil);
  liste.appendChild(row);
}

async function ayarlariKaydet() {
  const satirlar = Array.from(document.querySelectorAll('#ayar-urunler-list > div'));
  const urunler = [];
  satirlar.forEach((r) => {
    const ad = r.querySelector('.ayar-ad').value.trim();
    if (!ad) return;
    const f = parseFloat(r.querySelector('.ayar-fiyat').value);
    urunler.push({
      ikon: r.querySelector('.ayar-ikon').value.trim() || '📦',
      ad,
      fiyat: Number.isFinite(f) && f >= 0 ? f : BIRIM_FIYAT
    });
  });

  if (urunler.length === 0) {
    showToast('En az bir ürün eklemelisiniz!', 'warning');
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE}/api/ayarlar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urunler,
        isletme_adi: document.getElementById('ayar-isletme-adi').value.trim(),
        sahip_telefon: document.getElementById('ayar-sahip-telefon').value.trim(),
        hazirlik_dk: parseInt(document.getElementById('ayar-hazirlik-dk').value, 10) || 15,
        kritik_uyari: document.getElementById('ayar-kritik-uyari').checked,
        oto_cevap: document.getElementById('ayar-oto-cevap').checked,
        mesaj_sablonu: document.getElementById('ayar-mesaj-sablonu').value
      })
    });
    const data = await res.json();
    if (data.success) {
      AYARLAR = data;
      BIRIM_FIYAT = data.birim_fiyat;
      URUNLER = data.urunler;
      urunHaritasiniKur();
      urunSecenekleriniDoldur();
      ayarModalKapat();
      showToast('Ayarlar kaydedildi. ✅', 'success');
      aktifSiparisleriYukle();
      if (raporVerisi) raporYukle(raporModu);
    } else {
      showToast(data.error || 'Ayarlar kaydedilemedi!', 'error');
    }
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

// ─── GÜN OTURUMU ────────────────────────────────────────────────────
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function gunuBaslat(sessiz = false) {
  sessionAktif = true;
  gunAktif = true;
  localStorage.setItem('emanet_gun', localDateStr());

  const overlay = document.getElementById('start-overlay');
  overlay.classList.remove('overlay-enter');
  overlay.classList.add('overlay-exit');
  setTimeout(() => { overlay.style.display = 'none'; }, 300);

  document.getElementById('btn-gun-durdur').classList.remove('hidden');
  document.getElementById('btn-gun-durdur').classList.add('flex');
  document.getElementById('session-indicator').classList.remove('hidden');
  document.getElementById('session-indicator').classList.add('flex');

  const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('session-start-time').textContent = saat + "'den beri";

  // Ses uyarısı için AudioContext'i kullanıcı etkileşimiyle hazırla
  try {
    if (!audioCtx && window.AudioContext) audioCtx = new AudioContext();
  } catch (e) {}

  if (!sessiz) {
    if (waConnected) {
      showToast('Günaydın! Sistem ve WhatsApp aktif. Hayırlı işler! ☀️', 'success');
    } else {
      showToast('Sistem başlatıldı. WhatsApp bağlanınca mesajlar otomatik gidecek.', 'warning');
    }
  }

  aktifSiparisleriYukle();
  gunlukIstatistikleriGuncelle();
  otomatikYenilemeyiBaslat();
}

async function gunuDurdur() {
  try {
    const res = await apiFetch(`${API_BASE}/api/siparisler/aktif`);
    const aktifler = await res.json();
    if (aktifler.length > 0) {
      if (!confirm(`Dikkat! Hâlâ fırında ${aktifler.length} aktif sipariş var.\n\nYine de günü kapatmak istiyor musunuz?`)) return;
    }
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return;
  }

  if (!confirm('Günü kapatmak ve gün sonu PDF raporunu indirmek istediğinize emin misiniz?')) return;

  showToast('Gün sonu raporu hazırlanıyor... 📄', 'info');
  await pdfIndir(true);

  sessionAktif = false;
  gunAktif = false;
  localStorage.removeItem('emanet_gun');
  otomatikYenilemeyiDurdur();

  const overlay = document.getElementById('start-overlay');
  overlay.style.display = 'flex';
  overlay.classList.remove('overlay-exit');
  overlay.classList.add('overlay-enter');

  document.getElementById('btn-gun-durdur').classList.add('hidden');
  document.getElementById('btn-gun-durdur').classList.remove('flex');
  document.getElementById('session-indicator').classList.add('hidden');
  document.getElementById('session-indicator').classList.remove('flex');

  showToast('Gün kapatıldı. Hayırlı akşamlar! 🌙', 'success');
}

function oturumGeriYukle() {
  if (localStorage.getItem('emanet_gun') === localDateStr()) {
    gunuBaslat(true);
  }
}

// ─── OTOMATİK YENİLEME ─────────────────────────────────────────────
function otomatikYenilemeyiBaslat() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!gunAktif) return;
    aktifSiparisleriYukle();
    gunlukIstatistikleriGuncelle();
  }, 30000);
}

function otomatikYenilemeyiDurdur() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// ─── TOAST ──────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600/90 border-emerald-500/50',
    error: 'bg-red-600/90 border-red-500/50',
    info: 'bg-sky-600/90 border-sky-500/50',
    warning: 'bg-amber-600/90 border-amber-500/50'
  };
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.className = `toast-enter flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-sm shadow-2xl ${colors[type]} text-white font-medium min-w-[280px]`;
  toast.innerHTML = `<span class="text-lg">${icons[type]}</span><span class="flex-1"></span>`;
  // Kullanıcı verisini HTML olarak değil, metin olarak yaz (XSS koruması)
  toast.querySelector('span.flex-1').textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── SES UYARISI ────────────────────────────────────────────────────
function kisaBip() {
  try {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {}
}

// ─── SAAT ────────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ─── TAB SİSTEMİ ────────────────────────────────────────────────────
function switchTab(tab) {
  ['main', 'report', 'stok', 'kasa', 'karlilik'].forEach(t => {
    const panel = document.getElementById(`panel-${t}`);
    const btn = document.getElementById(`tab-${t}`);
    if (!panel || !btn) return;
    if (t === tab) {
      panel.classList.remove('hidden');
      btn.classList.add('tab-active', 'bg-dark-800', 'text-fire-400');
      btn.classList.remove('text-dark-400');
    } else {
      panel.classList.add('hidden');
      btn.classList.remove('tab-active', 'bg-dark-800', 'text-fire-400');
      btn.classList.add('text-dark-400');
    }
  });
  if (tab === 'report') raporYukle(raporModu);
  if (tab === 'stok') { stokYukle(); hareketleriYukle(); receteleriYukle(); }
  if (tab === 'kasa') kasaYukle();
  if (tab === 'karlilik') karlilikYukle();
}

// ─── TELEFON FORMATLAMA ──────────────────────────────────────────────
document.getElementById('telefon').addEventListener('input', function (e) {
  let val = e.target.value.replace(/\D/g, '');
  if (val.startsWith('0')) val = val.substring(1);
  if (val.length > 10) val = val.substring(0, 10);
  let formatted = '';
  for (let i = 0; i < val.length; i++) {
    if (i === 3 || i === 6 || i === 8) formatted += ' ';
    formatted += val[i];
  }
  e.target.value = formatted;
});

// ─── SİPARİŞ KAYDETME ───────────────────────────────────────────────
document.getElementById('siparis-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!gunAktif) { showToast('Gün kapatılmış. Önce "GÜNÜ BAŞLAT" ile başlayın.', 'warning'); return; }

  const musteriAdi = document.getElementById('musteri-adi').value.trim();
  const telefonRaw = document.getElementById('telefon').value.replace(/\s/g, '');
  const urunTuru = document.getElementById('urun-turu').value;

  if (!musteriAdi) { showToast('Müşteri adını giriniz!', 'warning'); return; }
  if (!/^\d{10}$/.test(telefonRaw)) { showToast('Telefon numarası 10 hane olmalıdır!', 'error'); return; }
  if (!urunTuru) { showToast('Ürün türü seçiniz!', 'warning'); return; }

  try {
    const res = await apiFetch(`${API_BASE}/api/siparis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ musteri_adi: musteriAdi, telefon: telefonRaw, urun_turu: urunTuru })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${musteriAdi} - ${urunTuru} fırına girdi! 🔥`, 'success');
      document.getElementById('siparis-form').reset();
      document.getElementById('musteri-adi').focus();
      aktifSiparisleriYukle();
    } else {
      showToast(data.error || 'Bir hata oluştu!', 'error');
    }
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
});

// ─── AKTİF SİPARİŞLERİ LİSTELEME ──────────────────────────────────
async function aktifSiparisleriYukle() {
  try {
    const res = await apiFetch(`${API_BASE}/api/siparisler/aktif`);
    const siparisler = await res.json();

    const grid = document.getElementById('siparisler-grid');
    const emptyState = document.getElementById('empty-state');

    // Kullanıcının yazdığı adetleri kaydet (yeniden çizimde silinmesin)
    const adetler = {};
    document.querySelectorAll('#siparisler-grid input[id^="adet-"]').forEach((inp) => {
      if (inp.value !== '') adetler[inp.id] = inp.value;
    });

    document.getElementById('active-count').textContent = siparisler.length;
    document.getElementById('stat-bekleyen').textContent = siparisler.length;

    // Yeni sipariş geldiyse sesli + masaüstü uyar
    if (oncekiAktifSayi !== null && siparisler.length > oncekiAktifSayi) {
      kisaBip();
      maasustuBildirim('🔥 Yeni sipariş girdi', `Fırında ${siparisler.length} sipariş bekliyor.`);
    }
    oncekiAktifSayi = siparisler.length;

    if (siparisler.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    // Kullanıcı adet yazarken listeyi yeniden çizme (focus/yazı kaybolmasın)
    const aktifEl = document.activeElement;
    if (aktifEl && /^adet-/.test(aktifEl.id || '')) return;

    aktifUrunMap = {};
    grid.innerHTML = siparisler.map((s, i) => {
      aktifUrunMap[s.id] = s.urun_turu;
      const girisZaman = new Date(s.giris_zamani).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
      const farkDk = Math.max(0, Math.floor((new Date() - new Date(s.giris_zamani)) / 60000));
      const sure = farkDk < 1 ? 'Az önce' : `${farkDk} dk`;
      const sureRenk = farkDk >= 15 ? 'text-red-400 font-bold' : (farkDk >= 10 ? 'text-amber-400 font-semibold' : 'text-fire-400/70 font-medium');
      const odendi = (s.odeme_durumu === 'Ödendi');
      return `
        <div class="slide-in bg-dark-900/80 backdrop-blur-sm rounded-2xl border ${odendi ? 'border-emerald-500/30' : 'border-dark-700/40'} overflow-hidden hover:border-fire-500/30 transition-all duration-300"
             style="animation-delay:${i*0.05}s" id="card-${s.id}">
          <div class="p-5">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 bg-fire-500/10 rounded-xl flex items-center justify-center text-2xl fire-pulse">${getUrunEmoji(s.urun_turu)}</div>
                <div>
                  <h3 class="font-bold text-gray-100 text-lg leading-tight">${escapeHtml(s.musteri_adi)}</h3>
                  <p class="text-fire-400 font-semibold text-sm">${escapeHtml(s.urun_turu)}</p>
                </div>
              </div>
              <div class="flex flex-col items-end gap-2">
                <button onclick="siparisIptal(${s.id})" class="text-dark-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10" title="Sil">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                ${odemeButonu(s)}
              </div>
            </div>
            <div class="flex items-center gap-4 text-sm text-dark-400">
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                ${girisZaman}
              </span>
              <span class="${sureRenk}">${sure}</span>
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                ${escapeHtml(formatTelefon(s.telefon))}
              </span>
            </div>
          </div>
          <div class="border-t border-dark-700/30 p-4 bg-dark-800/30">
            <div class="flex items-center gap-3">
              <div class="flex-shrink-0">
                <label class="text-xs text-dark-400 font-semibold mb-1 block">Adet</label>
                <input type="number" id="adet-${s.id}" min="1" max="999" placeholder="?"
                  oninput="fiyatGuncelle(${s.id})"
                  class="w-20 h-12 px-3 bg-dark-700 border border-dark-600/50 rounded-xl text-center text-xl font-bold text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all" />
              </div>
              <div class="flex-shrink-0 text-center min-w-[70px]">
                <label class="text-xs text-dark-400 font-semibold mb-1 block">Tutar</label>
                <div id="fiyat-${s.id}" class="h-12 flex items-center justify-center text-lg font-black text-fire-400">— ₺</div>
              </div>
              <button onclick="siparisiTamamla(${s.id}, '${escapeJs(s.musteri_adi)}', '${s.telefon}', '${escapeJs(s.urun_turu)}')"
                class="btn-press flex-1 h-12 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600
                       text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20
                       transition-all duration-200 flex items-center justify-center gap-2">
                <span class="text-lg">✅</span> FIRINDAN ÇIKTI
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

    // Yazılan adetleri geri yükle
    Object.entries(adetler).forEach(([inpId, val]) => {
      const inp = document.getElementById(inpId);
      if (inp) {
        inp.value = val;
        const id = inpId.replace('adet-', '');
        fiyatGuncelle(Number(id));
      }
    });
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Siparişler yüklenemedi!', 'error');
  }
}

// ─── FİYAT GÜNCELLE ─────────────────────────────────────────────────
function fiyatGuncelle(id) {
  const adetInput = document.getElementById(`adet-${id}`);
  const fiyatDiv = document.getElementById(`fiyat-${id}`);
  if (!fiyatDiv) return;
  const adet = parseInt(adetInput?.value);
  const birim = urunBirimFiyat(aktifUrunMap[id]);
  fiyatDiv.textContent = (adet && adet > 0) ? `${adet * birim} ₺` : '— ₺';
}

// ─── SİPARİŞİ TAMAMLA + OTOMATİK WHATSAPP ──────────────────────────
async function siparisiTamamla(id, musteriAdi, telefon, urunTuru) {
  const adetInput = document.getElementById(`adet-${id}`);
  const adet = parseInt(adetInput?.value);

  if (!adet || adet < 1) {
    showToast('Lütfen adet giriniz!', 'warning');
    adetInput?.focus();
    adetInput?.classList.add('ring-2', 'ring-red-500');
    setTimeout(() => adetInput?.classList.remove('ring-2', 'ring-red-500'), 2000);
    return;
  }

  try {
    // 1) Siparişi veritabanında tamamla
    const res = await apiFetch(`${API_BASE}/api/siparis/${id}/tamamla`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adet })
    });
    const data = await res.json();

    if (!data.success) {
      showToast(data.error || 'Bir hata oluştu!', 'error');
      return;
    }

    // Kartı animasyonla kaldır
    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.classList.add('fade-out');
      setTimeout(() => aktifSiparisleriYukle(), 350);
    }

    const toplamFiyat = (data.tutar != null) ? data.tutar : adet * urunBirimFiyat(urunTuru);
    const sablon = AYARLAR.mesaj_sablonu || 'Sayın {musteri}, getirmiş olduğunuz iç malzeme ile hazırlanan {adet} adet {urun} fırınımızdan taze çıkmıştır, hazırdır. Toplam hamur ve işçilik bedeli {tutar} TL\'dir. Ödeyip teslim alabilirsiniz. Afiyet olsun! 🔥';
    const mesaj = sablon
      .replace(/\{musteri\}/g, musteriAdi)
      .replace(/\{adet\}/g, adet)
      .replace(/\{urun\}/g, urunTuru)
      .replace(/\{tutar\}/g, toplamFiyat)
      .replace(/\{isletme\}/g, AYARLAR.isletme_adi || 'Fırın');

    // 2) WhatsApp'tan mesaj gönder
    if (waConnected) {
      try {
        const waRes = await apiFetch(`${API_BASE}/api/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefon, mesaj, siparis_id: id })
        });
        const waData = await waRes.json();

        if (waData.success) {
          showToast(`${musteriAdi} - ${adet} adet ${urunTuru} = ${toplamFiyat} ₺ — WhatsApp gönderildi! ✅`, 'success');
        } else {
          showToast(`Sipariş tamamlandı ama WA hatası: ${waData.error}`, 'warning');
          whatsappFallback(telefon, mesaj, musteriAdi);
        }
      } catch (waErr) {
        if (waErr.message !== 'UNAUTHORIZED') {
          showToast('Sipariş tamamlandı ama WA bağlantı hatası.', 'warning');
          whatsappFallback(telefon, mesaj, musteriAdi);
        }
      }
    } else {
      showToast(`${musteriAdi} - ${adet} adet = ${toplamFiyat} ₺`, 'info');
      whatsappFallback(telefon, mesaj, musteriAdi);
    }

    gunlukIstatistikleriGuncelle();
    cikanlariYukle();
    if (Array.isArray(data.dusuk_stok) && data.dusuk_stok.length > 0) {
      showToast('⚠️ Kritik stok seviyesi: ' + data.dusuk_stok.join(', '), 'warning');
    }

  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') {
      console.error('Sipariş tamamlama hatası:', err);
      showToast('Sunucu bağlantı hatası!', 'error');
    }
  }
}

// WhatsApp bağlı değilse: popup engellenmesin diye tıklanabilir buton göster
function whatsappFallback(telefon, mesaj, musteriAdi) {
  const url = `https://api.whatsapp.com/send/?phone=90${telefon}&text=${encodeURIComponent(mesaj)}&type=phone_number&app_absent=0`;
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast-enter flex flex-col gap-2 px-5 py-4 rounded-xl border bg-amber-600/90 border-amber-500/50 text-white font-medium min-w-[300px] max-w-sm shadow-2xl';

  const text = document.createElement('div');
  text.className = 'text-sm';
  text.textContent = `${musteriAdi || 'Müşteri'} için otomatik WhatsApp gönderilemedi. Manuel göndermek için butona tıklayın:`;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'btn-press text-center px-4 py-2.5 bg-white text-green-700 font-bold rounded-lg';
  link.textContent = '📲 WhatsApp Mesajını Aç';

  toast.appendChild(text);
  toast.appendChild(link);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 20000);
}

// ─── ÖDEME DURUMU ───────────────────────────────────────────────────
// Ödeme durumunu ayarla (ödeme alındı / geri al)
async function odemeAyarla(id, yeni) {
  try {
    const res = await apiFetch(`${API_BASE}/api/siparis/${id}/odeme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ odeme_durumu: yeni })
    });
    const data = await res.json();
    if (data.success) {
      showToast(yeni === 'Ödendi' ? 'Ödeme alındı olarak işaretlendi. 💵' : 'Ödeme "bekliyor" olarak işaretlendi.', 'info');
      aktifSiparisleriYukle();
      cikanlariYukle();
      if (raporVerisi) raporYukle(raporModu);
    } else {
      showToast(data.error || 'Ödeme güncellenemedi!', 'error');
    }
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

// Ödeme kontrolü: ödenmemişse "Ödeme Alındı" butonu, ödenmişse "Ödendi" rozeti gösterir
function odemeButonu(s) {
  const odendi = s.odeme_durumu === 'Ödendi';
  if (odendi) {
    return `<span class="inline-flex items-center gap-2">
      <span class="text-[11px] font-bold px-2 py-1 rounded-lg border bg-emerald-600/20 border-emerald-500/40 text-emerald-400">✅ Ödendi</span>
      <button onclick="odemeAyarla(${s.id}, 'Bekliyor')" class="text-[10px] text-dark-500 hover:text-amber-400 underline" title="Yanlışlıkla işaretlendiyse geri al">geri al</button>
    </span>`;
  }
  return `<button onclick="odemeAyarla(${s.id}, 'Ödendi')" class="btn-press text-[11px] font-bold px-3 py-1.5 rounded-lg border bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 transition-all" title="Ödemeyi alındı olarak işaretle">💵 Ödeme Alındı</button>`;
}

// ─── SİPARİŞ SİL ────────────────────────────────────────────────────
async function siparisIptal(id) {
  if (!confirm('Bu siparişi silmek istediğinize emin misiniz?')) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/siparis/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const card = document.getElementById(`card-${id}`);
      if (card) { card.classList.add('fade-out'); setTimeout(() => aktifSiparisleriYukle(), 350); }
      showToast('Sipariş silindi.', 'info');
    } else { showToast(data.error || 'Silinemedi!', 'error'); }
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

// ─── GÜNLÜK İSTATİSTİKLER ───────────────────────────────────────────
async function gunlukIstatistikleriGuncelle() {
  try {
    const res = await apiFetch(`${API_BASE}/api/rapor/gunluk`);
    const data = await res.json();
    document.getElementById('stat-tamamlanan').textContent = data.toplam?.toplam_siparis || 0;
  } catch (err) {}
}

// ─── RAPOR YÜKLEME (bugün veya tarih aralığı) ───────────────────────
async function raporYukle(tip = 'gunluk') {
  raporModu = tip;
  try {
    let url = `${API_BASE}/api/rapor/gunluk`;
    if (tip === 'aralik') {
      const b = document.getElementById('rapor-baslangic').value;
      const s = document.getElementById('rapor-bitis').value;
      if (!b || !s) { showToast('Başlangıç ve bitiş tarihi seçin!', 'warning'); return; }
      url = `${API_BASE}/api/rapor/aralik?baslangic=${b}&bitis=${s}`;
    }
    const res = await apiFetch(url);
    const data = await res.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    raporVerisi = data;
    raporuCiz(data, tip);
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Rapor yüklenemedi!', 'error');
  }
}

function bugunSec() {
  const bugun = localDateStr();
  document.getElementById('rapor-baslangic').value = bugun;
  document.getElementById('rapor-bitis').value = bugun;
  raporYukle('gunluk');
}

function raporuCiz(data, tip) {
  // Başlık / tarih
  if (tip === 'aralik') {
    document.getElementById('rapor-tarih').textContent = `${data.baslangic} → ${data.bitis} arası`;
  } else {
    document.getElementById('rapor-tarih').textContent =
      new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  const toplamAdet = data.toplam?.toplam_adet || 0;
  const toplamSiparis = data.toplam?.toplam_siparis || 0;
  const toplamCiro = data.toplam?.toplam_ciro || 0;

  document.getElementById('rapor-toplam-adet').textContent = toplamAdet;
  document.getElementById('rapor-toplam-siparis').textContent = toplamSiparis;
  document.getElementById('rapor-toplam-ciro').textContent = `${toplamCiro} ₺`;

  const ortalama = toplamSiparis > 0 ? (toplamAdet / toplamSiparis).toFixed(1) : 0;
  document.getElementById('rapor-ortalama').textContent = ortalama;

  // Ödeme özeti (sunucudan hesaplanır)
  const tamamlananlar = data.tamamlananlar || [];
  document.getElementById('rapor-tahsil').textContent = `${data.toplam?.tahsil_ciro || 0} ₺`;
  document.getElementById('rapor-bekleyen-odeme').textContent = `${data.toplam?.bekleyen_ciro || 0} ₺`;

  // Ürün dağılımı
  const urunListEl = document.getElementById('urun-rapor-list');
  if (data.urunRapor && data.urunRapor.length > 0) {
    const maxAdet = Math.max(...data.urunRapor.map(u => u.toplam_adet));
    urunListEl.innerHTML = data.urunRapor.map(u => {
      const yuzde = maxAdet > 0 ? (u.toplam_adet / maxAdet * 100) : 0;
      const ciro = u.ciro || 0;
      return `
        <div class="bg-dark-800/60 rounded-xl p-3.5">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-gray-200 flex items-center gap-2"><span>${getUrunEmoji(u.urun_turu)}</span> ${escapeHtml(u.urun_turu)}</span>
            <div class="text-right">
              <span class="text-fire-400 font-bold text-lg">${u.toplam_adet}</span>
              <span class="text-dark-500 text-sm ml-1">adet</span>
              <span class="text-emerald-400 font-bold text-sm ml-2">${ciro} ₺</span>
            </div>
          </div>
          <div class="w-full bg-dark-700 rounded-full h-2">
            <div class="bg-gradient-to-r from-fire-500 to-fire-600 h-2 rounded-full transition-all duration-700" style="width:${yuzde}%"></div>
          </div>
          <div class="text-dark-500 text-xs mt-1">${u.siparis_sayisi} sipariş</div>
        </div>`;
    }).join('');
  } else {
    urunListEl.innerHTML = '<p class="text-dark-500 text-center py-4">Henüz veri yok</p>';
  }

  // Teslim edilenler
  const tamamlananEl = document.getElementById('tamamlanan-list');
  if (tamamlananlar.length > 0) {
    tamamlananEl.innerHTML = tamamlananlar.map(s => {
      const cikisZaman = new Date(s.cikis_zamani).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
      const tutar = siparisTutar(s);
      const odendi = (s.odeme_durumu === 'Ödendi');
      return `
        <div class="flex items-center justify-between bg-dark-800/40 rounded-xl px-4 py-3 hover:bg-dark-800/60 transition-colors">
          <div class="flex items-center gap-3">
            <span class="${odendi ? 'text-emerald-400' : 'text-amber-400'}">${odendi ? '💵' : '⏳'}</span>
            <div>
              <span class="font-semibold text-gray-200 text-sm">${escapeHtml(s.musteri_adi)}</span>
              <span class="text-dark-500 text-sm ml-2">${escapeHtml(s.urun_turu)}</span>
            </div>
          </div>
          <div class="text-right flex items-center gap-3">
            <span><span class="text-fire-400 font-bold">${s.adet}</span> <span class="text-dark-500 text-xs">adet</span></span>
            <span class="text-emerald-400 font-bold text-sm">${tutar} ₺</span>
            <span class="text-dark-600 text-xs">${cikisZaman}</span>
            ${odemeButonu(s)}
          </div>
        </div>`;
    }).join('');
  } else {
    tamamlananEl.innerHTML = '<p class="text-dark-500 text-center py-4">Henüz teslim yok</p>';
  }

  // Aktif (fırında) sayısı — hem rapor üstünde hem rozet
  document.getElementById('rapor-bekleyen').textContent = document.getElementById('active-count').textContent || '0';

  // Tarih aralığı günlük dökümü
  const gunlerKutu = document.getElementById('rapor-gunler-kutu');
  const gunlerEl = document.getElementById('rapor-gunler');
  if (tip === 'aralik' && data.gunler && data.gunler.length > 0) {
    gunlerKutu.classList.remove('hidden');
    gunlerEl.innerHTML = data.gunler.map(g => `
      <div class="flex items-center justify-between bg-dark-800/40 rounded-xl px-4 py-2.5">
        <span class="text-gray-300 text-sm">${g.gun}</span>
        <span class="text-dark-400 text-sm">${g.siparis_sayisi} sipariş</span>
        <span><span class="text-fire-400 font-bold">${g.toplam_adet}</span> <span class="text-dark-500 text-xs">adet</span></span>
        <span class="text-emerald-400 font-bold text-sm">${g.ciro || 0} ₺</span>
      </div>`).join('');
  } else {
    gunlerKutu.classList.add('hidden');
    gunlerEl.innerHTML = '';
  }
}

// ─── PDF GÜN SONU / ARALIK RAPORU ───────────────────────────────────
async function pdfIndir(zorlaGunluk = false) {
  try {
    const mod = zorlaGunluk ? 'gunluk' : raporModu;
    let data;
    if (!zorlaGunluk && raporVerisi) {
      data = raporVerisi;
    } else {
      const res = await apiFetch(`${API_BASE}/api/rapor/gunluk`);
      data = await res.json();
    }

    const baslik = mod === 'aralik'
      ? `RAPOR: ${data.baslangic} → ${data.bitis}`
      : 'GUN SONU RAPORU';
    const altBaslik = new Date().toLocaleDateString('tr-TR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
      + ' - Saat: ' + new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });

    const toplamAdet = data.toplam?.toplam_adet || 0;
    const toplamSiparis = data.toplam?.toplam_siparis || 0;
    const toplamCiro = data.toplam?.toplam_ciro || 0;
    const tahsilCiro = data.toplam?.tahsil_ciro || 0;
    const bekleyenCiro = data.toplam?.bekleyen_ciro || 0;

    const tamamlananlar = data.tamamlananlar || [];

    const urunRows = (data.urunRapor || []).map(u => {
      const adet = u.toplam_adet || 0;
      const ciro = u.ciro || 0;
      const bf = adet > 0 ? (ciro / adet) : 0;
      return [
        u.urun_turu, (u.siparis_sayisi || 0).toString(), adet.toString(),
        `${bf} TL`, `${ciro} TL`
      ];
    });
    urunRows.push([
      { text:'TOPLAM', bold:true, fillColor:'#fff3e0' },
      { text:toplamSiparis.toString(), bold:true, fillColor:'#fff3e0' },
      { text:toplamAdet.toString(), bold:true, fillColor:'#fff3e0' },
      { text:'', fillColor:'#fff3e0' },
      { text:`${toplamCiro} TL`, bold:true, fillColor:'#fff3e0', color:'#e65100' }
    ]);

    const teslimatRows = tamamlananlar.map((s, i) => {
      const cikisZaman = new Date(s.cikis_zamani).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
      const odeme = s.odeme_durumu === 'Ödendi' ? 'Odendi' : 'Bekliyor';
      return [(i+1).toString(), s.musteri_adi, s.urun_turu, s.adet.toString(), `${siparisTutar(s)} TL`, odeme, cikisZaman];
    });

    const docDefinition = {
      pageSize:'A4', pageMargins:[40,60,40,60],
      header: { columns:[
        { text:'EMANET TAKIP SISTEMI', style:'headerLeft', margin:[40,20,0,0] },
        { text:'Gun Sonu Raporu', style:'headerRight', margin:[0,20,40,0] }
      ]},
      footer: function(p,c) { return { columns:[
        { text:'Emanet Lahmacun & Pide Takip Sistemi', style:'footerText', margin:[40,0,0,0] },
        { text:`Sayfa ${p} / ${c}`, style:'footerPage', margin:[0,0,40,0] }
      ]}; },
      content: [
        { text:baslik, style:'title', margin:[0,0,0,5] },
        { text:altBaslik, style:'subtitle', margin:[0,0,0,20] },
        { columns:[
          { width:'*', stack:[{ text:'Toplam Siparis', style:'boxLabel' },{ text:toplamSiparis.toString(), style:'boxValue' }], margin:[0,0,5,0] },
          { width:'*', stack:[{ text:'Toplam Adet', style:'boxLabel' },{ text:toplamAdet.toString(), style:'boxValue' }], margin:[5,0,5,0] },
          { width:'*', stack:[{ text:'Tahsil Edilen', style:'boxLabel' },{ text:`${tahsilCiro} TL`, style:'boxValue' }], margin:[5,0,5,0] },
          { width:'*', stack:[{ text:'Bekleyen Odeme', style:'boxLabel' },{ text:`${bekleyenCiro} TL`, style:'boxValue' }], margin:[5,0,5,0] },
          { width:'*', stack:[{ text:'TOPLAM CIRO', style:'boxLabel' },{ text:`${toplamCiro} TL`, style:'boxValueHL' }], margin:[5,0,0,0] }
        ], margin:[0,0,0,25] },
        { text:'Urun Bazli Ozet', style:'sectionTitle', margin:[0,0,0,8] },
        { table:{ headerRows:1, widths:['*','auto','auto','auto','auto'], body:[
          [{ text:'Urun Turu', style:'tH' },{ text:'Siparis', style:'tH' },{ text:'Adet', style:'tH' },{ text:'Birim', style:'tH' },{ text:'Tutar', style:'tH' }],
          ...urunRows
        ]}, layout:{ fillColor:r=>r===0?'#e65100':null, hLineWidth:()=>0.5, vLineWidth:()=>0.5, hLineColor:()=>'#e0e0e0', vLineColor:()=>'#e0e0e0' }, margin:[0,0,0,25] },
        { text:'Teslim Edilen Siparisler', style:'sectionTitle', margin:[0,0,0,8] },
        teslimatRows.length > 0 ? { table:{ headerRows:1, widths:[30,'*','auto','auto','auto','auto','auto'], body:[
          [{ text:'#', style:'tH' },{ text:'Musteri', style:'tH' },{ text:'Urun', style:'tH' },{ text:'Adet', style:'tH' },{ text:'Tutar', style:'tH' },{ text:'Odeme', style:'tH' },{ text:'Saat', style:'tH' }],
          ...teslimatRows
        ]}, layout:{ fillColor:r=>r===0?'#e65100':(r%2===0?'#fafafa':null), hLineWidth:()=>0.5, vLineWidth:()=>0.5, hLineColor:()=>'#e0e0e0', vLineColor:()=>'#e0e0e0' }} : { text:'Bu aralikta teslim edilen siparis bulunmamaktadir.', style:'emptyText' }
      ],
      styles: {
        headerLeft:{ fontSize:8, color:'#888', font:'Roboto' },
        headerRight:{ fontSize:8, color:'#888', alignment:'right', font:'Roboto' },
        footerText:{ fontSize:7, color:'#aaa', font:'Roboto' },
        footerPage:{ fontSize:7, color:'#aaa', alignment:'right', font:'Roboto' },
        title:{ fontSize:22, bold:true, color:'#e65100', font:'Roboto' },
        subtitle:{ fontSize:11, color:'#888', font:'Roboto' },
        sectionTitle:{ fontSize:14, bold:true, color:'#333', font:'Roboto' },
        boxLabel:{ fontSize:9, color:'#888', alignment:'center', margin:[8,8,8,2], font:'Roboto' },
        boxValue:{ fontSize:18, bold:true, color:'#333', alignment:'center', margin:[8,0,8,8], font:'Roboto' },
        boxValueHL:{ fontSize:18, bold:true, color:'#e65100', alignment:'center', margin:[8,0,8,8], font:'Roboto' },
        tH:{ fontSize:10, bold:true, color:'#fff', fillColor:'#e65100', margin:[4,6,4,6], font:'Roboto' },
        emptyText:{ fontSize:11, color:'#999', italics:true, margin:[0,10,0,0], font:'Roboto' }
      },
      defaultStyle:{ fontSize:10, color:'#333', font:'Roboto' }
    };

    const etiket = mod === 'aralik' ? `${data.baslangic}_${data.bitis}` : localDateStr();
    pdfMake.createPdf(docDefinition).download(`gun-sonu-raporu-${etiket}.pdf`);
    showToast('PDF raporu indiriliyor... 📄', 'success');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('PDF oluşturulamadı!', 'error');
  }
}

// ─── YARDIMCI FONKSİYONLAR ──────────────────────────────────────────
function escapeHtml(t) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(t == null ? '' : String(t)));
  return d.innerHTML;
}

function escapeJs(t) {
  return String(t == null ? '' : t)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\x3C');
}

function getUrunEmoji(ad) {
  return urunEmoji[ad] || '📦';
}

// Bir siparişin tutarı: tamamlanma anındaki birim fiyat (yoksa ürünün güncel fiyatı)
function siparisTutar(s) {
  const bf = (typeof s.birim_fiyat === 'number') ? s.birim_fiyat : urunBirimFiyat(s.urun_turu);
  return (s.adet || 0) * bf;
}

function formatTelefon(t) {
  if (!t || t.length !== 10) return t;
  return `${t.substring(0,3)} ${t.substring(3,6)} ${t.substring(6,8)} ${t.substring(8,10)}`;
}

// ─── PARA BİÇİMLENDİRME ─────────────────────────────────────────────
function fmtPara(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺';
}

// Miktar biçimlendirme (uzun ondalıkları gizler)
function fmtMiktar(n) {
  return (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

// ─── FIRINDAN ÇIKANLAR + ARAMA ──────────────────────────────────────
let cikanlarTimeout = null;

async function cikanlariYukle() {
  const el = document.getElementById('cikanlar-list');
  if (!el) return;
  const countEl = document.getElementById('cikanlar-count');
  const tarih = (document.getElementById('cikanlar-tarih')?.value) || localDateStr();
  const q = (document.getElementById('cikanlar-arama')?.value || '').trim();
  try {
    const res = await apiFetch(`${API_BASE}/api/siparisler/tamamlanan?tarih=${tarih}&q=${encodeURIComponent(q)}`);
    const liste = await res.json();
    if (countEl) countEl.textContent = Array.isArray(liste) ? liste.length : 0;
    if (!Array.isArray(liste) || liste.length === 0) {
      el.innerHTML = `<p class="text-dark-500 text-center py-6">${q ? 'Bu isim/telefonla sonuç bulunamadı.' : 'Bugün henüz sipariş çıkmadı.'}</p>`;
      return;
    }
    el.innerHTML = liste.map((s) => {
      const saat = new Date(s.cikis_zamani).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const odendi = s.odeme_durumu === 'Ödendi';
      return `
        <div class="flex items-center justify-between bg-dark-800/40 rounded-xl px-4 py-3 hover:bg-dark-800/70 transition-colors">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xl">${getUrunEmoji(s.urun_turu)}</span>
            <div class="min-w-0">
              <div class="font-semibold text-gray-200 text-sm truncate">${escapeHtml(s.musteri_adi)}</div>
              <div class="text-dark-500 text-xs truncate">${escapeHtml(s.urun_turu)} • ${escapeHtml(formatTelefon(s.telefon))} • ${saat}</div>
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <span><span class="text-fire-400 font-bold">${s.adet || 0}</span> <span class="text-dark-500 text-xs">adet</span></span>
            <span class="text-emerald-400 font-bold text-sm">${fmtPara(siparisTutar(s))}</span>
            ${odemeButonu(s)}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Çıkanlar yüklenemedi:', err);
  }
}

// ─── STOK TAKİP ─────────────────────────────────────────────────────
let stokListe = [];
let receteHaritasi = {};

async function stokYukle() {
  try {
    const res = await apiFetch(`${API_BASE}/api/stok`);
    const liste = await res.json();
    stokListe = Array.isArray(liste) ? liste : [];
    stokCiz();
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Stok yüklenemedi:', err);
  }
}

function stokCiz() {
  const el = document.getElementById('stok-list');
  if (!el) return;
  if (stokListe.length === 0) {
    el.innerHTML = '<p class="text-dark-500 text-center py-8 col-span-full">Henüz malzeme yok. Yukarıdan ekleyin (un, maya, kıyma...).</p>';
    return;
  }
  el.innerHTML = stokListe.map((s) => {
    const dusuk = s.dusuk;
    const maliyet = Number(s.birim_maliyet) || 0;
    const stokDeger = (Number(s.miktar) || 0) * maliyet;
    const altSatir = [];
    if (maliyet > 0) altSatir.push(`Alış: ${fmtPara(maliyet)}/${escapeHtml(s.birim)}`);
    if (s.tedarikci) altSatir.push(`🏭 ${escapeHtml(s.tedarikci)}`);
    if (maliyet > 0) altSatir.push(`Stok değeri: ${fmtPara(stokDeger)}`);
    return `
      <div class="bg-dark-900/80 rounded-2xl border ${dusuk ? 'border-red-500/40' : 'border-dark-700/40'} p-5">
        <div class="flex items-start justify-between mb-3">
          <div class="min-w-0">
            <div class="font-bold text-gray-100 text-lg flex items-center gap-2 flex-wrap">${escapeHtml(s.ad)}
              ${dusuk ? '<span class="text-[10px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded-full font-bold">KRİTİK</span>' : ''}
            </div>
            <div class="text-dark-500 text-xs">Kritik: ${fmtMiktar(s.kritik)} ${escapeHtml(s.birim)}</div>
            ${altSatir.length ? `<div class="text-dark-500 text-xs mt-0.5">${altSatir.join(' • ')}</div>` : ''}
          </div>
          <div class="text-right flex-shrink-0">
            <div class="text-2xl font-black ${dusuk ? 'text-red-400' : 'text-sky-400'}">${fmtMiktar(s.miktar)}</div>
            <div class="text-dark-500 text-xs">${escapeHtml(s.birim)}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="stokHareketModal(${s.id}, 'giris')" class="btn-press flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-bold rounded-lg text-sm">+ Alış</button>
          <button onclick="stokHareketModal(${s.id}, 'cikis')" class="btn-press flex-1 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-400 font-bold rounded-lg text-sm">− Çıkış</button>
          <button onclick="stokHareketModal(${s.id}, 'fire')" class="btn-press w-9 h-9 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-400 rounded-lg" title="Fire / zayi">🔥</button>
          <button onclick="stokDuzenleModal(${s.id})" class="btn-press w-9 h-9 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-lg" title="Düzenle">✏️</button>
          <button onclick="stokSil(${s.id})" class="btn-press w-9 h-9 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg" title="Sil">🗑</button>
        </div>
      </div>`;
  }).join('');
}

async function stokEkle() {
  const ad = document.getElementById('stok-yeni-ad').value.trim();
  const birim = document.getElementById('stok-yeni-birim').value.trim() || 'kg';
  const miktar = document.getElementById('stok-yeni-miktar').value;
  const kritik = document.getElementById('stok-yeni-kritik').value;
  const birim_maliyet = document.getElementById('stok-yeni-maliyet').value;
  const tedarikci = document.getElementById('stok-yeni-tedarikci').value.trim();
  if (!ad) { showToast('Malzeme adını giriniz!', 'warning'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/api/stok`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, birim, miktar, kritik, birim_maliyet, tedarikci })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Malzeme eklendi. ✅', 'success');
      ['stok-yeni-ad', 'stok-yeni-miktar', 'stok-yeni-kritik', 'stok-yeni-maliyet', 'stok-yeni-tedarikci']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
      await stokYukle();
      hareketleriYukle();
      receteleriYukle();
    } else showToast(data.error || 'Eklenemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

function stokHareketModal(id, tip) {
  const s = stokListe.find((x) => x.id === id);
  if (!s) return;
  const basliklar = { giris: '➕ Malzeme Alışı (Stok Girişi)', cikis: '➖ Stok Çıkışı', fire: '🔥 Fire / Zayi' };
  document.getElementById('stok-hareket-id').value = id;
  document.getElementById('stok-hareket-tip').value = tip;
  document.getElementById('stok-hareket-baslik').textContent = basliklar[tip] || 'Stok Hareketi';
  document.getElementById('stok-hareket-aciklama').textContent = `${s.ad} — mevcut: ${fmtMiktar(s.miktar)} ${s.birim}`;
  document.getElementById('stok-hareket-miktar').value = '';
  document.getElementById('stok-hareket-not').value = '';
  const tutarEl = document.getElementById('stok-hareket-tutar');
  if (tutarEl) tutarEl.value = '';
  document.getElementById('stok-hareket-tutar-kutu').classList.toggle('hidden', tip !== 'giris');
  const m = document.getElementById('stok-hareket-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
  setTimeout(() => document.getElementById('stok-hareket-miktar').focus(), 60);
}

function stokHareketKapat() {
  const m = document.getElementById('stok-hareket-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
}

async function stokHareketKaydet() {
  const id = document.getElementById('stok-hareket-id').value;
  const tip = document.getElementById('stok-hareket-tip').value;
  const miktar = parseFloat(document.getElementById('stok-hareket-miktar').value);
  const aciklama = document.getElementById('stok-hareket-not').value.trim();
  const tutarEl = document.getElementById('stok-hareket-tutar');
  const tutarKutu = document.getElementById('stok-hareket-tutar-kutu');
  const tutar = (tutarEl && tutarKutu && !tutarKutu.classList.contains('hidden')) ? parseFloat(tutarEl.value) : undefined;
  if (!Number.isFinite(miktar) || miktar <= 0) { showToast('Geçerli bir miktar giriniz!', 'warning'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/api/stok/${id}/hareket`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tip, miktar, aciklama, tutar: Number.isFinite(tutar) ? tutar : undefined })
    });
    const data = await res.json();
    if (data.success) {
      stokHareketKapat();
      showToast(data.gider ? `Stok güncellendi, kasaya ${fmtPara(data.gider)} gider eklendi. ✅` : 'Stok güncellendi. ✅', 'success');
      await stokYukle();
      hareketleriYukle();
    } else showToast(data.error || 'Güncellenemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

function stokDuzenleModal(id) {
  const s = stokListe.find((x) => x.id === id);
  if (!s) return;
  document.getElementById('stok-duzenle-id').value = id;
  document.getElementById('stok-duzenle-ad').value = s.ad;
  document.getElementById('stok-duzenle-birim').value = s.birim;
  document.getElementById('stok-duzenle-kritik').value = s.kritik;
  const mal = document.getElementById('stok-duzenle-maliyet');
  if (mal) mal.value = s.birim_maliyet || '';
  const ted = document.getElementById('stok-duzenle-tedarikci');
  if (ted) ted.value = s.tedarikci || '';
  const m = document.getElementById('stok-duzenle-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
}

function stokDuzenleKapat() {
  const m = document.getElementById('stok-duzenle-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
}

async function stokDuzenleKaydet() {
  const id = document.getElementById('stok-duzenle-id').value;
  const ad = document.getElementById('stok-duzenle-ad').value.trim();
  const birim = document.getElementById('stok-duzenle-birim').value.trim() || 'kg';
  const kritik = document.getElementById('stok-duzenle-kritik').value;
  const birim_maliyet = document.getElementById('stok-duzenle-maliyet') ? document.getElementById('stok-duzenle-maliyet').value : 0;
  const tedarikci = document.getElementById('stok-duzenle-tedarikci') ? document.getElementById('stok-duzenle-tedarikci').value.trim() : '';
  if (!ad) { showToast('Malzeme adını giriniz!', 'warning'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/api/stok/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad, birim, kritik, birim_maliyet, tedarikci })
    });
    const data = await res.json();
    if (data.success) {
      stokDuzenleKapat();
      showToast('Malzeme güncellendi. ✅', 'success');
      await stokYukle();
      hareketleriYukle();
      receteleriYukle();
    } else showToast(data.error || 'Güncellenemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

async function stokSil(id) {
  const s = stokListe.find((x) => x.id === id);
  if (!confirm(`"${s ? s.ad : 'Bu malzeme'}" silinsin mi? Reçetelerden de kaldırılır.`)) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/stok/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Malzeme silindi.', 'info');
      await stokYukle();
      hareketleriYukle();
      receteleriYukle();
    } else showToast(data.error || 'Silinemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

async function hareketleriYukle() {
  const el = document.getElementById('stok-hareket-list');
  if (!el) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/stok/hareketler?limit=60`);
    const liste = await res.json();
    if (!Array.isArray(liste) || liste.length === 0) {
      el.innerHTML = '<p class="text-dark-500 text-center py-4 text-sm">Henüz hareket yok.</p>';
      return;
    }
    el.innerHTML = liste.map((h) => {
      const giris = h.tip === 'giris';
      const zaman = new Date(h.zaman).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="flex items-center justify-between bg-dark-800/40 rounded-lg px-3 py-2 text-sm">
          <div class="min-w-0">
            <span class="font-semibold text-gray-200">${escapeHtml(h.stok_ad || 'Silinmiş malzeme')}</span>
            ${h.aciklama ? `<span class="text-dark-500 text-xs ml-1">• ${escapeHtml(h.aciklama)}</span>` : ''}
          </div>
          <div class="text-right flex-shrink-0 ml-2">
            <span class="${giris ? 'text-emerald-400' : 'text-amber-400'} font-bold">${giris ? '+' : '−'}${fmtMiktar(h.miktar)} ${escapeHtml(h.birim || '')}</span>
            <span class="text-dark-600 text-[11px] block">${zaman}</span>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Hareketler yüklenemedi:', err);
  }
}

// ─── REÇETELER ──────────────────────────────────────────────────────
async function receteleriYukle() {
  const el = document.getElementById('recete-list');
  if (!el) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/recete`);
    const rows = await res.json();
    receteHaritasi = {};
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (!receteHaritasi[r.urun_turu]) receteHaritasi[r.urun_turu] = [];
      receteHaritasi[r.urun_turu].push(r);
    });
    el.innerHTML = URUNLER.map((u) => {
      const kalem = receteHaritasi[u.ad] || [];
      const ozet = kalem.length
        ? kalem.map((k) => `${fmtMiktar(k.miktar)} ${escapeHtml(k.birim || '')} ${escapeHtml(k.stok_ad || '')}`).join(', ')
        : '<span class="text-dark-500">Reçete tanımlı değil</span>';
      return `
        <div class="flex items-center justify-between bg-dark-800/40 rounded-xl px-4 py-3">
          <div class="min-w-0">
            <div class="font-semibold text-gray-200 text-sm">${u.ikon || '📦'} ${escapeHtml(u.ad)}</div>
            <div class="text-dark-500 text-xs truncate">${ozet}</div>
          </div>
          <button onclick="receteDuzenleModal('${escapeJs(u.ad)}')" class="btn-press px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-200 text-xs font-semibold rounded-lg flex-shrink-0 ml-2">Düzenle</button>
        </div>`;
    }).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Reçeteler yüklenemedi:', err);
  }
}

function receteDuzenleModal(urun) {
  document.getElementById('recete-urun').value = urun;
  document.getElementById('recete-urun-adi').textContent = urun;
  const el = document.getElementById('recete-kalemler');
  el.innerHTML = '';
  const kalemler = receteHaritasi[urun] || [];
  if (kalemler.length === 0) receteSatiriEkle();
  else kalemler.forEach((k) => receteSatiriEkle(k.stok_id, k.miktar));
  const m = document.getElementById('recete-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
}

function receteKapat() {
  const m = document.getElementById('recete-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
}

function receteSatiriEkle(stokId = '', miktar = '') {
  const el = document.getElementById('recete-kalemler');
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2';

  const sec = document.createElement('select');
  sec.className = 'recete-stok flex-1 min-w-0 px-3 py-2.5 bg-dark-800 border border-dark-600/50 rounded-xl text-gray-100';
  const bos = document.createElement('option');
  bos.value = ''; bos.textContent = 'Malzeme seçin...';
  sec.appendChild(bos);
  stokListe.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = `${s.ad} (${s.birim})`;
    sec.appendChild(o);
  });
  if (stokId) sec.value = stokId;

  const inp = document.createElement('input');
  inp.type = 'number'; inp.min = '0'; inp.step = '0.01';
  inp.className = 'recete-miktar w-24 px-3 py-2.5 bg-dark-800 border border-dark-600/50 rounded-xl text-gray-100 text-right';
  inp.placeholder = 'Miktar';
  inp.value = miktar;

  const sil = document.createElement('button');
  sil.type = 'button';
  sil.className = 'btn-press w-10 h-10 flex-shrink-0 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400';
  sil.textContent = '✕';
  sil.addEventListener('click', () => row.remove());

  row.appendChild(sec); row.appendChild(inp); row.appendChild(sil);
  el.appendChild(row);
}

async function receteKaydet() {
  const urun = document.getElementById('recete-urun').value;
  const rows = Array.from(document.querySelectorAll('#recete-kalemler > div'));
  const kalemler = [];
  rows.forEach((r) => {
    const stokId = parseInt(r.querySelector('.recete-stok').value, 10);
    const mik = parseFloat(r.querySelector('.recete-miktar').value);
    if (Number.isInteger(stokId) && Number.isFinite(mik) && mik > 0) kalemler.push({ stok_id: stokId, miktar: mik });
  });
  try {
    const res = await apiFetch(`${API_BASE}/api/recete/${encodeURIComponent(urun)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kalemler })
    });
    const data = await res.json();
    if (data.success) {
      receteKapat();
      showToast(data.message || 'Reçete kaydedildi. ✅', 'success');
      receteleriYukle();
    } else showToast(data.error || 'Kaydedilemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

// ─── GELİR / GİDER (KASA) ───────────────────────────────────────────
async function kasaYukle() {
  const bEl = document.getElementById('kasa-baslangic');
  const sEl = document.getElementById('kasa-bitis');
  if (!bEl || !sEl) return;
  if (!bEl.value || !sEl.value) {
    const t = localDateStr();
    bEl.value = t.slice(0, 8) + '01';
    sEl.value = t;
  }
  const baslangic = bEl.value;
  const bitis = sEl.value;
  try {
    const res = await apiFetch(`${API_BASE}/api/kasa?baslangic=${baslangic}&bitis=${bitis}`);
    const d = await res.json();
    document.getElementById('kasa-gelir').textContent = fmtPara(d.gelir);
    document.getElementById('kasa-bekleyen').textContent = fmtPara(d.bekleyen);
    document.getElementById('kasa-gider').textContent = fmtPara(d.gider);
    const netEl = document.getElementById('kasa-net');
    netEl.textContent = fmtPara(d.net);
    netEl.className = 'text-3xl font-black ' + (d.net >= 0 ? 'text-fire-300' : 'text-red-400');
    document.getElementById('kasa-tarih').textContent =
      `${d.baslangic} → ${d.bitis} arası • ${d.siparis_sayisi} sipariş (${d.toplam_adet} adet) • Toplam ciro ${fmtPara(d.ciro)}`;
    await giderleriYukle(baslangic, bitis);
    kasaGrafikYukle(baslangic, bitis);
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Kasa yüklenemedi!', 'error');
  }
}

// Gün gün gelir/gider grafiği (saf CSS çubuklar)
async function kasaGrafikYukle(baslangic, bitis) {
  const el = document.getElementById('kasa-grafik');
  if (!el) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/kasa/aylik?baslangic=${baslangic}&bitis=${bitis}`);
    const d = await res.json();
    const gunler = d.gunler || [];
    if (gunler.length === 0) {
      el.innerHTML = '<p class="text-dark-500 text-sm m-auto">Bu aralıkta veri yok.</p>';
      return;
    }
    const max = Math.max(1, ...gunler.map((g) => Math.max(g.gelir || 0, g.gider || 0)));
    el.innerHTML = gunler.map((g) => {
      const hGelir = Math.round(((g.gelir || 0) / max) * 100);
      const hGider = Math.round(((g.gider || 0) / max) * 100);
      const gun = g.gun.slice(8);
      return `
        <div class="flex flex-col items-center gap-1 min-w-[28px]" title="${g.gun} • Gelir: ${fmtPara(g.gelir)} • Gider: ${fmtPara(g.gider)} • Net: ${fmtPara(g.net)}">
          <div class="flex items-end gap-0.5 h-40">
            <div class="w-3 bg-emerald-500 rounded-t" style="height:${hGelir}%"></div>
            <div class="w-3 bg-red-500 rounded-t" style="height:${hGider}%"></div>
          </div>
          <span class="text-dark-500 text-[10px]">${gun}</span>
        </div>`;
    }).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Grafik yüklenemedi:', err);
  }
}

async function giderleriYukle(baslangic, bitis) {
  const el = document.getElementById('gider-list');
  if (!el) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/giderler?baslangic=${baslangic || ''}&bitis=${bitis || ''}`);
    const d = await res.json();
    document.getElementById('gider-toplam').textContent = 'Toplam: ' + fmtPara(d.toplam);
    const liste = d.liste || [];
    if (liste.length === 0) {
      el.innerHTML = '<p class="text-dark-500 text-center py-6">Bu aralıkta gider yok.</p>';
      return;
    }
    el.innerHTML = liste.map((g) => `
      <div class="flex items-center justify-between bg-dark-800/40 rounded-xl px-4 py-3">
        <div class="min-w-0">
          <div class="font-semibold text-gray-200 text-sm truncate">${escapeHtml(g.aciklama)}</div>
          <div class="text-dark-500 text-xs">${escapeHtml(g.kategori || 'Diğer')} • ${g.tarih}</div>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="text-red-400 font-bold">${fmtPara(g.miktar)}</span>
          <button onclick="giderSil(${g.id})" class="text-dark-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10" title="Sil">✕</button>
        </div>
      </div>`).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Giderler yüklenemedi:', err);
  }
}

function kasaHizli(tip) {
  const t = localDateStr();
  const bEl = document.getElementById('kasa-baslangic');
  const sEl = document.getElementById('kasa-bitis');
  if (tip === 'bugun') { bEl.value = t; sEl.value = t; }
  else { bEl.value = t.slice(0, 8) + '01'; sEl.value = t; }
  kasaYukle();
}

async function giderEkle() {
  const aciklama = document.getElementById('gider-aciklama').value.trim();
  const miktar = document.getElementById('gider-miktar').value;
  const kategori = document.getElementById('gider-kategori').value;
  const tarih = document.getElementById('gider-tarih').value || localDateStr();
  if (!aciklama) { showToast('Açıklama giriniz!', 'warning'); return; }
  if (!(parseFloat(miktar) > 0)) { showToast('Geçerli bir tutar giriniz!', 'warning'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/api/giderler`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aciklama, miktar, kategori, tarih })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Gider eklendi. ✅', 'success');
      document.getElementById('gider-aciklama').value = '';
      document.getElementById('gider-miktar').value = '';
      kasaYukle();
    } else showToast(data.error || 'Eklenemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

async function giderSil(id) {
  if (!confirm('Bu gider silinsin mi?')) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/giderler/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { showToast('Gider silindi.', 'info'); kasaYukle(); }
    else showToast(data.error || 'Silinemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

// ─── KÂRLILIK & ANALİZ ──────────────────────────────────────────────
async function karlilikYukle() {
  const bEl = document.getElementById('karlilik-baslangic');
  const sEl = document.getElementById('karlilik-bitis');
  if (!bEl || !sEl) return;
  if (!bEl.value || !sEl.value) {
    const t = localDateStr();
    bEl.value = t.slice(0, 8) + '01';
    sEl.value = t;
  }
  const baslangic = bEl.value, bitis = sEl.value;
  try {
    const [karRes, musRes, saatRes] = await Promise.all([
      apiFetch(`${API_BASE}/api/rapor/karlilik?baslangic=${baslangic}&bitis=${bitis}`),
      apiFetch(`${API_BASE}/api/rapor/musteriler?baslangic=${baslangic}&bitis=${bitis}`),
      apiFetch(`${API_BASE}/api/rapor/saatlik?baslangic=${baslangic}&bitis=${bitis}`)
    ]);
    const kar = await karRes.json();
    const mus = await musRes.json();
    const saat = await saatRes.json();

    document.getElementById('karlilik-tarih').textContent = `${kar.baslangic} → ${kar.bitis} arası`;
    document.getElementById('kar-ciro').textContent = fmtPara(kar.toplam?.ciro || 0);
    document.getElementById('kar-maliyet').textContent = fmtPara(kar.toplam?.maliyet || 0);
    const karEl = document.getElementById('kar-kar');
    karEl.textContent = fmtPara(kar.toplam?.kar || 0);
    karEl.className = 'text-3xl font-black ' + ((kar.toplam?.kar || 0) >= 0 ? 'text-emerald-400' : 'text-red-400');
    document.getElementById('kar-marj').textContent = `${kar.toplam?.marj || 0}%`;

    const urunEl = document.getElementById('kar-urun-list');
    const liste = kar.liste || [];
    urunEl.innerHTML = liste.length ? liste.map((u) => {
      const karPozitif = (u.kar || 0) >= 0;
      return `
        <div class="bg-dark-800/50 rounded-xl px-3.5 py-3">
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-semibold text-gray-200 text-sm">${getUrunEmoji(u.urun_turu)} ${escapeHtml(u.urun_turu)}</span>
            <span class="${karPozitif ? 'text-emerald-400' : 'text-red-400'} font-bold text-sm">${fmtPara(u.kar)}</span>
          </div>
          <div class="grid grid-cols-4 gap-1 text-[11px] text-dark-400">
            <span>Adet: <b class="text-gray-300">${u.toplam_adet}</b></span>
            <span>Ciro: <b class="text-fire-400">${u.ciro}</b></span>
            <span>Maliyet: <b class="text-amber-400">${u.maliyet}</b></span>
            <span>Marj: <b class="text-gray-300">${u.marj}%</b></span>
          </div>
        </div>`;
    }).join('') : '<p class="text-dark-500 text-center py-4">Bu aralıkta satış yok.</p>';

    const musEl = document.getElementById('kar-musteri-list');
    const mliste = mus.liste || [];
    musEl.innerHTML = mliste.length ? mliste.map((m, i) => `
      <div class="flex items-center justify-between bg-dark-800/50 rounded-xl px-3.5 py-2.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-dark-500 text-xs w-5">${i + 1}.</span>
          <div class="min-w-0">
            <div class="font-semibold text-gray-200 text-sm truncate">${escapeHtml(m.musteri_adi)}</div>
            <div class="text-dark-500 text-[11px]">${escapeHtml(formatTelefon(m.telefon))} • ${m.siparis_sayisi} sipariş • ${m.toplam_adet} adet</div>
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="text-emerald-400 font-bold text-sm">${fmtPara(m.ciro)}</div>
          ${m.bekleyen > 0 ? `<div class="text-amber-400 text-[10px]">bekleyen ${fmtPara(m.bekleyen)}</div>` : ''}
        </div>
      </div>`).join('') : '<p class="text-dark-500 text-center py-4">Bu aralıkta müşteri yok.</p>';

    const saatEl = document.getElementById('kar-saatlik');
    const sliste = (saat.liste || []).filter((s) => s.toplam_adet > 0);
    if (sliste.length === 0) {
      saatEl.innerHTML = '<p class="text-dark-500 text-sm m-auto">Bu aralıkta veri yok.</p>';
    } else {
      const maxA = Math.max(1, ...sliste.map((s) => s.toplam_adet || 0));
      saatEl.innerHTML = sliste.map((s) => {
        const h = Math.round(((s.toplam_adet || 0) / maxA) * 100);
        return `
          <div class="flex flex-col items-center gap-1 min-w-[26px]" title="${s.saat}:00 • ${s.toplam_adet} adet / ${s.siparis_sayisi} sipariş">
            <div class="w-5 bg-gradient-to-t from-fire-600 to-fire-400 rounded-t" style="height:${h}%;min-height:3px"></div>
            <span class="text-dark-500 text-[10px]">${s.saat}</span>
          </div>`;
      }).join('');
    }
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Kârlılık verisi yüklenemedi!', 'error');
  }
}

function karlilikHizli(tip) {
  const t = localDateStr();
  const bEl = document.getElementById('karlilik-baslangic');
  const sEl = document.getElementById('karlilik-bitis');
  if (tip === 'bugun') { bEl.value = t; sEl.value = t; }
  else { bEl.value = t.slice(0, 8) + '01'; sEl.value = t; }
  karlilikYukle();
}

// ─── CSV / DIŞA AKTARMA ─────────────────────────────────────────────
function csvIndir(tur) {
  window.open(`${API_BASE}/api/disa-aktar/${tur}`, '_blank');
  showToast('CSV indiriliyor... (Excel ile açabilirsiniz) 📊', 'info');
}

// ─── YEDEK YÖNETİMİ ─────────────────────────────────────────────────
async function yedekleriYukle() {
  const el = document.getElementById('ayar-yedek-list');
  if (!el) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/yedekler`);
    const liste = await res.json();
    if (!Array.isArray(liste) || liste.length === 0) {
      el.innerHTML = '<p class="text-dark-500 text-xs">Henüz yedek yok.</p>';
      return;
    }
    el.innerHTML = liste.map((y) => {
      const kb = Math.round((y.boyut || 0) / 1024);
      const zaman = new Date(y.zaman).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
      return `
        <div class="flex items-center justify-between bg-dark-800/50 rounded-lg px-3 py-2">
          <span class="text-dark-300 text-xs truncate">${escapeHtml(y.dosya)} <span class="text-dark-500">(${kb} KB • ${zaman})</span></span>
          <button type="button" onclick="yedekIndir('${escapeJs(y.dosya)}')" class="text-fire-400 hover:text-fire-300 text-xs font-semibold ml-2">İndir</button>
        </div>`;
    }).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Yedekler yüklenemedi:', err);
  }
}

function yedekIndir(dosya) {
  window.open(`${API_BASE}/api/yedek/indir?dosya=${encodeURIComponent(dosya)}`, '_blank');
}

async function yedekAl() {
  try {
    const res = await apiFetch(`${API_BASE}/api/yedek/al`, { method: 'POST' });
    const d = await res.json();
    if (d.success) { showToast('Yedek alındı. ✅', 'success'); yedekleriYukle(); }
    else showToast(d.error || 'Yedek alınamadı!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

async function yedekYukle(input) {
  const dosya = input.files && input.files[0];
  if (!dosya) return;
  if (!confirm('Mevcut verilerin üzerine yazılacak. Devam edilsin mi? (Yükleme öncesi otomatik güvenlik yedeği alınır.)')) {
    input.value = ''; return;
  }
  try {
    const buf = await dosya.arrayBuffer();
    const res = await fetch(`${API_BASE}/api/yedek/yukle`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf
    });
    const d = await res.json();
    if (d.success) {
      showToast('Yedek geri yüklendi. Sayfa yenileniyor...', 'success');
      setTimeout(() => location.reload(), 1500);
    } else showToast(d.error || 'Yedek yüklenemedi!', 'error');
  } catch (err) {
    showToast('Yedek yüklenirken hata oluştu!', 'error');
  } finally {
    input.value = '';
  }
}

// ─── KULLANICILAR ───────────────────────────────────────────────────
async function kullanicilariYukle() {
  const el = document.getElementById('ayar-kullanicilar-list');
  if (!el) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/kullanicilar`);
    const liste = await res.json();
    if (!Array.isArray(liste) || liste.length === 0) {
      el.innerHTML = '<p class="text-dark-500 text-xs">Henüz kullanıcı yok. Sistem şu an girişsiz çalışıyor.</p>';
      return;
    }
    el.innerHTML = liste.map((u) => `
      <div class="flex items-center justify-between bg-dark-800/50 rounded-lg px-3 py-2">
        <span class="text-dark-200 text-sm">${escapeHtml(u.kullanici)}
          <span class="text-[10px] px-1.5 py-0.5 rounded ${u.rol === 'admin' ? 'bg-fire-600/20 text-fire-400' : 'bg-sky-600/20 text-sky-400'}">${u.rol}</span>
          ${u.aktif ? '' : '<span class="text-[10px] text-red-400">pasif</span>'}
        </span>
        <button type="button" onclick="kullaniciSil(${u.id}, '${escapeJs(u.kullanici)}')" class="text-dark-500 hover:text-red-400 text-xs ml-2">Sil</button>
      </div>`).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Kullanıcılar yüklenemedi:', err);
  }
}

async function kullaniciEkle() {
  const kullanici = document.getElementById('ayar-yeni-kullanici').value.trim();
  const sifre = document.getElementById('ayar-yeni-sifre').value;
  const rol = document.getElementById('ayar-yeni-rol').value;
  if (kullanici.length < 3) { showToast('Kullanıcı adı en az 3 karakter olmalı!', 'warning'); return; }
  if (sifre.length < 4) { showToast('Şifre en az 4 karakter olmalı!', 'warning'); return; }
  try {
    const res = await apiFetch(`${API_BASE}/api/kullanicilar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kullanici, sifre, rol })
    });
    const d = await res.json();
    if (d.success) {
      document.getElementById('ayar-yeni-kullanici').value = '';
      document.getElementById('ayar-yeni-sifre').value = '';
      if (d.ilkKullanici) {
        showToast('İlk kullanıcı yönetici olarak eklendi. Artık giriş gerekli — sayfa yenileniyor...', 'warning');
        setTimeout(() => location.reload(), 2500);
      } else {
        showToast('Kullanıcı eklendi. ✅', 'success');
        kullanicilariYukle();
      }
    } else showToast(d.error || 'Kullanıcı eklenemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

async function kullaniciSil(id, ad) {
  if (!confirm(`"${ad}" kullanıcısı silinsin mi?`)) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/kullanicilar/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) { showToast('Kullanıcı silindi.', 'info'); kullanicilariYukle(); }
    else showToast(d.error || 'Silinemedi!', 'error');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Sunucu bağlantı hatası!', 'error');
  }
}

// ─── İŞLEM / MESAJ GEÇMİŞİ ──────────────────────────────────────────
async function loglariYukle() {
  const el = document.getElementById('ayar-log-list');
  if (!el) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/loglar?limit=40`);
    const liste = await res.json();
    if (!Array.isArray(liste) || liste.length === 0) {
      el.innerHTML = '<p class="text-dark-500 text-xs">Henüz kayıt yok.</p>';
      return;
    }
    el.innerHTML = liste.map((l) => {
      const zaman = new Date(l.zaman).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      return `<div class="text-xs text-dark-400 flex items-center justify-between bg-dark-800/40 rounded-lg px-3 py-1.5">
        <span class="truncate">${escapeHtml(l.kullanici)} • ${escapeHtml(l.islem)}${l.detay ? ' • ' + escapeHtml(l.detay) : ''}</span>
        <span class="text-dark-600 ml-2 flex-shrink-0">${zaman}</span>
      </div>`;
    }).join('');
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') console.error('Loglar yüklenemedi:', err);
  }
}

async function mesajlariGoster() {
  try {
    const res = await apiFetch(`${API_BASE}/api/mesajlar?limit=60`);
    const liste = await res.json();
    if (!Array.isArray(liste) || liste.length === 0) { showToast('Henüz mesaj kaydı yok.', 'info'); return; }
    const ozet = liste.map((m) => {
      const zaman = new Date(m.zaman).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      const yon = m.yon === 'gelen' ? '[GELEN]' : '[GIDEN]';
      return `${yon} ${zaman} +${m.telefon} (${m.durum})\n${(m.mesaj || '').slice(0, 120)}`;
    }).join('\n\n');
    alert('SON WHATSAPP MESAJLARI\n\n' + ozet);
  } catch (err) {
    if (err.message !== 'UNAUTHORIZED') showToast('Mesaj geçmişi yüklenemedi!', 'error');
  }
}

// ─── MASAÜSTÜ BİLDİRİMİ ─────────────────────────────────────────────
function bildirimDestekleniyor() {
  return typeof Notification !== 'undefined';
}

function bildirimDurumunuGuncelle() {
  const btn = document.getElementById('btn-bildirim');
  if (!btn) return;
  if (!bildirimDestekleniyor()) { btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  if (Notification.permission === 'granted') {
    btn.textContent = '🔔';
    btn.title = 'Masaüstü bildirimleri AÇIK';
    btn.classList.add('text-emerald-400');
  } else {
    btn.textContent = '🔕';
    btn.title = 'Masaüstü bildirimlerini aç';
    btn.classList.remove('text-emerald-400');
  }
}

async function bildirimDurumunuDegistir() {
  if (!bildirimDestekleniyor()) { showToast('Tarayıcınız masaüstü bildirimini desteklemiyor.', 'warning'); return; }
  if (Notification.permission === 'granted') {
    maasustuBildirim('Bildirimler açık', 'Yeni sipariş geldiğinde burada göreceksiniz. 🔥');
    showToast('Masaüstü bildirimleri zaten açık. ✅', 'info');
    return;
  }
  const izin = await Notification.requestPermission();
  bildirimDurumunuGuncelle();
  if (izin === 'granted') {
    showToast('Masaüstü bildirimleri açıldı. ✅', 'success');
    maasustuBildirim('Bildirimler açıldı', 'Yeni sipariş geldiğinde haber vereceğiz. 🔥');
  } else {
    showToast('Bildirim izni verilmedi.', 'warning');
  }
}

function maasustuBildirim(baslik, govde) {
  try {
    if (!bildirimDestekleniyor() || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // sekme açıkken gereksiz
    new Notification(baslik, { body: govde });
  } catch (e) {}
}

// ─── BAŞLANGIÇ AKIŞI ────────────────────────────────────────────────
async function baslangicAkisi() {
  await ayarlariYukle();
  urunSecenekleriniDoldur();
  const bugun = localDateStr();
  const bInput = document.getElementById('rapor-baslangic');
  const sInput = document.getElementById('rapor-bitis');
  if (bInput && !bInput.value) bInput.value = bugun;
  if (sInput && !sInput.value) sInput.value = bugun;
  const cTarih = document.getElementById('cikanlar-tarih');
  if (cTarih && !cTarih.value) cTarih.value = bugun;
  const gTarih = document.getElementById('gider-tarih');
  if (gTarih && !gTarih.value) gTarih.value = bugun;
  const kb = document.getElementById('karlilik-baslangic');
  const ks = document.getElementById('karlilik-bitis');
  if (kb && !kb.value) kb.value = bugun.slice(0, 8) + '01';
  if (ks && !ks.value) ks.value = bugun;

  bildirimDurumunuGuncelle();

  await aktifSiparisleriYukle();
  await gunlukIstatistikleriGuncelle();
  await cikanlariYukle();
  startWaPolling();
  oturumGeriYukle();
}

// ─── SAYFA YÜKLENDIĞİNDE ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('login-sifre')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') girisYap();
  });
  document.getElementById('login-kullanici')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-sifre')?.focus();
  });

  // PWA: service worker kaydı (opsiyonel, hata olursa yok say)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.getElementById('urun-turu')?.addEventListener('change', seciliUrunFiyatiniGuncelle);

  // Fırından çıkanlar: isim araması (gecikmeli) + tarih değişimi
  document.getElementById('cikanlar-arama')?.addEventListener('input', () => {
    clearTimeout(cikanlarTimeout);
    cikanlarTimeout = setTimeout(cikanlariYukle, 350);
  });
  document.getElementById('cikanlar-tarih')?.addEventListener('change', cikanlariYukle);

  const yetkili = await authKontrol();
  if (yetkili) await baslangicAkisi();
});

// ─── Emanet Lahmacun/Pide Takip Sistemi - Frontend ───────────────────

const API_BASE = '';
const BIRIM_FIYAT = 15; // TL / adet

// ─── WHATSAPP DURUM TAKİBİ ─────────────────────────────────────────
let waConnected = false;
let waPollingInterval = null;

async function whatsappDurumKontrol() {
  try {
    const res = await fetch(`${API_BASE}/api/whatsapp/status`);
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
        badgeDot.className = 'w-2.5 h-2.5 bg-red-400 rounded-full';
        badgeText.textContent = 'WA Bağlı Değil';
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
    console.error('WA durum kontrolü hatası:', err);
  }
}

async function whatsappOturumuKapat() {
  if (!confirm('WhatsApp bağlantısını kesmek ve oturumu kapatmak istediğinize emin misiniz?')) return;
  showToast('Bağlantı kesiliyor...', 'info');
  try {
    const res = await fetch(`${API_BASE}/api/whatsapp/logout`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('WhatsApp bağlantısı kesildi ve oturum temizlendi!', 'success');
      whatsappDurumKontrol();
    } else {
      showToast(data.error || 'Bağlantı kesilemedi!', 'error');
    }
  } catch (err) {
    showToast('Bağlantı kesme hatası oluştu!', 'error');
  }
}

async function whatsappYenidenBaglan() {
  showToast('WhatsApp yeniden bağlanıyor...', 'info');
  try {
    await fetch(`${API_BASE}/api/whatsapp/reconnect`, { method: 'POST' });
    setTimeout(whatsappDurumKontrol, 2000);
  } catch (err) {
    showToast('Yeniden bağlanma hatası!', 'error');
  }
}

// WhatsApp durumunu her 3 saniyede kontrol et
function startWaPolling() {
  whatsappDurumKontrol();
  waPollingInterval = setInterval(whatsappDurumKontrol, 3000);
}

// ─── OTURUM YÖNETİMİ ───────────────────────────────────────────────
let sessionAktif = false;

function gunuBaslat() {
  sessionAktif = true;

  const overlay = document.getElementById('start-overlay');
  overlay.classList.remove('overlay-enter');
  overlay.classList.add('overlay-exit');
  setTimeout(() => overlay.style.display = 'none', 300);

  document.getElementById('btn-gun-durdur').classList.remove('hidden');
  document.getElementById('btn-gun-durdur').classList.add('flex');
  document.getElementById('session-indicator').classList.remove('hidden');
  document.getElementById('session-indicator').classList.add('flex');

  const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('session-start-time').textContent = saat + "'den beri";

  if (waConnected) {
    showToast('Günaydın! Sistem ve WhatsApp aktif. Hayırlı işler! ☀️', 'success');
  } else {
    showToast('Sistem başlatıldı. WhatsApp bağlanınca mesajlar otomatik gidecek.', 'warning');
  }

  aktifSiparisleriYukle();
  gunlukIstatistikleriGuncelle();
}

async function gunuDurdur() {
  try {
    const res = await fetch(`${API_BASE}/api/siparisler/aktif`);
    const aktifler = await res.json();
    if (aktifler.length > 0) {
      if (!confirm(`Dikkat! Hâlâ fırında ${aktifler.length} aktif sipariş var.\n\nYine de günü kapatmak istiyor musunuz?`)) return;
    }
  } catch (e) {}

  if (!confirm('Günü kapatmak ve gün sonu PDF raporunu indirmek istediğinize emin misiniz?')) return;

  showToast('Gün sonu raporu hazırlanıyor... 📄', 'info');
  await pdfIndir();

  sessionAktif = false;

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
  toast.innerHTML = `<span class="text-lg">${icons[type]}</span><span class="flex-1">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
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
  ['main', 'report'].forEach(t => {
    const panel = document.getElementById(`panel-${t}`);
    const btn = document.getElementById(`tab-${t}`);
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
  if (tab === 'report') raporYukle();
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
  const musteriAdi = document.getElementById('musteri-adi').value.trim();
  const telefonRaw = document.getElementById('telefon').value.replace(/\s/g, '');
  const urunTuru = document.getElementById('urun-turu').value;

  if (!musteriAdi) { showToast('Müşteri adını giriniz!', 'warning'); return; }
  if (!/^\d{10}$/.test(telefonRaw)) { showToast('Telefon numarası 10 hane olmalıdır!', 'error'); return; }
  if (!urunTuru) { showToast('Ürün türü seçiniz!', 'warning'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/siparis`, {
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
    showToast('Sunucu bağlantı hatası!', 'error');
  }
});

// ─── AKTİF SİPARİŞLERİ LİSTELEME ──────────────────────────────────
async function aktifSiparisleriYukle() {
  try {
    const res = await fetch(`${API_BASE}/api/siparisler/aktif`);
    const siparisler = await res.json();

    const grid = document.getElementById('siparisler-grid');
    const emptyState = document.getElementById('empty-state');

    document.getElementById('active-count').textContent = siparisler.length;
    document.getElementById('stat-bekleyen').textContent = siparisler.length;

    if (siparisler.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    const urunEmoji = { 'Lahmacun':'🥙', 'Kıymalı Pide':'🫓', 'Kaşarlı Pide':'🧀', 'Karışık Pide':'🍕', 'Diğer':'📦' };

    grid.innerHTML = siparisler.map((s, i) => {
      const girisZaman = new Date(s.giris_zamani).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
      const farkDk = Math.floor((new Date() - new Date(s.giris_zamani)) / 60000);
      const sure = farkDk < 1 ? 'Az önce' : `${farkDk} dk`;
      return `
        <div class="slide-in bg-dark-900/80 backdrop-blur-sm rounded-2xl border border-dark-700/40 overflow-hidden hover:border-fire-500/30 transition-all duration-300"
             style="animation-delay:${i*0.05}s" id="card-${s.id}">
          <div class="p-5">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 bg-fire-500/10 rounded-xl flex items-center justify-center text-2xl fire-pulse">${urunEmoji[s.urun_turu]||'📦'}</div>
                <div>
                  <h3 class="font-bold text-gray-100 text-lg leading-tight">${escapeHtml(s.musteri_adi)}</h3>
                  <p class="text-fire-400 font-semibold text-sm">${s.urun_turu}</p>
                </div>
              </div>
              <button onclick="siparisIptal(${s.id})" class="text-dark-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10" title="Sil">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="flex items-center gap-4 text-sm text-dark-400">
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                ${girisZaman}
              </span>
              <span class="text-fire-400/70 font-medium">${sure}</span>
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                ${formatTelefon(s.telefon)}
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
  } catch (err) {
    showToast('Siparişler yüklenemedi!', 'error');
  }
}

// ─── FİYAT GÜNCELLE ─────────────────────────────────────────────────
function fiyatGuncelle(id) {
  const adetInput = document.getElementById(`adet-${id}`);
  const fiyatDiv = document.getElementById(`fiyat-${id}`);
  const adet = parseInt(adetInput?.value);
  fiyatDiv.textContent = (adet && adet > 0) ? `${adet * BIRIM_FIYAT} ₺` : '— ₺';
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
    const res = await fetch(`${API_BASE}/api/siparis/${id}/tamamla`, {
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

    const toplamFiyat = adet * BIRIM_FIYAT;
    const mesaj = `Sayın ${musteriAdi}, getirmiş olduğunuz iç malzeme ile hazırlanan ${adet} adet ${urunTuru} fırınımızdan taze çıkmıştır, hazırdır. Toplam hamur ve işçilik bedeli ${toplamFiyat} TL'dir. Ödeyip teslim alabilirsiniz. Afiyet olsun! 🔥`;

    // 2) WhatsApp'tan mesaj gönder
    if (waConnected) {
      try {
        const waRes = await fetch(`${API_BASE}/api/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefon, mesaj })
        });
        const waData = await waRes.json();

        if (waData.success) {
          showToast(`${musteriAdi} - ${adet} adet ${urunTuru} = ${toplamFiyat} ₺ — WhatsApp gönderildi! ✅`, 'success');
        } else {
          showToast(`Sipariş tamamlandı ama WA hatası: ${waData.error}. Manuel gönderiliyor...`, 'warning');
          whatsappFallback(telefon, mesaj);
        }
      } catch (waErr) {
        showToast('Sipariş tamamlandı ama WA bağlantı hatası. Manuel gönderiliyor...', 'warning');
        whatsappFallback(telefon, mesaj);
      }
    } else {
      // WhatsApp bağlı değilse eski yöntemle aç
      showToast(`${musteriAdi} - ${adet} adet = ${toplamFiyat} ₺ — WhatsApp açılıyor...`, 'info');
      whatsappFallback(telefon, mesaj);
    }

    gunlukIstatistikleriGuncelle();

  } catch (err) {
    console.error('Sipariş tamamlama hatası:', err);
    showToast('Sunucu bağlantı hatası!', 'error');
  }
}

// WhatsApp bağlı değilse fallback: tarayıcıda aç
function whatsappFallback(telefon, mesaj) {
  const url = `https://api.whatsapp.com/send/?phone=90${telefon}&text=${encodeURIComponent(mesaj)}&type=phone_number&app_absent=0`;
  window.open(url, '_blank');
}

// ─── SİPARİŞ SİL ────────────────────────────────────────────────────
async function siparisIptal(id) {
  if (!confirm('Bu siparişi silmek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/siparis/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      const card = document.getElementById(`card-${id}`);
      if (card) { card.classList.add('fade-out'); setTimeout(() => aktifSiparisleriYukle(), 350); }
      showToast('Sipariş silindi.', 'info');
    } else { showToast(data.error || 'Silinemedi!', 'error'); }
  } catch (err) { showToast('Sunucu bağlantı hatası!', 'error'); }
}

// ─── GÜNLÜK İSTATİSTİKLER ───────────────────────────────────────────
async function gunlukIstatistikleriGuncelle() {
  try {
    const res = await fetch(`${API_BASE}/api/rapor/gunluk`);
    const data = await res.json();
    document.getElementById('stat-tamamlanan').textContent = data.toplam?.toplam_siparis || 0;
  } catch (err) {}
}

// ─── RAPOR YÜKLEME ──────────────────────────────────────────────────
async function raporYukle() {
  try {
    const res = await fetch(`${API_BASE}/api/rapor/gunluk`);
    const data = await res.json();

    document.getElementById('rapor-tarih').textContent =
      new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const toplamAdet = data.toplam?.toplam_adet || 0;
    const toplamSiparis = data.toplam?.toplam_siparis || 0;
    const toplamCiro = toplamAdet * BIRIM_FIYAT;

    document.getElementById('rapor-toplam-adet').textContent = toplamAdet;
    document.getElementById('rapor-toplam-siparis').textContent = toplamSiparis;
    document.getElementById('rapor-toplam-ciro').textContent = `${toplamCiro} ₺`;

    const aktifRes = await fetch(`${API_BASE}/api/siparisler/aktif`);
    const aktifData = await aktifRes.json();
    document.getElementById('rapor-bekleyen').textContent = aktifData.length || 0;

    const ortalama = toplamSiparis > 0 ? (toplamAdet / toplamSiparis).toFixed(1) : 0;
    document.getElementById('rapor-ortalama').textContent = ortalama;

    const urunEmoji = { 'Lahmacun':'🥙', 'Kıymalı Pide':'🫓', 'Kaşarlı Pide':'🧀', 'Karışık Pide':'🍕', 'Diğer':'📦' };
    const urunListEl = document.getElementById('urun-rapor-list');
    if (data.urunRapor && data.urunRapor.length > 0) {
      const maxAdet = Math.max(...data.urunRapor.map(u => u.toplam_adet));
      urunListEl.innerHTML = data.urunRapor.map(u => {
        const yuzde = maxAdet > 0 ? (u.toplam_adet / maxAdet * 100) : 0;
        const ciro = u.toplam_adet * BIRIM_FIYAT;
        return `
          <div class="bg-dark-800/60 rounded-xl p-3.5">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-gray-200 flex items-center gap-2"><span>${urunEmoji[u.urun_turu]||'📦'}</span> ${u.urun_turu}</span>
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

    const tamamlananEl = document.getElementById('tamamlanan-list');
    if (data.tamamlananlar && data.tamamlananlar.length > 0) {
      tamamlananEl.innerHTML = data.tamamlananlar.map(s => {
        const cikisZaman = new Date(s.cikis_zamani).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
        const tutar = s.adet * BIRIM_FIYAT;
        return `
          <div class="flex items-center justify-between bg-dark-800/40 rounded-xl px-4 py-3 hover:bg-dark-800/60 transition-colors">
            <div class="flex items-center gap-3">
              <span class="text-emerald-400">✅</span>
              <div>
                <span class="font-semibold text-gray-200 text-sm">${escapeHtml(s.musteri_adi)}</span>
                <span class="text-dark-500 text-sm ml-2">${s.urun_turu}</span>
              </div>
            </div>
            <div class="text-right flex items-center gap-3">
              <span><span class="text-fire-400 font-bold">${s.adet}</span> <span class="text-dark-500 text-xs">adet</span></span>
              <span class="text-emerald-400 font-bold text-sm">${tutar} ₺</span>
              <span class="text-dark-600 text-xs">${cikisZaman}</span>
            </div>
          </div>`;
      }).join('');
    } else {
      tamamlananEl.innerHTML = '<p class="text-dark-500 text-center py-4">Henüz teslim yok</p>';
    }
  } catch (err) {
    showToast('Rapor yüklenemedi!', 'error');
  }
}

// ─── PDF GÜN SONU RAPORU ────────────────────────────────────────────
async function pdfIndir() {
  try {
    const res = await fetch(`${API_BASE}/api/rapor/gunluk`);
    const data = await res.json();

    const bugun = new Date().toLocaleDateString('tr-TR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const saatStr = new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });

    const toplamAdet = data.toplam?.toplam_adet || 0;
    const toplamSiparis = data.toplam?.toplam_siparis || 0;
    const toplamCiro = toplamAdet * BIRIM_FIYAT;

    const urunRows = (data.urunRapor || []).map(u => [
      u.urun_turu, u.siparis_sayisi.toString(), u.toplam_adet.toString(),
      `${BIRIM_FIYAT} TL`, `${u.toplam_adet * BIRIM_FIYAT} TL`
    ]);
    urunRows.push([
      { text:'TOPLAM', bold:true, fillColor:'#fff3e0' },
      { text:toplamSiparis.toString(), bold:true, fillColor:'#fff3e0' },
      { text:toplamAdet.toString(), bold:true, fillColor:'#fff3e0' },
      { text:'', fillColor:'#fff3e0' },
      { text:`${toplamCiro} TL`, bold:true, fillColor:'#fff3e0', color:'#e65100' }
    ]);

    const teslimatRows = (data.tamamlananlar || []).map((s, i) => {
      const cikisZaman = new Date(s.cikis_zamani).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
      return [(i+1).toString(), s.musteri_adi, s.urun_turu, s.adet.toString(), `${s.adet * BIRIM_FIYAT} TL`, cikisZaman];
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
        { text:'GUN SONU RAPORU', style:'title', margin:[0,0,0,5] },
        { text:`${bugun} - Saat: ${saatStr}`, style:'subtitle', margin:[0,0,0,20] },
        { columns:[
          { width:'*', stack:[{ text:'Toplam Siparis', style:'boxLabel' },{ text:toplamSiparis.toString(), style:'boxValue' }], margin:[0,0,5,0] },
          { width:'*', stack:[{ text:'Toplam Adet', style:'boxLabel' },{ text:toplamAdet.toString(), style:'boxValue' }], margin:[5,0,5,0] },
          { width:'*', stack:[{ text:'Birim Fiyat', style:'boxLabel' },{ text:`${BIRIM_FIYAT} TL`, style:'boxValue' }], margin:[5,0,5,0] },
          { width:'*', stack:[{ text:'TOPLAM CIRO', style:'boxLabel' },{ text:`${toplamCiro} TL`, style:'boxValueHL' }], margin:[5,0,0,0] }
        ], margin:[0,0,0,25] },
        { text:'Urun Bazli Ozet', style:'sectionTitle', margin:[0,0,0,8] },
        { table:{ headerRows:1, widths:['*','auto','auto','auto','auto'], body:[
          [{ text:'Urun Turu', style:'tH' },{ text:'Siparis', style:'tH' },{ text:'Adet', style:'tH' },{ text:'Birim', style:'tH' },{ text:'Tutar', style:'tH' }],
          ...urunRows
        ]}, layout:{ fillColor:r=>r===0?'#e65100':null, hLineWidth:()=>0.5, vLineWidth:()=>0.5, hLineColor:()=>'#e0e0e0', vLineColor:()=>'#e0e0e0' }, margin:[0,0,0,25] },
        { text:'Teslim Edilen Siparisler', style:'sectionTitle', margin:[0,0,0,8] },
        teslimatRows.length > 0 ? { table:{ headerRows:1, widths:[30,'*','auto','auto','auto','auto'], body:[
          [{ text:'#', style:'tH' },{ text:'Musteri', style:'tH' },{ text:'Urun', style:'tH' },{ text:'Adet', style:'tH' },{ text:'Tutar', style:'tH' },{ text:'Saat', style:'tH' }],
          ...teslimatRows
        ]}, layout:{ fillColor:r=>r===0?'#e65100':(r%2===0?'#fafafa':null), hLineWidth:()=>0.5, vLineWidth:()=>0.5, hLineColor:()=>'#e0e0e0', vLineColor:()=>'#e0e0e0' }} : { text:'Bugun teslim edilen siparis bulunmamaktadir.', style:'emptyText' }
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
        boxValue:{ fontSize:20, bold:true, color:'#333', alignment:'center', margin:[8,0,8,8], font:'Roboto' },
        boxValueHL:{ fontSize:20, bold:true, color:'#e65100', alignment:'center', margin:[8,0,8,8], font:'Roboto' },
        tH:{ fontSize:10, bold:true, color:'#fff', fillColor:'#e65100', margin:[4,6,4,6], font:'Roboto' },
        emptyText:{ fontSize:11, color:'#999', italics:true, margin:[0,10,0,0], font:'Roboto' }
      },
      defaultStyle:{ fontSize:10, color:'#333', font:'Roboto' }
    };

    const tarihDosya = new Date().toISOString().split('T')[0];
    pdfMake.createPdf(docDefinition).download(`gun-sonu-raporu-${tarihDosya}.pdf`);
    showToast('PDF raporu indiriliyor... 📄', 'success');
  } catch (err) {
    showToast('PDF oluşturulamadı!', 'error');
  }
}

// ─── YARDIMCI FONKSİYONLAR ──────────────────────────────────────────
function escapeHtml(t) { const d = document.createElement('div'); d.appendChild(document.createTextNode(t)); return d.innerHTML; }
function escapeJs(t) { return t.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"'); }
function formatTelefon(t) { if(!t||t.length!==10) return t; return `${t.substring(0,3)} ${t.substring(3,6)} ${t.substring(6,8)} ${t.substring(8,10)}`; }

// ─── OTOMATİK YENİLEME ─────────────────────────────────────────────
setInterval(() => { aktifSiparisleriYukle(); gunlukIstatistikleriGuncelle(); }, 30000);

// ─── SAYFA YÜKLENDIĞINDE ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  aktifSiparisleriYukle();
  gunlukIstatistikleriGuncelle();
  startWaPolling(); // WhatsApp durum takibini başlat
});

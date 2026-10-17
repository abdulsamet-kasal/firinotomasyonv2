# 🧠 PROJE DURUM DOSYASI — Fırınotomasyon

> **Bu dosya, projenin "hafızasıdır".** Yeni bir sohbet (chat) açıldığında yapay zekânın
> projenin **tamamına hâkim** olması için buraya kadar her şey buraya yazıldı.
>
> **Güncelleme tarihi:** 2026-10-17
> **Son sürüm:** v1.7 — POS/kart tahsilat takibi (+ yayınlanmamış stok sekmesi iyileştirmesi)
> **Canlı sunucu:** `http://127.0.0.1:3000` (kullanıcı `baslat.bat` ile çalıştırıyor)

---

## 0) YENİ SOHBET İÇİN İLK OKUMA (TL;DR)

- Bu proje; **fırın/unlu mamul emanet sipariş takibi + WhatsApp bildirim + stok/reçete + kasa/kârlılık** sistemidir.
- **Tek geliştirici dosyaları:** `server.js` (backend, ~2200 satır), `public/app.js` (~2270 satır), `public/index.html` (~975 satır). Geri kalanı doküman/betik.
- **Çalıştırma:** `baslat.bat` (WhatsApp + tarayıcı açar). **Kurulum:** `kurulum.bat` (`npm install`).
- **Test/geliştirme:** `WA_DISABLE=1` + farklı `PORT` ile ikinci bir kopya çalıştır (bkz. §9).
- **Veritabanı:** `emanet.db` (sql.js / SQLite WASM). **Gizli:** `.env`, `.wwebjs_auth/`, `emanet.db`, `yedekler/` → `.gitignore`'da.
- **Kâr kuralı:** brüt kâr = ciro − reçete malzeme maliyeti; net kâr = brüt kâr − diğer giderler **+ siparişsiz POS satışları** (stok açıkken "Malzeme Alımı" gideri çift sayılmasın diye hariç).
- **Stok aç/kapat:** `stok_aktif` ayarı. **2026-10-17'de kullanıcı "butonu bulamıyorum" dediği için** belirgin hale getirildi (bkz. §8).
- **POS entegrasyonu (v1.7):** Ödemeler **Nakit/Kart** tipiyle işaretlenir; Kasa'da gün sonu **Z raporu mutabakatı** var (bkz. §7-§8'de v1.7 notları). Kullanıcının klasik banka POS'u var — makineye yazılım-entegrasyonu yapılması **mümkün değil**, bu yüzden elle kayıt + mutabakat yolu seçildi.
- **⚠️ Git durumu:** `server.js`, `public/app.js`, `public/index.html`, `README.md`, `PROJE-DURUM.md` **commit edilip `v2`'ye pushlandı** (`99c4c12` — v1.7 + stok kapat butonu, 2026-10-17). Çalışma ağacı temiz.

---

## 1) PROJE NEDİR?

Fırınlar ve unlu mamul işletmeleri için **yerel (offline çalışabilen) web otomasyonu**:

- Müşteri, **kendi iç malzemesiyle** (kıyma, soğan vb.) emanet lahmacun/pide yaptırır.
- İşletme siparişi sisteme girer → fırına verir → adet girer → "FIRINDAN ÇIKTI" der.
- Sistem **otomatik WhatsApp mesajı** gönderir ("...hazırdır, toplam X TL'dir").
- Ürün reçetesine göre **stoktan malzeme düşer**, kritik seviyeye inince sahibine **WhatsApp uyarısı** gider.
- Gün sonu / tarih aralığı **ciro, kâr, kasa raporları** (PDF + CSV) üretilir.

Öne çıkan özellikler: ürün bazlı fiyat, ödeme takibi, stok + reçete + fire + malzeme alımı, kârlılık analizi, kullanıcı/rol yönetimi, yedekleme, PWA (telefona kurulum), masaüstü bildirimi.

---

## 2) TEKNOLOJİ YIĞINI

| Katman | Teknoloji | Not |
| :--- | :--- | :--- |
| Backend | Node.js + Express.js (`^4.21`) | REST API |
| Veritabanı | **sql.js** (`^1.11`, SQLite WASM) | Cihaza SQLite kurulumu gerekmez; bellekte çalışır, diske senkron yazar |
| WhatsApp | **whatsapp-web.js** (`^1.26`) | WhatsApp Web otomasyonu |
| Tarayıcı motoru | Puppeteer Core + sistemdeki Edge/Chrome/Brave | Harici Chromium indirmez, otomatik algılar |
| QR | qrcode (`^1.5`) | QR'ı DataURL'e çevirir |
| Frontend | Vanilla JS + HTML5 | Framework yok |
| Stil | TailwindCSS **CDN** | Koyu/fırın teması (CDN uyarısı normal) |
| PDF | pdfmake (CDN) | Gün sonu + detaylı rapor PDF |

**package.json** name: `emanet-lahmacun-takip`, start script: `node server.js`.

---

## 3) DOSYA HARİTASI

```text
Fırınotomasyon/
├── server.js                 # ★ Backend: Express + DB + WhatsApp + tüm API uçları (~2058 satır)
├── public/
│   ├── index.html            # ★ Tek sayfa arayüz (sekmeler, modallar) (~940 satır)
│   ├── app.js                # ★ Tüm frontend mantığı + PDF/CSV motoru (~2121 satır)
│   ├── manifest.json         # PWA manifest
│   └── sw.js                 # Service worker (çevrimdışı kabuk)
├── emanet.db                 # ★ Canlı SQLite DB (gitignore'da — GİZLİ)
├── yedekler/                 # Günlük otomatik yedekler (gitignore — GİZLİ)
├── .wwebjs_auth/             # WhatsApp oturumu (gitignore — GİZLİ)
├── .wwebjs_cache/            # WhatsApp önbelleği (gitignore)
├── node_modules/             # Bağımlılıklar (gitignore)
├── .env.example              # Ortam değişkenleri örneği (.env'i bundan kopyala)
├── baslat.bat                # Tek tıkla başlat (chcp 65001 + cd + OPEN_BROWSER=1 + node server.js)
├── kurulum.bat               # Node kontrol + npm install
├── README.md                 # Kullanıcı dokümantasyonu (sürüm notları v1.1→v1.6)
├── GELISTIRME-ONERILERI.md   # Yol haritası (26 madde, 19 uygulandı / 7 ertelendi)
├── PROJE-DURUM.md            # ★ BU DOSYA (geliştirici/AI devir notu)
├── package.json / package-lock.json
└── PROJE_ONERI_FORMU_DOLDURULMUS.docx  # (İlgisiz proje formu, git dışı)
```

---

## 4) HIZLI BAŞLANGIÇ

- **Çalıştır:** `baslat.bat` → sunucu `127.0.0.1:3000`'de açılır, WhatsApp başlar, tarayıcı otomatik açılır (QR okutulur).
- **Durdur:** Konsol penceresini kapat ya da Ctrl+C.
- **Sadece frontend değiştiyse:** sunucuyu yeniden başlatmaya gerek yok — statik dosyalar her istekte okunur, **tarayıcıda F5** yeterli.
- **server.js değiştiyse:** sunucu yeniden başlatılmalı (ve yeni ayar/kolonlar DB'ye restart'ta eklenir).

---

## 5) VERİTABANI ŞEMASI

> Şema, `initDatabase()` içinde kurulur; eksik kolonlar `ALTER TABLE` (try/catch) ile eklenir.

### Temel tablolar
| Tablo | Kolonlar |
| :--- | :--- |
| **siparisler** | `id`, `musteri_adi`, `telefon`, `urun_turu`, `adet`, `durum` (`Fırında`/`Tamamlandı`), `odeme_durumu` (`Bekliyor`/`Ödendi`), `odeme_tipi` (v1.7: `Nakit`/`Kart` — `Bekliyor`'ken boş), `giris_zamani`, `cikis_zamani`, `created_date` |
| **ayarlar** | `anahtar` (PK), `deger` — anahtar/değer ayar deposu |
| **stok** | `id`, `ad`, `birim`, `miktar`, `kritik`, `created_at` |
| **stok_hareketleri** | `id`, `stok_id`, `tip`, `miktar`, `aciklama`, `otomatik` (0/1), `zaman` |
| **recete** | `id`, `urun_turu`, `stok_id`, `miktar` |
| **giderler** | `id`, `aciklama`, `miktar`, `kategori`, `tarih`, `created_at` |
| **pos_z** (v1.7) | `id`, `tarih`, `tutar` (POS Z raporu toplamı), `aciklama`, `created_at` |
| **pos_satis** (v1.7) | `id`, `tarih`, `tutar`, `aciklama`, `created_at` — siparişsiz kart satışları (mutabakata dahil, kasaya maliyetsiz gelir) |
| **mesaj_log** | `id`, `telefon`, `musteri_adi`, `urun_turu`, `mesaj`, `durum`, `hata`, `yon` (`giden`/`gelen`), `zaman` |
| **islem_log** | `id`, `kullanici`, `islem`, `detay`, `zaman` (denetim izi) |
| **kullanicilar** | `id`, `kullanici` (UNIQUE), `sifre_hash` (scrypt), `rol` (`admin`/`personel`), `aktif`, `created_at` |

### Sonradan eklenen kolonlar (ALTER TABLE — migration)
- `siparisler.odeme_durumu`, `siparisler.birim_fiyat` (sipariş tamamlanınca **mühürlenen** fiyat), `siparisler.grup_no`, `siparisler.notlar` (çok-ürünlü sepet ve sıra no için **hazır ama arayüz yok**)
- `stok.birim_maliyet` (alış fiyatı), `stok.tedarikci`

### Kurulum davranışları
- **İlk açılış:** stok boşsa **16 temel malzeme + 4 ürün için gerçekçi reçete** (Lahmacun, Kıymalı/Kaşarlı/Karışık Pide) otomatik yüklenir. Yalnızca bir kez; mevcut veri varsa çalışmaz.
- **Günlük yedek:** `yedekler/emanet-YYYY-MM-DD.db` (günde 1 kez; 30 günden eskisi silinir).
- ⚠️ Malzemeler **0 kg** başlar → ilk açılışta kırmızı **"KRİTİK"** görünür. `+ Giriş`/`+ Alış` ile gerçek stok girilir.
- ⚠️ Reçete düşümü stok eksikse miktarı **negatife** indirebilir (gerçek eksik açık görünsün diye — normal).

---

## 6) API UÇLARI (özet)

> Tümü `server.js` içinde. `rolGerekli('admin')` işaretliler **personel** rolünde **403** döner.

**Kimlik / Auth**
`GET /api/auth-durum`, `POST /api/login`, `POST /api/auth-cikis`

**WhatsApp**
`GET /api/whatsapp/status`, `POST /api/whatsapp/send`, `POST /api/whatsapp/reconnect`, `POST /api/whatsapp/logout`

**Siparişler**
`POST /api/siparis`, `GET /api/siparisler/aktif`, `PUT /api/siparis/:id/tamamla`, `PUT /api/siparis/:id/odeme`, `DELETE /api/siparis/:id`, `GET /api/siparisler/tamamlanan?tarih=&q=`

**Ayarlar**
`GET /api/ayarlar`, `PUT /api/ayarlar` *(admin)* — sadece **gönderilen alanları** günceller (kısmi güncelleme güvenli).

**Stok / Reçete**
`GET|POST /api/stok`, `PUT|DELETE /api/stok/:id`, `POST /api/stok/:id/hareket`, `GET /api/stok/hareketler`, `GET /api/recete`, `PUT /api/recete/:urun`

**Kasa / POS**
`GET /api/kasa?baslangic=&bitis=` — (v1.7) yanıtta `gelir_nakit`, `gelir_kart`, `pos_satis` kırılımı var; `net = gelir + pos_satis − gider`.

**POS Mutabakat (v1.7, hepsi admin)**
`GET /api/pos/mutabakat?baslangic=&bitis=` (sistem kart toplamı + Z toplamı + fark + Z kayıtları), `POST /api/pos/z` `{tarih,tutar,aciklama}`, `DELETE /api/pos/z/:id`, `POST /api/pos/satis` `{tutar,aciklama,tarih?}`, `DELETE /api/pos/satis/:id`. CSV türü: `disa-aktar/pos-mutabakat?baslangic=&bitis=` (gün gün: sipariş kartı + siparişsiz + Z + fark).

**Gider / Kârlılık**
`GET|POST /api/giderler`, `DELETE /api/giderler/:id`, `GET /api/rapor/karlilik`, `GET /api/rapor/musteriler`, `GET /api/rapor/saatlik`, `GET /api/kasa/aylik`, `GET /api/rapor/detayli?baslangic=&bitis=` *(admin)*

**Rapor / Dışa aktarma**
`GET /api/rapor/gunluk`, `GET /api/rapor/aralik?baslangic=&bitis=`, `GET /api/disa-aktar/:tur` *(admin)* — `tur` ∈ `siparisler|giderler|stok|karlilik|detayli|pos-mutabakat`; **UTF-8 BOM + `;` ayraçlı** CSV (Excel Türkçe uyumlu). `gunluk`/`aralik`/`detayli` yanıtlarında (v1.7) `tahsil_nakit` / `tahsil_kart` / `pos_satis` kırılım alanları da var.

**Yedek / Log / Kullanıcı** *(hepsi admin)*
`GET /api/yedekler`, `POST /api/yedek/al`, `GET /api/yedek/indir?dosya=`, `POST /api/yedek/yukle`, `GET /api/mesajlar`, `GET /api/loglar`, `GET|POST /api/kullanicilar`, `PUT|DELETE /api/kullanicilar/:id`

**Sağlık:** `GET /api/health`

---

## 7) AYARLAR (VARSAYILANLAR) ve İŞ KURALLARI

`VARSAYILAN_AYARLAR` (tabloda `ayarlar` anahtar/değer):
`birim_fiyat`, `urunler` (JSON: ad + ikon + fiyat), `isletme_adi`, `sahip_telefon`, `kritik_uyari` (`'1'`), **`stok_aktif` (`'1'`)**, `oto_cevap` (`'1'`), `hazirlik_dk` (`'15'`), `mesaj_sablonu`.

**Mesaj şablonu değişkenleri:** `{musteri}`, `{adet}`, `{urun}`, `{tutar}`, `{isletme}`.

### Temel iş kuralları (bunlara dikkat!)
1. **Fiyat "mühürlenir":** Sipariş tamamlanırken ürünün **o anki** birim fiyatı `siparisler.birim_fiyat`'a yazılır. Sonradan fiyat değişse geçmiş raporlar bozulmaz.
2. **Kasa geliri = yalnızca "Ödendi"** siparişler. "Bekliyor" → bekleyen ödeme.
3. **Ödeme UI:** belirsiz toggle yok; net **"💵 Ödeme Alındı"** butonu → sonra **"✅ Ödendi"** rozeti + "geri al" linki. (Fırın kartı, Fırından Çıkanlar ve rapor — üçünde aynı.)
4. **Kâr hesabı:**
   - **Brüt kâr** = ciro − reçeteden hesaplanan **malzeme maliyeti**.
   - **Net kâr** = brüt kâr − **diğer giderler** + **siparişsiz POS satışları** (v1.7).
   - **Stok AÇIKken:** "Malzeme Alımı" kategorisi diğer giderlerden **hariç** (çift sayımı önler).
   - **Stok KAPALIyken:** malzeme maliyeti = **0**; **tüm giderler** net kâra dahil.
5. **Stok kapalıyken:** `receteDus` (malzeme düşümü) çalışmaz, `kritikStokUyar` gönderilmez, düşük stok listesi boş döner, kârlılıkta maliyet 0 sayılır.
6. **Yüzdeler** 1 ondalığa yuvarlanır (`Math.round(x*1000)/10`).
7. **Zaman dilimi:** Raporlar UTC değil **yerel saat** kullanır (`getLocalDateString`) → gece 00:00–03:00 siparişleri kaybolmaz.
8. **Ödeme tipi (v1.7):** Sipariş "Ödendi" yapılırken **Nakit/Kart** seçilmek zorunda; "geri al" (Bekliyor) tipi boşaltır. Migration'da eski "Ödendi" kayıtları **Nakit** kabul edilir. Mutabakat kıyaslama: her gün için `sistem kart = sipariş kart tahsilatı (cikis_zamani günü) + pos_satis` vs `girilen Z toplamı`; fark = sistem − Z.

---

## 8) FRONTEND YAPISI

### Sekmeler (`switchTab`)
`main` (Ana/Sipariş) · `report` (Rapor) · `stok` (Stok/Reçete) · `kasa` (Gelir/Gider) · `karlilik` (Kârlılık & Analiz)

- **Rol:** personel → `kasa`, `karlilik` sekmeleri **gizli**; ayarların kullanıcı/yedek/log kutuları gizli; sunucu tarafı da 403.
- `uygulaRol()` → role + stok ayarına göre görünürlüğü ayarlar.

### Öne çıkan fonksiyonlar (`app.js`)
- **Başlangıç:** `baslangicAkisi`, `girisYap`, `authKontrol`, `oturumGeriYukle`, `gunuBaslat`/`gunuDurdur`
- **WhatsApp:** `whatsappDurumKontrol`, `startWaPolling` (3 sn'de bir), `whatsappFallback` (kopuksa `api.whatsapp.com` linkini yeni sekmede açar → mesaj kaybolmaz)
- **Sipariş:** `aktifSiparisleriYukle`, `siparisiTamamla` (adet doğrula → tamamla → mesaj üret → gönder), `odemeAyarla(id, yeni, tip)` / `odemeButonu(s)` (v1.7: Nakit/Kart iki buton + tipli rozet), `siparisIptal`, `cikanlariYukle`
- **Stok:** `stokYukle`/`stokCiz`/`stokEkle`, `stokHareketKaydet`, `stokDuzenleKaydet`, `stokSil`, `hareketleriYukle`, `receteleriYukle`/`receteKaydet`
- **Stok aç/kapat (v1.6):** `stokAktifMi()`, `stokTakibiniKapat()`, `stokTakibiniAc()`, `stokDurumDegistir(aktif)`
- **Kasa/Kârlılık:** `kasaYukle` (v1.7: nakit/kart kırılımı + `posMutabakatYukle` çağrısı), `kasaGrafikYukle`, `giderEkle`/`giderSil`, `karlilikYukle`, `karlilikHizli`
- **POS mutabakat (v1.7):** `posMutabakatYukle(b, s)`, `posZKaydet`, `posZSil`, `posSatisKaydet`, `posSatisSil` — Kasa sekmesindeki "💳 POS Mutabakatı" kutusunu yönetir (`pos-mutabakat-ozet`, `pos-mutabakat-liste`, `pos-z-*`, `pos-satis-*` id'leri). Admin görür (kasa sekmesi personelde zaten gizli).
- **Rapor:** `raporuCiz`, `pdfIndir` (gün sonu), `donemAraligi(prefix)`, `detayliPdfIndir(prefix)`, `detayliPdfOlustur()`, `detayliCsvIndir(prefix)`, `csvIndir`
- **Yedek/Kullanıcı/Log:** `yedekAl`/`yedekIndir`/`yedekYukle`/`yedekleriYukle`, `kullaniciEkle`/`kullaniciSil`, `loglariYukle`, `mesajlariGoster`
- **Bildirim:** `bildirimDestekleniyor`/`bildirimDurumunuDegistir`/`maasustuBildirim` (yazım hatası: "maasustu")

### v1.6 — Detaylı rapor mimarisi (tek kaynak)
- Tek kaynak: **`detayliRapor(baslangic, bitis)`** → `GET /api/rapor/detayli`.
- **PDF** (`detayliPdfOlustur`) ve **CSV** (`/api/disa-aktar/detayli`) bu fonksiyonu kullanır.
- Butonlar hem **Kârlılık** hem **Kasa** sekmesinde; tarih aralığı `donemAraligi('karlilik'|'kasa')` ile okunur.
- Rapor bölümleri: Özet (kâr/zarar) · Ürün bazlı kârlılık · Gider kategorileri · Gün gün döküm · Müşteriler · Saatlik yoğunluk · Teslim edilen siparişler.

### v1.6 — Stok aç/kapat (2026-10-17'de İYİLEŞTİRİLDİ)
**Sorun:** Buton yalnızca Ayarlar içinde küçük bir kutuydu → kullanıcı bulamadı.
**Çözüm (yayınlanmamış):**
- **Stok sekmesi artık HER ZAMAN görünür** (kapalıyken gizlenmiyor).
- Sekme başlığında belirgin buton: **`⏸️ Stok takibini kapat`** → `confirm()` ile onay ister, `stokDurumDegistir(false)` çağırır.
- Kapalıyken ortada açıklamalı kutu: **"📦 Stok takibi kapalı"** + **`▶️ Stok Takibini Aç`** butonu (`btn-stok-ac`).
- İlgili id'ler: `stok-icerik`, `stok-kapali`, `btn-stok-kapat`, `btn-stok-ac`, `stok-alt-baslik`. `uygulaRol()` bunları yönetir.
- Ayarlar'daki kutu da ayrı, **mavi çerçeveli belirgin bloğa** taşındı (`ayar-stok-aktif`).
- Aç/kapat butonları **yalnızca admin**'e görünür. `PUT /api/ayarlar` sadece `{stok_aktif}` gönderir → ürün/ayar bozulmaz.

---

## 9) GELİŞTİRME / TEST İPUÇLARI (KRİTİK)

**Canlı veriye dokunmadan test etme yöntemi:**
```powershell
# 1) Geçici klasöre kopya (kendi DB'sini kurar — DB_PATH = __dirname/emanet.db)
$tmp = "$env:TEMP\opencode\firin-test"
# server.js + package.json + public/ kopyala
# node_modules'ü junction ile bağla (kopyalama):
New-Item -ItemType Junction -Path "$tmp\node_modules" -Target "<proje>\node_modules"
# 2) Farklı port + WhatsApp kapalı olarak başlat
$env:WA_DISABLE='1'; $env:PORT='3100'; $env:OPEN_BROWSER='0'; node server.js
```
- Test bitince: sunucuyu durdur, junction'ı `cmd /c rmdir` ile sil, temp klasörü kaldır, tarayıcı sekmesini kapat.

**Tuzaklar / dikkat:**
- **Windows konsolu Türkçe karakterleri bozar** (kaynak dosyalar doğrudur; sadece konsol çıktısı bozuk görünür). `baslat.bat` içinde `chcp 65001` var.
- **PowerShell `--jq`:** boşluklar argümanı böler → JSON'u `ConvertFrom-Json` ile işle.
- **sql.js `db.export()`** bağlantıyı kapatıp açar → `last_insert_rowid()` sıfırlanır; yeni id için `SELECT MAX(id)` kullan.
- **`node --check server.js` / `node --check public/app.js`** ile hızlı sözdizimi kontrolü.
- `public/index.html` Tailwind CDN kullanıyor → tarayıcı konsolunda **CDN uyarısı normal**, hata değil.
- `DB_PATH = path.join(__dirname, 'emanet.db')` → kopya klasör kendi DB'sini kullanır; canlı DB'ye dokunmaz.

---

## 10) ORTAM DEĞİŞKENLERİ (`.env`)

`.env.example`'ı `.env` olarak kopyalayın. Değişkenler:

| Değişken | Açıklama | Varsayılan |
| :--- | :--- | :--- |
| `PORT` | Sunucu portu | `3000` |
| `HOST` | `127.0.0.1` (güvenli) / `0.0.0.0` (ağdaki cihazlar — **şifre şart**) | `127.0.0.1` |
| `APP_PASSWORD` | Giriş şifresi; boşsa şifre koruması kapalı | *(boş)* |
| `OPEN_BROWSER` | Açılışta tarayıcıyı aç (`1`/`0`) | baslat.bat ile `1` |
| `PUPPETEER_EXECUTABLE_PATH` | Elle Chrome/Edge yolu (opsiyonel) | *(otomatik)* |
| `WA_DISABLE` | `1` ise WhatsApp hiç başlatılmaz (test için) | *(boş)* |
| `CHROME_PATH` / `LOCALAPPDATA` | Tarayıcı algılama için kullanılır | — |

> **Güvenlik:** `HOST=0.0.0.0` yaparsan **mutlaka** `APP_PASSWORD` belirle; yoksa ağdaki herkes müşteri verisini görür.

---

## 11) SÜRÜM GEÇMİŞİ

| Sürüm | Özet |
| :--- | :--- |
| **v1.0** | İlk sürüm: sipariş girişi, WhatsApp otomatik mesaj, gün sonu PDF |
| **v1.1** | Ayarlar ekranı, ödeme durumu, tarih aralığı raporu, otomatik günlük yedek, sesli uyarı, gün oturumu hatırlama, güvenlik/doğrulama düzeltmeleri |
| **v1.2** | Ürün bazlı fiyatlandırma (fiyat "mühürleme"), çok tarayıcı destekli WhatsApp, stabilite düzeltmeleri |
| **v1.3** | Fırından Çıkanlar + arama, **stok takip**, **reçete/otomatik düşüm**, **Gelir/Gider (Kasa)**, CSV |
| **v1.4** | Net ödeme butonu ("💵 Ödeme Alındı"), 16 malzeme + 4 gerçekçi reçete otomatik kurulumu, yol haritası dosyası |
| **v1.5** | Kârlılık & Analiz sekmesi, malzeme alış fiyatı + tedarikçi, fire/zayi, kritik stok WhatsApp uyarısı, mesaj şablonu + mesaj geçmişi + otomatik cevap robotu, aylık grafik, CSV dışa aktarma, yedek geri yükleme, kullanıcı/rol, masaüstü bildirimi, PWA, işlem günlüğü |
| **v1.6** | **Stok takibi aç/kapat** + **detaylı kâr/zarar raporu (PDF & CSV)** + kârlılık kartları & CSV zenginleştirme |
| **v1.7** | **POS/kart tahsilat takibi**: Nakit/Kart ödeme tipi seçimi, kasa + raporlarda nakit/kart kırılımı, **POS Mutabakatı** (Z raporu karşılaştırma + siparişsiz kart satışları), `pos_z`/`pos_satis` tabloları, `pos-mutabakat` CSV'i. Klasik banka POS'una yazılım entegrasyonu **mümkün olmadığından** elle kayıt + mutabakat yolu seçildi. |

---

## 12) GIT / DEPO DURUMU

**Branch:** `main`

**Remote'lar:**
| Remote | URL | Açıklama |
| :--- | :--- | :--- |
| `origin` | `https://github.com/abdulsamet-kasal/firin-otomasyonu.git` | Eski **public** repo (v1.0 hâli) |
| `v2` | `https://github.com/abdulsamet-kasal/firinotomasyonv2.git` | **Güncel public repo** (v1.5 → v1.6) |

**Commit'ler (main):**
```
f74518f  İlk commit (v1.0)
86da8de  v1.5
e17ea28  v1.6: stok takibi aç/kapat + detaylı kâr/zarar raporu
0c2234b  v1.6.1: stok aç/kapat butonu stok sekmesine taşındı + PROJE-DURUM.md eklendi
99c4c12  v1.7: pos/kart tahsilat takibi (+ commit mesajında hataen stok butonundan da söz edilir — asıl işi v1.7'dir)
```
Güncel sürümü gönderme komutu: **`git push v2 main`** → **2026-10-17'de gönderildi (99c4c12).** Çalışma ağacı temiz, yayımlanmamış değişiklik yok.

**`.gitignore` korumaları (public paylaşım için gizli tutuluyor):**
`.env`, `.wwebjs_auth/`, `.wwebjs_cache/`, `*.db` / `emanet.db`, `yedekler/`, `node_modules/`, `*.docx/*.doc`, `*.log`, `*.pem/*.key/*.cert`. → Repoda **gizli anahtar/oturum/DB yok**.

**Not:** Eski public repo `firin-otomasyonu` (v1.0) güncellenmedi/arşivlenmedi — kullanıcı karar verirse: `git push origin main` (güncelle) veya GitHub'dan arşivle/sil.

---

## 13) BEKLEYEN İŞLER / YOL HARİTASI

### Şu an beklemede (ACİL DEĞİL)
1. ~~§12'deki değişikliklerin commit + push'u~~ → **Tamamlandı (99c4c12, 2026-10-17).**
2. (Belki) eski `origin` repo güncellensin/arşivlensin.
3. İlgi alanı (kullanıcı vurgusu): klasik banka POS'una yazılım entegrasyonu mümkün değil; ileride **akıllı/Android POS** veya **sanal POS (iyzico/PayTR, WhatsApp ödeme linki)** istenirse bu yola geçilebilir (internet + sağlayıcı hesabı gerekir).

### `GELISTIRME-ONERILERI.md`'den ERTELENENLER (kullanıcı isterse sıradaki sürüm)
- **1.1** Çok ürünlü sipariş (sepet) — *veri modeli hazır: `grup_no`, `notlar` alanları var; arayüz yok.*
- **1.2** Sıra no + tahmini çıkış saati — *`hazirlik_dk` ayarı hazır.*
- **1.4** Müşteri kaydı & geçmişi (telefon girince isim otomatik dolsun) — *kısmen müşteri raporu var.*
- **1.5** Kısmi teslim / iptal gerekçesi
- **1.6** Vardiya / gün aç-kapa kilidi (gün sonu sayımı) — *"Günü Başlat" altyapısı var.*
- **2.5** Envanter (sayım) modu + fark raporu
- **3.3** Personel/yevmiye takibi (otomatik gider)
- **3.5** Bekleyen ödeme hatırlatması (gün sonu)
- **4.4** Otomatik haftalık/aylık PDF + WhatsApp (*zamanlanmış otomatik gönderim*)
- **5.4** SMS yedeği (ücretli servis gerekir)
- **6.3** Bulut yedek (Google Drive / e-posta)
- **6.5** Çok şube / çok fırın desteği (yapısal)

**Toplam:** 26 maddenin **19'u uygulandı**, 7(+) ertelendi.

### Geliştirici notu (kullanıcı ne istedi?)
- 2026-10-17: Kullanıcı "**stok takip kısmını kapatma butonu** koymamışsın ya da bulamadım; sonra diyeceğim özellikleri ekleyeceğiz" dedi.
  → Buton vardı ama gizliydi; **belirgin hale getirildi** (§8). Kullanıcı **yeni özellik listesini verecek** → hazır ol.
- 2026-10-17: Kullanıcı **POS entegrasyonu** istedi ("POStan alınan ödemeler sisteme girsin, ya da burdan POS'a ödeme aktarılsın"). Seçim: **Nakit/Kart takibi + Z raporu mutabakatı**, cihaz **klasik banka POS'u** (API'si yok → direkt entegrasyon mümkün değil). **v1.7 olarak uygulandı ve test edildi** (bkz. §6-§8). İleride sanal POS/ödeme linki istenirse yukarıdaki 3. maddeye bak.

---

## 14) BAŞKA BİLGİSAYARA TAŞIMA

**Kopyalanacak:** `public/`, `server.js`, `package.json`, `kurulum.bat`, `baslat.bat` (+ veri için isteğe bağlı `emanet.db`).
**Kopyalanmayacak (otomatik oluşur):** `node_modules/`, `.wwebjs_auth/`.
**Yeni bilgisayarda:** Node.js LTS kur → `kurulum.bat` → `baslat.bat` → QR okut.

---

## 15) BİLİNEN TUZAKLAR / DİKKAT EDİLECEKLER

- **Windows konsolu** Türkçe karakterleri bozuk gösterir (dosyalar doğru).
- **sql.js**: `export()` sonrası `last_insert_rowid()` sıfırlanır → `SELECT MAX(id)`.
- **Tailwind CDN uyarısı** tarayıcı konsolunda normaldir.
- Reçete düşümü stok **negatife** inebilir — bu kasıtlı (eksik açık görünsün).
- Stok **0 kg** başlar → başlangıçta "KRİTİK" etiketi normal.
- `PUT /api/ayarlar` yalnızca gönderilen alanları günceller → kısmi güncelleme güvenli.
- Admin olmayan kullanıcı için stok aç/kapat butonları gizli; sunucu da 403 verir.

---

*Bu dosya, yeni sohbetlerin projeye hızlı hâkim olması için tutulur. Önemli bir değişiklikte güncellenmeli.* 🔥

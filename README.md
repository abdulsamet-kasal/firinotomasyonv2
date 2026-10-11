# 🔥 Emanet Lahmacun & Pide Takip ve WhatsApp Bildirim Sistemi

Bu proje; fırınlar ve unlu mamul işletmeleri için geliştirilmiş, müşterilerin getirdiği iç malzemelerle hazırlanan emanet siparişleri (lahmacun, pide vb.) takip eden, sipariş fırından çıktığında müşteriye otomatik **WhatsApp bildirimi** gönderen ve gün sonu ciro/adet raporları (PDF dahil) sunan web tabanlı yerel bir otomasyon sistemidir.

---

## 📁 Proje Dizin Yapısı (Nerede Ne Var?)

```text
Fırınotomasyon/
│
├── public/                       # Frontend (Kullanıcı Arayüzü) Dosyaları
│   ├── index.html                # Sistemin tek sayfalık modern arayüzü (HTML5 + TailwindCSS)
│   └── app.js                    # Arayüz mantığı, WhatsApp durumu, API istekleri ve PDF motoru
│
├── node_modules/                 # Projenin çalışması için gereken harici kütüphaneler
├── .wwebjs_auth/                 # WhatsApp oturum bilgileri (Kayıtlı telefon oturumu)
│
├── emanet.db                     # SQLite veritabanı dosyası (Tüm sipariş ve rapor geçmişi)
├── server.js                     # Projenin beyni (Express.js sunucusu, SQLite ve WhatsApp motoru)
├── package.json                  # Proje bağımlılıkları ve konfigürasyonu
├── package-lock.json             # Kütüphane sürüm kilit dosyası
├── baslat.bat                    # Tek tıkla sistemi ve tarayıcıyı başlatan betik
├── kurulum.bat                   # Yeni bilgisayarda ortamı hazırlayan kurulum betiği
└── README.md                     # Projenin kapsamlı dokümantasyonu (Bu dosya)
```

---

## ⚙️ Teknoloji Yığını (Tech Stack)

| Katman | Teknoloji / Kütüphane | Kullanım Amacı |
| :--- | :--- | :--- |
| **Backend** | **Node.js & Express.js** | Web sunucusu ve REST API altyapısı |
| **Veritabanı** | **sql.js (SQLite WASM)** | Cihaza SQLite kurulumu gerektirmeden bellekte çalışıp diske senkron olan veritabanı |
| **WhatsApp Motoru** | **whatsapp-web.js** | WhatsApp Web'i arka planda yöneten çekirdek otomasyon kütüphanesi |
| **Tarayıcı Motoru** | **Puppeteer Core + MS Edge/Chrome** | WhatsApp Web'i arka planda çalıştıran Chromium motoru |
| **QR Kod** | **qrcode** | WhatsApp Web QR kodunu arayüzde göstermek için DataURL'e çevirir |
| **Frontend** | **HTML5 + Vanilla JS** | Hafif, hızlı ve bağımlılıksız modern JavaScript arayüzü |
| **Stil / Tasarım** | **TailwindCSS (CDN)** | Koyu tema (Dark Mode) fırın/ateş temalı modern tasarım |
| **Raporlama** | **pdfmake (CDN)** | Gün sonu raporunu tablo ve ciro dökümüyle PDF'e dönüştürür |

---

## 🧠 Kod Bloklarının Detaylı Analizi

### 1. `server.js` (Sunucu ve Arka Plan Motoru)

Sunucu dosyası backend'in tüm yönetimini üstlenir. 4 temel bölümden oluşur:

#### A) Veritabanı Yönetimi (`sql.js`)
* **`initDatabase()`**: Sunucu açıldığında `emanet.db` dosyasını diskten okur. Dosya yoksa sıfırdan oluşturur. `siparisler` tablosunu otomatik kurar.
* **`saveDatabase()`**: Bellekteki veritabanı durumunu `emanet.db` dosyasına binary buffer olarak yazar (her işlemde ve 10 saniyede bir otomatik).
* **Veritabanı Tablosu (`siparisler`)**:
  * `id`: Benzersiz sipariş numarası (Otomatik artan).
  * `musteri_adi`: Müşterinin adı soyadı.
  * `telefon`: 10 haneli telefon numarası.
  * `urun_turu`: Lahmacun, Kıymalı Pide, Kaşarlı Pide, Karışık Pide, Diğer.
  * `adet`: Fırından çıktığında girilen gerçek pişmiş adet.
  * `durum`: `'Fırında'` veya `'Tamamlandı'`.
  * `giris_zamani`: Siparişin fırına girdiği saat.
  * `cikis_zamani`: Fırından çıkış anı.
  * `created_date`: Günlük rapor filtrelemesi için yerel tarih (`YYYY-MM-DD`).

#### B) Otomatik Tarayıcı Algılama (`getBrowserExecutablePath`)
* Sisteme harici Chromium indirmeye gerek bırakmaz.
* Windows üzerinde **Google Chrome**, **Microsoft Edge** (`msedge.exe`) ve **Brave** yollarını sırayla tarar.
* Her Windows 10 ve 11 bilgisayarda varsayılan bulunan Microsoft Edge'i otomatik algılayarak WhatsApp Web motorunu sorunsuz başlatır.

#### C) WhatsApp Yaşam Döngüsü (`initWhatsApp`)
* **`LocalAuth`**: WhatsApp oturumunu `.wwebjs_auth/` klasörüne kaydeder. Sunucu yeniden başlasa bile tekrar QR kod okutmaya gerek kalmaz.
* **`qr` Event**: WhatsApp Web QR kodu ürettiğinde bunu Base64 resme (`data:image/png;base64,...`) dönüştürerek web arayüzüne servis eder.
* **`ready` Event**: Bağlantı kurulduğunda telefon numarasını ve profil adını hafızaya alır.
* **`disconnected` / `logout`**: Oturum kapatıldığında oturum klasörünü temizler ve yeni QR için sistemi yeniden başlatır.

#### D) REST API Uç Noktaları
* `GET /api/whatsapp/status`: WhatsApp bağlantı durumunu (`initializing`, `qr`, `connected`, `error`), QR kodunu ve bağlı numara bilgisini döner.
* `POST /api/whatsapp/send`: Müşteri numarasına formatlama uygular (`905XXXXXXXXX@c.us`) ve `{ waitUntilMsgSent: true }` parametresiyle WhatsApp sunucusundan teslim onayı alana kadar bekleyip mesajı iletir.
* `POST /api/siparis`: Yeni müşteri adı, telefon ve ürün türüyle siparişi fırına alır.
* `GET /api/siparisler/aktif`: Fırında pişmekte olan tüm bekleyen siparişleri listeler.
* `PUT /api/siparis/:id/tamamla`: Siparişe çıkan adet bilgisini ekler, durumunu `'Tamamlandı'` yapar ve çıkış saatini mühürler.
* `GET /api/rapor/gunluk`: Bugün teslim edilen siparişleri, ürün dağılımını, toplam adedi ve toplam ciroyu yerel saat dilimine göre hesaplar.
* `DELETE /api/siparis/:id`: Hatalı girilen siparişi iptal eder/siler.

---

### 2. `public/index.html` (Arayüz Tasarımı)

* **Başlangıç Ekranı (Start Overlay)**: Günün başında açılan pencereli karşılama ekranı. WhatsApp bağlı değilse QR kodunu gösterir, bağlıysa "GÜNÜ BAŞLAT" butonuyla ana ekrana geçişi sağlar.
* **Üst Bar (Header)**: Canlı saat, aktif fırındaki sipariş sayısı sayacı, WhatsApp durum rozeti (`WA Bağlı` / `QR Bekliyor`), bağlantı kesme butonu ve "GÜNÜ DURDUR" kontrolü.
* **Sol Panel (Sipariş Giriş Formu)**:
  * Müşteri adı girişi.
  * Akıllı telefon formatlama kutusu (yazarken otomatik boşluk koyar).
  * Tek tıkla ürün türü butonları (Lahmacun, Kıymalı, Kaşarlı, Karışık, Diğer).
  * "FIRINA VER" butonu.
* **Sağ Panel (Fırındaki Siparişler)**:
  * Her sipariş için dinamik kart oluşturulur.
  * Kartta müşterinin adı, ürün ikonu, giriş saati ve fırında geçen dakika sayacı yer alır.
  * Kart üzerinde **Adet Girişi** alanı bulunur. Adet girildiğinde anlık olarak **Birim Fiyat (15 ₺)** ile tutar otomatik hesaplanır.
  * **"✅ FIRINDAN ÇIKTI"** butonuna basıldığında sipariş tamamlanır ve otomatik WhatsApp mesajı gönderilir.
* **Günlük Rapor Sekmesi**:
  * Toplam sipariş, toplam adet, ortalama adet/sipariş ve günün toplam cirosu kartları.
  * Ürün bazlı sipariş ve ciro dağılım grafikleri.
  * Bugün teslim edilen tüm müşterilerin geçmiş listesi.

---

### 3. `public/app.js` (Arayüz Mantığı ve Entegrasyon)

* **`startWaPolling()`**: Sayfa açıldığında her 3 saniyede bir `/api/whatsapp/status` sorgulayarak arayüzdeki rozeti ve QR kodunu günceller.
* **`siparisiTamamla()`**:
  1. Girilen adedi doğrular.
  2. `/api/siparis/:id/tamamla` API'sini tetikler.
  3. Müşteriye özel mesaj metnini dinamik olarak üretir:
     > *"Sayın [Müşteri], getirmiş olduğunuz iç malzeme ile hazırlanan [Adet] adet [Ürün] fırınımızdan taze çıkmıştır, hazırdır. Toplam hamur ve işçilik bedeli [Tutar] TL'dir. Ödeyip teslim alabilirsiniz. Afiyet olsun! 🔥"*
  4. WhatsApp bağlıysa `/api/whatsapp/send` ile mesajı arka plandan otomatik gönderir.
  5. WhatsApp bağlı değilse veya herhangi bir hatada `whatsappFallback()` devreye girerek tarayıcıda doğrudan `api.whatsapp.com` linkini yeni sekmede açar (Böylece mesaj hiçbir koşulda kaybolmaz).
* **`pdfIndir()`**: Gün sonu verilerini alır ve `pdfmake` kütüphanesiyle A4 formatında, logolu, tablolu ve toplam cirolu resmi bir gün sonu PDF raporu oluşturup bilgisayara indirir.

---

### 4. Çalıştırma ve Kurulum Dosyaları

#### `baslat.bat`
```bat
@echo off
chcp 65001 >nul
:: 2 saniye sonra tarayıcıyı aç (Sunucu tamamen portu dinlemeye başlayınca)
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
node server.js
pause
```
* `chcp 65001`: Konsolda Türkçe karakterlerin (`ğ, ş, ı, ö, ü, ç`) bozulmasını engeller.
* `timeout /t 2`: Tarayıcının sunucu portu açılmadan önce açılıp `ERR_CONNECTION_REFUSED` (Bu siteye ulaşılamıyor) hatası vermesini engeller.

#### `kurulum.bat`
* Yeni bir bilgisayarda Node.js'in yüklü olup olmadığını kontrol eder.
* `npm install` komutu ile `package.json` içindeki tüm bağımlılıkları tek tıkla kurar.

---

## 🛠️ Çözülen Kritik Teknik Noktalar

1. **Chromium / Tarayıcı Bağımlılığı**:
   Sistemde Google Chrome kurulu olmasa bile Windows'un yerleşik **Microsoft Edge** tarayıcısını bularak Puppeteer'a bağlar.
2. **WhatsApp Web LID / JID Uyumluluğu**:
   WhatsApp'ın yeni gizlilik mimarisinde ortaya çıkan `@lid` hesaplarında yaşanan mesaj teslim sorunları aşılmış; mesaj gönderiminde `{ waitUntilMsgSent: true }` ile WhatsApp sunucu teyidi (`Ack: 1`) alınması garanti altına alınmıştır.
3. **WhatsApp Web Dahili Modül Yama Düzeltmeleri**:
   WhatsApp Web güncellemelerinde kaybolan/değişen dahili fonksiyonlar (`WALinkify`, `lastReceivedKey`) güvenli `try-catch` bloklarıyla sarılmış ve mesaj modeli dönüşü güvenceye alınmıştır.
4. **Zaman Dilimi (Timezone) Uyumu**:
   Raporlamada UTC yerine yerel saat (`getLocalDateString()`) kullanılarak gece 00:00 - 03:00 saatleri arasındaki siparişlerin gün sonu raporunda kaybolması engellenmiştir.
5. **SQLite Sayacı (`last_insert_rowid`)**:
   Veritabanı kaydetme (`export`) işlemlerinde ID sıfırlanma riski `SELECT MAX(id)` sorgusuyla çözülmüştür.

---

## 📦 Başka Bir Bilgisayara Taşıma Rehberi

Sistemi farklı bir fırın bilgisayarına taşımak istediğinizde:

1. **Sadece Şu Dosyaları Kopyalayın:**
   * `public/` (klasör)
   * `server.js`
   * `package.json`
   * `kurulum.bat`
   * `baslat.bat`
   * *(İsteğe bağlı)* `emanet.db` (Eski verileri taşımak istiyorsanız kopyalayın, temiz başlangıç için kopyalamayın).

2. **Kopyalamamanız Gerekenler (Otomatik Oluşur):**
   * ❌ `node_modules/` (Yeni bilgisayarda `kurulum.bat` ile sıfırdan kurulmalıdır).
   * ❌ `.wwebjs_auth/` (Eski bilgisayarın oturumudur, yeni bilgisayarda sıfırdan QR okutulmalıdır).

3. **Yeni Bilgisayarda:**
   * [Node.js LTS](https://nodejs.org/) sürümünü kurun.
   * `kurulum.bat` dosyasına çift tıklayın.
   * Kurulum bitince `baslat.bat` ile sistemi başlatın ve QR kodu telefonunuzdan okutun.

---

*Hayırlı işler, bol ve bereketli kazançlar dileriz!* 🔥

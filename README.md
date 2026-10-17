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
├── yedekler/                     # Otomatik alınan günlük veritabanı yedekleri (30 gün saklanır)
├── .env                          # (Opsiyonel) Port / Host / Şifre ayarları - .env.example'ı kopyalayın
├── server.js                     # Projenin beyni (Express.js sunucusu, SQLite ve WhatsApp motoru)
├── package.json                  # Proje bağımlılıkları ve konfigürasyonu
├── package-lock.json             # Kütüphane sürüm kilit dosyası
├── baslat.bat                    # Tek tıkla sistemi ve tarayıcıyı başlatan betik
├── kurulum.bat                   # Yeni bilgisayarda ortamı hazırlayan kurulum betiği
├── README.md                     # Projenin kapsamlı dokümantasyonu (Bu dosya)
└── GELISTIRME-ONERILERI.md       # Sisteme eklenebilecek yeni özellikler (yol haritası)
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
  * `odeme_durumu`: `'Bekliyor'` veya `'Ödendi'`.
  * `birim_fiyat`: Sipariş tamamlanırken ürünün **o anki** birim fiyatı (geçmiş raporlar için mühürlenir).
  * `durum`: `'Fırında'` veya `'Tamamlandı'`.
  * `giris_zamani`: Siparişin fırına girdiği saat.
  * `cikis_zamani`: Fırından çıkış anı.
  * `created_date`: Siparişin oluşturulduğu yerel tarih (`YYYY-MM-DD`).
* **`ayarlar` Tablosu**: `birim_fiyat` (genel varsayılan) ve `urunler` (isim + emoji + birim fiyat JSON listesi) ayarlarını tutar.
* **`stok` Tablosu** *(v1.3)*: Malzemeler (`ad`, `birim`, `miktar`, `kritik` seviye).
* **`stok_hareketleri` Tablosu** *(v1.3)*: Her stok giriş/çıkışı (`tip`, `miktar`, `aciklama`, `otomatik`, `zaman`). Reçeteden otomatik düşenler `otomatik=1` ile işaretlenir.
* **`recete` Tablosu** *(v1.3)*: Ürün başına malzeme ve miktar (`urun_turu`, `stok_id`, `miktar`). Sipariş tamamlanınca `miktar × adet` stoktan düşülür.
* **`giderler` Tablosu** *(v1.3)*: Elle girilen giderler (`aciklama`, `miktar`, `kategori`, `tarih`).

#### B) Otomatik Tarayıcı Algılama (`getBrowserCandidates`)
* Sisteme harici Chromium indirmeye gerek bırakmaz.
* Windows üzerinde **Google Chrome**, **Microsoft Edge** (`msedge.exe`) ve **Brave** yollarını tarayıp bir aday listesi oluşturur.
* Başlatma başarısız olursa (örn. Edge açılmazsa) sıradaki tarayıcı otomatik denenir; hepsi tükenirse Puppeteer'in kendi Chromium'u deneneir. Böylece "QR gelmiyor" durumları en aza iner.
* Her Windows 10 ve 11 bilgisayarda varsayılan bulunan Microsoft Edge'i otomatik algılayarak WhatsApp Web motorunu sorunsuz başlatır.

#### C) WhatsApp Yaşam Döngüsü (`startWaClient` / `initWhatsApp`)
* **`LocalAuth`**: WhatsApp oturumunu `.wwebjs_auth/` klasörüne kaydeder. Sunucu yeniden başlasa bile tekrar QR kod okutmaya gerek kalmaz.
* **`qr` Event**: WhatsApp Web QR kodu ürettiğinde bunu Base64 resme (`data:image/png;base64,...`) dönüştürerek web arayüzüne servis eder.
* **`ready` Event**: Bağlantı kurulduğunda telefon numarasını ve profil adını hafızaya alır.
* **`disconnected` / `auth_failure`**: Artan bekleme süresiyle (5s→60s, en fazla 15 deneme) otomatik yeniden bağlanır. Tümü başarısız olursa arayüzde "Tekrar Dene" / "Bağlantıyı Kes" ile müdahale edilir.

#### D) REST API Uç Noktaları
* `GET /api/whatsapp/status`: WhatsApp bağlantı durumunu (`initializing`, `qr`, `connected`, `error`), QR kodunu ve bağlı numara bilgisini döner.
* `POST /api/whatsapp/send`: Müşteri numarasına formatlama uygular (`905XXXXXXXXX@c.us`) ve `{ waitUntilMsgSent: true }` parametresiyle WhatsApp sunucusundan teslim onayı alana kadar bekleyip mesajı iletir.
* `POST /api/siparis`: Yeni müşteri adı, telefon ve ürün türüyle siparişi fırına alır.
* `GET /api/siparisler/aktif`: Fırında pişmekte olan tüm bekleyen siparişleri listeler.
* `PUT /api/siparis/:id/tamamla`: Siparişe çıkan adet bilgisini ekler, **o anki ürün fiyatını `birim_fiyat` olarak mühürler**, durumunu `'Tamamlandı'` yapar, çıkış saatini kaydeder ve **ürünün reçetesindeki malzemeleri stoktan otomatik düşer**. Kritik seviyeye inen malzemeleri `dusuk_stok` alanında döner.
* `PUT /api/siparis/:id/odeme`: Siparişin ödeme durumunu (`Bekliyor` / `Ödendi`) günceller.
* `GET /api/rapor/gunluk`: Bugün teslim edilen siparişleri, **ürün bazlı ciro**, tahsil edilen ve bekleyen ödeme tutarlarını yerel saat dilimine göre hesaplar.
* `GET /api/rapor/aralik?baslangic=&bitis=`: İki tarih arası özet + gün gün döküm + ciro döner.
* `GET /api/ayarlar` / `PUT /api/ayarlar`: Ürün listesini (isim + emoji + **birim fiyat**) okur/günceller.
* `DELETE /api/siparis/:id`: Hatalı girilen siparişi iptal eder/siler.
* `GET /api/siparisler/tamamlanan?tarih=&q=` *(v1.3)*: Tamamlanmış siparişleri getirir. `q` verilirse **isim/telefon** ile tüm tarihlerde arar; verilmezse `tarih` (varsayılan bugün) listelenir.
* `GET/POST /api/stok`, `PUT/DELETE /api/stok/:id`, `POST /api/stok/:id/hareket`, `GET /api/stok/hareketler` *(v1.3)*: Malzeme listesi, ekleme/güncelleme/silme, manuel stok giriş/çıkış ve hareket geçmişi.
* `GET /api/recete`, `PUT /api/recete/:urun` *(v1.3)*: Ürün reçetesini okur/kaydeder (`kalemler: [{stok_id, miktar}]`).
* `GET/POST /api/giderler`, `DELETE /api/giderler/:id` *(v1.3)*: Gider listesi/ekleme/silme.
* `GET /api/kasa?baslangic=&bitis=` *(v1.3)*: Aralık için `gelir` (yalnızca "Ödendi"), `bekleyen`, `ciro`, `gider` ve `net` değerlerini döner.
* `GET /api/rapor/karlilik?baslangic=&bitis=` *(v1.5)*: Ürün bazlı **ciro, iç maliyet, brüt kâr ve marj** (`toplam` + `liste`). Maliyet, reçetedeki malzemelerin `birim_maliyet` değerlerinden hesaplanır.
* `GET /api/rapor/musteriler?baslangic=&bitis=` *(v1.5)*: Müşteri bazlı sipariş sayısı, toplam adet, ciro ve bekleyen ödeme (en çok alışveriş yapanlar).
* `GET /api/rapor/saatlik?baslangic=&bitis=` *(v1.5)*: Siparişlerin çıktığı saatlere göre yoğunluk dağılımı (00–23).
* `GET /api/kasa/aylik?baslangic=&bitis=` *(v1.5)*: Gün gün gelir / ciro / gider / net (gelir–gider grafiği için).
* `GET /api/disa-aktar/:tur` *(v1.5, **yönetici**)*: `siparisler`, `giderler`, `stok`, `karlilik` verilerini **UTF-8 BOM'lu, `;` ayraçlı CSV** olarak indirir (Excel ile Türkçe karakterler bozulmadan açılır).
* `GET /api/yedekler` *(v1.5, **yönetici**)*: `yedekler/` klasöründeki `.db` yedeklerini listeler.
* `POST /api/yedek/al` *(v1.5, **yönetici**)*: O anki veritabanının anlık yedeğini alır.
* `GET /api/yedek/indir?dosya=` *(v1.5, **yönetici**)*: Bir yedeği indirir (dizin dışına çıkma korumalı).
* `POST /api/yedek/yukle` *(v1.5, **yönetici**)*: Ham `.db` gövdesini alır, SQLite imzasını doğrular, **önce güvenlik yedeği alır**, sonra canlı veritabanını değiştirir.
* `GET /api/mesajlar` / `GET /api/loglar` *(v1.5, **yönetici**)*: WhatsApp mesaj geçmişi ve işlem (denetim) günlüğü.
* `GET/POST /api/kullanicilar`, `PUT/DELETE /api/kullanicilar/:id` *(v1.5, **yönetici**)*: Kullanıcı/rol yönetimi. İlk oluşturulan kullanıcı otomatik **admin** olur. Şifreler `scrypt` (salt + hash) ile saklanır.
* `POST /api/auth-cikis` *(v1.5)*: Oturumu kapatır.
* `GET /api/auth-durum` *(v1.5)*: `authRequired`, `authorized`, `kullaniciGerekli` ve aktif `rol` bilgisini döner.

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
  * Kart üzerinde **Adet Girişi** alanı bulunur. Adet girildiğinde, o ürünün **kendi birim fiyatı** ile tutar otomatik hesaplanır (ürün bazlı fiyatlandırma).
  * **"✅ FIRINDAN ÇIKTI"** butonuna basıldığında sipariş tamamlanır ve otomatik WhatsApp mesajı gönderilir.
  * **"Fırından Çıkanlar" listesi** *(v1.3)*: Aktif siparişlerin altında, fırından çıkan siparişler listelenir. **İsim/soyisim/telefon arama** ve gün seçimi vardır; satırdan ödeme durumu değiştirilebilir.
* **Günlük Rapor Sekmesi**:
  * Toplam sipariş, toplam adet, ortalama adet/sipariş ve günün toplam cirosu kartları.
  * Ürün bazlı sipariş ve ciro dağılım grafikleri.
  * Bugün teslim edilen tüm müşterilerin geçmiş listesi.
* **Stok Sekmesi** *(v1.3)*: Malzeme listesi (miktar + kritik seviye), manuel giriş/çıkış, son hareketler ve **reçete düzenleme**.
* **Gelir / Gider Sekmesi** *(v1.3)*: Tarih aralığı seçimi, Gelir/Bekleyen/Gider/Net Kâr kartları ve gider ekleme/silme.

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
* **`cikanlariYukle()`** *(v1.3)*: Fırından çıkan siparişleri çeker; arama kutusuna yazıldıkça (gecikmeli/debounce) isim–telefon filtresi uygular.
* **`stokYukle()` / `stokEkle()` / `stokHareketKaydet()`** *(v1.3)*: Stok kartlarını çizer, yeni malzeme ekler, manuel giriş/çıkış kaydeder; kritik seviye altındakileri kırmızı gösterir.
* **`receteleriYukle()` / `receteKaydet()`** *(v1.3)*: Ürün reçetelerini listeler ve modal üzerinden malzeme kalemleri kaydeder (satırlar DOM ile üretilir).
* **`kasaYukle()` / `giderEkle()`** *(v1.3)*: Seçilen tarih aralığı için gelir/bekleyen/gider/net kârı hesaplar ve gider listesini yönetir.

---

### 4. Çalıştırma ve Kurulum Dosyaları

#### `baslat.bat`
```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set OPEN_BROWSER=1
node server.js
pause
```
* `cd /d "%~dp0"`: Betiği çalıştıran klasöre geçer. **Yönetici olarak çalıştırılsa bile** doğru klasörde (`C:\Windows\System32` değil) çalışmasını sağlar. Bu satır olmadan "Cannot find module ...server.js" hatası alınıyordu.
* `chcp 65001`: Konsolda Türkçe karakterlerin (`ğ, ş, ı, ö, ü, ç`) bozulmasını engeller.
* `OPEN_BROWSER=1`: `server.js` sunucu portu dinlemeye başlar başlamaz tarayıcıyı otomatik açar (yönetici/normal fark etmez).

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

## 🔐 Yapılandırma (`.env`)

Sistem varsayılan olarak **sadece bu bilgisayardan** (`127.0.0.1`) erişilebilir ve şifresizdir. Ayarları değiştirmek için proje klasöründeki `.env.example` dosyasını `.env` olarak kopyalayın:

| Ayar | Açıklama | Varsayılan |
| :--- | :--- | :--- |
| `PORT` | Sunucu portu | `3000` |
| `HOST` | `127.0.0.1` (güvenli, sadece bu PC) / `0.0.0.0` (ağdaki tüm cihazlar) | `127.0.0.1` |
| `APP_PASSWORD` | Giriş şifresi. Boşsa şifre koruması kapalıdır. | *(boş)* |
| `OPEN_BROWSER` | Sunucu açılınca tarayıcıyı otomatik açar (`1`/`0`) | baslat.bat ile `1` |
| `PUPPETEER_EXECUTABLE_PATH` | Kullanılacak Chrome/Edge yolu (opsiyonel) | *(otomatik)* |
| `WA_DISABLE` | `1` yapılırsa WhatsApp hiç başlatılmaz (yalnızca test/geliştirme) | *(boş)* |

> **Not:** `HOST=0.0.0.0` yapıp tablet/telefonla bağlanacaksanız **mutlaka** `APP_PASSWORD` belirleyin. Aksi halde aynı ağdaki herkes müşteri verilerinizi görebilir.

---

## ✨ v1.5 Yenilikleri

**Yeni özellikler**
- 🏆 **Kârlılık & Analiz sekmesi**: Ürün bazlı **ciro / iç maliyet / brüt kâr / kâr marjı** tablosu, **en çok alışveriş yapan müşteriler** listesi ve **saatlik yoğunluk** grafiği. Maliyet, reçetedeki malzemelerin **alış fiyatlarından** otomatik hesaplanır. Bugün / Bu Ay veya serbest tarih aralığı seçilebilir.
- 💵 **Malzeme alış fiyatı & tedarikçi**: Stok kartlarına **birim alış fiyatı** ve **tedarikçi** eklendi; stok değeri (miktar × alış) otomatik görünür. `+ Alış` yaparken **tutar** girilirse alış fiyatı güncellenir **ve kasaya otomatik gider** yazılır.
- 🔥 **Fire / zayi**: Stoktan malzeme çıkışını "fire" olarak işaretleyebilirsiniz; hareket geçmişinde ayrı görünür.
- ⚠️ **Kritik stok WhatsApp uyarısı**: Malzemeler kritik seviyeye inince (en fazla saatte bir) **işletme sahibinin telefonuna** otomatik WhatsApp mesajı gider.
- 💬 **Mesaj şablonu + gönderim geçmişi + otomatik cevap robotu**: Tamamlanma mesajı artık şablondan üretilir (`{musteri}`, `{adet}`, `{urun}`, `{tutar}`, `{isletme}`). Gelen WhatsApp mesajlarında bekleyen/ödenmemiş sipariş durumunu otomatik yanıtlar; tüm giden/gelen mesajlar kaydedilir.
- 📊 **Gün gün gelir/gider grafiği (Kasa)** ve **CSV dışa aktarma** (siparişler, giderler, stok, kârlılık).
- 💾 **Yedek yönetimi**: Elle yedek al, listele, indir, **geri yükle** (yükleme öncesi otomatik güvenlik yedeği alınır).
- 🔐 **Kullanıcı & rol yönetimi**: Kullanıcı adı + şifre ile giriş (`scrypt` ile saklanır). **personel** rolü Kasa/Kârlılık, ayar kaydetme, dışa aktarma, yedek ve kullanıcı yönetimine erişemez (hem arayüzde gizlenir hem sunucuda **403** ile korunur). İlk kullanıcı otomatik **admin** olur.
- 🔔 **Masaüstü bildirimi**: Sekme arka plandayken yeni sipariş gelince Windows bildirimi.
- 📱 **PWA**: Telefona/tablete "uygulama olarak ekle" desteği (`manifest.json` + service worker).
- 🏪 **İşletme ayarları**: İşletme adı, sahip telefonu, ortalama hazırlık süresi, kritik uyarı ve otomatik cevap aç/kapat.
- 📜 **İşlem günlüğü (denetim izi)**: Kim, ne zaman, hangi işlemi yaptı (ayar/ödeme/sipariş tamamlama/kullanıcı işlemleri) kayıt altına alınır.

**Notlar**
- Malzemeler **0 kg** ile gelir; reçete düşümü stok eksikse **negatife** inebilir (gerçek eksik açık görünür). `+ Alış`/`+ Giriş` ile gerçek stoğunuzu girin.
- Şablonlu mesajda `{tutar}` = ödenmesi gereken toplam (adet × ürün fiyatı).
- Yedekten geri yükleme sonrası **sayfayı yenilemeniz** istenir.

---

## ✨ v1.4 Yenilikleri

**Yeni / iyileştirilen**
- 💵 **Net ödeme kontrolü**: Artık belirsiz bir "toggle" yerine, ödenmemiş siparişlerde **"💵 Ödeme Alındı"** butonu; ödeme alınınca **"✅ Ödendi"** rozeti ve yanında **"geri al"** bağlantısı görünür. (Fırındaki kart, Fırından Çıkanlar listesi ve rapor listesi — üçünde de aynı.)
- 📦 **Hazır malzeme + reçete seti**: Sistemi ilk kez başlattığınızda (stok boşsa) **16 temel malzeme** (un, maya, kıyma, soğan, domates, kaşar, sucuk...) ve **4 ürün için gerçekçi reçeteler** (Lahmacun, Kıymalı/Kaşarlı/Karışık Pide) otomatik yüklenir. Miktarlar yaygın tariflerden uyarlanmıştır; `Stok → Reçeteler → Düzenle` ile kendi tarifinize göre değiştirebilirsiniz. (Bu kurulum yalnızca bir kez yapılır ve mevcut veriniz varsa çalışmaz.)
- 📄 **`GELISTIRME-ONERILERI.md`**: Sisteme eklenebilecek yeni özelliklerin önceliklendirilmiş yol haritası.

> **Not:** Malzemeler **0 kg** ile gelir; bu yüzden ilk açılışta kırmızı **"KRİTİK"** görünür. `+ Giriş` ile gerçek stoğunuzu girin, uyarı kaybolur.

---

## ✨ v1.3 Yenilikleri

**Yeni özellikler**
- 🧾 **"Fırından Çıkanlar" listesi + isim/telefon arama**: Ana ekranda, fırındaki siparişlerin hemen altında bugün (veya seçilen gün) fırından çıkan siparişler listelenir. Arama kutusuna **isim, soyisim veya telefon** yazdığınızda tüm tarihlerde arama yapılır. Her satırdan ödeme durumu (Ödendi/Bekliyor) tek tıkla değiştirilebilir.
- 📦 **Stok takip**: Un, maya, kıyma, domates gibi malzemeleri birim (kg/adet...), mevcut miktar ve **kritik seviye** ile tanımlayın. Manuel **+ Giriş / − Çıkış** yapabilir, tüm hareketlerin geçmişini görebilirsiniz. Kritik seviyenin altına düşen malzemeler **kırmızı "KRİTİK"** etiketiyle işaretlenir.
- 🍽️ **Reçete (otomatik stok düşümü)**: Her ürün için 1 adette kullanılan malzemeler tanımlanır (örn. 1 Lahmacun = 0,05 kg un + 0,01 kg maya...). Sipariş **"FIRINDAN ÇIKTI"** ile tamamlanınca ilgili malzemeler stoktan **otomatik düşülür** ve hareket geçmişine yazılır. Stok kritik seviyeye inince uyarı gösterilir.
- 💰 **Gelir / Gider (Kasa)**: Seçilen tarih aralığı için **Gelir (yalnızca "Ödendi" işaretli siparişler)**, **Bekleyen Ödeme**, **Gider** ve **Net Kâr** otomatik hesaplanır. Giderler kategoriyle (Malzeme Alımı, Kira, Elektrik/Su/Doğalgaz, Personel, Diğer) elle eklenip silinebilir.

**Düzeltmeler**
- 🔴 Stok miktarlarında kayan nokta gürültüsü (`0.44999999999999996`) giderildi; tüm miktarlar 3 ondalığa yuvarlanıp `0,45` gibi okunur biçimde gösterilir.
- 🔧 Test/geliştirme kolaylığı: `.env` içine `WA_DISABLE=1` yazılırsa WhatsApp bağlantısı hiç başlatılmaz (normal kullanımda etkisiz, belgelenmesi için `.env.example`'a eklendi).

---

## ✨ v1.2 Yenilikleri ve Düzeltmeleri

**Yeni özellik**
- 💰 **Ürün bazlı fiyatlandırma**: Artık her ürünün kendi birim fiyatı var (örn. Lahmacun 20 ₺, Kıymalı Pide 30 ₺). Ayarlar ekranından her ürün için ayrı fiyat girilir.
  - Sipariş, **tamamlandığı andaki fiyatla "mühürlenir"**; sonradan fiyat değiştirseniz bile geçmiş raporlar bozulmaz.
  - Sipariş formunda seçili ürünün fiyatı anlık görünür; kartta adet girilince tutar doğru ürün fiyatıyla hesaplanır.
  - Raporlar (günlük ve tarih aralığı) ve PDF, ciroyu **ürün bazlı** hesaplar; tahsil edilen / bekleyen ödeme de gerçek tutarlar üzerinden çıkar.

**Düzeltmeler**
- 🔴 WhatsApp başlatma artık **çok tarayıcı destekli**: Edge/Chrome/Brave sırayla denenir; biri açılmazsa otomatik olarak diğerine geçer (QR sorunlarının en yaygın nedeni çözüldü).
- 🔴 Yeniden bağlanma denemeleri **sınırlandırıldı** (15 kez); sonsuz döngü yerine anlaşılır bir hata mesajı gösterilir.
- 🔴 Kullanıcı **adet yazarken** liste yenilenmez; yazarken imleç/odak kaybı ve yanlış değer sorunu giderildi.
- 🔴 Ayarlar ekranı satırları ve ürün açılır listesi artık DOM ile oluşturuluyor (tırnak içeren ürün adlarıyla **bozulma/HTML enjeksiyonu** engellendi).
- 🔴 Gün sonu PDF'i artık her durumda **o günün** raporunu üretir (daha önce tarih aralığı raporu açıksa yanlış rapor inebiliyordu).

---

## ✨ v1.1 Yenilikleri ve Düzeltmeleri

**Düzeltilen hatalar**
- 🔴 Otomatik yenilemede **girilen adetlerin silinmesi** engellendi (yenileme sırasında değerler korunur).
- 🔴 Günlük rapor artık siparişin **çıkış saatine** göre hesaplanıyor (gece yarısı sınırındaki kayıp siparişler düzeltildi).
- 🔴 WhatsApp otomatik gönderilemediğinde açılan link **popup engelleyiciye takılmaz**; arayüzde tıklanabilir buton çıkar.
- 🔴 WhatsApp bağlantısı koptuğunda sistem **otomatik olarak yeniden bağlanmayı** dener (artan bekleme süresiyle).
- 🔴 İsim/adet/ürün alanlarına **sunucu tarafı doğrulama** ve HTML kaçışlaması (XSS koruması) eklendi.
- 🔴 Güvenlik: sunucu artık varsayılan olarak sadece bu bilgisayarı dinler; opsiyonel **şifre koruması** eklendi.

**Yeni özellikler**
- ⚙️ **Ayarlar ekranı**: Birim fiyat ve ürün listesi (isim + emoji) arayüzden düzenlenebilir.
- 💵 **Ödeme durumu**: Her sipariş "Bekliyor / Ödendi" olarak işaretlenebilir; raporda tahsil edilen ve bekleyen ödeme tutarları görünür.
- 📅 **Tarih aralığı raporu**: Sadece bugün değil, seçilen iki tarih arası satış + gün gün döküm + PDF.
- 🗄️ **Otomatik günlük yedek**: `yedekler/` klasörüne her gün bir kez yedek alınır, 30 günden eskiler silinir.
- 🔔 Yeni sipariş geldiğinde **sesli uyarı** ve fırında **10/15 dakikayı geçen siparişlerde renk uyarısı**.
- 🧩 Gün oturumu **hatırlanır** (sayfa yenilenince tekrar "GÜNÜ BAŞLAT" istenmez).

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

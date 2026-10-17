# 🚀 Fırınotomasyon — Geliştirme Önerileri (Yol Haritası)

Bu rapor; mevcut sisteme (sipariş takibi + WhatsApp bildirimi + stok/reçete + kasa) eklenebilecek,
işe en çok yarayacak özellikleri öncelik sırasına göre listeler.

> Durum işaretleri: ✅ **uygulandı** (v1.5 / v1.6) · ⏳ **ertelendi** (gerekçe yazılı) · ⭐ = öncelik.

**Durum özeti:** Aşağıdaki 26 maddenin **19'u uygulandı**, 7'si gerekçesiyle ertelendi.

> **v1.6 notu (kullanıcı geri bildirimi):** İki ekleme yapıldı — **stok takibini aç/kapat** (isteğe bağlı modül; 2.7) ve **detaylı kâr/zarar raporu, PDF + CSV** (3.6).

---

## 1) Operasyon (Günlük kullanımı kolaylaştıranlar)

| # | Özellik | Durum | Neden gerekli? | Zorluk |
| :-- | :--- | :--- | :--- | :--- |
| 1.1 | ⭐ **Çok ürünlü sipariş (sepet)** | ⏳ Ertelendi | Şu an 1 sipariş = 1 ürün. Aynı müşteri "2 lahmacun + 1 kaşarlı" alıyorsa tek kayıt altında toplanmalı, tek WhatsApp mesajı gitmeli. | Orta |
| 1.2 | ⭐ **Fırın sıra / tahmini çıkış saati** | ⏳ Ertelendi | Sipariş numarası ve tahmini çıkış saati. (Veri modelinde `grup_no`/`notlar` alanları ve **ortalama hazırlık süresi ayarı** hazır; arayüz sıradaki sürümde.) | Kolay-Orta |
| 1.3 | ⭐ **Masaüstü/titreşim bildirimi** | ✅ Uygulandı | Sekme arka plandayken **Windows masaüstü bildirimi** (🔔 butonu ile izin). Sesli uyarı zaten vardı. | Kolay |
| 1.4 | **Müşteri kaydı ve geçmişi** | ⏳ Ertelendi | Telefon girilince isim otomatik dolsun, "son siparişler" görünsün. (`Müşteri bazlı rapor` bunun bir kısmını karşılıyor.) | Orta |
| 1.5 | **Kısmi teslim / iptal gerekçesi** | ⏳ Ertelendi | Eksik çıkan sipariş, iade, iptal nedeni kaydı. | Kolay |
| 1.6 | **Vardiya / gün aç-kapa kilidi** | ⏳ Ertelendi | "Günü başlat" altyapısı var; kasa kapanışı/gün sonu sayımı sıradaki sürümde. | Orta |

## 2) Stok ve Maliyet

| # | Özellik | Durum | Neden gerekli? | Zorluk |
| :-- | :--- | :--- | :--- | :--- |
| 2.1 | ⭐ **Malzeme birim maliyeti + otomatik kâr** | ✅ Uygulandı | Stok kartına **alış fiyatı** eklendi; reçeteden **ürün maliyeti** ve **kâr marjı** otomatik hesaplanıyor (Kârlılık sekmesi). | Orta |
| 2.2 | ⭐ **Kritik stokta WhatsApp uyarısı** | ✅ Uygulandı | Kritik seviyeye inince **işletme sahibine** otomatik WhatsApp mesajı (saatte en fazla 1, spam yok). | Kolay-Orta |
| 2.3 | **Malzeme alımı = otomatik gider + stok girişi** | ✅ Uygulandı | `+ Alış` sırasında **tutar** girilince stok artar, alış fiyatı güncellenir **ve kasaya gider** yazılır — çift kayıt yok. | Orta |
| 2.4 | **Fire / zayi takibi** | ✅ Uygulandı | 🔥 butonuyla stoktan **fire** düşülür; hareket geçmişinde ayrı görünür. | Kolay |
| 2.5 | **Envanter (sayım) modu** | ⏳ Ertelendi | Belirli günde sayım + fark raporu. (Yapısal; sıradaki sürüm.) | Orta |
| 2.6 | **Tedarikçi kaydı** | ✅ Uygulandı (temel) | Stok kartına **tedarikçi** alanı. (Fiyat geçmişi/ayrı tedarikçi defteri sıradaki sürümde.) | Orta |
| 2.7 | ⭐ **Stok takibini aç/kapat (isteğe bağlı modül)** | ✅ Uygulandı *(v1.6)* | İşletme stok tutmak istemiyorsa **Ayarlar → Stok takibi** ile kapatır: Stok/Reçete sekmeleri gizlenir, malzeme düşümü ve kritik uyarı durur; kârlılıkta maliyet 0, net kâr = ciro − tüm giderler. | Kolay |

## 3) Finans / Kasa

| # | Özellik | Durum | Neden gerekli? | Zorluk |
| :-- | :--- | :--- | :--- | :--- |
| 3.1 | ⭐ **Aylık gelir-gider grafiği** | ✅ Uygulandı | Kasa sekmesinde **gün gün gelir/gider** sütun grafiği. | Kolay-Orta |
| 3.2 | ⭐ **Excel/CSV dışa aktarma** | ✅ Uygulandı | Siparişler, giderler, stok ve kârlılık **CSV** (Türkçe Excel uyumlu). *(v1.6)* Ayrıca **çok bölümlü detaylı rapor CSV'si** (özet + ürün + gider + gün + müşteri + saat + teslim). | Kolay |
| 3.3 | **Personel/yevmiye takibi** | ⏳ Ertelendi | Yevmiye/gün takibi ve otomatik gider. (Kullanıcı rolleri geldi; yevmiye ayrı iş.) | Orta |
| 3.4 | **Kâr/zarar (P&L) özeti** | ✅ Uygulandı *(v1.6)* | Kârlılık sekmesi ciro − malzeme maliyeti = **brüt kâr**; ayrıca **– diğer giderler = NET kâr/zarar** (marj ile). Sabit giderler dahil gerçek P&L. | Orta |
| 3.5 | **Bekleyen ödeme hatırlatma** | ⏳ Ertelendi | Gün sonu ödenmemişler hatırlatması. (Otomatik cevap robotu "ödenmemiş sipariş" bilgisini şimdiden verir.) | Kolay |
| 3.6 | ⭐ **Detaylı kâr/zarar raporu (PDF + CSV)** | ✅ Uygulandı *(v1.6)* | Kârlılık/Kasa sekmelerinden **📄 Detaylı PDF** ve **⬇️ Detaylı Rapor (CSV)**: özet (kâr/zarar), ürün kârlılığı, gider kategorileri, gün gün döküm, müşteriler, saatlik yoğunluk ve teslim edilen siparişler. | Orta |

## 4) Raporlama

| # | Özellik | Durum | Neden gerekli? | Zorluk |
| :-- | :--- | :--- | :--- | :--- |
| 4.1 | ⭐ **Ürün bazlı kârlılık raporu** | ✅ Uygulandı | **Kârlılık** sekmesi: ürün bazlı ciro, maliyet, kâr, marj + CSV. | Orta |
| 4.2 | **Müşteri bazlı rapor** | ✅ Uygulandı | En çok sipariş veren / harcayan müşteriler + bekleyen ödeme. | Kolay |
| 4.3 | **Saatlik yoğunluk grafiği** | ✅ Uygulandı | Hangi saatte kaç sipariş — personel planı için. | Kolay |
| 4.4 | **Otomatik haftalık/aylık PDF + WhatsApp** | ⏳ Ertelendi | Zamanlanmış otomatik gönderim. (Manuel PDF + WhatsApp hazır; otomatik zamanlama sıradaki sürümde.) | Orta |

## 5) İletişim / Bildirim

| # | Özellik | Durum | Neden gerekli? | Zorluk |
| :-- | :--- | :--- | :--- | :--- |
| 5.1 | ⭐ **Otomatik cevap robotu** | ✅ Uygulandı | Müşteri yazınca bekleyen siparişi / ödenmemiş borcunu otomatik yanıtlar (ayardan kapatılabilir). | Orta-Zor |
| 5.2 | **Farklı mesaj şablonları** | ✅ Uygulandı | Tek, düzenlenebilir **mesaj şablonu** (`{musteri}`, `{adet}`, `{urun}`, `{tutar}`, `{isletme}`). | Kolay |
| 5.3 | **Mesaj gönderim geçmişi** | ✅ Uygulandı | Tüm giden/gelen mesajlar kaydedilir; ayarlardan "Mesaj geçmişini gör". | Orta |
| 5.4 | **SMS yedeği** | ⏳ Ertelendi | Ücretli SMS servisi/kimlik bilgisi gerektirir; talep edilirse eklenir. | Orta |

## 6) Teknik / Güvenlik / Kurulum

| # | Özellik | Durum | Neden gerekli? | Zorluk |
| :-- | :--- | :--- | :--- | :--- |
| 6.1 | ⭐ **Kullanıcı ve rol yönetimi** | ✅ Uygulandı | `admin` / `personel` rolleri; personel finans/ayar/yedek göremez (arayüz + sunucu 403). Şifreler `scrypt`. | Orta |
| 6.2 | ⭐ **Yedekten geri dönme butonu** | ✅ Uygulandı | Arayüzden yedek al / listele / indir / **geri yükle** (yükleme öncesi güvenlik yedeği). | Kolay |
| 6.3 | **Bulut yedek (Google Drive / e-posta)** | ⏳ Ertelendi | Kimlik bilgisi/hesap kurulumu gerektirir; yerel yedek + indirme şimdilik yeterli. | Orta |
| 6.4 | **PWA (telefona kurulabilir uygulama)** | ✅ Uygulandı | `manifest.json` + service worker; "ana ekrana ekle" ve çevrimdışı kabuk. | Orta |
| 6.5 | **Çok şube / çok fırın desteği** | ⏳ Ertelendi | Yapısal değişiklik (şube başına ayrı veri). İhtiyaç olursa planlanır. | Zor |
| 6.6 | **Log / işlem geçmişi** | ✅ Uygulandı | `islem_log` tablosu: kim, ne zaman, hangi işlemi yaptı (denetim izi). | Orta |

---

## 🎯 Önerilen Sıralama (ilk 5 adım) — durumu

1. **Malzeme maliyeti + ürün kârlılığı (2.1 + 4.1)** → ✅ Uygulandı
2. **Kritik stok WhatsApp uyarısı (2.2)** → ✅ Uygulandı
3. **Çok ürünlü sipariş / sepet (1.1)** → ⏳ Ertelendi (sıradaki sürüm)
4. **Excel/CSV dışa aktarma (3.2)** → ✅ Uygulandı
5. **Kullanıcı/rol yönetimi (6.1)** → ✅ Uygulandı

---

## 💡 Kısa notlar
- **Stok kartları 0 kg ile gelir** ve bu yüzden kırmızı **"KRİTİK"** yazar. `+ Alış`/`+ Giriş` ile gerçek stoğunuzu girin, uyarı kaybolur.
- Reçete düşümü, stok eksikse miktarı **negatife** indirebilir (gerçek eksik açık görünür). Bu normaldir.
- Kârlılık hesabı, reçetedeki malzemelerin **alış fiyatlarına** bağlıdır; alış fiyatlarını güncel tutun.
- Ertelenen maddeler için bir **gerekçe** yazıldı (ücretli servis, hesap/kimlik, yapısal değişiklik vb.). İstediğinizi söyleyin, sıradaki sürümde ekleyelim.

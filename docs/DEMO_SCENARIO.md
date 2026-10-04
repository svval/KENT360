# KENT360 – Demo Senaryosu

Bu senaryo, pilot sunumunda **12–15 dakikada** ürünün uçtan uca değerini göstermek için tasarlanmıştır. Seed verisi (Phase 4–6) bu akışı birebir destekleyecek şekilde üretilir.

> ⚠️ Aşağıdaki hesaplar ve parolalar **yalnızca development seed** içindir. Production ortamında seed çalıştırılmaz.

## Demo Belediyesi

**Şahinbey Belediyesi / Gaziantep** (kurgusal demo kiracısı — belediye adı kodda değil, seed verisindedir).
Seed mahalleleri: Karataş, Akkent, Güneykent, Dumlupınar, Binevler – **isimler gerçek, sınırlar demo geometridir** (basit dikdörtgenler, resmi sınır değil). Hikâye talebinin noktası (37.0585 K, 37.3710 D) Karataş poligonunun içindedir. Resmi sınırlar GeoJSON içe aktarma ile yüklenebilir.

## Demo Hesapları

| Rol                | E-posta                 | Parola         | Kişi                             |
| ------------------ | ----------------------- | -------------- | -------------------------------- |
| System Admin       | `admin@kent360.local`   | `Kent360!Demo` | Sistem Yöneticisi                |
| Department Manager | `manager@kent360.local` | `Kent360!Demo` | Fen İşleri Müdürü                |
| Team Leader        | `leader@kent360.local`  | `Kent360!Demo` | Fen İşleri – Ekip 1 sorumlusu    |
| Field Staff        | `field@kent360.local`   | `Kent360!Demo` | Ahmet Kaya (Fen İşleri – Ekip 1) |
| Citizen            | `citizen@kent360.local` | `Kent360!Demo` | Vatandaş                         |

Phase 6 ek saha personeli (hepsi `Kent360!Demo`, Saha Personeli rolü): `mehmet.yilmaz@` (Fen İşleri – Ekip 2 sorumlusu), `hasan.celik@` (Ekip 2), `ayse.koc@` / `emre.aydin@` (Park ve Bahçeler – Merkez Ekip), `fatma.ozturk@` (Temizlik – Ekip 1), `burak.kurt@` (Zabıta – Merkez Ekip) – alan adı `kent360.local`.

## Hazır Kayıtlar

| Kayıt            | Değer                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hikâye talebi    | `KNT-2026-001248` – Karataş Mahallesi, yol çukuru                                                                                                |
| Hikâye iş emri   | `WO-2026-000883` – Fen İşleri – Ekip 1, Ahmet Kaya                                                                                               |
| AI önerisi       | Kategori: Yol ve Kaldırım / Yol Çukuru · Müdürlük: Fen İşleri · Öncelik: Yüksek · Risk: Orta · Güven: %94                                        |
| Duplicate örneği | Karataş'ta 55 m uzakta, 3 saat önce açılmış benzer çukur talebi (skor ≈ 0.84)                                                                    |
| Arka plan verisi | 120 demo talep (Phase 5 ✅) · 5 saha ekibi ve 45 iş emri (Phase 6 ✅: 28 doğrulanmış, 17 açık – oluşturuldu … tamamlandı; önce/sonra fotoğraflı) |

## Akış

### Sahne 1 – Operasyon Merkezi (yönetici, 2 dk)

1. `manager@kent360.local` ile giriş → **Kent Operasyon Merkezi**.
2. KPI kartları: bugünkü talepler, açık/kritik talepler, açık iş emirleri, ortalama çözüm süresi, **SLA içinde çözüm %91,4**.
3. Canlı harita: uzaklaştırınca kümeler, yaklaştırınca tekil talepler; **Katmanlar** panelinden _Yoğunluk_ (heatmap) ve _Mahalle Sınırları_.
4. "Kritik Talepler" kartı: SLA'sı en yakın olan en üstte.

### Sahne 2 – Vatandaş bildirimi ve AI (vatandaş, 3 dk)

5. `citizen@kent360.local` → **Yeni Talep**.
6. Fotoğraf yükle → haritada Karataş Mahallesi'nde bir nokta seç → mahalle **otomatik** doldurulur.
7. Açıklama: _"Okul önündeki yolda büyük bir çukur var, araçlar sürekli çarpıyor."_
8. **AI Önerisi** paneli: Yol Çukuru · Fen İşleri · Yüksek · %94 güven. Vatandaş önerileri değiştirebilir.
9. **"Muhtemel benzer kayıt bulundu"** uyarısı: 55 m · aynı kategori · %88 metin benzerliği · 3 saat önce.
   Seçenekler: _Mevcut bildirime katıl_ / _Yeni bildirim oluşturmaya devam et_.
10. Yeni bildirim → `KNT-2026-…` numarası ve takip ekranı.

### Sahne 3 – Yönlendirme ve iş emri (yönetici, 3 dk)

11. Dashboard'da yeni talep görünür → **Talep detayı**: açıklama, fotoğraf, harita, AI analizi, SLA geri sayımı, **zaman çizelgesi**.
12. **Fen İşleri Müdürlüğüne ata** → **İş emri oluştur** → **Fen İşleri – Ekip 1 / Ahmet Kaya**'ya ata.
13. Toast: _"İş emri WO-2026-… Ahmet Kaya'ya atandı."_ Zaman çizelgesi güncellenir.

### Sahne 4 – Saha360 (saha personeli, 3 dk)

14. Mobil uygulamada `field@kent360.local` → _"Günaydın Ahmet · Bugün 8 göreviniz var."_
15. KRİTİK / YÜKSEK kartlar, mesafe ve SLA sayacı → görev detayı → **Görevi Kabul Et** → **Yola Çıktım**.
16. **Olay Yerindeyim**: konum doğrulaması (uzaktaysa _"İş emri konumuna henüz yeterince yakın değilsiniz."_).
17. BEFORE fotoğrafı → **İşe Başla** → AFTER fotoğrafı → **İşi Tamamla** (AFTER olmadan tamamlanamaz).

### Sahne 5 – Doğrulama ve kent zekâsı (yönetici, 3 dk)

18. İş emri detayında **Önce / Sonra** karşılaştırması → **Doğrula**.
19. Talep **Çözüldü → Doğrulandı → Kapandı**; zaman çizelgesi baştan sona okunur.
20. Dashboard KPI'ları ve harita güncellenir.
21. **MahallePulse → Karataş**: toplam/açık/kritik talepler, ortalama çözüm süresi, en sık sorunlar, 30 günlük trend ve anomali uyarısı:
    _"Karataş Mahallesi'nde park ekipmanı bildirimleri son 30 gün ortalamasına göre %46 arttı."_
22. **Audit Log** (admin): atama, durum değişiklikleri, kim/ne zaman/hangi IP.

## Sunum Notları

- AI'nın **karar vermediğini**, öneri ürettiğini ve insan düzeltmelerinin kaydedildiğini vurgulayın.
- Mükerrer tespitinin **açıklanabilir** olduğunu (mesafe/kategori/metin/zaman bileşenleri) gösterin.
- Beyaz etiket: belediye adı, logo ve renklerin ayarlardan değiştiğini gösterin.

## Phase 5 ile çalışan kısım

Sahne 2'nin fotoğraf + konum + açıklama ile talep oluşturma bölümü (AI önerisi ve mükerrer uyarısı hariç) ve Sahne 3'ün "talep detayı, zaman çizelgesi, SLA, müdürlüğe atama" bölümü çalışır:

1. `citizen@kent360.local` → **Talepler → Yeni Talep** → _Yol ve Kaldırım › Yol Çukuru_ (ilgili birim: Fen İşleri, hedef süre: 1 gün) → açıklama → **Demo konumu kullan** (Karataş) → fotoğraf → **Talebi gönder** → `KNT-2026-…` ve talep detayı.
2. `manager@kent360.local` → **Talepler** (Fen İşleri kapsamı) → talep → **İncelemeye al** → **Müdürlüğe ata**; öncelik değişikliği; zaman çizelgesi güncellenir.
3. `citizen@kent360.local` aynı talepte güncel durumu ve süreci görür (personel adları olmadan).

## Phase 6 ile çalışan kısım (Sahne 3–5, web)

1. `manager@kent360.local` → incelemedeki bir Fen İşleri talebi → **Müdürlüğe ata** → **İş Emri Oluştur** (talimat) → `WO-2026-…` detayı → **Ekibe / personele ata**: _Fen İşleri – Ekip 1 / Ahmet Kaya_ → toast _"WO-2026-…, Fen İşleri – Ekip 1 / Ahmet Kaya için atandı."_
2. `field@kent360.local` → **Görevlerim** → iş emri → **Kabul et** → **Yola çık** → **Sahaya vardım** (tarayıcı konumu; uzaktaysa _"İş emri konumuna henüz yeterince yakın değilsiniz (… m; en fazla 150 m)."_) → "Önce" fotoğrafı → **İşe başla** → **İşi tamamla** (açıklama + "Sonra" fotoğrafı) → _"İş emri tamamlandı."_ Talep vatandaş için "Çözüldü".
3. `manager@kent360.local` → iş emri → **Önce / Sonra** karşılaştırması → **Doğrula** → talepte **Talebi kapat**.

Demo bilgisayarı belediye sınırında değilse konum adımı reddedilir – bu beklenen davranıştır. Sunumda tarayıcının konum simülasyonu (DevTools → Sensors) veya yalnız geliştirme ortamında `.env`'de `FIELD_LOCATION_BYPASS=true` kullanılabilir (geçmişe "Konum kontrolü geliştirme modunda atlandı" yazılır). Mobil Saha360 Phase 12'de aynı API ile gelir.

Harita üzerinden nokta seçimi Phase 9'da, AI önerisi ve mükerrer uyarısı Phase 11'de eklenecek.

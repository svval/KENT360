# KENT360 – Demo Senaryosu (5–8 dakika)

Uçtan uca hikâye: bir vatandaşın çukur bildirimi AI ile sınıflandırılır, mükerrer olduğu fark edilir, iş emrine dönüşür, saha ekibi önce/sonra kanıtıyla kapatır, yönetici doğrular; aynı veri MahallePulse, rapor ve audit ekranlarında görünür.

> ⚠️ Hesaplar ve parolalar **yalnızca development seed** içindir. Production'da seed çalıştırılmaz.

## Hazırlık (sunumdan önce, 2 dk)

```powershell
npm run infra:up
npm run db:deploy
npm run db:seed                  # ilk kurulumda
npm run demo:refresh -- --yes    # demo verisini bugüne taşır (seed'den günler sonra)
npm run dev
```

- `http://localhost:4000/health/ready` → `database: up`, `storage: up` olmalı (değilse `docker compose up -d --force-recreate minio`).
- Saha adımları konum ister. Demo bilgisayarı demo mahallelerinde değilse yalnız geliştirme `.env`'inde `FIELD_LOCATION_BYPASS=true` kullanın (geçmişe "Konum kontrolü geliştirme modunda atlandı" yazılır) veya tarayıcının konum simülasyonunu (DevTools → Sensors) kullanın.
- Tarayıcıda dört sekme / profil açın: yönetici, müdür, saha, vatandaş.

## Demo Hesapları

| Rol                 | E-posta                 | Parola         | Kişi                             |
| ------------------- | ----------------------- | -------------- | -------------------------------- |
| Sistem Yöneticisi   | `admin@kent360.local`   | `Kent360!Demo` | Sistem Yöneticisi                |
| Müdürlük Yöneticisi | `manager@kent360.local` | `Kent360!Demo` | Elif Demir – Fen İşleri Müdürü   |
| Ekip Sorumlusu      | `leader@kent360.local`  | `Kent360!Demo` | Fen İşleri – Ekip 1 sorumlusu    |
| Saha Personeli      | `field@kent360.local`   | `Kent360!Demo` | Ahmet Kaya – Fen İşleri – Ekip 1 |
| Vatandaş            | `citizen@kent360.local` | `Kent360!Demo` | Vatandaş                         |

Ek saha personeli (hepsi `Kent360!Demo`): `mehmet.yilmaz@`, `hasan.celik@`, `ayse.koc@`, `emre.aydin@`, `fatma.ozturk@`, `burak.kurt@` – alan adı `kent360.local`.

## Demo Verisi

**Şahinbey Belediyesi / Gaziantep** kurgusal demo kiracısıdır (belediye adı kodda değil, seed verisindedir). Mahalleler: Karataş, Akkent, Güneykent, Dumlupınar, Binevler – **isimler gerçek, sınırlar demo dikdörtgenleridir, resmi sınır değildir.**

| Kayıt                 | İçerik                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Arka plan             | 129 talep (son 90 gün), 5 saha ekibi, 45 iş emri (her durumda; önce/sonra fotoğraflı)        |
| Anomali sinyali       | Karataş'ta son 6 günde 5 yol çukuru (önceki 4 haftada yok), Güneykent'te 4 çöp bildirimi     |
| Mükerrer hedefi       | Karataş "okul önündeki yolda derin çukur" kümesi – en yenisi temiz seed'de `KNT-2026-000250` |
| Sahaya atanmış iş     | `WO-2026-000037` – Ahmet Kaya'ya atanmış (durum: Atandı)                                     |
| Doğrulama bekleyen iş | `WO-2026-000041` – Ahmet Kaya tamamladı, önce/sonra fotoğraflı                               |
| Bildirimler           | Her demo hesabında küçük bir gelen kutusu + SLA taramasının ürettiği güncel uyarılar         |

Numaralar temiz bir seed'e göredir; denemeler sırasında yeni kayıt açıldıysa listeden en güncelini seçin.

## Akış

### 1. Giriş (yönetici · 20 sn)

`admin@kent360.local` → giriş. Sol menüde **Operasyon / Kent Zekâsı / Yönetim / Raporlama** grupları; menü yetkiye göre değişir.

### 2. Dashboard (yönetici · 45 sn)

**Kent Operasyon Merkezi:** bugünkü / açık / kritik talepler, açık iş emirleri, ortalama çözüm süresi, SLA uyumu; 30 günlük trend; kritik talepler (SLA'sı en yakın üstte); **Kent Zekâsı** kartında anomaliler. Zil simgesinde okunmamış bildirim sayısı (SLA aşıldı uyarıları).

### 3. Canlı Harita (yönetici · 45 sn)

**Canlı Harita:** uzaklaşınca kümeler, yaklaşınca tekil talepler; katmanlardan **Talep yoğunluğu** (ısı haritası) ve **Mahalle riski**. Karataş'a tıkla → risk kartı → **MahallePulse detayı** (sahne 10'da döneceğiz).

### 4. Vatandaş talebi (vatandaş · 30 sn)

`citizen@kent360.local` → menüde yalnız **Dashboard** ve **Talepler** → **Yeni Talep**. Açıklama: _"Okulun önündeki yolda derin bir çukur var, araçlar zarar görüyor."_ → **Demo konumu kullan** (Karataş; mahalle otomatik bulunur).

### 5. AI önerisi (vatandaş · 30 sn)

**AI ile analiz et** → _Yol ve Kaldırım › Yol Çukuru · Fen İşleri · Yüksek · güven yüzdesi_, kısa gerekçe ve kaynak (kural tabanlı sınıflandırıcı ya da Claude). **Öneriyi uygula** formu doldurur; vatandaş değiştirebilir. Vurgu: _AI öneri üretir, karar vermez; kişisel veri analize gitmez._

### 6. Mükerrer tespiti (vatandaş · 40 sn)

Aynı kartta **Benzer bildirimler bulundu**: Karataş'taki çukur bildirimi, _"%95 benzer · 40 m uzakta · aynı kategori · 6 saat önce · metin %88 benzer"_ gibi açıklama. **Bu talebe katıl** → talep detayı, "Bu talebi takip ediyorsunuz" rozeti, isimsiz zaman çizelgesi. Yeni kayıt açılmadı; destekçi sayısı arttı.

### 7. İş emrine dönüşüm (müdür · 1 dk)

`manager@kent360.local` → zilde **Yeni talep** bildirimi → aynı talep (yalnız Fen İşleri kapsamını görür) → personel için **AI Analizi** paneli (öneri, güven, benzer talepler) → **İncelemeye al** → **Müdürlüğe ata** → **İş Emri Oluştur** → **Ekibe / personele ata**: _Fen İşleri – Ekip 1 / Ahmet Kaya_. Vatandaşa "Talebinizde gelişme" bildirimi gider.

### 8. Saha kanıtı (saha · 1 dk)

`field@kent360.local` → zilde **Yeni iş emri** → **Görevlerim** → iş emri (ya da hazır `WO-2026-000037`) → **Kabul et** → **Yola çık** → **Sahaya vardım** (PostGIS konum kontrolü; uzaktaysa _"İş emri konumuna henüz yeterince yakın değilsiniz"_) → **Önce** fotoğrafı → **İşe başla** → **Sonra** fotoğrafı + açıklama → **İşi tamamla** (sonra fotoğrafı olmadan tamamlanamaz).

### 9. Müdür doğrulaması (müdür · 40 sn)

Zilde **İş emri tamamlandı** → iş emri (ya da hazır `WO-2026-000041`) → **Önce / Sonra** karşılaştırması → **Doğrula**. Talep _Doğrulandı_ olur; vatandaşa **"Talebiniz çözüldü"** bildirimi gider. Gerekirse **Geri gönder** → saha ekibine "İş emri iade edildi" bildirimi.

### 10. MahallePulse (yönetici · 45 sn)

**MahallePulse** → risk sıralı tablo → **Karataş**: risk 0–100 ve bileşenleri (açık yük, SLA aşımı, kritik oran, artış, yavaş çözüm), kategori dağılımı, 30/90 gün trend, anomali: _"Karataş Mahallesi'nde yol çukuru bildirimleri son 7 günde 5 adet; önceki 4 haftada hiç yoktu."_ Vurgu: kural tabanlı ve açıklanabilir.

### 11. Raporlar ve Audit (yönetici · 45 sn)

**Raporlar:** dönem ve filtreler (müdürlük, kategori, durum, öncelik, mahalle) → özet (toplam, çözülen, SLA içinde, ortalama çözüm, açık iş emri), müdürlük ve mahalle performans tabloları → **Talep Raporu → CSV indir** (`kent360-talep-raporu-YYYY-AA-GG.csv`, Excel'de Türkçe karakterlerle açılır).
**Audit:** filtre _İşlem = Talep durumu değişti_ → satır → **Detay**: kim, ne zaman, hangi IP, "Durum: Çözüldü → Doğrulandı" gibi okunabilir değişiklikler; parola, token, istek gövdesi gösterilmez.

## Sunum Notları

- **Kapsam:** müdür yalnız kendi müdürlüğünü (rapor dahil), saha personeli yalnız kendi/ekibinin işlerini, vatandaş yalnız kendi ve katıldığı taleplerini görür; başka belediyenin kaydı her zaman "bulunamadı".
- **AI karar vermez;** sağlayıcı yoksa veya hata verirse kural tabanlı sınıflandırıcı devreye girer, akış bozulmaz.
- **Mükerrer tespiti açıklanabilirdir** (mesafe / kategori / metin / zaman) ve otomatik birleştirme yapmaz.
- **Beyaz etiket:** belediye adı, logo ve renkler **Belediye Profili** ekranından değişir.
- Saha adımları bu sürümde web konsolundan yapılır; Saha360 mobil uygulaması opsiyonel bir gelecek uzantısıdır (aynı API).

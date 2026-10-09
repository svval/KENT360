# KENT360 – Portfolyo Rehberi

GitHub README'si, CV ve LinkedIn için hangi ekranların görüntüsünün alınacağı, nasıl alınacağı ve projenin kısa açıklamaları.

## Ekran görüntüsü öncesi hazırlık

1. `npm run infra:up` → `npm run demo:refresh -- --yes` → `npm run dev`; `/health/ready` her şeyin `up` olduğunu göstermeli.
2. Tarayıcı penceresi **1440 × 900**, yakınlaştırma %100, açık tema. Tarayıcı eklentilerini ve yer imi çubuğunu gizleyin.
3. Yönetici ekranları için `admin@kent360.local`, vatandaş ekranı için `citizen@kent360.local` (parola `Kent360!Demo`).
4. Görselleri `docs/screenshots/NN-ad.png` olarak kaydedip README'ye ekleyin. Gerçek kişi verisi yoktur; demo mahalle sınırlarının resmi olmadığını görsel açıklamasında belirtin.

## Çekilecek ekranlar

| #   | Ekran                          | Nasıl                                                                                                                      | Önerilen açıklama                                                                                                                        |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dashboard**                  | Admin → Dashboard; sayfanın üst yarısı (KPI'lar + trend + Kent Zekâsı kartı)                                               | _Kent Operasyon Merkezi: kapsamlı KPI'lar, SLA uyumu, 30 günlük trend ve kural tabanlı anomali uyarıları._                               |
| 2   | **Canlı Harita**               | Canlı Harita → "Talep yoğunluğu" ve "Mahalle riski" açık → Karataş'a tıkla (risk kartı görünsün)                           | _MapLibre + PostGIS: bbox sorguları, kümeleme, ısı haritası ve mahalle risk choropleth'i (demo sınırlar)._                               |
| 3   | **Talep Detay**                | Talepler → Karataş'taki "Yol Çukuru" talebi; zaman çizelgesi, SLA göstergesi ve AI Analizi paneli görünsün                 | _Talep yaşam döngüsü: durum makinesi, SLA snapshot'ı, değişmez zaman çizelgesi ve personel için AI önerisi._                             |
| 4   | **İş Emri Detay + Önce/Sonra** | İş Emirleri → durum "Tamamlandı" olan bir iş (ör. `WO-2026-000041`) → Önce / Sonra kartı                                   | _Saha kanıtı: PostGIS konum doğrulaması, zorunlu "sonra" fotoğrafı, meta verisiz yeniden kodlanmış ve imzalı URL ile sunulan görseller._ |
| 5   | **MahallePulse**               | MahallePulse → Karataş detayı; risk skoru ve bileşenleri + kategori dağılımı                                               | _Açıklanabilir 0–100 risk skoru, 5 ağırlıklı bileşen, kategori dağılımı ve trend._                                                       |
| 6   | **AI Benzer Talep**            | Vatandaş → Yeni Talep → çukur açıklaması → Demo konumu → **AI ile analiz et**; öneri kartı ve "Benzer bildirimler bulundu" | _AI destekli sınıflandırma (öneri, karar değil) ve PostGIS + pg_trgm hibrit mükerrer tespiti; vatandaş mevcut talebe katılabilir._       |
| 7   | **Raporlama**                  | Raporlar; filtreler + özet kartları + performans tabloları + "Dışa aktar" kartları                                         | _Kapsama duyarlı raporlar ve Excel uyumlu, formül enjeksiyonuna karşı korumalı CSV dışa aktarımı._                                       |

İsteğe bağlı ek görseller: bildirim zili açık hâlde (dashboard), Audit detay penceresi, 390 px genişlikte mobil görünüm.

## CV açıklaması – Türkçe

- **KENT360** – NestJS, Next.js ve PostgreSQL/PostGIS ile belediye talep yaşam döngüsünü (bildirim → yönlendirme → saha iş emri → önce/sonra kanıtı → doğrulama) yöneten çok kiracılı bir web platformu geliştirdim; Prisma ile modüler monolit mimari, izin tabanlı RBAC, nesne kapsamları ve değiştirilemez audit kaydı uyguladım.
- MapLibre ve PostGIS ile canlı operasyon haritası (bbox sorguları, kümeleme, ısı haritası, mahalle risk katmanı), sahada konum doğrulaması ve mahalle bazlı açıklanabilir risk skoru ile kural tabanlı anomali tespiti içeren analitik (MahallePulse) geliştirdim.
- Sağlayıcıdan bağımsız bir AI katmanı (varsayılan kural tabanlı sınıflandırıcı, opsiyonel Claude; kişisel veri maskeleme), PostGIS + pg_trgm ile açıklanabilir mükerrer tespiti, uygulama içi bildirimler, CSV raporlar ve MinIO üzerinde güvenli medya saklama ekledim; Jest ve Supertest ile birim ve uçtan uca testler yazdım.

## CV description – English

- Built **KENT360**, a multi-tenant web platform that manages the municipal service-request lifecycle (report → routing → field work order → before/after evidence → verification) with NestJS, Next.js and PostgreSQL/PostGIS; implemented a Prisma-based modular monolith with permission-based RBAC, object-level scopes and an append-only audit trail.
- Developed a live operations map with MapLibre and PostGIS (bounding-box queries, clustering, heatmap, neighbourhood risk layer), on-site location checks, and a neighbourhood analytics module with an explainable risk score and rule-based anomaly detection.
- Added a provider-agnostic AI layer (deterministic rule-based default, optional Claude, personal-data masking), explainable duplicate detection with PostGIS and pg_trgm, in-app notifications, CSV reporting and secure media storage on MinIO; covered domain rules and APIs with Jest unit and Supertest end-to-end tests.

## Doğru anlatım için notlar

- Kullanıcı sayısı veya performans iddiası yoktur; proje demo verisiyle çalışan bir MVP'dir.
- AI **öneri** üretir; varsayılan sağlayıcı kural tabanlıdır. Claude yalnız `AI_PROVIDER=anthropic` ve API anahtarıyla devreye girer.
- Mobil uygulama (Saha360) yapılmadı; saha adımları web konsolunda çalışır.
- Redis Docker Compose'da hazırdır ancak API şu an kullanmaz (rate limit bellek içi).
- Demo mahalle sınırları uydurma dikdörtgenlerdir; resmi veri değildir.

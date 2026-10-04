# KENT360 – Geliştirme Yol Haritası

Durum: ✅ tamamlandı · 🟡 kısmen · ⬜ planlandı

İlke: **Önce uçtan uca MVP senaryosu kusursuz çalışır, sonra genişlik.** Her faz çalışır durumda ve testleri geçer halde bırakılır.

| Faz | Kapsam                                                                     | Durum                            |
| --- | -------------------------------------------------------------------------- | -------------------------------- |
| 0   | Mimari, repository, dokümantasyon, monorepo                                | ✅                               |
| 1   | Docker altyapısı, PostgreSQL/PostGIS, Redis, MinIO, Prisma şeması, env     | ✅ gerçek DB üzerinde doğrulandı |
| 2   | Backend temeli: config, validation, hata formatı, loglama, Swagger, health | ✅                               |
| 3   | Kimlik doğrulama ve yetkilendirme                                          | ✅                               |
| 4   | Belediye domain'i: belediye, müdürlük, mahalle, kategori + seed            | ✅                               |
| 5   | Talep yönetimi: talepler, medya, history, workflow, SLA                    | ✅                               |
| 6   | İş emirleri: ekipler, atama, workflow, önce/sonra                          | ⬜                               |
| 7   | Web temeli: login, layout, sidebar, topbar, tasarım sistemi                | ✅                               |
| 8   | Yönetim arayüzü: dashboard, talepler, talep detayı, iş emirleri            | ⬜                               |
| 9   | GIS: harita, kümeleme, heatmap, mahalleler                                 | ⬜                               |
| 10  | MahallePulse: analitik, mahalle detayı                                     | ⬜                               |
| 11  | AI: mock provider, sınıflandırma, öncelik, müdürlük önerisi, duplicate     | ⬜                               |
| 12  | Saha360 mobil                                                              | ⬜                               |
| 13  | Raporlar, bildirimler, audit arayüzü                                       | ⬜                               |
| 14  | Test, güvenlik, performans, dokümantasyon, demo cilası                     | ⬜                               |

---

## Phase 0 – Mimari ve Repository ✅

- npm workspaces monorepo (`apps/api`, `apps/web`, `packages/shared-types`, `packages/config`)
- Ortak TypeScript (strict) ve ESLint flat config, Prettier, EditorConfig, `.gitattributes` (LF)
- `docs/` altında 8 belge, README

## Phase 1 – Altyapı ✅

- `docker-compose.yml`: `postgis/postgis:17-3.5`, `redis:8.8-alpine`, MinIO + bucket oluşturan init job; volume ve healthcheck'ler
- Prisma 7 şeması: 26 model, 17 enum, PostGIS geometri kolonları, GIST/GIN index'ler
- Migration `init` (Prisma üretimi) + `db_rules` (trigger'lar, CHECK kısıtları, append-only audit)
- `.env.example`, Zod ile doğrulanan env şeması
- İdempotent seed altyapısı (`npm run db:seed`): izin kataloğu, sistem rolleri, demo belediyesi
- **Çıkış kriteri:** `npm run infra:up && npm run db:deploy` hatasız çalışır, `/health/ready` → `ok` ✅ (2026-09-26: PostGIS 3.5.2, pg_trgm 1.6, geometri/GIST/GIN, konum ve mahalle merkezi trigger'ları, CHECK kısıtları, audit append-only (UPDATE/DELETE/TRUNCATE reddi) gerçek DB'de test edildi; `prisma migrate diff` şema ile DB arasında fark bulmadı)

## Phase 2 – Backend Temeli ✅

- ✅ Global prefix `/api/v1`, Swagger `/api/docs`, helmet, CORS, ValidationPipe, Throttler
- ✅ Standart hata/başarı zarfı, structured log + redaksiyon, request-id
- ✅ `/health`, `/health/ready`
- ✅ Sayfalama/sıralama DTO altyapısı (`PaginationQueryDto`, `parseSort` beyaz listesi), `@CurrentUser`, `@Tenant`, `@ReqMeta`, kiracı kapsamı (`prisma.forTenant()`) – Phase 3 ile tamamlandı
- **Çıkış:** e2e testleri ayrı `kent360_test` veritabanında geçer

## Phase 3 – Auth / RBAC / Audit ✅

- ✅ Login (Argon2id, hesap kilidi, hesap varlığını sızdırmayan hata), refresh (rotation + reuse detection, eşzamanlı kullanım koruması), logout, logout-all, oturum listesi/iptali, me
- ✅ `JwtAuthGuard` (global, `@Public()` istisnası; kullanıcı, durum ve oturum her istekte DB'den doğrulanır), `PermissionsGuard` + `@Permissions()`
- ✅ Kiracı izolasyonu: `prisma.forTenant()` Prisma extension'ı (başka belediyenin kaydı → 404)
- ✅ Kullanıcı ve rol yönetimi uçları, merkezi sanitize eden `AuditService`
- ✅ Web: gerçek login, bellek içi access token, sessiz oturum yenileme, route koruması, izin bazlı menü, topbar kullanıcı bilgisi
- ✅ Seed: 5 demo kullanıcı (yalnız development)
- ✅ **Testler:** unit (parola, token, guard'lar, kilit politikası, tenant scope, sanitizer, sayfalama) + e2e (auth, rotation/reuse, logout, RBAC, tenant izolasyonu, audit)
- ⏭ Vatandaş kaydı (`/auth/register`) Phase 8'e (vatandaş portalı) taşındı: belediye seçimi Phase 4 verisine bağlı

## Phase 4 – Belediye Domain'i ✅

- ✅ Belediye profili/markası (`GET/PATCH /municipality`), marka `/auth/me` ile konsola uygulanır
- ✅ Müdürlükler (pasifleştirme, sabit kodlar, kullanımdaki müdürlük koruması)
- ✅ Mahalleler: PostGIS MultiPolygon, GeoJSON FeatureCollection ucu, `resolve` (ST_Covers), ya-hepsi-ya-hiçbiri GeoJSON içe aktarma (+ dryRun)
- ✅ İki seviyeli kategori ağacı: müdürlük yönlendirmesi, varsayılan öncelik, SLA (dakika, miras)
- ✅ DB kuralları: geometri geçerliliği, kod biçimleri, SLA aralığı, aynı-kiracı trigger'ları
- ✅ Web: `/settings/municipality`, `/settings/departments`, `/settings/categories`, `/settings/neighborhoods`; merkezi toast sistemi
- ✅ **Seed:** 5 müdürlük, 5 ana / 13 alt kategori, 5 mahalle (**demo geometri**, resmi sınır değil – DATABASE_DESIGN §9); 5 demo hesap (Phase 3). Daha büyük örnek veri Phase 5–6 ile.
- ✅ **Testler:** unit (geometri doğrulama, kategori kuralları, SLA biçimi) + e2e (tenant izolasyonu, Polygon/MultiPolygon, geçersiz GeoJSON/PostGIS, resolve ve sınır davranışı, FeatureCollection, import rollback, hiyerarşi, SLA, RBAC, audit)

## Phase 5 – Talep Yönetimi ✅

- ✅ Atomik, belediye + yıl bazlı numara (`KNT-2026-000001`), belediye içinde tekil
- ✅ Talep oluşturma: yaprak kategori, müdürlük / öncelik / SLA snapshot, `ST_Covers` ile mahalle (bulunamazsa `NULL` + uyarı), kaynağı sunucu belirler
- ✅ Durum makinesi (tam graf; Phase 5 elle geçişleri açık, AI / iş emri geçişleri ilgili fazlara ayrılmış), öncelik ve müdürlük değişikliği uçları
- ✅ `request_history` zaman çizelgesi + audit, aynı transaction'da
- ✅ Object scope: admin / müdürlük / kendi talepleri; kapsam dışı 404
- ✅ Liste: sayfalama, izinli sıralama, durum/öncelik/kategori/müdürlük/mahalle/kaynak/tarih/SLA filtreleri, arama
- ✅ Medya: imza doğrulamalı JPEG/PNG/WEBP, private MinIO, presigned URL; yeniden kodlama ile EXIF/GPS/XMP temizliği, yön düzeltme, piksel sınırı (stabilizasyon)
- ✅ Web: `/requests` (URL filtreli tablo), `/requests/new` (kategori → açıklama → konum paneli → fotoğraf → kontrol), `/requests/[id]` (detay, SLA, işlemler, süreç)
- ✅ **Seed:** 120 deterministik demo talep (son 90 gün)
- ✅ **Testler:** unit (durum makinesi, SLA, dosya imzası, kapsam, yıl) + e2e (numara eşzamanlılığı / yıl / belediye, yönlendirme, SLA snapshot, kapsamlar, filtreler, iş akışı, geçmiş/audit, medya güvenliği)
- ⏭ Harita üzerinden konum seçimi → Phase 9 (MapLibre); mükerrer tespiti ve AI → Phase 11

## Phase 6 – İş Emirleri ✅

- ✅ Talepten iş emri (`WO-2026-000001`, `NumberingService`), talep başına tek aktif iş emri (satır kilidi + kısmi unique index)
- ✅ Saha ekipleri (müdürlüğe bağlı, üyeler aynı müdürlüğün aktif saha personeli, tek sorumlu, pasifleştirme), `/field-teams` API
- ✅ Ekip/personel ataması, yeniden atama (geçmiş korunur), uygulama içi atama bildirimi
- ✅ İş emri durum makinesi (tek kaynak), işi yürüten kuralı, iyimser eşzamanlılık, `from` ile bayat istek tespiti
- ✅ Talep ↔ iş emri senkronu (tek yön, aynı transaction, vatandaşa dönük zaman çizelgesi); `VERIFIED → CLOSED` elle
- ✅ Saha yakınlığı: PostGIS mesafesi, belediye ayarı (`onSiteRadiusMeters`), reddedilen denemenin kaydı, yalnız dev/test bypass
- ✅ BEFORE / DURING / AFTER kanıtları (Phase 5 görüntü hattı), tamamlamada açıklama + AFTER zorunlu, tamamlanmış kanıtın değişmezliği
- ✅ Kapsamlar: yönetici / müdürlük / ekip sorumlusu / saha personeli; audit olayları
- ✅ Web: `/work-orders` (tablo, URL filtreleri, saha personeline "Görevlerim"), `/work-orders/[id]` (Önce | Sonra karşılaştırma, lightbox, operasyon kartı, "İşi Tamamla"), talep detayında "İş Emri Oluştur", `/field/teams`
- ✅ **Seed:** 5 saha ekibi, 45 iş emri (tüm durumlar), programatik önce/sonra fotoğrafları
- ✅ **Testler:** unit (durum makinesi, kapsam, yürütücü, yakınlık, senkron tablosu, ekip kuralları) + e2e (numara eşzamanlılığı, tekrar oluşturma yarışı, atama/yeniden atama, eşzamanlı atama/tamamlama, bayat geçiş, kapsamlar, yakınlık, medya, tamamlama, doğrulama, senkron, audit, seed idempotency)
- ⏭ Saha360 mobil uygulaması aynı API ile → Phase 12; bildirim gelen kutusu → Phase 13; harita üzerinde iş emirleri → Phase 9

## Phase 7 – Web Temeli ✅

- ✅ Tasarım token'ları, Inter, sidebar (daraltılabilir, mobil çekmece), topbar (breadcrumb, arama, API durumu, kullanıcı menüsü), sayfa iskeletleri, login ekranı
- ✅ Gerçek oturum yönetimi, route koruması, izin bazlı menü (Phase 3)
- ✅ Toast sistemi (Phase 4)

## Phase 8 – Yönetim Arayüzü

- Dashboard KPI'ları ve grafikler (Recharts), talep listesi (URL state, filtre, sıralama, sayfalama), talep detayı (timeline, AI paneli, harita), iş emri listesi/detayı (önce/sonra karşılaştırma), vatandaş "Yeni Talep" akışı

## Phase 9 – GIS

- MapLibre GL, OSM tabanlı raster/vektör altlık, GeoJSON kaynakları, supercluster kümeleme, heatmap katmanı, mahalle choropleth, katman paneli, bbox bazlı veri yükleme

## Phase 10 – MahallePulse

- Mahalle metrikleri, kategori dağılımı, 7/30/90 gün trendleri, kural tabanlı anomali tespiti (son 30 gün ortalamasına göre artış)

## Phase 11 – AI

- `AIProvider` arayüzü, `MockAIProvider` (kategori `keywords` + risk kuralları), analiz uç noktası, duplicate skoru (PostGIS + pg_trgm), "AI Önerisi" UI
- **Testler:** mock sınıflandırıcı, duplicate skor bileşenleri

## Phase 12 – Saha360 Mobil

- Expo (React Native) uygulaması workspace'e eklenir; görevler, harita, bildirimler, profil; görev detayı ve workflow butonları; kamera ile önce/sonra; konum doğrulama + mock konum; SecureStore ile oturum

## Phase 13 – Raporlar, Bildirimler, Audit UI

- CSV raporlar, uygulama içi bildirimler (olay → bildirim), audit log ekranı, SLA risk tarayıcısı (periyodik iş)

## Phase 14 – Sağlamlaştırma

- Kritik akış e2e testi (login → talep → iş emri → atama → tamamlama), güvenlik gözden geçirme, sorgu planı kontrolü (EXPLAIN), erişilebilirlik denetimi, ekran görüntüleri, demo cilası

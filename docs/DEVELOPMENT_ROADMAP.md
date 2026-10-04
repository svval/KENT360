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

## Phase 8 – Yönetim Arayüzü ✅

- ✅ `GET /dashboard/overview`: 6 KPI (bugün/dün, açık, kritik, açık iş emri, ort. çözüm süresi ve SLA uyumu – önceki 30 günle), 30 günlük yerel trend, kritik talepler (CRITICAL → SLA aşıldı → SLA riskte), son talepler; kullanıcının kapsamında
- ✅ Dashboard ekranı: KPI kartları, bağımlılıksız SVG trend grafiği (doğrulanmış palet, lejant + direkt etiket + tooltip + tablo görünümü), kritik ve son talepler, küçük canlı harita; vatandaş ve saha personeline kısayol paneli
- ✅ Topbar genel arama (`GET /search`): talep ve iş emri, numara / açıklama / adres, kapsam korunur; klavye ile gezinme
- ✅ (Talep / iş emri listeleri ve detayları Phase 5–6'da tamamlandı)
- ⏭ AI paneli → Phase 11; vatandaş kaydı ve mobil talep akışı → Phase 12

## Phase 9 – GIS ✅

- ✅ MapLibre GL 6 + ücretsiz, anahtarsız OpenFreeMap altlığı (`NEXT_PUBLIC_MAP_STYLE_URL` ile değiştirilebilir; yoksa yapılandırma uyarısı)
- ✅ `GET /map/requests`, `GET /map/work-orders`: zarfsız GeoJSON, PostGIS bbox (GIST), filtreler, kapsam
- ✅ `/map`: talep (kümeli), kritik, iş emri ve mahalle katmanları; katman paneli/lejant; renk + şekil farkı; seçim kartı ("Detaya git" / "İş emrine git"); URL'de filtreler; görünür alan değişince debounce'lu yeniden yükleme
- ✅ Kümeleme MapLibre'nin dahili GeoJSON kümelemesiyle (ayrı supercluster bağımlılığı gerekmedi)
- ✅ Mahalle sınırları Phase 4 GeoJSON ucundan: ince çizgi, düşük opaklık, hover, tıklayınca ad; geliştirmede "Demo sınır geometrisi" notu
- ⏭ Isı haritası ve mahalle choropleth'i → Phase 10 (MahallePulse metrikleriyle birlikte)

## Phase 10 – MahallePulse ✅

- ✅ `/analytics/neighborhoods`, `/analytics/neighborhoods/:id`, `/analytics/anomalies`: mahalle metrikleri (toplam / açık / çözülen / kritik / açık iş emri / SLA aşımı / çözüm süresi / en sık kategori / 7–30 gün / önceki 30 gün), gruplu SQL, kapsamlı
- ✅ Açıklanabilir risk skoru 0–100 (5 ağırlıklı bileşen, `riskFactors`), seviye LOW…CRITICAL – yapay zekâ değil
- ✅ Kural tabanlı anomali: son 7 gün / önceki 4 haftanın haftalık ortalaması; en az 3 bildirim, ×1,5 ve +2 şartı
- ✅ Web: `/neighborhoods` (Kent Zekâsı kartı + risk sıralı tablo), `/neighborhoods/[id]` (risk ve bileşenleri, KPI, kategori dağılımı, 30/90 gün trend, anomaliler, harita, açık talepler, aktif iş emirleri), dashboard "Kent Zekâsı" kartı
- ✅ Harita: talep yoğunluğu ısı haritası ve mahalle risk choropleth'i (lejant, mahalle tıklamasında risk kartı)
- ✅ Seed: seed anına göre 9 küçük "sinyal" talebi (anomali + mükerrer demosu), idempotent

## Phase 11 – AI ✅

- ✅ `AiProvider` arayüzü; `MockAiProvider` (deterministik, anahtarsız) ve `AnthropicAiProvider` (`@anthropic-ai/sdk`, `claude-opus-5`, yapılandırılmış çıktı, reddetme yedeği); hata/anahtarsızlıkta mock'a düşüş
- ✅ `POST /requests/analyze` (kaydetmeden öneri + benzer bildirimler); talep oluşturulunca analiz ve eşleşmeler saklanır (kişisel veri maskelenir)
- ✅ Mükerrer tespiti: PostGIS (150 m, GIST) + pg_trgm + kategori + zaman, açıklanabilir skor, otomatik birleştirme yok
- ✅ `POST /requests/:id/join`: vatandaş mevcut talebe katılır (bir kez), takipçi olarak izler; katılımcı sayısı
- ✅ Web: yeni talepte "AI ile analiz et" + "Öneriyi uygula", "Benzer bildirimler bulundu" kartı (Detayı gör / Bu talebe katıl / Yine de yeni talep oluştur); talep detayında personel için AI Analizi paneli
- ✅ **Testler:** risk / anomali / sınıflandırıcı / PII maskeleme / mükerrer skoru / sağlayıcı yedeği (unit) + metrikler, kapsam, kiracı, anomali eşiği, analiz, mükerrer adayları (yakın / uzak / eski / kapalı / başka belediye / pg_trgm), katılma, saklama temizliği (e2e)
- ⏭ Görüntü analizi ve AI isabet raporu → ileride; bildirimler Phase 13

## Phase 12 – Saha360 Mobil

- Expo (React Native) uygulaması workspace'e eklenir; görevler, harita, bildirimler, profil; görev detayı ve workflow butonları; kamera ile önce/sonra; konum doğrulama + mock konum; SecureStore ile oturum

## Phase 13 – Raporlar, Bildirimler, Audit UI

- CSV raporlar, uygulama içi bildirimler (olay → bildirim), audit log ekranı, SLA risk tarayıcısı (periyodik iş)

## Phase 14 – Sağlamlaştırma

- Kritik akış e2e testi (login → talep → iş emri → atama → tamamlama), güvenlik gözden geçirme, sorgu planı kontrolü (EXPLAIN), erişilebilirlik denetimi, ekran görüntüleri, demo cilası

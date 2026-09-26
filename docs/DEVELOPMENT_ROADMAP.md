# KENT360 – Geliştirme Yol Haritası

Durum: ✅ tamamlandı · 🟡 kısmen · ⬜ planlandı

İlke: **Önce uçtan uca MVP senaryosu kusursuz çalışır, sonra genişlik.** Her faz çalışır durumda ve testleri geçer halde bırakılır.

| Faz | Kapsam                                                                     | Durum                                                          |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0   | Mimari, repository, dokümantasyon, monorepo                                | ✅                                                             |
| 1   | Docker altyapısı, PostgreSQL/PostGIS, Redis, MinIO, Prisma şeması, env     | ✅ (migration'ın DB'ye uygulanması Docker kurulumunu bekliyor) |
| 2   | Backend temeli: config, validation, hata formatı, loglama, Swagger, health | 🟡 temel parçalar kuruldu                                      |
| 3   | Kimlik doğrulama ve yetkilendirme                                          | ⬜                                                             |
| 4   | Belediye domain'i: belediye, müdürlük, mahalle, kategori + seed            | ⬜                                                             |
| 5   | Talep yönetimi: talepler, medya, history, workflow, SLA                    | ⬜                                                             |
| 6   | İş emirleri: ekipler, atama, workflow, önce/sonra                          | ⬜                                                             |
| 7   | Web temeli: login, layout, sidebar, topbar, tasarım sistemi                | 🟡 layout ve tasarım sistemi kuruldu                           |
| 8   | Yönetim arayüzü: dashboard, talepler, talep detayı, iş emirleri            | ⬜                                                             |
| 9   | GIS: harita, kümeleme, heatmap, mahalleler                                 | ⬜                                                             |
| 10  | MahallePulse: analitik, mahalle detayı                                     | ⬜                                                             |
| 11  | AI: mock provider, sınıflandırma, öncelik, müdürlük önerisi, duplicate     | ⬜                                                             |
| 12  | Saha360 mobil                                                              | ⬜                                                             |
| 13  | Raporlar, bildirimler, audit arayüzü                                       | ⬜                                                             |
| 14  | Test, güvenlik, performans, dokümantasyon, demo cilası                     | ⬜                                                             |

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
- **Çıkış kriteri:** `npm run infra:up && npm run db:deploy` hatasız çalışır, `/health/ready` → `ok`

## Phase 2 – Backend Temeli 🟡

- ✅ Global prefix `/api/v1`, Swagger `/api/docs`, helmet, CORS, ValidationPipe, Throttler
- ✅ Standart hata/başarı zarfı, structured log + redaksiyon, request-id
- ✅ `/health`, `/health/ready`
- ⬜ Sayfalama/sıralama DTO altyapısı, `@CurrentUser`, kiracı kapsamı yardımcıları
- **Çıkış:** e2e health testi DB ile ve DB'siz geçer

## Phase 3 – Auth / RBAC

- Login, refresh (rotation + reuse detection), logout, me, vatandaş kaydı
- `JwtAuthGuard` (global, `@Public()` istisnası), `PermissionsGuard` + `@RequirePermissions()`
- Kullanıcı ve rol yönetimi uçları, audit log servisi
- **Testler:** parola hash/doğrulama, token rotation, reuse detection, guard'lar (unit + e2e)

## Phase 4 – Belediye Domain'i

- Belediye profili/markası (`/municipalities/current`), müdürlükler, mahalleler (GeoJSON), kategori ağacı + SLA
- **Seed:** 1 belediye (Şahinbey kurgusu), 5 müdürlük, 12+ gerçek Gaziantep mahallesi (yaklaşık poligonlar), tam kategori ağacı, 30+ kullanıcı, tüm roller/izinler. Seed idempotent ve < 10 sn.
- Web: marka bilgisi API'den yüklenir

## Phase 5 – Talep Yönetimi

- Atomik numara üretimi, konumdan mahalle bulma (PostGIS), SLA hesaplama
- Durum makinesi + geçiş uç noktası, history, audit
- Medya yükleme (MinIO, MIME/magic byte doğrulama, presigned URL)
- **Seed:** 150+ talep (son 90 gün, gerçekçi dağılım)
- **Testler:** durum geçiş tablosu, SLA hesabı, numara formatı ve eşzamanlılık

## Phase 6 – İş Emirleri

- Talepten iş emri, ekip/personel ataması (geçmiş korunur), iş emri durum makinesi
- Konum doğrulama, AFTER fotoğrafı zorunluluğu, talep↔iş emri senkronu
- **Seed:** 8 saha ekibi, 40+ iş emri, önce/sonra fotoğraflı demo senaryosu (KNT-2026-001248 / WO-2026-000883)

## Phase 7 – Web Temeli 🟡

- ✅ Tasarım token'ları, Inter, sidebar (daraltılabilir, mobil çekmece), topbar (breadcrumb, arama, API durumu, kullanıcı menüsü), sayfa iskeletleri, login ekranı
- ⬜ Gerçek oturum yönetimi, route koruması, izin bazlı menü, toast sistemi

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

# KENT360 – Veritabanı Tasarımı

Kaynak: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) ·
Migration'lar: [`apps/api/prisma/migrations`](../apps/api/prisma/migrations)

## 1. Konvansiyonlar

| Konu         | Karar                                                                                          | Gerekçe                                                             |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Motor        | PostgreSQL 17 + PostGIS 3.5 + pg_trgm                                                          | Spatial sorgu, metin benzerliği tek motorda                         |
| Primary key  | UUIDv7 (`uuid(7)`, `uuid` tipi)                                                                | Zaman sıralı → B-tree dostu; tahmin edilemez (IDOR riskini azaltır) |
| İsimlendirme | Model PascalCase / alan camelCase → tablo ve kolon `snake_case`                                | SQL ve BI araçlarında okunabilirlik                                 |
| Zaman        | `timestamptz(3)`, **UTC**                                                                      | Saat dilimi dönüşümü yalnızca arayüzde                              |
| Enum         | PostgreSQL native enum                                                                         | DB seviyesinde geçersiz değer engellenir                            |
| Kiracı       | Kiracıya ait tablolarda `municipality_id`                                                      | Multi-municipality / white-label                                    |
| Silme        | İlişkiler `Restrict` (kök veriler) / `Cascade` (alt kayıtlar) / `SetNull` (aktör referansları) | Kullanıcı silinse bile geçmiş kayıt kaybolmaz                       |

## 2. Varlık Haritası

```
Municipality ─┬─< Department ─┬─< FieldTeam ─< FieldTeamMember >─ User
              │               └─< RequestCategory (parent/children ağacı)
              ├─< Neighborhood (boundary MultiPolygon, center Point)
              ├─< User ─< UserRole >─ Role ─< RolePermission >─ Permission
              │     └─< RefreshToken (hash, familyId)
              ├─< Request ─┬─< RequestMedia
              │            ├─< RequestHistory (zaman çizelgesi)
              │            ├─< RequestFollower (mevcut bildirime katılanlar)
              │            ├─< AIAnalysis
              │            ├─< DuplicateMatch (request ↔ matchedRequest)
              │            ├─< Comment
              │            └─< WorkOrder ─┬─< WorkOrderAssignment (atama geçmişi)
              │                           ├─< WorkOrderMedia (BEFORE/DURING/AFTER)
              │                           ├─< WorkOrderHistory
              │                           └─< Comment
              ├─< Notification
              ├─< AuditLog (append-only)
              └─< NumberSequence (yıllık sayaçlar)
```

## 3. Tablolar

| Tablo                                                    | Amaç                     | Önemli alanlar                                                                                                                             |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `municipalities`                                         | Kiracı + marka           | `slug`, `primary_color`, `secondary_color`, `logo_url`, `timezone`, `map_center_*`, `settings` (JSON: SLA risk oranı, duplicate yarıçapı…) |
| `departments`                                            | Müdürlükler              | `(municipality_id, code)` unique                                                                                                           |
| `neighborhoods`                                          | Mahalleler               | `boundary geometry(MultiPolygon,4326)`, `center geometry(Point,4326)`, `population`, `status`                                              |
| `users`                                                  | Tüm kullanıcılar         | `email` unique (küçük harf), `password_hash` (Argon2id), `failed_login_count`, `locked_until`                                              |
| `roles`, `permissions`, `user_roles`, `role_permissions` | RBAC                     | Sistem rolleri `municipality_id = NULL`; izin kodları `@kent360/shared-types` ile birebir                                                  |
| `refresh_tokens`                                         | Oturum yenileme          | Yalnızca **hash** saklanır; `family_id` ile yeniden kullanım tespiti                                                                       |
| `request_categories`                                     | Hiyerarşik kategori      | `parent_id`, `department_id`, `default_priority`, `default_sla_minutes`, `keywords[]` (mock AI)                                            |
| `requests`                                               | Talepler                 | `public_number`, `status`, `priority`, `risk_level`, `source`, `latitude/longitude`, `location`, `sla_due_at`, `supporter_count`           |
| `request_media`                                          | Talep fotoğrafları       | `storage_key` (sunucu üretimi), `mime_type`, `size_bytes`                                                                                  |
| `request_history`                                        | Zaman çizelgesi          | `event_type`, `old_status`, `new_status`, `metadata`                                                                                       |
| `request_followers`                                      | "Mevcut bildirime katıl" | `(request_id, user_id)` PK                                                                                                                 |
| `field_teams`, `field_team_members`                      | Saha ekipleri            | `leader_id`, üyelik `joined_at/left_at`                                                                                                    |
| `work_orders`                                            | İş emirleri              | `public_number`, zaman damgaları (`accepted/en_route/arrived/started/completed/verified/cancelled_at`), denormalize aktif atama            |
| `work_order_assignments`                                 | Atama geçmişi            | Yeniden atama eski satırı `unassigned_at` ile kapatır, **üzerine yazmaz**                                                                  |
| `work_order_media`                                       | Kanıt fotoğrafları       | `type` (BEFORE/DURING/AFTER), çekim konumu ve zamanı                                                                                       |
| `work_order_history`                                     | İş emri olayları         | Olay anındaki personel konumu                                                                                                              |
| `comments`                                               | Notlar                   | Talebe **veya** iş emrine bağlı (CHECK), `visibility` INTERNAL/PUBLIC                                                                      |
| `notifications`                                          | Uygulama içi bildirim    | `channel` (IN_APP; EMAIL/SMS/PUSH için hazır), `entity_type/entity_id` deep link                                                           |
| `ai_analyses`                                            | AI önerileri             | `provider`, `model`, öneriler, `confidence`, temizlenmiş `raw_response`, `accepted`                                                        |
| `duplicate_matches`                                      | Mükerrer adaylar         | Toplam skor **ve** tüm bileşenleri, karar veren kişi                                                                                       |
| `audit_logs`                                             | Denetim izi              | `before_data/after_data`, `ip_address`, `user_agent`                                                                                       |
| `number_sequences`                                       | Numara sayaçları         | `(municipality_id, scope, year)` PK                                                                                                        |

## 4. Spatial Tasarım

**Neden hem `latitude/longitude` hem `location`?** Uygulama kodu ve API sözleşmesi sade sayılarla çalışır; PostGIS sorguları (`ST_DWithin`, `ST_Contains`, kümeleme) geometri kolonunu ve GIST index'ini kullanır. İkisinin tutarsız olmasını engellemek için `location` **DB trigger'ı** ile üretilir:

```sql
CREATE TRIGGER requests_sync_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON requests
  FOR EACH ROW EXECUTE FUNCTION kent360_sync_point_location();
```

Aynı yaklaşım `work_orders` için uygulanır; `neighborhoods.center` ise `ST_PointOnSurface(boundary)` ile üretilir (içbükey poligonlarda bile nokta mahalle içinde kalır).

Tipik sorgular:

```sql
-- Konumdan mahalle bulma (talep oluştururken)
SELECT id, name FROM neighborhoods
WHERE municipality_id = $1 AND ST_Contains(boundary, ST_SetSRID(ST_MakePoint($lng, $lat), 4326));

-- Yakındaki açık talepler (duplicate adayları)
SELECT id FROM requests
WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($lng,$lat),4326)::geography, 150);
```

Tüm raw sorgular Prisma'nın tagged template'i (`$queryRaw\`...\``) ile **parametreli** yazılır; `$queryRawUnsafe` kullanılmaz.

## 5. Okunabilir Numara Üretimi (race-condition güvenli)

`KNT-2026-000001` / `WO-2026-000001` formatı için belediye + kapsam + yıl bazında sayaç tutulur. Artırma tek bir atomik ifadedir; eşzamanlı iki istek aynı numarayı alamaz (satır kilidi `ON CONFLICT DO UPDATE` tarafından alınır):

```sql
INSERT INTO number_sequences (municipality_id, scope, year, last_value, updated_at)
VALUES ($1, 'REQUEST', $2, 1, now())
ON CONFLICT (municipality_id, scope, year)
DO UPDATE SET last_value = number_sequences.last_value + 1, updated_at = now()
RETURNING last_value;
```

Bu ifade talebi oluşturan transaction içinde çalışır; transaction geri alınırsa numara da geri alınır (boşluk oluşmaz). Biçimlendirme saf fonksiyondur: `formatPublicNumber()` (`src/common/utils/public-number.ts`, birim testli). Yıl, belediyenin saat diliminde hesaplanır (31 Aralık 23:30 Türkiye saati → yeni yıl değil).

## 6. Index Stratejisi

| Tablo                                | Index                                                                                                                                                  | Kullanım                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| requests                             | `(municipality_id, status)`, `status`, `priority`, `category_id`, `department_id`, `neighborhood_id`, `created_at`, `sla_due_at`, `created_by_id`      | Liste filtreleri, dashboard sayaçları, "taleplerim" |
| requests                             | **GIST** `location`                                                                                                                                    | Harita bbox, yakın kayıt                            |
| requests                             | **GIN trigram** `description`, `address`                                                                                                               | Arama ve metin benzerliği                           |
| work_orders                          | `(municipality_id, status)`, `status`, `(assigned_user_id, status)`, `field_team_id`, `department_id`, `request_id`, `created_at`, **GIST** `location` | Mobil "görevlerim", ekip yükü                       |
| neighborhoods                        | **GIST** `boundary`                                                                                                                                    | Point-in-polygon                                    |
| request_history / work_order_history | `(parent_id, created_at)`                                                                                                                              | Zaman çizelgesi                                     |
| notifications                        | `(user_id, read_at, created_at)`                                                                                                                       | Okunmamış bildirim sayacı                           |
| audit_logs                           | `(municipality_id, created_at)`, `(entity_type, entity_id)`, `(user_id, created_at)`, `action`                                                         | Audit ekranı filtreleri                             |

## 7. Veritabanı Seviyesi Kurallar

Prisma şema dilinin ifade edemediği kurallar ayrı migration'dadır (`20260926000100_db_rules`):

- Koordinat aralığı: `latitude ∈ [-90, 90]`, `longitude ∈ [-180, 180]`
- `comments` tam olarak bir üst kayda bağlı olmalı
- `duplicate_matches`: kendisiyle eşleşme yok, skor `[0,1]`
- `ai_analyses.confidence ∈ [0,1]`, medya boyutu > 0, SLA dakikası > 0
- **Sistem rolleri tekil:** `roles (municipality_id, code)` unique index'i `NULLS NOT DISTINCT` (`20260926000200_roles_nulls_not_distinct`); aynı sistem rolü kodu (`municipality_id = NULL`) ikinci kez oluşturulamaz, belediyeye özel roller farklı belediyelerde aynı kodu kullanabilir.
- **Mahalle geometrisi:** `ST_IsValid`, boş olmama ve boylam/enlem aralığı CHECK kısıtları (`20260926000300_municipality_domain`).
- **Kod biçimleri:** müdürlük ve kategori kodları `^[A-Z][A-Z0-9_]+$`, mahalle kodları `^[A-Za-z0-9][A-Za-z0-9_-]*$`.
- **SLA aralığı:** `default_sla_minutes` 1 … 525 600 (365 gün).
- **Aynı kiracı:** `request_categories` trigger'ı üst kategori ve müdürlüğün aynı belediyeye ait olduğunu ve ağacın iki seviyeli olduğunu; `users` trigger'ı kullanıcının müdürlüğünün aynı belediyede olduğunu zorlar.
- **`audit_logs` append-only:** `UPDATE`, `DELETE`, `TRUNCATE` trigger ile reddedilir. Saklama süresi dolan kayıtların arşivlenmesi yalnızca DBA tarafından, trigger bilinçli olarak devre dışı bırakılarak yapılır.

## 8. KVKK ve Veri Minimizasyonu

- Vatandaştan yalnızca ad, soyad, e-posta ve (opsiyonel) telefon alınır; T.C. kimlik no gibi veriler **toplanmaz**.
- Parola yalnızca Argon2id hash; refresh token yalnızca SHA-256 hash olarak saklanır.
- `ai_analyses.raw_response` saklanmadan önce kişisel veriden arındırılır.
- Vatandaş iletişim bilgisi API yanıtlarında yalnızca `users.read` izni olanlara döner.
- Audit log'da `before_data/after_data` alanlarına parola/token yazılmaz (servis katmanında alan beyaz listesi).

## 9. Belediye Domain'i (Phase 4)

### Mahalle geometrisi

- `boundary` her zaman **MultiPolygon, SRID 4326**'dır. API `Polygon` da kabul eder ve `ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(…), 4326)))` ile saklar – gerçek mahalle sınırları çok parçalı olabildiği için tek tip kolon tercih edildi. API yanıtında tek parçalı sınır `geometryType: "Polygon"` olarak gösterilir.
- `center` trigger ile `ST_PointOnSurface(boundary)` olarak üretilir (içbükey poligonda bile içeride kalır).
- Geçerlilik iki katmanlı: uygulama yapıyı ve koordinat aralığını denetler, PostGIS `ST_IsValid` topolojiyi; aynı kurallar DB CHECK kısıtı olarak da vardır.
- Geometri Prisma'nın `Unsupported` tipidir: okuma/yazma parametreli raw SQL ile yapılır ve her sorgu `municipality_id`'yi kendisi filtreler (`prisma.forTenant()` raw SQL'i kapsamaz).

### Demo mahalle geometrileri – RESMİ SINIR DEĞİLDİR

Development seed'indeki beş mahalle (Karataş, Akkent, Güneykent, Dumlupınar, Binevler) **gerçek mahalle adlarıyla, uydurma geometriler** kullanır: Şahinbey merkezine yakın, birbirinden ayrık, basit dikdörtgenler (Binevler iki parçalı → MultiPolygon örneği). Harita, noktadan mahalle bulma ve MahallePulse demolarını mümkün kılmak içindir. Resmi sınır verisi (ör. belediye CBS birimi) elde edildiğinde `POST /neighborhoods/import` ile yüklenir; demo kayıtları pasifleştirilir. Tanımlar: `apps/api/prisma/seed-domain.ts`.

### Talep kategorileri ve yönlendirme

```
Yol ve Kaldırım (ROAD)             → Fen İşleri
 ├─ Yol Çukuru (ROAD_POTHOLE)      → Fen İşleri            · Yüksek · 1 gün
 ├─ Asfalt Bozulması               → Fen İşleri            · Normal · 3 gün
 └─ Kaldırım Bozukluğu             → Fen İşleri            · Normal · 3 gün
Park ve Yeşil Alan (PARK)          → Park ve Bahçeler
 ├─ Oyun Grubu Arızası             → Park ve Bahçeler      · Yüksek · 1 gün
 ├─ Park Aydınlatması              → Park ve Bahçeler      · Normal · 2 gün
 └─ Sulama                         → Park ve Bahçeler      · Düşük  · 3 gün
Temizlik (CLEANING)                → Temizlik İşleri
 └─ Çöp · Konteyner · Moloz        → Temizlik İşleri       · 12 saat / 1 gün / 2 gün
Zabıta (ENFORCEMENT)               → Zabıta
 └─ İşgal · Gürültü · İzinsiz Afiş → Zabıta                · 1 gün / 4 saat / 2 gün
Sosyal Destek (SOCIAL)             → Sosyal Yardım İşleri
 └─ Sosyal Yardım Başvurusu        → Sosyal Yardım İşleri  · Normal · 3 gün
```

| Kural                                                                                                                                                                     | Uygulama                  | Hata                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| Ağaç **iki seviyelidir**: ana kategori → alt kategori                                                                                                                     | servis + DB trigger       | `409 CATEGORY_HIERARCHY_INVALID`                  |
| **Alt kategori bir müdürlüğe yönlendirilmek zorundadır**; ana kategoride müdürlük isteğe bağlıdır (alt kategorisi olmayan bir ana kategori doğrudan seçilirse kullanılır) | servis                    | `400 CATEGORY_DEPARTMENT_REQUIRED`                |
| Üst kategori ve müdürlük aynı belediyeden olmalı                                                                                                                          | servis (404) + DB trigger | `404 CATEGORY_NOT_FOUND` / `DEPARTMENT_NOT_FOUND` |
| Yeni yönlendirme pasif müdürlüğe yapılamaz                                                                                                                                | servis                    | `409 DEPARTMENT_INACTIVE`                         |
| Aktif kategorilerin yönlendirildiği müdürlük pasifleştirilemez                                                                                                            | servis                    | `409 DEPARTMENT_IN_USE`                           |
| Pasif ana kategori altında aktif alt kategori olamaz; ana kategori pasifleşince alt kategorileri de pasifleşir (audit'te listelenir)                                      | servis                    | `409 CATEGORY_PARENT_INACTIVE`                    |

İki seviye tercihinin gerekçesi: vatandaş formunda "Kategori → Alt kategori" seçimi ve raporlama için yeterli; döngü ve derinlik problemlerini yapısal olarak ortadan kaldırır; SLA mirası tek adımlı ve açıklanabilir kalır.

**Phase 5'te yönlendirme:** talebin müdürlüğü = seçilen kategorinin `departmentId`'si (alt kategoride her zaman dolu). Öncelik = `defaultPriority` (AI veya kullanıcı değiştirebilir).

### SLA

- Kanonik birim **dakika** (`default_sla_minutes`, 1 … 525 600). Arayüz ve API "4 saat", "1 gün 12 saat" gibi okunur biçimi `formatSlaMinutes()` (`@kent360/shared-types`) ile üretir.
- Alt kategorinin değeri boşsa ana kategorininki kullanılır (`effectiveSlaMinutes`); ikisi de boşsa SLA takibi yapılmaz.
- Phase 5: `slaDueAt = createdAt + effectiveSlaMinutes` (ARCHITECTURE §6.3).
- Demo varsayılanları: 240 (4 saat, gürültü) · 720 (12 saat, çöp) · 1440 (1 gün) · 2880 (2 gün) · 4320 (3 gün).

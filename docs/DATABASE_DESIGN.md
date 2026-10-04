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

Bu ifade talebi oluşturan transaction içinde çalışır; transaction geri alınırsa numara da geri alınır (boşluk oluşmaz). Sayaç belediye bazlı olduğundan numara **belediye içinde** tekildir: `UNIQUE (municipality_id, public_number)` (iki belediye de `KNT-2026-000001`'e sahip olabilir). Uygulama: `NumberingService` (`src/modules/numbering`); iş emirleri (`WORK_ORDER` kapsamı, `WO-2026-000001`) aynı servisi kullanır. Test: 25 eşzamanlı talep ardışık ve tekrarsız numara alır. Biçimlendirme saf fonksiyondur: `formatPublicNumber()` (`src/common/utils/public-number.ts`, birim testli). Yıl, belediyenin saat diliminde hesaplanır (31 Aralık 23:30 Türkiye saati → yeni yıl değil).

## 6. Index Stratejisi

| Tablo                                | Index                                                                                                                                                                                                                                                                                                                            | Kullanım                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| requests                             | `(municipality_id, status)`, `status`, `priority`, `category_id`, `department_id`, `neighborhood_id`, `created_at`, `sla_due_at`, `created_by_id`                                                                                                                                                                                | Liste filtreleri, dashboard sayaçları, "taleplerim"                                                |
| requests                             | **GIST** `location`                                                                                                                                                                                                                                                                                                              | Harita bbox, yakın kayıt                                                                           |
| requests                             | **GIN trigram** `description`, `address`                                                                                                                                                                                                                                                                                         | Arama ve metin benzerliği                                                                          |
| work_orders                          | `(municipality_id, created_at DESC)`, `(municipality_id, department_id, created_at DESC)`, `(assigned_user_id, status)`, `(field_team_id, status)`, `(municipality_id, status)`, `status`, `department_id`, `request_id`, `created_at`, **GIST** `location`; kısmi unique `request_id WHERE status NOT IN (VERIFIED, CANCELLED)` | Yönetici/müdürlük listesi, "görevlerim", ekip kapsamı ve sayaçları, talep başına tek aktif iş emri |
| neighborhoods                        | **GIST** `boundary`                                                                                                                                                                                                                                                                                                              | Point-in-polygon                                                                                   |
| request_history / work_order_history | `(parent_id, created_at)`                                                                                                                                                                                                                                                                                                        | Zaman çizelgesi                                                                                    |
| notifications                        | `(user_id, read_at, created_at)`                                                                                                                                                                                                                                                                                                 | Okunmamış bildirim sayacı                                                                          |
| audit_logs                           | `(municipality_id, created_at)`, `(entity_type, entity_id)`, `(user_id, created_at)`, `action`                                                                                                                                                                                                                                   | Audit ekranı filtreleri                                                                            |

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

### Çakışma kuralı

Aynı belediyenin **aktif** mahalleleri alan olarak çakışamaz: bir yer iki mahalleye birden ait görünmemelidir.

- **Ölçüt:** `ST_Area(ST_Intersection(a, b)::geography)` – kesişimin sferoid üzerindeki gerçek alanı (m²). `ST_Intersects` yalnızca GIST index'li ön filtredir; tek başına kullanılsaydı ortak sınırı paylaşan komşuları da reddederdi (sınır temasında kesişim alanı 0'dır). `ST_Overlaps` da uygun değildir: bir poligon diğerini tamamen içeriyorsa `false` döner.
- **Tolerans: 1 m²** (`OVERLAP_TOLERANCE_M2`). Ortak sınırlardaki kayan nokta / yeniden projeksiyon artefaktları bunun çok altındadır (6+ ondalık ≈ 10 cm), gerçek bir mükerrer atama ise onlarca m² ve üzeridir. 1 m² üstü her şerit raporlanır, sessizce kabul edilmez.
- **Kapsam:** yeni mahalle, sınır güncellemesi, pasif mahallenin yeniden aktifleştirilmesi ve GeoJSON içe aktarma (dosya içi çiftler + kayıtlı mahalleler). Pasif mahalleler dikkate alınmaz. Farklı belediyeler birbirini etkilemez.
- **Eşzamanlılık:** yazma transaction'ı belediye bazlı `pg_advisory_xact_lock` alır ve kontrolü kilit altında tekrarlar; iki eşzamanlı içe aktarma birbirine çakışan sınırları aynı anda yazamaz.
- Kontrol servis katmanındadır (tolerans ve açıklayıcı hata gerektirdiği için CHECK/EXCLUDE kısıtı olarak ifade edilemez). `/resolve`'daki "küçük alan, sonra kod" kuralı güvenlik ağı olarak korunur; geçerli bir veri setinde yalnızca ortak sınır çizgisindeki noktalar için devreye girer.

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

## 10. Talepler (Phase 5)

### Oluşturma – sunucunun belirledikleri

| Alan                           | Kaynak                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `public_number`                | `NumberingService` – belediye + yıl sayacı (belediyenin saat diliminde yıl)                                                       |
| `department_id`                | seçilen alt kategorinin müdürlüğü – **snapshot**; kategori sonradan başka müdürlüğe bağlansa da talep değişmez                    |
| `priority`                     | kategorinin `default_priority` (sonra yetkili personel değiştirebilir)                                                            |
| `sla_due_at`, `sla_at_risk_at` | `created_at` + etkin kategori SLA'sı; risk eşiği = bitişten geriye SLA süresinin %25'i (`settings.slaAtRiskRatio`) – **snapshot** |
| `neighborhood_id`              | `NeighborhoodLocator` (`ST_Covers`, Phase 4 ile aynı fonksiyon); bulunamazsa `NULL`                                               |
| `source`                       | personel → `MUNICIPAL_STAFF`, vatandaş web formu → `WEB` (`MOBILE` Phase 12)                                                      |
| `title`                        | "Kategori – Mahalle" (ör. "Yol Çukuru – Karataş"); vatandaştan ayrıca başlık istenmez                                             |
| `status`                       | `NEW`                                                                                                                             |

Kategori kuralları: aktif, **yaprak** (alt kategorisi olmayan) ve aktif bir müdürlüğe yönlendirilmiş olmalı.

**Mahalle bulunamazsa talep reddedilmez** (`neighborhood_id = NULL`, yanıtta "Konum tanımlı mahalle sınırları dışında."). Gerekçe: demo mahalle sınırları resmi değil ve gerçek sınır verisinde de boşluklar olabilir; vatandaşın bildirimi kaybolmamalı, operatör konumu kontrol eder.

### SLA snapshot

SLA oluşturma anında dondurulur: kategori SLA'sı veya belediyenin risk oranı sonradan değişirse, ya da talep başka müdürlüğe yönlendirilirse **mevcut talepler etkilenmez**. `sla_due_at` / `sla_at_risk_at` bir DB trigger'ı ile değiştirilemez. SLA durumu saklanmaz, hesaplanır (`evaluateSla`, `@kent360/shared-types`): açık talep şimdiye göre (`BREACHED` > bitiş, `AT_RISK` ≥ risk eşiği, aksi `ON_TIME`); çözülmüş talep `resolved_at` anına göre sabitlenir; reddedilen talepte SLA yoktur.

### Yaşam döngüsü

```
NEW ─► UNDER_REVIEW ─► ASSIGNED_TO_DEPARTMENT ─► (Phase 6) WORK_ORDER_CREATED ─► IN_PROGRESS ─► RESOLVED ─► VERIFIED ─► CLOSED
 │  └► (Phase 11) AI_ANALYZED ─┘        │  ▲
 └──────────────┴──────────────────────┴──┴──► REJECTED (gerekçe zorunlu)
```

Geçiş tablosunun tamamı `request-status.machine.ts`'te tanımlıdır; her geçiş `manual` (kişi, Phase 5 ucu) ya da `system` (AI / iş emri akışı) olarak işaretlidir. Phase 5'te açık olan elle geçişler: `NEW → UNDER_REVIEW | REJECTED`, `UNDER_REVIEW → ASSIGNED_TO_DEPARTMENT | REJECTED`, `ASSIGNED_TO_DEPARTMENT → UNDER_REVIEW (gerekçeli) | REJECTED`. Sistem geçişleri elle istenirse `409` döner. Durum güncellemesi iyimser eşzamanlılıkla yapılır (`WHERE status = <eski>`).

### Zaman çizelgesi ve denetim

- `request_history`: ürün içi süreç (`CREATED`, `DEPARTMENT_ASSIGNED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `MEDIA_ADDED`…), vatandaşa da gösterilir.
- `audit_logs`: güvenlik denetimi (`REQUEST_CREATED`, `REQUEST_STATUS_CHANGED`, `REQUEST_PRIORITY_CHANGED`, `REQUEST_DEPARTMENT_CHANGED`, `REQUEST_MEDIA_ADDED`). Genel güncelleme ucu olmadığından `REQUEST_UPDATED` kullanılmaz.
- İkisi de değişiklikle aynı transaction'da yazılır.

### Medya

`request_media.storage_key` tek doğruluk kaynağıdır (`url` kolonu boş kalır): `municipalities/{municipalityId}/requests/{requestId}/{uuid}.{jpg|png|webp}`. Uzantı dosya imzasından gelir; istemci dosya adı hiçbir yerde kullanılmaz. Saklanan nesne, meta verisi (EXIF/GPS/XMP) atılarak yeniden kodlanmış görüntüdür; `mime_type` ve `size_bytes` bu çıktıyı tanımlar (SECURITY §5). Nesneler private `kent360-media` bucket'ındadır (e2e testleri ayrı `kent360-media-test` bucket'ını kullanır), erişim yalnızca yetki kontrolünden sonra verilen 5 dakikalık presigned URL ile.

### DB kuralları (`20260927000000`, `…0100`, `…0200`)

- Talebin kategorisi, müdürlüğü ve mahallesi aynı belediyeden olmalı (trigger).
- `public_number`, `municipality_id`, `created_at`, SLA snapshot'ı değişmez; bildiren (`created_by_id`) yalnızca `NULL`'a düşebilir (hesap silinirse), başka kullanıcıya aktarılamaz.
- `sla_at_risk_at ≤ sla_due_at`, `sla_due_at > created_at` (CHECK).
- Liste index'leri: `(municipality_id, created_at DESC)` ve `(municipality_id, department_id, created_at DESC)` – yönetici ve müdürlük görünümlerinin varsayılan sıralaması. Diğer filtreler mevcut tek kolon ve trigram index'leriyle karşılanır; mükerrer tespiti (Phase 11) için gerekli `location` GIST, `category_id` ve `created_at` index'leri hazırdır.

### Demo veri

`prisma/seed-requests.ts`: 120 talep, deterministik (sabit tohumlu üreteç), bir kez oluşturulur (zaman çizelgesinde `demoSeed` işareti), son 90 güne yayılmış, açıklamalarda "(Demo kaydı)". Phase 6 seed'i bu kapanmış taleplerin 28'ine doğrulanmış iş emri ekler (bkz. §11). Talep numaraları sıra sayacından gelir ve **geri alınmaz**: geliştirme veritabanında eski demo kayıtları silinip yeniden seed edildiğinde numaralar kaldığı yerden devam eder (ör. `KNT-2026-000122…000241`); audit kayıtları append-only olduğu için silinmez.

## 11. İş Emirleri ve Saha Ekipleri (Phase 6)

### Oluşturma

İş emri yalnız `ASSIGNED_TO_DEPARTMENT` durumundaki bir talepten, talep satırı `SELECT … FOR UPDATE` ile kilitlenerek oluşturulur. Sunucu talepten kopyalar: `department_id`, `priority`, `title`, `sla_due_at` ve **konum snapshot'ı** (`latitude`, `longitude`, `address`; `location` trigger'la üretilir). Numara `NumberingService` (`WORK_ORDER` kapsamı) ile aynı transaction'da alınır; talep durumu, talep zaman çizelgesi (`WORK_ORDER_CREATED`), iş emri geçmişi ve audit aynı transaction'dadır.

### Atama ve geçmiş

`work_orders.field_team_id` / `assigned_user_id` güncel atamadır (hızlı sorgu için); `work_order_assignments` tüm geçmişi tutar (her atama yeni satır, önceki `unassigned_at` ile kapanır). `field_team_members` silinmez: ekipten çıkan üyenin `left_at` alanı dolar, yeniden eklenince temizlenir. `field_teams.leader_id` üyeler arasındaki `LEADER`'ı yansıtır.

### Zaman çizelgesi ve denetim

- `work_order_history` (iç süreç, personel adlarıyla): `CREATED`, `ASSIGNED`, `REASSIGNED`, `ACCEPTED`, `EN_ROUTE`, `ON_SITE`, `STARTED`, `WAITING`, `RESUMED`, `MEDIA_ADDED`, `COMPLETED`, `VERIFIED`, `RETURNED`, `CANCELLED`, `LOCATION_CHECK_FAILED`; konum doğrulanan adımlarda cihaz konumu ve `metadata.distanceMeters`.
- `request_history`: talebe yansıyan anlamlı olaylar, vatandaşa dönük metinle (ARCHITECTURE §6.2).
- `audit_logs`: `WORK_ORDER_CREATED`, `WORK_ORDER_ASSIGNED`, `WORK_ORDER_REASSIGNED`, `WORK_ORDER_STATUS_CHANGED`, `WORK_ORDER_MEDIA_ADDED`, `WORK_ORDER_COMPLETED`, `WORK_ORDER_VERIFIED`, `WORK_ORDER_CANCELLED`, `WORK_ORDER_LOCATION_REJECTED`, `FIELD_TEAM_CREATED`, `FIELD_TEAM_UPDATED`, `FIELD_TEAM_MEMBERS_CHANGED` (+ senkronda `REQUEST_STATUS_CHANGED`).
- Atamada atanan kişiye (yoksa ekip sorumlusuna) `notifications` satırı (`WORK_ORDER_ASSIGNED`, uygulama içi; gelen kutusu arayüzü Phase 13).

### Kanıt fotoğrafları

`work_order_media.type`: `BEFORE` (sahada / çalışırken), `DURING` (çalışırken / beklemede), `AFTER` (çalışırken); tür başına en fazla 5. Key: `municipalities/{mid}/work-orders/{workOrderId}/{before|during|after}/{uuid}.{ext}`; talep fotoğraflarıyla aynı hat (`ImageUploadService` → `normalizeImage`).

### DB kuralları (`20260928000000_work_orders`)

- Aynı kiracı: iş emrinin talebi, müdürlüğü, ekibi (ekip ayrıca **aynı müdürlükten**) ve atanan kişisi; ekibin müdürlüğü ve sorumlusu; ekip üyesinin kullanıcısı (trigger'lar).
- Talep başına tek aktif iş emri: `work_orders_one_active_per_request` kısmi unique index'i (Prisma bu index'i ifade edemez; migration diff'i etkilemez).
- Değişmezler: `public_number`, `municipality_id`, `request_id`, `created_at`, **konum**; `COMPLETED`/`VERIFIED` iken `completion_description`; `VERIFIED` ve `CANCELLED` terminal. `COMPLETED`/`VERIFIED` için boş olmayan `completion_description` (CHECK).
- `work_order_media` append-only: güncellenemez; iş emri `COMPLETED / VERIFIED / CANCELLED` iken yeni fotoğraf eklenemez.

### Demo veri

`prisma/seed-work-orders.ts`: 5 ekip (Fen İşleri – Ekip 1/2, Park ve Bahçeler – Merkez Ekip, Temizlik – Ekip 1, Zabıta – Merkez Ekip), 6 ek demo saha personeli, **45 iş emri** (`WO-2026-000001…000045`): 28 doğrulanmış (daha önce kapanmış taleplerde) + 17 açık (CREATED 2, ASSIGNED 3, ACCEPTED 2, EN_ROUTE 1, ON_SITE 2, IN_PROGRESS 3, WAITING 2, COMPLETED 2). Bağlı talepler API'nin yapacağı gibi ilerletilir. Önce/sonra fotoğrafları programatik çizilir (indirilmiş görsel yok) ve `normalizeImage`'dan geçer. Deterministik ve idempotent (`demoSeed: phase6-v1`); e2e `seed.e2e-spec.ts` iki kez çalıştırıp hiçbir şey eklenmediğini doğrular.

## 12. Operasyon Okuma Modelleri (Phase 8–9)

Dashboard, harita ve arama yeni tablo veya index eklemez; mevcut verinin kapsamlı sorgularıdır (`src/modules/operations`).

- **Kapsam SQL'e çevrilir:** Raw / PostGIS sorguları da liste uçlarının nesne kapsamını kullanır. `scopeToSql()` yalnızca kapsam fonksiyonlarının ürettiği şekilleri (`{}`, `{ kolon: uuid }`, `{ kolon: { in: [...] } }`, `{ OR: [...] }`) izinli kolon listesiyle SQL'e çevirir; değerler parametredir, tanımadığı bir anahtar görürse hata verir (fail closed). `municipality_id` her sorguda elle filtrelenir.
- **KPI:** talepler için tek toplama sorgusu (`count(*) FILTER (…)`, `avg(resolved_at - created_at)`); açık iş emri sayısı Prisma `count`. Trend: oluşturma ve çözülme için birer `GROUP BY (… AT TIME ZONE <belediye saat dilimi>)::date`. Kritik liste: üç küçük sınırlı sorgu (CRITICAL / SLA aşıldı / SLA riskte), birleştirilip tekilleştirilir. N+1 yok.
- **Harita:** `location && ST_MakeEnvelope(batı, güney, doğu, kuzey, 4326)` – GIST `location` index'i. `EXPLAIN ANALYZE` (demo veri): talep bbox + müdürlük sorgusu `requests_location_idx` ve `requests_department_id_idx` ile Bitmap Index Scan, ~2 ms. KPI toplaması 120 satırda sıralı tarama (0,25 ms); büyüyen veride `(municipality_id, created_at DESC)` index'i kullanılabilir. **Yeni index gerekmedi.**
- **Arama:** talep ve iş emri liste sorgularının kendisi (trigram index'li `ILIKE`, tam numara eşleşmesi) – ayrı bir arama yapısı yok.

## 13. MahallePulse ve AI (Phase 10–11)

Yeni tablo veya migration yok; mevcut `ai_analyses`, `duplicate_matches`, `request_followers` ve `requests.supporter_count / ai_analyzed` kullanılır.

- **MahallePulse** (`modules/operations/pulse.service.ts`): liste üç gruplu sorgudur – mahalle metrikleri (`neighborhoods LEFT JOIN requests` + `FILTER` toplamları), `DISTINCT ON` ile en sık kategori, açık iş emri sayıları. Anomaliler tek `GROUP BY neighborhood, category` sorgusu (son 35 gün). Detay: kategori dağılımı ve 90 günlük trend birer gruplu sorgu, açık talep / iş emri listeleri sınırlı (10). Risk skoru ve anomali kuralları saf fonksiyonlardır (`domain/neighborhood-risk.ts`, `domain/anomaly.ts`).
- **Kapsam:** tüm sorgular talep / iş emri nesne kapsamını `scopeToSql` ile uygular; `municipality_id` her sorguda elle filtrelenir.
- **AI saklama** (`ai_analyses`): `provider, model, suggested_category_id, suggested_department_id, priority_suggestion, confidence, latency_ms, accepted` (seçilen kategori = önerilen mi), `classification` = `{ categoryCode, matchedKeywords, fallback }`, `summary` = maskelenmiş tek cümle, `raw_response` = `{ reasoning }`. Açıklamanın tamamı, prompt ve kişisel veri saklanmaz.
- **Mükerrer eşleşmeleri** (`duplicate_matches`): talep oluşturulurken skoru ≥ 0,35 olan en fazla 5 aday, bileşenleriyle (`SUGGESTED`).
- **Katılım** (`request_followers` PK `(request_id, user_id)`): bir kullanıcı bir talebe bir kez katılır; `supporter_count` aynı transaction'da artar; zaman çizelgesine isimsiz `CITIZEN_JOINED` yazılır. Katılan vatandaş talebi `requestReadScope` takipçi kuralıyla görür.
- **Demo:** `prisma/seed-pulse.ts` seed anına göre 9 yeni talep ekler (Karataş'ta 5 yol çukuru, Güneykent'te 4 çöp) – bir kez, `demoSeed: phase10-v1` – ve bunlara saklanmış analiz + mükerrer eşleşmeleri yazar. Böylece demo anomali ve mükerrer önerisi gerçek veriden üretilir.
- **Performans:** demo veride analitik ve aday sorguları milisaniyeler içinde; aday sorgusu `requests_location_idx` (GIST) ile önce kutuya, sonra kesin mesafeye daraltılır; metin benzerliği `pg_trgm similarity()` yalnız bu küçük aday kümesinde hesaplanır.

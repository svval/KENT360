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
| `neighborhoods`                                          | Mahalleler               | `boundary geometry(MultiPolygon,4326)`, `center geometry(Point,4326)`, `population`                                                        |
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
- **`audit_logs` append-only:** `UPDATE`, `DELETE`, `TRUNCATE` trigger ile reddedilir. Saklama süresi dolan kayıtların arşivlenmesi yalnızca DBA tarafından, trigger bilinçli olarak devre dışı bırakılarak yapılır.

## 8. KVKK ve Veri Minimizasyonu

- Vatandaştan yalnızca ad, soyad, e-posta ve (opsiyonel) telefon alınır; T.C. kimlik no gibi veriler **toplanmaz**.
- Parola yalnızca Argon2id hash; refresh token yalnızca SHA-256 hash olarak saklanır.
- `ai_analyses.raw_response` saklanmadan önce kişisel veriden arındırılır.
- Vatandaş iletişim bilgisi API yanıtlarında yalnızca `users.read` izni olanlara döner.
- Audit log'da `before_data/after_data` alanlarına parola/token yazılmaz (servis katmanında alan beyaz listesi).

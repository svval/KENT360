# KENT360 – API Tasarımı

- **Base URL:** `http://localhost:4000/api/v1`
- **Swagger UI:** `http://localhost:4000/api/docs` · **OpenAPI JSON:** `/api/docs/openapi.json`
- **Health:** `GET /health` (liveness), `GET /health/ready` (readiness) — prefix dışında
- **Format:** JSON, UTF-8, tarih/saat ISO-8601 **UTC**

## 1. Yanıt Zarfı

Başarılı:

```json
{ "success": true, "data": { "id": "…", "publicNumber": "KNT-2026-001248" } }
```

Sayfalı:

```json
{
  "success": true,
  "data": [{ "…": "…" }],
  "meta": { "page": 1, "pageSize": 20, "total": 134, "totalPages": 7 }
}
```

Hata:

```json
{
  "success": false,
  "code": "REQUEST_NOT_FOUND",
  "message": "Talep bulunamadı.",
  "details": null,
  "timestamp": "2026-09-25T18:00:00.000Z",
  "path": "/api/v1/requests/…",
  "requestId": "5006c498-274a-42f2-9170-a85037058707"
}
```

- İstemciler **`code`** alanına göre dallanır; `message` Türkçe ve kullanıcıya gösterilebilir.
- `requestId`, `x-request-id` yanıt header'ı ve sunucu log'larıyla aynıdır (destek taleplerinde kullanılır).
- 5xx hatalarında iç hata mesajı/stack **asla** dönmez.

| HTTP      | `code`                                                   | Durum                                             |
| --------- | -------------------------------------------------------- | ------------------------------------------------- |
| 400       | `VALIDATION_FAILED`                                      | DTO doğrulaması; `details` alan mesajları listesi |
| 401       | `UNAUTHORIZED`                                           | Token yok / geçersiz / süresi dolmuş              |
| 403       | `FORBIDDEN`                                              | Yetki yok ya da başka belediyenin kaydı           |
| 404       | `NOT_FOUND`, `REQUEST_NOT_FOUND`, `WORK_ORDER_NOT_FOUND` |                                                   |
| 409       | `CONFLICT`, `INVALID_STATUS_TRANSITION`                  | Domain kuralı ihlali                              |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE`           | Dosya yükleme                                     |
| 429       | `RATE_LIMITED`                                           |                                                   |
| 503       | `SERVICE_UNAVAILABLE`                                    | Bağımlılık erişilemiyor                           |

## 2. Kimlik Doğrulama

- `Authorization: Bearer <accessToken>` (15 dk ömür)
- Refresh token: web'de `httpOnly; Secure; SameSite=Strict` cookie, mobilde güvenli depolama (Expo SecureStore)
- Ayrıntı: [SECURITY.md](SECURITY.md)

## 3. Sayfalama, Filtre, Sıralama

```
GET /api/v1/requests?page=2&pageSize=20
    &status=IN_PROGRESS&status=ASSIGNED_TO_DEPARTMENT      (çoklu değer)
    &priority=HIGH&categoryId=…&departmentId=…&neighborhoodId=…
    &createdFrom=2026-09-01T00:00:00Z&createdTo=2026-09-30T23:59:59Z
    &slaStatus=AT_RISK&q=karataş çukur
    &sort=-priority,slaDueAt
```

- `pageSize` üst sınırı 100; varsayılan 20.
- `sort`: virgülle ayrılmış alanlar, `-` azalan. Yalnızca beyaz listedeki alanlar kabul edilir.
- `q`: talep numarası tam eşleşme **veya** adres/açıklama trigram araması.
- Harita uçları sayfalı değil **bbox** filtrelidir ve hafif GeoJSON döner.

## 4. Uç Nokta Planı

Durum: ✅ uygulandı · 🗓 planlandı (faz)

### System

| Metot | Yol             | Açıklama                            | Durum |
| ----- | --------------- | ----------------------------------- | ----- |
| GET   | `/health`       | Liveness                            | ✅    |
| GET   | `/health/ready` | PostgreSQL + PostGIS kontrolü (503) | ✅    |

### Auth (Phase 3) ✅

| Metot  | Yol                  | İzin                                                           |
| ------ | -------------------- | -------------------------------------------------------------- |
| POST   | `/auth/login`        | public · rate limit 5/dk/IP+e-posta · refresh cookie döner     |
| POST   | `/auth/refresh`      | refresh cookie · rotation + reuse detection · 30/dk            |
| POST   | `/auth/logout`       | refresh cookie · oturum ailesini iptal eder (audit)            |
| POST   | `/auth/logout-all`   | oturum · kullanıcının tüm oturumları (audit)                   |
| GET    | `/auth/me`           | oturum · profil + roller + izinler                             |
| GET    | `/auth/sessions`     | oturum · aktif oturumlar                                       |
| DELETE | `/auth/sessions/:id` | oturum · bir oturumu sonlandırır (audit)                       |
| POST   | `/auth/register`     | vatandaş kaydı · rate limit — **Phase 8** (vatandaş portalı) 🗓 |

### Users / Roles (Phase 3) ✅

| Metot | Yol                      | İzin                                                                         |
| ----- | ------------------------ | ---------------------------------------------------------------------------- |
| GET   | `/users`, `/users/:id`   | `users.read` · sayfalı, `q`, `status`, `role`, `sort`                        |
| POST  | `/users`                 | `users.manage` (audit)                                                       |
| PATCH | `/users/:id`             | `users.manage` (audit; pasifleştirme tüm oturumları kapatır)                 |
| PUT   | `/users/:id/roles`       | `roles.manage` (audit; kendi rolü değiştirilemez)                            |
| GET   | `/roles`, `/permissions` | `roles.manage`                                                               |
| POST  | `/roles`                 | `roles.manage` – belediyeye özel rol (audit)                                 |
| PUT   | `/roles/:id/permissions` | `roles.manage` (audit) – yalnız belediye rolleri; sistem rolleri salt okunur |

### Organisation (Phase 4) ✅

Hiçbir uçta silme (DELETE) yoktur: kayıtlar `status: INACTIVE` ile pasifleştirilir. Kodlar (`code`) oluşturulduktan sonra değiştirilemez. Başka belediyenin kaydı her uçta `404` döner.

| Metot              | Yol                                              | İzin                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                | `/municipality`                                  | `municipality.read` – oturumdaki kullanıcının belediyesi (liste yok)                                                                                                                                             |
| PATCH              | `/municipality`                                  | `municipality.update` (audit: `MUNICIPALITY_UPDATED`) – ad, il, logo, renkler, iletişim, adres, saat dilimi, harita merkezi; `slug` ve `status` değiştirilemez                                                   |
| GET                | `/departments`, `/departments/:id`               | `departments.read` · sayfalı, `search` (ad/kod), `status`, `sort`                                                                                                                                                |
| POST / PATCH       | `/departments`, `/departments/:id`               | `departments.manage` (audit: `DEPARTMENT_CREATED/UPDATED/STATUS_CHANGED`). Aktif kategorilerin yönlendirildiği müdürlük pasifleştirilemez → `409 DEPARTMENT_IN_USE`                                              |
| GET                | `/neighborhoods`, `/neighborhoods/:id`           | `neighborhoods.read` · liste geometri özeti (tip, parça, km², merkez) döner; detay `boundary` (GeoJSON) içerir                                                                                                   |
| GET                | `/neighborhoods/geojson`                         | `neighborhoods.read` – **zarfsız** GeoJSON FeatureCollection (bkz. §8)                                                                                                                                           |
| GET                | `/neighborhoods/resolve?lat=&lng=`               | `neighborhoods.read` – `{ id, name, code }` veya `null`                                                                                                                                                          |
| POST / PATCH       | `/neighborhoods`, `/neighborhoods/:id`           | `neighborhoods.manage` (audit: `NEIGHBORHOOD_CREATED/UPDATED/STATUS_CHANGED`). Aktif başka bir mahalleyle alan çakışması → `409 NEIGHBORHOOD_BOUNDARY_OVERLAP`, `details.conflicts: [{ code, name, overlapM2 }]` |
| POST               | `/neighborhoods/import[?dryRun=true]`            | `neighborhoods.manage` (audit: `NEIGHBORHOODS_IMPORTED`) – bkz. §8                                                                                                                                               |
| GET                | `/request-categories`                            | `categories.read` · düz liste, sayfalı; `search`, `status`, `departmentId`, `parentId`                                                                                                                           |
| GET                | `/request-categories/tree[?status=]`             | `categories.read` – tüm ağaç tek istekte                                                                                                                                                                         |
| GET / POST / PATCH | `/request-categories/:id`, `/request-categories` | okuma `categories.read`, yazma `categories.manage` (audit: `CATEGORY_CREATED/UPDATED/STATUS_CHANGED`)                                                                                                            |

Kategori yanıtı yönlendirme ve SLA bilgisini hazır verir: `department { id, name, code, status }`, `defaultPriority`, `defaultSlaMinutes` (kendi değeri, `null` = miras), `effectiveSlaMinutes` (kendi ?? ana kategori), `slaLabel` ("4 saat", "1 gün 12 saat"). Kurallar ve hata kodları: [DATABASE_DESIGN.md §9](DATABASE_DESIGN.md#9-belediye-domaini-phase-4).

### Requests (Phase 5, AI: Phase 11)

| Metot | Yol                         | İzin                                                                       |
| ----- | --------------------------- | -------------------------------------------------------------------------- |
| POST  | `/requests/analyze`         | `requests.create` – AI önerisi + duplicate adayları (kaydetmeden)          |
| POST  | `/requests`                 | `requests.create` · rate limit                                             |
| POST  | `/requests/:id/media`       | `requests.create` (sahibi) · multipart                                     |
| POST  | `/requests/:id/join`        | `requests.create` – mevcut bildirime katıl                                 |
| GET   | `/requests`                 | `requests.read` (belediye) / `requests.readOwn` (vatandaş: yalnızca kendi) |
| GET   | `/requests/:id`             | aynı                                                                       |
| GET   | `/requests/:id/timeline`    | aynı                                                                       |
| PATCH | `/requests/:id`             | `requests.update` – kategori/öncelik düzeltme (audit)                      |
| POST  | `/requests/:id/transitions` | `requests.update` / `requests.assign` – `{ to, reason? }`                  |
| GET   | `/requests/map?bbox=`       | `requests.read` – GeoJSON                                                  |

### Work Orders & Field (Phase 6)

| Metot          | Yol                                 | İzin                                                                                  |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| POST           | `/work-orders`                      | `workOrders.create` (talepten)                                                        |
| GET            | `/work-orders` · `/work-orders/:id` | `workOrders.read` / `workOrders.readAssigned`                                         |
| GET            | `/work-orders/mine`                 | `workOrders.readAssigned` – mobil görev listesi                                       |
| POST           | `/work-orders/:id/assign`           | `workOrders.assign` – `{ fieldTeamId?, assigneeId?, note? }`                          |
| POST           | `/work-orders/:id/transitions`      | `workOrders.execute` / `complete` / `verify` – `{ to, latitude?, longitude?, note? }` |
| POST           | `/work-orders/:id/media`            | `workOrders.execute` – `type=BEFORE                                                   | DURING | AFTER` |
| GET/POST/PATCH | `/field-teams`                      | `fieldTeams.read` / `fieldTeams.manage`                                               |

### Analytics / Reports / Notifications / Audit (Phase 8–13)

| Metot | Yol                                                                                 | İzin                            |
| ----- | ----------------------------------------------------------------------------------- | ------------------------------- |
| GET   | `/analytics/overview`                                                               | `analytics.read` – KPI kartları |
| GET   | `/analytics/trend` · `/analytics/categories` · `/analytics/departments`             | `analytics.read`                |
| GET   | `/analytics/neighborhoods` · `/analytics/neighborhoods/:id`                         | `analytics.read` – MahallePulse |
| GET   | `/analytics/anomalies`                                                              | `analytics.read`                |
| GET   | `/reports/:type.csv`                                                                | `reports.export`                |
| GET   | `/notifications` · PATCH `/notifications/:id/read` · POST `/notifications/read-all` | oturum                          |
| GET   | `/audit`                                                                            | `audit.read`                    |

## 5. Durum Geçişi Uç Noktaları

Durumlar alan güncellemesiyle (`PATCH { status }`) değil, **niyet bildiren geçiş** uç noktasıyla değişir:

```http
POST /api/v1/work-orders/{id}/transitions
{ "to": "ON_SITE", "latitude": 37.0585, "longitude": 37.3710 }
```

Sunucu: (1) izin, (2) kiracı, (3) durum makinesi, (4) iş kuralları (AFTER fotoğrafı, konum yakınlığı) kontrol eder; ardından tek transaction'da durumu, zaman damgasını, history'yi, gerekirse bağlı talebi ve audit log'u yazar. Geçersiz geçiş → `409 INVALID_STATUS_TRANSITION`, `details: { from, to, allowed: [...] }`.

## 6. Rate Limit

| Kapsam                                  | Limit                                                          |
| --------------------------------------- | -------------------------------------------------------------- |
| Global varsayılan                       | 120 istek / dk / IP                                            |
| `POST /auth/login`                      | 5 / dk / IP + e-posta; 10 başarısız denemede hesap 15 dk kilit |
| `POST /auth/register`, parola işlemleri | 3 / dk / IP                                                    |
| `POST /requests`                        | 10 / saat / kullanıcı                                          |
| Health                                  | muaf                                                           |

## 7. Versiyonlama

URL tabanlı (`/api/v1`). Geriye uyumsuz değişiklik `/api/v2` ile gelir; v1 en az bir sürüm boyunca `Deprecation` header'ı ile birlikte yaşar.

## 8. GeoJSON

Tüm geometriler **RFC 7946 GeoJSON**, koordinatlar **WGS84 (EPSG:4326)** ve `[boylam, enlem]` sırasındadır.

**Harita kaynağı – `GET /neighborhoods/geojson`.** Health uçları gibi zarf (`{ success, data }`) **içermez**; yanıt doğrudan MapLibre/Leaflet kaynağı olarak kullanılabilir (`Content-Type: application/geo+json`). Yalnız aktif ve sınırı olan mahalleler, 6 ondalık basamak (≈10 cm), properties'te yalnızca `id`, `name`, `code`. JSON PostgreSQL'de üretilip metin olarak iletilir (API parse/serialize etmez).

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "019…",
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": [
          [
            [
              [37.36, 37.05],
              [37.372, 37.05],
              [37.372, 37.062],
              [37.36, 37.062],
              [37.36, 37.05]
            ]
          ]
        ]
      },
      "properties": { "id": "019…", "name": "Karataş", "code": "KARATAS" }
    }
  ]
}
```

**İçe aktarma – `POST /neighborhoods/import`.** Gövde bir FeatureCollection'dır (en fazla 1000 Feature, 10 MB; diğer uçların gövde sınırı 100 kB). QGIS / ogr2ogr çıktısındaki `name`, `crs`, `bbox` üyeleri kabul edilir; `crs` verilmişse WGS84 (CRS84 / EPSG:4326) olmalıdır.

| Alan                                           | Zorunlu | Kural                                                                                                                                                     |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `properties.name`                              | ✔       | 2–120 karakter                                                                                                                                            |
| `properties.code`                              | ✔       | `^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$`, belediye içinde ve dosyada tekil                                                                                      |
| `properties.district`, `properties.population` | –       | metin ≤ 80 / negatif olmayan tam sayı                                                                                                                     |
| `geometry`                                     | ✔       | `Polygon` veya `MultiPolygon`; halkalar kapalı ve ≥ 4 nokta; koordinat aralığı; ≤ 100 000 köşe; **`ST_IsValid`** (kendi kendini kesen poligon reddedilir) |

- **Ya hepsi ya hiçbiri:** önce bütün Feature'lar doğrulanır, dosyadaki tüm hatalar tek yanıtta döner, yalnızca tamamen geçerli dosya tek transaction'da yazılır.
- **Alan çakışması:** Dosyadaki mahalleler birbirleriyle ve belediyedeki aktif mahallelerle **alan** olarak çakışamaz (yalnızca ortak sınır / köşe teması serbest; tolerans 1 m² – bkz. DATABASE_DESIGN §9). Hata öğesi `reason: "NEIGHBORHOOD_BOUNDARY_OVERLAP"` ve `conflict: { code, name, source: "database" | "file", overlapM2 }` taşır; geometri döndürülmez. Tüm hatalar çakışmaysa yanıt `409 NEIGHBORHOOD_BOUNDARY_OVERLAP`, başka hata da varsa `400 NEIGHBORHOOD_IMPORT_FAILED`.
- **Mükerrer kod politikası (MVP):** belediyede aynı kodla mahalle varsa hata; üzerine yazma / upsert yok.
- `?dryRun=true`: aynı doğrulama, kayıt yok → `{ imported: 0, failed: 0, dryRun: true, codes }`.
- Başarı: `200 { imported, failed: 0, dryRun: false, codes }`. Hata: `400 NEIGHBORHOOD_IMPORT_FAILED`, `details: { imported: 0, failed, errors: [{ index, code, message }] }`.

**Noktadan mahalle – `GET /neighborhoods/resolve`.** `ST_Covers` kullanılır, `ST_Contains` değil: `ST_Contains` sınır çizgisi üzerindeki noktayı "içeride" saymaz, dolayısıyla komşu mahallelerin ortak sınırındaki bir talep hiçbir mahalleye düşmezdi. `ST_Covers` ile sınırdaki nokta eşleşir; iki mahalle birden kapsıyorsa **alanı küçük olan**, sonra **kodu küçük olan** seçilir (deterministik). Sorgu GIST index'ini kullanır.

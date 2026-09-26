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

### Auth (Phase 3)

| Metot | Yol              | İzin                                |
| ----- | ---------------- | ----------------------------------- |
| POST  | `/auth/login`    | public · rate limit 5/dk/IP+e-posta |
| POST  | `/auth/refresh`  | refresh cookie · rotation           |
| POST  | `/auth/logout`   | oturum ailesini iptal eder          |
| GET   | `/auth/me`       | profil + roller + izinler           |
| POST  | `/auth/register` | vatandaş kaydı · rate limit         |

### Users / Roles (Phase 3)

| Metot | Yol                      | İzin                   |
| ----- | ------------------------ | ---------------------- |
| GET   | `/users`                 | `users.read`           |
| POST  | `/users`                 | `users.manage` (audit) |
| PATCH | `/users/:id`             | `users.manage` (audit) |
| PUT   | `/users/:id/roles`       | `roles.manage` (audit) |
| GET   | `/roles`, `/permissions` | `roles.manage`         |
| PUT   | `/roles/:id/permissions` | `roles.manage` (audit) |

### Organisation (Phase 4)

| Metot          | Yol                                         | İzin                                        |
| -------------- | ------------------------------------------- | ------------------------------------------- |
| GET            | `/municipalities/current`                   | public (marka bilgisi)                      |
| PATCH          | `/municipalities/current`                   | `settings.manage` (audit)                   |
| GET/POST/PATCH | `/departments`                              | okuma: oturum · yazma: `departments.manage` |
| GET            | `/neighborhoods` · `/neighborhoods/geojson` | oturum                                      |
| GET            | `/neighborhoods/lookup?lat=&lng=`           | oturum – noktadan mahalle                   |
| GET/POST/PATCH | `/request-categories` (ağaç)                | yazma: `categories.manage`                  |

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

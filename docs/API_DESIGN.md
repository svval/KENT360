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

| HTTP      | `code`                                                                                | Durum                                             |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 400       | `VALIDATION_FAILED`                                                                   | DTO doğrulaması; `details` alan mesajları listesi |
| 401       | `UNAUTHORIZED`                                                                        | Token yok / geçersiz / süresi dolmuş              |
| 403       | `FORBIDDEN`                                                                           | Yetki yok ya da başka belediyenin kaydı           |
| 404       | `NOT_FOUND`, `REQUEST_NOT_FOUND`, `WORK_ORDER_NOT_FOUND`, `NOTIFICATION_NOT_FOUND`    |                                                   |
| 409       | `CONFLICT`, `INVALID_STATUS_TRANSITION`, `WORK_ORDER_STALE`, `FIELD_LOCATION_TOO_FAR` | Domain kuralı ihlali, eşzamanlı değişiklik        |
| 413 / 415 | `PAYLOAD_TOO_LARGE`, `IMAGE_DIMENSIONS_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE`          | Dosya yükleme                                     |
| 429       | `RATE_LIMITED`                                                                        |                                                   |
| 503       | `SERVICE_UNAVAILABLE`                                                                 | Bağımlılık erişilemiyor                           |

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

| Metot | Yol             | Açıklama                                                                                                           | Durum |
| ----- | --------------- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| GET   | `/health`       | Liveness                                                                                                           | ✅    |
| GET   | `/health/ready` | PostgreSQL + PostGIS (yoksa 503) ve nesne depolama (yoksa `"status": "degraded"`, `checks.storage.status: "down"`) | ✅    |

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

### Requests (Phase 5) ✅

| Metot | Yol                                | İzin                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST  | `/requests`                        | `requests.create` (audit: `REQUEST_CREATED`) · 30/saat/IP. Gövde yalnızca `categoryId, description, latitude, longitude, address?` – diğer her alan (müdürlük, öncelik, SLA, mahalle, kaynak, durum, numara, başlık) **sunucuda** belirlenir; gönderilirse `400` |
| GET   | `/requests`                        | `requests.read` **veya** `requests.readOwn` – kapsama göre otomatik daraltılır (bkz. §9)                                                                                                                                                                         |
| GET   | `/requests/:id`                    | aynı – kapsam dışı / başka belediye → `404 REQUEST_NOT_FOUND`                                                                                                                                                                                                    |
| POST  | `/requests/:id/transitions`        | `requests.update` / `requests.assign` (geçişe göre) – `{ to, reason? }` (audit: `REQUEST_STATUS_CHANGED`)                                                                                                                                                        |
| PATCH | `/requests/:id/priority`           | `requests.update` – `{ priority, reason? }` (audit: `REQUEST_PRIORITY_CHANGED`)                                                                                                                                                                                  |
| PATCH | `/requests/:id/department`         | `requests.assign` – `{ departmentId, reason? }`, yalnız aktif müdürlük; SLA değişmez (audit: `REQUEST_DEPARTMENT_CHANGED`)                                                                                                                                       |
| POST  | `/requests/:id/media`              | `requests.create` (sahibi) veya `requests.update` – multipart `files` (audit: `REQUEST_MEDIA_ADDED`)                                                                                                                                                             |
| GET   | `/requests/:id/media/:mediaId/url` | talebi görebilen – yeni kısa ömürlü URL                                                                                                                                                                                                                          |

Genel `PATCH /requests/:id` **yoktur**: değişiklikler niyet bildiren uçlarla yapılır, `createdBy`, `municipalityId`, `publicNumber`, `createdAt` ve SLA snapshot'ı hiçbir uçtan değiştirilemez (DB trigger'ı da reddeder).

Liste parametreleri: `page`, `pageSize` (≤ 100), `sort` (`createdAt`, `slaDueAt`, `priority`, `publicNumber`, `status`; varsayılan `-createdAt`), `status` ve `priority` (çoklu: `?status=NEW&status=UNDER_REVIEW` ya da virgüllü), `categoryId` (ana kategori seçilirse alt kategorileri de), `departmentId`, `neighborhoodId`, `source`, `createdFrom`, `createdTo`, `slaStatus` (`ON_TIME | AT_RISK | BREACHED`), `search` (tam talep no, yoksa açıklama/adres – trigram index'li `ILIKE`), `mine=true`.

Detay yanıtı: kategori (+ ana kategori), müdürlük, mahalle, konum, `locationNotice` ("Konum tanımlı mahalle sınırları dışında." – mahalle bulunamadıysa), `sla: { dueAt, atRiskAt, status, remainingMinutes }`, `media[]` (5 dk'lık presigned `url`), `timeline[]` (vatandaşa personel adı gösterilmez), `reporter` (yalnız `users.read` sahibi personele) ve `actions` (kullanıcının yapabileceği geçişler / değişiklikler – sunucu aynı kuralları uygular).

Hata kodları: `CATEGORY_NOT_FOUND`, `CATEGORY_INACTIVE`, `CATEGORY_NOT_SELECTABLE` (alt kategorisi olan ana kategori), `CATEGORY_NOT_ROUTABLE`, `DEPARTMENT_INACTIVE`, `INVALID_STATUS_TRANSITION` (`details: { from, to, allowed }`), `TRANSITION_REASON_REQUIRED`, `REQUEST_CLOSED`, `MEDIA_LIMIT_REACHED`, `UNSUPPORTED_MEDIA_TYPE` (415; animasyonlu görüntü dahil), `PAYLOAD_TOO_LARGE` (413), `IMAGE_DIMENSIONS_TOO_LARGE` (413, `details: { index, width, height }`), `INVALID_IMAGE` (400, çözülemeyen/bozuk görüntü), `STORAGE_UNAVAILABLE` (503).

### AI ve mükerrer tespiti (Phase 11) ✅

| Metot | Yol                  | İzin                                                                                                                                                                                                          |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST  | `/requests/analyze`  | `requests.create` – `{ description, latitude?, longitude?, categoryId? }`; **hiçbir şey saklanmaz**. Yanıt: `{ provider, model, fallback, suggestion, possibleDuplicates[] }` (60/saat)                       |
| POST  | `/requests/:id/join` | `requests.create` – mevcut açık talebe katıl (audit: `REQUEST_JOINED`); bir kez (`409 ALREADY_JOINED`), kendi talebine değil (`409 CANNOT_JOIN_OWN_REQUEST`), sonuçlanmış talebe değil (`409 REQUEST_CLOSED`) |

- `suggestion`: `category` (+ ana kategori), `department`, `priority`, `confidence` (0–1), kısa `reasoning`, `summary`. **Öneridir**: talep oluşturulurken istemci yine yalnız kendi seçtiği kategoriyi gönderir.
- `possibleDuplicates[]` (en fazla 5): `requestId, publicNumber, categoryName, status, distanceMeters, ageMinutes, score, components{distance,category,text,time}, explanation ("55 m uzakta · aynı kategori · 3 saat önce · metin %88 benzer"), possibleDuplicate (score ≥ 0,60), supporterCount, canView`. Personel kendi talep kapsamındaki adayları görür; vatandaş belediye genelindeki adayları yalnız bu **kamuya açık alanlarla** görür (açıklama, adres, bildiren yok).
- Talep oluşturulunca aynı analiz **saklanır** (`ai_analyses`, `duplicate_matches`, audit `REQUEST_AI_ANALYZED`); talep detayında `ai` (yalnız personel), `supporterCount`, `joined`.
- Sağlayıcı: `AI_PROVIDER=mock` (varsayılan, anahtarsız, deterministik) veya `anthropic` (+ `AI_API_KEY`, `AI_MODEL` varsayılan `claude-opus-5`). Hata / zaman aşımı / reddetmede yanıt mock'tan gelir ve `fallback: true` olur.

### Work Orders & Field (Phase 6) ✅

| Metot | Yol                                     | İzin                                                                                                                                                                                                                              |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST  | `/work-orders`                          | `workOrders.create` – `{ requestId, instructions? }` (audit: `WORK_ORDER_CREATED`). Talep `ASSIGNED_TO_DEPARTMENT` olmalı; numara, müdürlük, öncelik, SLA ve konum talepten **sunucuda** kopyalanır; talep → `WORK_ORDER_CREATED` |
| GET   | `/work-orders`                          | `workOrders.read` **veya** `workOrders.readAssigned` – kapsama göre daraltılır (§10). Mobil "görevlerim" listesi de budur (ayrı `/mine` ucu yok)                                                                                  |
| GET   | `/work-orders/:id`                      | aynı – kapsam dışı / başka belediye → `404 WORK_ORDER_NOT_FOUND`                                                                                                                                                                  |
| POST  | `/work-orders/:id/assignment`           | `workOrders.assign` – `{ fieldTeamId?, assignedUserId?, note? }` (en az biri; audit: `WORK_ORDER_ASSIGNED` / `WORK_ORDER_REASSIGNED`); atanan kişiye uygulama içi bildirim                                                        |
| POST  | `/work-orders/:id/transitions`          | `workOrders.execute` / `complete` / `verify` / `create` (geçişe göre) – `{ to, from?, reason?, completionDescription?, latitude?, longitude? }`                                                                                   |
| POST  | `/work-orders/:id/media`                | `workOrders.execute` + işi yürüten kişi – multipart `type=BEFORE\|DURING\|AFTER` + `files` (audit: `WORK_ORDER_MEDIA_ADDED`)                                                                                                      |
| GET   | `/work-orders/:id/media/:mediaId/url`   | iş emrini görebilen – yeni kısa ömürlü URL                                                                                                                                                                                        |
| GET   | `/field-teams` · `/field-teams/:id`     | `fieldTeams.read` – yönetici: tümü · personel: kendi müdürlüğü. Liste: üye / açık iş / tamamlanan iş sayıları (tek gruplu sorgu); detay: üyeler                                                                                   |
| POST  | `/field-teams`                          | `fieldTeams.manage` – `{ departmentId, name, code }` (yalnız kendi müdürlüğü; audit: `FIELD_TEAM_CREATED`)                                                                                                                        |
| PATCH | `/field-teams/:id`                      | `fieldTeams.manage` – `{ name?, status? }`; kod ve müdürlük değişmez; açık işi olan ekip pasifleştirilemez → `409 FIELD_TEAM_HAS_ACTIVE_WORK` (audit: `FIELD_TEAM_UPDATED`)                                                       |
| PUT   | `/field-teams/:id/members`              | `fieldTeams.manage` – `{ members: [{ userId, role: LEADER\|MEMBER }] }` (tam liste; en fazla bir LEADER; audit: `FIELD_TEAM_MEMBERS_CHANGED`)                                                                                     |
| GET   | `/field-teams/candidates?departmentId=` | `fieldTeams.manage` – müdürlüğün ekiplere eklenebilecek aktif saha personeli                                                                                                                                                      |

Genel `PATCH /work-orders/:id` **yoktur**. Liste parametreleri: `page`, `pageSize`, `sort` (`createdAt`, `slaDueAt`, `priority`, `publicNumber`, `status`; varsayılan `-createdAt`), `status` / `priority` (çoklu), `departmentId`, `fieldTeamId`, `assignedUserId`, `neighborhoodId`, `createdFrom`, `createdTo`, `search` (tam `WO-…` veya `KNT-…` numarası; yoksa numara parçası, talep açıklaması, adres).

Detay yanıtı: kaynak talep (no, durum, açıklama, fotoğraflar – bildiren kişi bilgisi **yok**), kategori, mahalle, müdürlük, ekip, personel, konum (snapshot), SLA (kaynak talebin snapshot'ı; iş tamamlanınca durur), `media[]` (`type` ile, presigned URL), `assignments[]` (atama geçmişi), `timeline[]` (iç süreç, personel adlarıyla), `completionDescription`, `cancellationReason`, önemli tarihler, `actions` (`transitions[]` – `requiresReason / requiresLocation / requiresCompletion` ile, `canAssign`, `canUploadMedia[]`) ve `proximity: { radiusMeters, bypass }`.

Hata kodları: `WORK_ORDER_NOT_FOUND` (404), `WORK_ORDER_ALREADY_EXISTS` (409 – talebin aktif iş emri var), `REQUEST_NOT_READY_FOR_WORK_ORDER` (409), `REQUEST_HAS_ACTIVE_WORK_ORDER` (409 – aktif iş emri varken talep yeniden yönlendirilemez), `INVALID_STATUS_TRANSITION` (409, `details: { from, to, allowed }`), `WORK_ORDER_STALE` (409 – eşzamanlı değişiklik veya `from` uyuşmazlığı), `WORK_ORDER_NOT_ASSIGNABLE` (409), `NOT_WORK_ORDER_EXECUTOR` (403), `TRANSITION_REASON_REQUIRED` (400), `COMPLETION_DESCRIPTION_REQUIRED` (400), `AFTER_PHOTO_REQUIRED` (409), `FIELD_LOCATION_REQUIRED` (400), `FIELD_LOCATION_TOO_FAR` (409, `details: { distanceMeters, radiusMeters }`), `MEDIA_TYPE_NOT_ALLOWED` (409), `MEDIA_LIMIT_REACHED` (409, tür başına 5), `ASSIGNEE_INVALID` (409), `FIELD_TEAM_NOT_FOUND` (404), `FIELD_TEAM_INACTIVE` (409), `FIELD_TEAM_CODE_TAKEN` (409), `FIELD_TEAM_MEMBER_INVALID` (400), `FIELD_TEAM_HAS_ACTIVE_WORK` (409); medya hataları talep fotoğraflarıyla aynıdır.

### Dashboard, Map, Search (Phase 8–9) ✅

| Metot | Yol                   | İzin                                                                                                                                                                                                                                    |
| ----- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/dashboard/overview` | `requests.read` – KPI'lar, 30 günlük trend, kritik ve son talepler (vatandaş ve saha personeli → 403)                                                                                                                                   |
| GET   | `/map/requests`       | `requests.read` – **zarfsız** GeoJSON `FeatureCollection` (Point); `bbox=batı,güney,doğu,kuzey`, `status`, `priority` (çoklu), `departmentId`, `categoryId` (ana kategori alt kategorileriyle), `createdFrom`, `createdTo`, `open=true` |
| GET   | `/map/work-orders`    | `workOrders.read` **veya** `workOrders.readAssigned` – zarfsız GeoJSON; `bbox`, `status`, `priority`, `departmentId`, `open=true`                                                                                                       |
| GET   | `/search?q=`          | talep veya iş emri okuma izni – en az 2 karakter; tür başına 5 sonuç: `[{ type: REQUEST\|WORK_ORDER, id, publicNumber, title, subtitle, status }]`                                                                                      |

- **Kapsam:** hepsi liste uçlarıyla aynı nesne kapsamını kullanır (§9, §10): yönetici belediyenin tümü, müdürlük yöneticisi kendi müdürlüğü, saha personeli iş emri haritasında yalnız kendi/ekibinin işleri. Filtreler kapsamı genişletemez; başka belediye hiç görünmez.
- **Dashboard KPI'ları** (belediyenin saat dilimine göre): `todayRequests` (yerel gece yarısından beri; `previous`: dün), `openRequests` (RESOLVED / VERIFIED / CLOSED / REJECTED dışı), `criticalRequests` (açık + CRITICAL), `openWorkOrders` (CREATED … WAITING), `avgResolutionMinutes` ve `slaCompliancePercent` (son 30 günde çözülenler; `previous`: önceki 30 gün). `trend`: son 30 yerel gün, `{ date, created, resolved }`. `criticalRequests`: açık talepler – önce CRITICAL, sonra SLA aşılmış, sonra SLA riskte (`reason` ile), en fazla 8.
- **Harita özellikleri yalındır:** talep → `id, publicNumber, status, priority, category, department, neighborhood, slaStatus, critical, done, createdAt`; iş emri → `id, publicNumber, status, priority, department, team, assignedUser, requestId, requestNumber`. Açıklama, adres, bildiren gibi alanlar taşınmaz. En fazla 5000 nesne (en yeniler); fazlası varsa `"truncated": true` (yabancı üye).
- Geçersiz `bbox` → `400`.

### MahallePulse (Phase 10) ✅

| Metot | Yol                            | İzin                                                                                                                            |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| GET   | `/analytics/neighborhoods`     | `analytics.read` + `requests.read` – aktif mahalleler, risk skoruna göre azalan                                                 |
| GET   | `/analytics/neighborhoods/:id` | aynı – `+ center, categories[], trend[90 gün], openRequests[10], activeWorkOrders[10], anomalies[]`; başka belediye / yok → 404 |
| GET   | `/analytics/anomalies`         | aynı – kural tabanlı artışlar, güçlüden zayıfa                                                                                  |

Mahalle başına: `total, open, resolved, critical` (açık + CRITICAL), `openWorkOrders, slaBreachPercent` (son 90 gün, SLA takipli taleplerde), `avgResolutionMinutes` (son 90 gün), `topCategory, last7, last30, previous30, changePercent, riskScore` (0–100), `riskLevel` (`LOW < 25 ≤ MEDIUM < 50 ≤ HIGH < 75 ≤ CRITICAL`), `riskFactors[]` (`key, label, value 0–1, points, detail`). Kapsam: yönetici belediye, müdürlük yöneticisi kendi müdürlüğü; vatandaş ve saha personeli 403. Isı haritası ayrı uç gerektirmez: `/map/requests` (bbox) verisini kullanır; choropleth bu listedeki `riskScore` değerleridir.

### Bildirimler (Phase 13) ✅

| Metot | Yol                       | İzin / kural                                                                                                  |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET   | `/notifications`          | oturum – yalnız kendi bildirimleri, yeniden eskiye; `?page&pageSize&unread=true`; `meta.unreadCount`          |
| PATCH | `/notifications/:id/read` | kendi bildirimi; başkasının / başka belediyenin / yok → `404 NOTIFICATION_NOT_FOUND`; tekrar çağrı idempotent |
| POST  | `/notifications/read-all` | kendi okunmamışlarının hepsi → `{ updated }`                                                                  |

Öğe: `id, type, title, message, createdAt, readAt, entityType ('Request' | 'WorkOrder' | null), entityId`. Vatandaş (iç okuma yetkisi olmayan kullanıcı) yalnız `REQUEST_UPDATED`, `REQUEST_VERIFIED`, `SYSTEM` türlerini görür. Gerçek zamanlı kanal yok; web 60 sn'de bir sorgular.

### Raporlar (Phase 13) ✅

| Metot | Yol                   | İzin                                                                                            |
| ----- | --------------------- | ----------------------------------------------------------------------------------------------- |
| GET   | `/reports/summary`    | `reports.export` + `requests.read` – özet + müdürlük ve mahalle performans satırları            |
| GET   | `/reports/{type}.csv` | aynı – `requests`, `work-orders`, `sla`, `departments`, `neighborhoods`; bilinmeyen dosya → 404 |

Filtreler (hepsi opsiyonel): `dateFrom`, `dateTo` (yerel gün `YYYY-MM-DD`, dahil; varsayılan son 30 gün, en fazla 2 yıl, ters aralık → `400 INVALID_DATE_RANGE`), `departmentId`, `categoryId` (ana kategori alt kategorileri kapsar), `status`, `priority`, `neighborhoodId`. Kapsam: yönetici belediye, müdürlük yöneticisi kendi müdürlüğü (filtreyle genişletilemez); vatandaş ve saha personeli 403.
CSV: UTF-8 BOM, `;` ayraç, ondalık virgül, CRLF; `= + - @` (ve sekme / CR) ile başlayan metin hücreleri `'` ile etkisizleştirilir; `Content-Disposition: attachment; filename="kent360-talep-raporu-2026-10-04.csv"` (CORS'ta `Content-Disposition` açılır); satır sınırı 10 000; açıklama ve bildiren dışa aktarılmaz.

### Audit (Phase 13) ✅

| Metot | Yol      | İzin                                                                                                              |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| GET   | `/audit` | `audit.read` – kendi belediyesi, yeniden eskiye; `?user&action&entityType&entityId&dateFrom&dateTo&page&pageSize` |

Öğe: `id, createdAt, action, entityType, entityId, actor { id, name, email } | null, ipAddress, changes[{ field, before, after }]`. `changes` yalnız değişen alanların düzleştirilmiş, okunabilir listesidir; parola / token / çerez / başlık / gövde / prompt / tarayıcı / oturum kimliği alanları hiç dönmez, ham JSON dönmez.

## 5. Durum Geçişi Uç Noktaları

Durumlar alan güncellemesiyle (`PATCH { status }`) değil, **niyet bildiren geçiş** uç noktasıyla değişir:

```http
POST /api/v1/work-orders/{id}/transitions
{ "to": "ON_SITE", "latitude": 37.0585, "longitude": 37.3710 }
```

Sunucu: (1) izin, (2) kiracı ve nesne kapsamı, (3) işi yürüten kişi mi (saha adımları), (4) durum makinesi, (5) iş kuralları (gerekçe, konum yakınlığı, tamamlama açıklaması, AFTER fotoğrafı) kontrol eder; ardından tek transaction'da durumu, zaman damgasını, iş emri geçmişini, audit log'u ve – senkron kuralı gerektiriyorsa – bağlı talebi (durum + vatandaşa dönük zaman çizelgesi + audit) yazar. Durum güncellemesi iyimser eşzamanlılıkla yapılır (`WHERE status = <okunan>`); iki eşzamanlı istekten biri `409` alır. İstemci gördüğü durumu `from` ile gönderebilir; farklıysa `409 WORK_ORDER_STALE`. Geçersiz geçiş → `409 INVALID_STATUS_TRANSITION`, `details: { from, to, allowed: [...] }`.

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

## 9. Talep Erişim Kapsamı (object scope)

RBAC izni tek başına yetmez; her talep sorgusu kullanıcının kapsamıyla daraltılır ve kapsam dışı talep **404** döner (varlığı sızdırılmaz):

| Kullanıcı                                                           | Görebildiği talepler                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| System Admin (`requests.read`, müdürlük kısıtı yok)                 | belediyenin tüm talepleri                                            |
| Diğer personel (`requests.read`)                                    | kendi müdürlüğüne yönlendirilmiş talepler (müdürlüğü yoksa: hiçbiri) |
| Talep oluşturabilen herkes (`requests.create` / `requests.readOwn`) | kendi bildirdiği talepler                                            |

Kurallar toplanır (bir müdür kendi müdürlüğünü ve kendi bildirdiklerini görür). Filtre parametreleri kapsamın **içinde** uygulanır; `?departmentId=…` ile kapsam genişletilemez. Medya uçları aynı kontrolü tekrar uygular.

## 10. İş Emri Erişim Kapsamı (Phase 6)

| Kullanıcı                                                  | Görebildiği iş emirleri                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| System Admin (`workOrders.read`, müdürlük kısıtı yok)      | belediyenin tüm iş emirleri                                 |
| Müdürlük yöneticisi (`workOrders.read`)                    | kendi müdürlüğünün iş emirleri                              |
| Ekip sorumlusu, saha personeli (`workOrders.readAssigned`) | kendisine atananlar + aktif üyesi olduğu ekiplere atananlar |

Filtreler kapsamın içinde uygulanır (`?assignedUserId=<başkası>` kapsamı genişletmez, boş liste döner); kapsam dışı iş emri, fotoğrafı ve fotoğraf URL'si `404`. Yazma kuralları ayrıca:

- **Saha adımları** (kabul, yola çıkma, sahaya varış, başlama, bekleme, devam, tamamlama, fotoğraf) yalnız **işi yürütene** açıktır: atanan kişi; kişi atanmamışsa ekibin aktif üyeleri; ekibin sorumlusu. Aynı ekipteki başka bir üye `403 NOT_WORK_ORDER_EXECUTOR`.
- **Atama:** `workOrders.assign`; ekip sorumlusu (`workOrders.read` olmadan) yalnız sorumlusu olduğu ekiplerin işini yine o ekiplere atar. Hedef ekip aktif ve iş emrinin müdürlüğünde; hedef kişi aynı belediyede, aktif, saha yetkili (`workOrders.execute`) ve ekibin aktif üyesi (ekipsiz atamada aynı müdürlükten) olmalı.
- **Doğrulama / geri gönderme** `workOrders.verify`, **iptal** `workOrders.create` (müdürlük yöneticisi, yönetici).

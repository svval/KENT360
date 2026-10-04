# KENT360 – Mimari

## 1. Mimari Karar: Modular Monolith

KENT360 ilk sürümde **tek deploy edilen, içeride domain modüllerine ayrılmış bir NestJS uygulamasıdır**.

| Kriter           | Modular Monolith                               | Microservices                          |
| ---------------- | ---------------------------------------------- | -------------------------------------- |
| Deployment       | Tek artefakt, tek pipeline                     | N servis, service mesh, versiyon uyumu |
| Transaction      | Talep + iş emri + history tek DB transaction'ı | Saga / outbox gerekir                  |
| Debug            | Tek süreç, tek log akışı                       | Dağıtık tracing zorunlu                |
| Takım            | 1–8 geliştirici için ideal                     | Servis başına takım gerektirir         |
| Domain sınırları | Modül sınırları + bağımlılık kuralları         | Ağ sınırı                              |

Bir belediyenin yükü (günde yüzlerce–birkaç bin talep) tek bir iyi indekslenmiş PostgreSQL ve yatay çoğaltılabilen stateless API ile rahatça karşılanır. Modül sınırları korunduğu için, gerçekten ihtiyaç doğarsa bir modül (ör. `AIModule`, `NotificationsModule`) ayrı servise çıkarılabilir.

## 2. Sistem Görünümü

```
                ┌──────────────────────────┐        ┌─────────────────────────┐
                │  apps/web  (Next.js 16)  │        │ apps/mobile (Expo / RN) │
                │  Yönetim konsolu +       │        │  Saha360 – saha personeli│
                │  vatandaş portalı        │        │                          │
                └────────────┬─────────────┘        └────────────┬────────────┘
                             │  HTTPS  /api/v1  (JSON, JWT)       │
                             └───────────────┬────────────────────┘
                                             ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ apps/api  – NestJS 11 modular monolith                                         │
│                                                                                │
│  HTTP pipeline: helmet → CORS → rate limit → JWT guard → permission guard      │
│                 → ValidationPipe → controller → service → Prisma               │
│                                                                                │
│  Auth · Users · Roles · Permissions · Municipalities · Departments             │
│  Neighborhoods · GIS · RequestCategories · Requests · FieldTeams · WorkOrders  │
│  Files · Notifications · AI · Analytics · Reports · Audit · System(Health)     │
└──────────┬──────────────────────────┬──────────────────────────┬──────────────┘
           ▼                          ▼                          ▼
 ┌───────────────────┐     ┌────────────────────┐     ┌────────────────────────┐
 │ PostgreSQL 17     │     │ Redis 8            │     │ MinIO (S3 API)         │
 │ + PostGIS 3.5     │     │ cache, rate limit, │     │ fotoğraf / kanıt       │
 │ + pg_trgm         │     │ job kuyruğu        │     │ presigned URL          │
 └───────────────────┘     └────────────────────┘     └────────────────────────┘
```

## 3. Monorepo Yapısı

```
kent360/
├── apps/
│   ├── api/                 NestJS API (Prisma şeması ve migration'lar burada)
│   ├── web/                 Next.js App Router – yönetim konsolu ve vatandaş portalı
│   └── mobile/              Saha360 (Phase 12'de workspace'e eklenir)
├── packages/
│   ├── shared-types/        Domain enum'ları, izin kataloğu, API sözleşme tipleri
│   └── config/              Ortak tsconfig ve ESLint flat config
├── infrastructure/          Postgres init SQL, MinIO bucket script'i
├── docs/                    Bu belgeler
└── docker-compose.yml       Geliştirme altyapısı
```

**Araç seçimi:** npm workspaces yeterlidir. Turborepo, build süresi gerçek bir sorun olduğunda (ör. CI'da uzak cache ihtiyacı) eklenecektir; şu an 2 uygulama + 2 paket için ek karmaşıklık getirir.

**`packages/ui` neden henüz yok?** Web'in bileşenleri (`apps/web/src/components/ui`) shadcn yaklaşımıyla uygulamanın içindedir. React Native, DOM bileşenlerini paylaşamaz; ortak UI paketi ancak ikinci bir web uygulaması (ör. ayrı vatandaş portalı) doğduğunda anlamlı olur.

**`shared-types` neden derleniyor?** NestJS CommonJS çıktısı üretir ve node_modules içindeki `.ts` dosyalarını derlemez. Paket `tsc` ile CJS + `.d.ts` olarak derlenir (`npm install` sonrası otomatik); Next.js aynı çıktıyı `transpilePackages` ile kullanır.

## 4. Backend Katmanları

```
Controller   HTTP: route, DTO doğrulama, Swagger, yetki dekoratörleri. İş mantığı içermez.
   ↓
Service      Domain kuralları: durum geçişleri, SLA, atama, audit/history yazımı.
   ↓
Policy/      Saf fonksiyonlar – durum makineleri, SLA hesabı, duplicate skoru.
Domain       Veritabanından bağımsız, birim testle %100 kapsanır.
   ↓
Prisma       Veri erişimi. Spatial sorgular için tipli `$queryRaw` (parametreli, asla string birleştirme).
```

Modül iç yapısı (örnek):

```
modules/requests/
├── requests.module.ts
├── requests.controller.ts
├── requests.service.ts
├── domain/
│   ├── request-status.machine.ts      (+ .spec.ts)
│   └── sla.policy.ts                  (+ .spec.ts)
└── dto/
    ├── create-request.dto.ts
    └── list-requests.query.ts
```

## 5. Çapraz Kesen Altyapı (Phase 1–2'de kuruldu)

| Konu           | Uygulama                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Config         | `@nestjs/config` + Zod şeması (`src/config/env.validation.ts`); geçersiz config ile süreç başlamaz, production'da örnek JWT secret reddedilir |
| Hata formatı   | `AllExceptionsFilter` → `{ success:false, code, message, details, timestamp, path, requestId }`                                               |
| Başarı formatı | `ResponseEnvelopeInterceptor` → `{ success:true, data, meta? }`; health endpoint'leri `@RawResponse()` ile muaf                               |
| Doğrulama      | Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)                                                                    |
| Loglama        | `nestjs-pino` – JSON structured log, `x-request-id` korelasyonu, `authorization`/`cookie`/parola/token alanları redakte                       |
| Güvenlik       | Helmet, CORS whitelist, global rate limit (Throttler)                                                                                         |
| Health         | `GET /health` (liveness), `GET /health/ready` (PostgreSQL + PostGIS → 503; nesne depolama → `degraded`)                                       |
| API dokümanı   | Swagger UI `/api/docs`, OpenAPI JSON `/api/docs/openapi.json`                                                                                 |

## 6. Domain İş Akışları

### 6.1 Talep Durum Makinesi

```
NEW ──► AI_ANALYZED ──► UNDER_REVIEW ──► ASSIGNED_TO_DEPARTMENT ──► WORK_ORDER_CREATED ──► IN_PROGRESS ──► RESOLVED ──► VERIFIED ──► CLOSED
 │           │               │                  │   ▲                       │                               │
 │           │               │                  │   └──── (iş emri iptal) ──┘                               │
 └───────────┴───────────────┴──────────────────┴──► REJECTED                     (doğrulama reddi) ◄──────┘→ IN_PROGRESS
```

| Kaynak                 | İzin verilen hedefler                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| NEW                    | AI_ANALYZED, UNDER_REVIEW, REJECTED                                   |
| AI_ANALYZED            | UNDER_REVIEW, ASSIGNED_TO_DEPARTMENT, REJECTED                        |
| UNDER_REVIEW           | ASSIGNED_TO_DEPARTMENT, REJECTED                                      |
| ASSIGNED_TO_DEPARTMENT | WORK_ORDER_CREATED, UNDER_REVIEW (yeniden yönlendirme), REJECTED      |
| WORK_ORDER_CREATED     | IN_PROGRESS, ASSIGNED_TO_DEPARTMENT (tüm iş emirleri iptal edildiyse) |
| IN_PROGRESS            | RESOLVED                                                              |
| RESOLVED               | VERIFIED, IN_PROGRESS (çözüm kabul edilmedi)                          |
| VERIFIED               | CLOSED (elle, `requests.update` – Phase 6)                            |
| CLOSED, REJECTED       | — (terminal)                                                          |

`NEW → CLOSED` gibi kısa devre geçişler reddedilir (`INVALID_STATUS_TRANSITION`). Her geçiş `request_history`'ye, kritik geçişler ayrıca `audit_logs`'a yazılır.

### 6.2 İş Emri Durum Makinesi

Tek doğruluk kaynağı: `apps/api/src/modules/work-orders/domain/work-order-status.machine.ts` (birim testli).

| Kaynak              | Hedefler              | Kim / kural                                                                               |
| ------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| CREATED             | ASSIGNED, CANCELLED   | ASSIGNED yalnız atama ucuyla; iptal yönetici (`workOrders.create`), gerekçe zorunlu       |
| ASSIGNED            | ACCEPTED, CANCELLED   | kabul: işi yürüten (atanan kişi / ekip / ekip sorumlusu)                                  |
| ACCEPTED            | EN_ROUTE, CANCELLED   |                                                                                           |
| EN_ROUTE            | ON_SITE               | **konum doğrulama** (§6.4)                                                                |
| ON_SITE             | IN_PROGRESS           | **konum doğrulama**; `startedAt` ilk başlamada yazılır                                    |
| IN_PROGRESS         | WAITING, COMPLETED    | bekleme gerekçeli; COMPLETED için `completionDescription` + en az bir **AFTER** fotoğrafı |
| WAITING             | IN_PROGRESS           | devam: **konum doğrulama**                                                                |
| COMPLETED           | VERIFIED, IN_PROGRESS | doğrulama veya gerekçeli geri gönderme (`workOrders.verify`)                              |
| VERIFIED, CANCELLED | —                     | terminal (DB trigger da reddeder)                                                         |

**Atama / yeniden atama:** `CREATED → ASSIGNED`; `ASSIGNED` aynı kalır; `ACCEPTED` iken başka kişiye atanırsa `ASSIGNED`'a döner (yeni kişi kabul eder); `WAITING` korunur (yeni kişi sahada devam ettirir). `EN_ROUTE / ON_SITE / IN_PROGRESS` iken yeniden atama yoktur – iş önce beklemeye alınır; böylece sahadaki konum kanıtı işi yapan kişiye aittir. Her atama yeni bir `work_order_assignments` satırıdır, önceki satır `unassigned_at` ile kapanır.

**Talep ↔ iş emri senkronu** (tek yön: iş emri talebi ilerletir; `requests/domain/work-order-sync.ts`, `RequestWorkOrderSync`): bir talebin aynı anda en fazla **bir** aktif iş emri olur (kısmi unique index), bu yüzden "tüm iş emirleri" kuralı tek iş emrine indirgenir.

| İş emri adımı                  | Talep                                            | Vatandaşın gördüğü                                  |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| oluşturuldu                    | ASSIGNED_TO_DEPARTMENT → WORK_ORDER_CREATED      | "Talebiniz için saha iş emri oluşturuldu."          |
| işe başlandı / devam (ilk kez) | WORK_ORDER_CREATED → IN_PROGRESS                 | "Saha ekibi çalışmaya başladı."                     |
| tamamlandı                     | IN_PROGRESS → RESOLVED (`resolvedAt`, SLA durur) | "Saha çalışması tamamlandı, sorun giderildi."       |
| doğrulandı                     | RESOLVED → VERIFIED                              | "Çözüm belediye tarafından doğrulandı."             |
| geri gönderildi                | RESOLVED → IN_PROGRESS (`resolvedAt` temizlenir) | "Çözüm yeniden ele alındı, saha çalışması sürüyor." |
| iptal edildi                   | WORK_ORDER_CREATED → ASSIGNED_TO_DEPARTMENT      | "İş emri iptal edildi; …yeniden planlanacak."       |

`VERIFIED → CLOSED` ayrı ve elle yapılan bir talep adımıdır (müdürlük talebi kapatır). Senkron, iş emri değişikliğinin **aynı transaction'ında** çalışır: talep satırı kilitlenir, durum iyimser eşzamanlılıkla güncellenir, talep zaman çizelgesi ve audit yazılır; herhangi biri başarısız olursa iş emri değişikliği de geri alınır. Aktif iş emri varken talep başka müdürlüğe yönlendirilemez (`409 REQUEST_HAS_ACTIVE_WORK_ORDER`).

### 6.3 SLA

- `slaDueAt = createdAt + category.defaultSlaMinutes` (alt kategoride tanımlı değilse üst kategoriden miras).
- Öncelik `CRITICAL`'e yükseltilirse SLA en fazla belediye ayarındaki kritik üst sınıra (varsayılan 4 saat) çekilir; hiçbir zaman uzatılmaz.
- SLA durumu **hesaplanır, saklanmaz**:
  - `BREACHED` – çözülmemiş ve `now > slaDueAt`, ya da `resolvedAt > slaDueAt`
  - `AT_RISK` – kalan süre toplam sürenin `%25`'inden az (`settings.slaAtRiskRatio`)
  - `ON_TIME` – diğer durumlar
- Öncelik sıralaması: `CRITICAL > HIGH > NORMAL > LOW`, eşitlikte `slaDueAt` en yakın olan önce.

### 6.4 Konum Doğrulama (saha yakınlığı)

`ON_SITE`, `ON_SITE → IN_PROGRESS` ve `WAITING → IN_PROGRESS` adımlarında cihaz konumu (`latitude, longitude`) **zorunludur** (`400 FIELD_LOCATION_REQUIRED`). Uzaklık PostGIS ile iş emrinin **snapshot** noktasına ölçülür (`ST_DistanceSphere`, `municipality_id` filtresiyle); eşik belediye ayarı `settings.onSiteRadiusMeters` (10–5000 m, varsayılan 150 m). Eşik aşılırsa geçiş `409 FIELD_LOCATION_TOO_FAR` ile reddedilir ("İş emri konumuna henüz yeterince yakın değilsiniz (… m; en fazla … m).") ve deneme ayrı bir transaction'da `LOCATION_CHECK_FAILED` olayı + `WORK_ORDER_LOCATION_REJECTED` audit kaydıyla saklanır. Başarılı adımda ölçülen mesafe ve cihaz konumu iş emri geçmişine yazılır.

Geliştirme/demo için `FIELD_LOCATION_BYPASS=true` konum olmadan veya uzaktan geçişe izin verir; bu **gizli değildir** (geçmişe "Konum kontrolü geliştirme modunda atlandı" yazılır, detayda `proximity.bypass` döner) ve env doğrulaması **production'da reddeder**. Web istemcisi her adımda taze konum ister (`maximumAge: 0`). Saha360 (Phase 12) aynı ucu kullanır.

## 7. Mükerrer Talep Tespiti (MVP algoritması)

Aday kümesi PostGIS ile daraltılır, ardından açıklanabilir bir skor hesaplanır:

```sql
-- Adaylar: 150 m içinde, son 30 gün, kapanmamış/reddedilmemiş talepler (GIST index)
WHERE ST_DWithin(r.location::geography, :point::geography, 150)
  AND r.created_at > now() - interval '30 days'
  AND r.status NOT IN ('CLOSED','REJECTED')
```

| Bileşen         | Formül                                                   | Ağırlık |
| --------------- | -------------------------------------------------------- | ------- |
| `distanceScore` | `max(0, 1 − d / 150m)`                                   | 0.35    |
| `categoryScore` | aynı alt kategori 1.0 · aynı üst kategori 0.6 · farklı 0 | 0.25    |
| `textScore`     | `pg_trgm similarity(description, :text)` (GIN index)     | 0.25    |
| `timeScore`     | `max(0, 1 − saat / 168)`                                 | 0.15    |

**Uygulama (Phase 11 ✅):** `modules/ai/duplicate.service.ts` – aday sorgusu GIST index'ini kullanmak için önce geometri üzerinde `ST_DWithin(location, nokta, 0.0025°)`, ardından kesin `ST_DistanceSphere ≤ 150 m`; `municipality_id` filtresi, personelde talep kapsamı. Skor saf fonksiyon `domain/duplicate-score.ts` (birim testli); 0,35 altı gösterilmez. Hiçbir zaman otomatik birleştirme yapılmaz – vatandaş isterse `POST /requests/:id/join` ile mevcut talebe katılır.

`duplicateScore ≥ 0.60` → "Muhtemel benzer kayıt bulundu." Örnek: 55 m, aynı kategori, %88 metin benzerliği, 3 saat önce → `0.35·0.63 + 0.25·1 + 0.25·0.88 + 0.15·0.98 ≈ 0.84`. Tüm bileşenler `duplicate_matches` tablosunda saklanır; ileride `textScore` embedding benzerliği ile değiştirilebilir (arayüz aynı kalır).

## 8. Yapay Zekâ Mimarisi

```ts
interface AIProvider {
  readonly name: string;
  analyzeRequest(input: RequestAnalysisInput): Promise<RequestAnalysis>; // kategori, müdürlük, öncelik, risk, özet, güven
  classifyText(text: string): Promise<Classification>;
  suggestDepartment(categoryCode: string): Promise<string | null>;
  suggestPriority(
    input: RequestAnalysisInput,
  ): Promise<{ priority: Priority; riskLevel: RiskLevel }>;
  summarizeRequest(text: string): Promise<string>;
  analyzeImage(image: ImageRef): Promise<ImageSignals>;
}
```

- **Uygulanan arayüz (Phase 11 ✅, `modules/ai/ai-provider.ts`):** `analyzeRequest`, `suggestCategory`, `suggestPriority`, `summarize`. Görüntü analizi henüz yok.
- `AI_PROVIDER=mock` → **MockAiProvider**: kategori `keywords` alanı üzerinden kural tabanlı, deterministik ve açıklanabilir sonuç (API anahtarı gerekmez); "okul / çocuk / tehlike" gibi ifadeler önceliği yükseltir, "yaralan / kaza / gaz kaçağı" kritik yapar. Güven 0,2 (eşleşme yok) … 0,95.
- `AI_PROVIDER=anthropic` + `AI_API_KEY` → **AnthropicAiProvider**: resmi `@anthropic-ai/sdk`, model `AI_MODEL` (varsayılan `claude-opus-5`), tek kısa çağrı, yapılandırılmış JSON çıktı (`output_config.format`), düşük effort, sunucu tarafı reddetme yedeği (`fallbacks: "default"`). Anahtar yoksa, hata / zaman aşımı (`AI_TIMEOUT_MS`) / reddetme olursa `AiService` mock ile yanıtlar ve `fallback: true` döner – AI hiçbir zaman talep oluşturmayı bozmaz.
- Sağlayıcıya yalnızca **maskelenmiş açıklama** ve kategori listesi gönderilir (`maskPersonalData`: e-posta, telefon, kimlik no, IBAN); ad, iletişim, konum **gönderilmez**. Saklanan analizde açıklama yoktur: kodlar, eşleşen kelimeler, maskelenmiş tek cümlelik özet ve kısa gerekçe.
- Öneri `ai_analyses` tablosuna yazılır; insan kararından sonra `accepted` alanı doldurulur → sınıflandırıcı isabet oranı ölçülebilir.

## 9. Dosya Depolama

- Uygulama yalnızca **S3 protokolü** ile konuşur (`@aws-sdk/client-s3`); MinIO ↔ AWS S3 ↔ diğer S3 uyumlu servisler arasında geçiş env değişikliğidir.
- Object key sunucuda üretilir: `municipalities/{municipalityId}/requests/{requestId}/{uuid}.{ext}` ve `municipalities/{municipalityId}/work-orders/{workOrderId}/{before|during|after}/{uuid}.{ext}`. İstemci dosya adı asla kullanılmaz.
- Tek yükleme hattı: `ImageUploadService` (imza → normalizeImage → private bucket → DB transaction, hata olursa nesneler silinir); talep ve iş emri fotoğrafları aynı hattan geçer.
- Bucket private'tır; istemciye kısa ömürlü presigned URL verilir.

## 10. Teknoloji ve Sürüm Kararları

| Bileşen              | Sürüm                             | Karar notu                                                                                                                                                                                                           |
| -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js              | 22 LTS (24 LTS ile de doğrulandı) | `engines: >=22.12`                                                                                                                                                                                                   |
| NestJS               | **11.2**                          | NestJS 12 tamamen ESM'e geçti; Jest/ts-jest ve decorator metadata ekosistemi ESM'de henüz sorunlu. 11.x olgun CJS hattıdır.                                                                                          |
| TypeScript           | **5.9**                           | TS 7 (native) ts-jest ile uyumsuz (`<7`), Nest CLI 11 5.9 ile gelir.                                                                                                                                                 |
| Prisma               | **7.10** (stable)                 | npm `latest` etiketi 8.0 RC'yi gösteriyor; production için stabil 7.x. Driver adapter (`@prisma/adapter-pg`) + `prisma.config.ts`.                                                                                   |
| Next.js / React      | 16.3 / 19.3                       | App Router, Turbopack build                                                                                                                                                                                          |
| Tailwind CSS         | 4.3                               | CSS-first `@theme` token'ları                                                                                                                                                                                        |
| ESLint               | **9**                             | ESLint 10 mevcut, ancak `eslint-config-next`'in bağımlılıkları (react, jsx-a11y, import eklentileri) yalnızca ≤9'u destekliyor.                                                                                      |
| PostgreSQL / PostGIS | 17 / 3.5                          | `postgis/postgis:17-3.5`                                                                                                                                                                                             |
| Redis                | 8.8                               |                                                                                                                                                                                                                      |
| MinIO                | `pgsty/minio`                     | Upstream MinIO 2025 sonunda hazır container image yayınlamayı bıraktı ve Docker Hub'daki `minio/minio` kaldırıldı. Pigsty'nin sürdürdüğü build aynı sunucudur; uygulama S3 API'si dışında MinIO'ya bağımlı değildir. |
| npm                  | 11                                | `allowScripts` ile yalnızca gerekli install script'lerine izin verildi (Prisma engine'leri, esbuild vb.); telemetri script'i (`@scarf/scarf`) çalıştırılmaz.                                                         |

## 11. Evrim Yolu

| İhtiyaç ortaya çıkarsa                 | Değerlendirilecek çözüm                                 |
| -------------------------------------- | ------------------------------------------------------- |
| Çoklu API instance                     | Throttler storage → Redis; oturum zaten stateless (JWT) |
| Uzun süren işler (rapor, AI, bildirim) | BullMQ (Redis) ile arka plan kuyruğu                    |
| Gerçek zamanlı dashboard               | WebSocket/SSE (`@nestjs/websockets`) + Redis pub/sub    |
| Metin benzerliği yetersiz kalırsa      | `pgvector` ile embedding (ayrı vector DB değil)         |
| Bir modülün bağımsız ölçeklenmesi      | O modülün servise çıkarılması (outbox pattern ile)      |
| Arama ihtiyacı `pg_trgm`'yi aşarsa     | PostgreSQL full-text → gerekirse OpenSearch             |

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
| Health         | `GET /health` (liveness), `GET /health/ready` (PostgreSQL + PostGIS kontrolü, 503 ile)                                                        |
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
| VERIFIED               | CLOSED                                                                |
| CLOSED, REJECTED       | — (terminal)                                                          |

`NEW → CLOSED` gibi kısa devre geçişler reddedilir (`INVALID_STATUS_TRANSITION`). Her geçiş `request_history`'ye, kritik geçişler ayrıca `audit_logs`'a yazılır.

### 6.2 İş Emri Durum Makinesi

| Kaynak              | Hedefler              | Kural                                                                      |
| ------------------- | --------------------- | -------------------------------------------------------------------------- |
| CREATED             | ASSIGNED, CANCELLED   | Atama: ekip ve/veya personel                                               |
| ASSIGNED            | ACCEPTED, CANCELLED   | Yeniden atama durum değiştirmez, yeni `work_order_assignments` satırı açar |
| ACCEPTED            | EN_ROUTE, CANCELLED   |                                                                            |
| EN_ROUTE            | ON_SITE               | Konum doğrulama (bkz. 6.4)                                                 |
| ON_SITE             | IN_PROGRESS           |                                                                            |
| IN_PROGRESS         | WAITING, COMPLETED    | COMPLETED için en az bir **AFTER** fotoğrafı zorunlu                       |
| WAITING             | IN_PROGRESS           | Malzeme/izin bekleme                                                       |
| COMPLETED           | VERIFIED, IN_PROGRESS | Yönetici doğrular veya geri gönderir                                       |
| VERIFIED, CANCELLED | —                     | terminal                                                                   |

**Talep ↔ iş emri senkronu:** İlk iş emri `IN_PROGRESS` olunca talep `IN_PROGRESS`; talebin tüm aktif iş emirleri `COMPLETED` olunca talep `RESOLVED`; hepsi `VERIFIED` olunca talep `VERIFIED`. Bu geçişler aynı DB transaction'ında yapılır.

### 6.3 SLA

- `slaDueAt = createdAt + category.defaultSlaMinutes` (alt kategoride tanımlı değilse üst kategoriden miras).
- Öncelik `CRITICAL`'e yükseltilirse SLA en fazla belediye ayarındaki kritik üst sınıra (varsayılan 4 saat) çekilir; hiçbir zaman uzatılmaz.
- SLA durumu **hesaplanır, saklanmaz**:
  - `BREACHED` – çözülmemiş ve `now > slaDueAt`, ya da `resolvedAt > slaDueAt`
  - `AT_RISK` – kalan süre toplam sürenin `%25`'inden az (`settings.slaAtRiskRatio`)
  - `ON_TIME` – diğer durumlar
- Öncelik sıralaması: `CRITICAL > HIGH > NORMAL > LOW`, eşitlikte `slaDueAt` en yakın olan önce.

### 6.4 Konum Doğrulama (Saha360)

`ON_SITE` ve `IN_PROGRESS` geçişlerinde cihaz konumu gönderilirse iş emri noktasına `ST_DistanceSphere` ile mesafe ölçülür. Varsayılan eşik 150 m (`settings.onSiteRadiusMeters`). Eşik aşılırsa geçiş reddedilir ("İş emri konumuna henüz yeterince yakın değilsiniz.") ve `LOCATION_CHECK_FAILED` olayı history'ye yazılır. Konum izni olmayan development ortamı için Saha360'ta mock konum sağlayıcısı bulunacaktır (Phase 12).

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

- `AI_PROVIDER=mock` → **MockAIProvider**: kategori `keywords` alanı üzerinden kural tabanlı, deterministik ve açıklanabilir sonuç (API anahtarı gerekmez).
- Gerçek sağlayıcı aynı arayüzü uygular ve `AIModule` içinde env ile seçilir.
- Sağlayıcıya yalnızca açıklama ve fotoğraf gönderilir; kişisel veri (ad, telefon, e-posta) **gönderilmez**. `raw_response` saklanmadan önce temizlenir.
- Öneri `ai_analyses` tablosuna yazılır; insan kararından sonra `accepted` alanı doldurulur → sınıflandırıcı isabet oranı ölçülebilir.

## 9. Dosya Depolama

- Uygulama yalnızca **S3 protokolü** ile konuşur (`@aws-sdk/client-s3`); MinIO ↔ AWS S3 ↔ diğer S3 uyumlu servisler arasında geçiş env değişikliğidir.
- Object key sunucuda üretilir: `{municipalityId}/{requests|work-orders}/{yyyy}/{mm}/{uuid}.{ext}`. İstemci dosya adı asla kullanılmaz.
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

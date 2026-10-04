# KENT360

**Smart Municipal Operations & Urban Intelligence Platform**
_Akıllı Belediye Operasyon ve Kent Zekâsı Platformu_

KENT360 manages the full lifecycle of a municipal service request — from a citizen's photo and map pin, through AI-assisted triage, duplicate detection and department routing, to field-crew work orders with before/after evidence — and turns that operational data into neighbourhood-level urban intelligence.

> **Status:** Phases 0–11 complete – infrastructure, authentication / RBAC / audit, the municipality domain, **request management** and **work orders & field operations** (field teams, assignment history, work order state machine, request ↔ work order sync, PostGIS on-site check, before/during/after evidence, scoped access) with their web screens, plus the **operations dashboard** (scoped KPIs, 30-day trend, critical/recent requests), **global search** and the **MapLibre live map** (PostGIS bbox, clustering, neighbourhood layer). Phase 10–11 add **MahallePulse** (neighbourhood metrics, explainable 0–100 risk score, rule-based anomalies, heatmap and risk choropleth) and **AI assistance** (provider abstraction – deterministic mock by default, Claude via `AI_PROVIDER=anthropic` – category/priority suggestion, PostGIS + pg_trgm duplicate detection, joining an existing request). Next: Phase 12 (Saha360 mobile). See the [roadmap](docs/DEVELOPMENT_ROADMAP.md).

---

## Features

| Module                     | What it does                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Kent Operasyon Merkezi** | Operations dashboard: live KPIs, clustered city map, SLA compliance, critical queue                                                        |
| **Akıllı Talep Yönetimi**  | AI-suggested category / department / priority / risk, explainable duplicate detection, status workflow engine, SLA tracking, full timeline |
| **Saha360**                | Field teams, assignment history, work-order workflow, location check-in, BEFORE / DURING / AFTER photo evidence, React Native app          |
| **MahallePulse**           | Neighbourhood analytics: volume, resolution time, SLA success, top issues, trends, rule-based anomaly alerts                               |
| **Platform**               | Multi-municipality & white-label branding, RBAC with fine-grained permissions, immutable audit log, in-app notifications, CSV reports      |

## Architecture

A **modular monolith**: one deployable NestJS API with strict domain modules, backed by PostgreSQL + PostGIS. Chosen deliberately over microservices for transactional consistency (request + work order + history in one transaction), simple operations and a small-team-friendly codebase — while keeping module boundaries clean enough to extract a service later.

```
 Next.js web console ─┐                    ┌─ PostgreSQL 17 + PostGIS 3.5 + pg_trgm
                      ├─► NestJS API /api/v1 ─┼─ Redis 8 (cache, rate limit, jobs)
 Expo field app ──────┘                    └─ MinIO / S3 (photo evidence)
```

Highlights of the design:

- **Spatial by default** – request and work-order points are PostGIS geometries kept in sync with lat/lng by DB triggers; GIST indexes power map bounding-box queries, point-in-polygon neighbourhood lookup and proximity checks.
- **Explainable duplicate detection** – distance, category, trigram text similarity and time components are stored individually, not just a total score.
- **Race-free public numbers** – `KNT-2026-000001` / `WO-2026-000001` from an atomic `INSERT … ON CONFLICT … RETURNING` counter per municipality and year.
- **Workflow as state machines** – request and work-order transitions are validated domain rules, exposed as intent endpoints (`POST /work-orders/:id/transitions`), never free-form status writes.
- **AI suggests, humans decide** – provider-agnostic `AIProvider` interface with an offline `MockAIProvider`; suggestion acceptance is recorded to measure accuracy.
- **Append-only audit trail** – enforced by database triggers, not just application code.

Details: [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) · [API_DESIGN.md](docs/API_DESIGN.md)

## Tech Stack

| Layer    | Technology                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Backend  | NestJS 11, TypeScript 5.9 (strict), Prisma 7 (driver adapter `pg`), class-validator, Zod (env), Swagger/OpenAPI, pino        |
| Database | PostgreSQL 17, PostGIS 3.5, pg_trgm                                                                                          |
| Web      | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui approach (Radix), TanStack Query, React Hook Form + Zod, Lucide |
| Maps     | MapLibre GL JS                                                                                                               |
| Mobile   | React Native + Expo                                                                                                          |
| Infra    | Docker Compose, Redis 8, MinIO (S3 API)                                                                                      |
| Quality  | Jest, Supertest, ESLint 9, Prettier                                                                                          |

Version choices (e.g. NestJS 11 over the ESM-only 12, ESLint 9 for Next.js plugin compatibility) are justified in [ARCHITECTURE.md § 10](docs/ARCHITECTURE.md#10-teknoloji-ve-sürüm-kararları).

## Project Structure

```
kent360/
├── apps/
│   ├── api/                  NestJS API
│   │   ├── prisma/           schema.prisma + migrations
│   │   ├── src/
│   │   │   ├── common/       errors, filters, interceptors, utils
│   │   │   ├── config/       validated environment
│   │   │   ├── modules/      domain modules (health, auth, requests, …)
│   │   │   └── prisma/       PrismaService
│   │   └── test/             e2e tests
│   ├── web/                  Next.js console & citizen portal
│   │   └── src/{app,components,hooks,lib,providers}
│   └── mobile/               Saha360 (Phase 12)
├── packages/
│   ├── shared-types/         enums, permission catalogue, API contracts
│   └── config/               shared tsconfig + ESLint config
├── infrastructure/           Postgres init SQL, MinIO bucket bootstrap
├── docs/                     architecture, database, API, UI/UX, security, roadmap, demo
└── docker-compose.yml
```

## Prerequisites

- **Node.js 22 LTS** or newer (`node --version`)
- **npm 10+**
- **Docker Desktop** (with WSL 2 on Windows) for PostgreSQL/PostGIS, Redis and MinIO
- Git

## Installation

```powershell
git clone <repo-url> kent360
cd kent360
Copy-Item .env.example .env
npm install
```

`npm install` also builds `@kent360/shared-types` and generates the Prisma client.

## Docker

```powershell
npm run infra:up        # docker compose up -d
docker compose ps       # postgres and redis should be "healthy"
npm run infra:logs
npm run infra:down      # stop (data is kept in named volumes)
```

| Service              | Container          | Port                                 |
| -------------------- | ------------------ | ------------------------------------ |
| PostgreSQL + PostGIS | `kent360-postgres` | 5432                                 |
| Redis                | `kent360-redis`    | 6379                                 |
| MinIO API / Console  | `kent360-minio`    | 9000 / [9001](http://localhost:9001) |

The `kent360-minio-init` job creates the private `kent360-media` bucket and exits.
Ports can be changed in `.env` (`POSTGRES_PORT`, `REDIS_PORT`, …) if they collide with local services.

## Environment

All variables are documented in [`.env.example`](.env.example). The API validates them at startup and refuses to boot with an invalid configuration (and, in production, with the example JWT secrets). The web app reads `NEXT_PUBLIC_*` values from `apps/web/.env.local` (see `apps/web/.env.example`).

## Database Migration

```powershell
npm run db:deploy       # apply migrations (prisma migrate deploy)
npm run db:migrate      # create a new migration during development (prisma migrate dev)
npm run db:studio       # browse data
```

Migrations: `20260926000000_init` (generated from the Prisma schema) and `20260926000100_db_rules` (spatial triggers, CHECK constraints, append-only audit log).

## Seed

Idempotent development seed (`apps/api/prisma/seed.ts`, safe to re-run; refuses to run with `NODE_ENV=production`):

```powershell
npm run db:seed
```

Seeds the RBAC catalogue (29 permissions, 5 system roles with their default permission sets from `@kent360/shared-types`), the demo municipality and accounts, 5 departments, a two-level request category tree (routing, priority and SLA defaults) and 5 neighbourhoods. Existing records are never overwritten. It also creates **120 deterministic demo requests** (last 90 days, marked "(Demo kaydı)", created once) and, for Phase 6, **5 field teams** with 6 extra demo field staff and **45 demo work orders** in every status, with programmatically drawn before/after photos uploaded to the private bucket (MinIO must be running).

> **Demo geometry:** the neighbourhood names are real, but their boundaries are simple placeholder rectangles near Şahinbey centre – **not official boundaries**. Replace them with real data via _Ayarlar → Mahalle Sınırları → GeoJSON İçe Aktar_ (`POST /api/v1/neighborhoods/import`). See [DATABASE_DESIGN.md §9](docs/DATABASE_DESIGN.md#9-belediye-domaini-phase-4).

## Start Backend

```powershell
npm run dev:api
```

- API: http://localhost:4000/api/v1
- Liveness: http://localhost:4000/health → `{ "status": "ok", … }`
- Readiness: http://localhost:4000/health/ready (PostgreSQL + PostGIS → 503 when down; object storage → `"status": "degraded"` with `checks.storage.status: "down"`)

> **Map:** the base map is OpenFreeMap (free, no API key, OpenStreetMap data – needs internet). Set `NEXT_PUBLIC_MAP_STYLE_URL` in `apps/web/.env.local` to use another MapLibre style. MapLibre's web worker is copied to `apps/web/public/maplibre/` by the `predev` / `prebuild` scripts (gitignored).

> **Photos broken after a reboot?** Docker Desktop occasionally comes back with a dead port proxy for a container that restarted with a new IP (requests to `localhost:9000` get an empty reply although MinIO is healthy inside the container). Readiness then reports `storage: down`; fix it with `docker compose up -d --force-recreate minio` (data lives in the volume).

## Start Web

```powershell
npm run dev:web         # http://localhost:3000
npm run dev             # API + web together
```

The top bar shows a live system status pill (_Sistem çevrimiçi / Veritabanı yok / API çevrimdışı_).

## Start Mobile

Saha360 is scaffolded in Phase 12 — see [`apps/mobile/README.md`](apps/mobile/README.md).

## Demo Accounts

Created by `npm run db:seed`. **Development only** — the seed refuses to run with `NODE_ENV=production`; never run it against a production database. Log in at http://localhost:3000/login.

| Role               | Email                   | Password       |
| ------------------ | ----------------------- | -------------- |
| System Admin       | `admin@kent360.local`   | `Kent360!Demo` |
| Department Manager | `manager@kent360.local` | `Kent360!Demo` |
| Team Leader        | `leader@kent360.local`  | `Kent360!Demo` |
| Field Staff        | `field@kent360.local`   | `Kent360!Demo` |
| Citizen            | `citizen@kent360.local` | `Kent360!Demo` |

Full walkthrough: [DEMO_SCENARIO.md](docs/DEMO_SCENARIO.md).

## Swagger

http://localhost:4000/api/docs (OpenAPI JSON: `/api/docs/openapi.json`). Enabled by default outside production; controlled by `SWAGGER_ENABLED`.

## Testing

```powershell
npm test                              # unit tests (all workspaces)
npm run test:e2e -w @kent360/api      # API e2e (boots the full app; needs `npm run infra:up`)
npm run typecheck
npm run lint
```

The e2e suites run against a separate `kent360_test` database on the same PostgreSQL server (created and migrated automatically; the development database is never touched); uploads go to a separate private `kent360-media-test` bucket. Fixtures use unique names per run, so the database is not wiped between runs — drop `kent360_test` by hand for a clean slate.

## Roadmap

| Phase | Scope                                                         | Status            |
| ----- | ------------------------------------------------------------- | ----------------- |
| 0     | Architecture, monorepo, documentation                         | ✅                |
| 1     | Docker, PostGIS, Redis, MinIO, Prisma data model              | ✅                |
| 2     | Backend foundation (config, errors, logging, Swagger, health) | ✅                |
| 3     | Authentication, RBAC & audit                                  | ✅                |
| 4     | Municipality domain + seed                                    | ✅                |
| 5     | Request management, workflow, SLA                             | ✅                |
| 6     | Work orders, teams, before/after                              | ✅                |
| 7     | Web foundation (layout, design system, login)                 | ✅                |
| 8     | Management UI                                                 | ✅                |
| 9     | GIS: map, clustering, heatmap                                 | ✅ (heatmap → 10) |
| 10    | MahallePulse analytics                                        | ✅                |
| 11    | AI classification & duplicate detection                       | ✅                |
| 12    | Saha360 mobile                                                | ⬜                |
| 13    | Reports, notifications, audit UI                              | ⬜                |
| 14    | Hardening & demo polish                                       | ⬜                |

## Screenshots

| Operations dashboard | Live map      | Request detail | Saha360       |
| -------------------- | ------------- | -------------- | ------------- |
| _coming soon_        | _coming soon_ | _coming soon_  | _coming soon_ |

## Documentation

[Project overview](docs/PROJECT_OVERVIEW.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE_DESIGN.md) · [API](docs/API_DESIGN.md) · [UI/UX](docs/UI_UX_GUIDE.md) · [Security](docs/SECURITY.md) · [Roadmap](docs/DEVELOPMENT_ROADMAP.md) · [Demo](docs/DEMO_SCENARIO.md)

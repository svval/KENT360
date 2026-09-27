import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AreaGeometry,
  AuditAction,
  type MultiPolygonGeometry,
  type NeighborhoodDetail,
  type NeighborhoodImportError,
  type NeighborhoodImportResult,
  type NeighborhoodResolution,
  type NeighborhoodSummary,
  type Paginated,
} from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { paginated, parseSort, toSkipTake } from '../../common/pagination/pagination';
import { changedFields, isUniqueViolation, pickFields } from '../../common/utils/prisma-errors';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NeighborhoodLocator } from './neighborhood-locator';
import {
  crsError,
  type ImportFeature,
  parseImportFeatures,
  validateAreaGeometry,
} from './domain/geojson';
import {
  importFailureIsOverlapOnly,
  OVERLAP_TOLERANCE_M2,
  type OverlapConflict,
  overlapImportError,
  overlapMessage,
} from './domain/overlap';
import {
  type CreateNeighborhoodDto,
  type ImportNeighborhoodsDto,
  type ListNeighborhoodsQueryDto,
  type UpdateNeighborhoodDto,
} from './dto/neighborhoods.dto';

/** Anything that can run raw SQL: the root client or a (tenant-scoped) transaction. */
type RawDb = Pick<PrismaService, '$queryRaw' | '$executeRaw'>;

const SORTABLE = ['name', 'code', 'createdAt', 'status'] as const;

const scalarSelect = {
  id: true,
  name: true,
  code: true,
  district: true,
  population: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NeighborhoodSelect;

type NeighborhoodRecord = Prisma.NeighborhoodGetPayload<{ select: typeof scalarSelect }>;

interface GeoSummaryRow {
  id: string;
  partCount: number;
  areaKm2: number | null;
  latitude: number | null;
  longitude: number | null;
}

const notFound = () =>
  AppException.notFound(ErrorCode.NEIGHBORHOOD_NOT_FOUND, 'Mahalle bulunamadı.');

/**
 * Neighbourhoods (mahalleler) with PostGIS boundaries. Prisma cannot read or write
 * geometry columns, so geometry goes through parametrised raw SQL. Raw SQL is not
 * covered by prisma.forTenant(): every statement here filters municipality_id itself.
 *
 * GeoJSON → PostGIS is always ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(…), 4326))):
 * 2D, SRID 4326 and MultiPolygon, matching the column type (a Polygon becomes one part).
 */
@Injectable()
export class NeighborhoodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locator: NeighborhoodLocator,
  ) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async list(
    actor: AuthUser,
    query: ListNeighborhoodsQueryDto,
  ): Promise<Paginated<NeighborhoodSummary>> {
    const db = this.prisma.forTenant(actor.municipalityId);
    const search = query.search?.trim();
    const where: Prisma.NeighborhoodWhereInput = {
      ...(query.status && { status: query.status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      db.neighborhood.findMany({
        where,
        select: scalarSelect,
        orderBy: parseSort(query.sort, SORTABLE, [{ name: 'asc' }]),
        ...toSkipTake(query),
      }),
      db.neighborhood.count({ where }),
    ]);
    const geo = await this.geoSummaries(
      actor,
      items.map((item) => item.id),
    );
    return paginated(
      items.map((item) => this.toSummary(item, geo.get(item.id))),
      total,
      query,
    );
  }

  async get(actor: AuthUser, id: string): Promise<NeighborhoodDetail> {
    const item = await this.load(actor, id);
    const [geo] = (await this.geoSummaries(actor, [id])).values();
    const [row] = await this.prisma.$queryRaw<{ boundary: MultiPolygonGeometry | null }[]>`
      SELECT ST_AsGeoJSON(boundary, 6)::json AS boundary
      FROM neighborhoods WHERE id = ${id}::uuid AND municipality_id = ${actor.municipalityId}::uuid`;
    return { ...this.toSummary(item, geo), boundary: row?.boundary ?? null };
  }

  /**
   * FeatureCollection of active neighbourhoods for maps, built and serialised by
   * PostgreSQL in one statement (6 decimals ≈ 10 cm; only id/name/code properties).
   * Returned as a JSON string so the API does not parse and re-serialise it.
   */
  async featureCollection(actor: AuthUser): Promise<string> {
    const [row] = await this.prisma.$queryRaw<{ body: string }[]>`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(json_build_object(
          'type', 'Feature',
          'id', n.id,
          'geometry', ST_AsGeoJSON(n.boundary, 6)::json,
          'properties', json_build_object('id', n.id, 'name', n.name, 'code', n.code)
        ) ORDER BY n.name), '[]'::json)
      )::text AS body
      FROM neighborhoods n
      WHERE n.municipality_id = ${actor.municipalityId}::uuid
        AND n.status = 'ACTIVE' AND n.boundary IS NOT NULL`;
    return row.body;
  }

  /** Which active neighbourhood contains the point? See NeighborhoodLocator. */
  resolve(actor: AuthUser, lat: number, lng: number): Promise<NeighborhoodResolution | null> {
    return this.locator.locate(actor.municipalityId, lat, lng);
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async create(
    actor: AuthUser,
    dto: CreateNeighborhoodDto,
    meta: RequestMeta,
  ): Promise<NeighborhoodDetail> {
    const geometry = validateAreaGeometry(dto.geometry);
    if (!geometry.ok) throw invalidGeometry(geometry.error);
    await this.assertValidInPostgis([geometry.geometry]);
    const conflicts = await this.databaseOverlaps(
      this.prisma,
      actor.municipalityId,
      [geometry.geometry],
      [],
    );
    if (conflicts.length > 0) throw overlapError(conflicts);

    const feature: ImportFeature = {
      index: 0,
      name: dto.name,
      code: dto.code,
      district: dto.district ?? null,
      population: dto.population ?? null,
      geometry: geometry.geometry,
    };
    let id: string;
    try {
      [id] = await this.insertFeatures(actor, [feature], meta, false);
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
    return this.get(actor, id);
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateNeighborhoodDto,
    meta: RequestMeta,
  ): Promise<NeighborhoodDetail> {
    const before = await this.load(actor, id);
    const { geometry: rawGeometry, ...attributes } = dto;
    let geometry: AreaGeometry | undefined;
    if (rawGeometry !== undefined) {
      const result = validateAreaGeometry(rawGeometry);
      if (!result.ok) throw invalidGeometry(result.error);
      await this.assertValidInPostgis([result.geometry]);
      geometry = result.geometry;
    }
    const changed = changedFields(before, attributes as Partial<NeighborhoodRecord>);
    if (changed.length === 0 && !geometry) return this.get(actor, id);

    // Overlap matters only for a neighbourhood that is (or becomes) ACTIVE and whose area
    // changes or re-enters the active set.
    const willBeActive = (dto.status ?? before.status) === 'ACTIVE';
    const reactivated = changed.includes('status') && dto.status === 'ACTIVE';
    const candidate =
      willBeActive && (geometry || reactivated)
        ? (geometry ?? (await this.storedBoundary(actor, id)))
        : null;
    if (candidate) {
      const conflicts = await this.databaseOverlaps(
        this.prisma,
        actor.municipalityId,
        [candidate],
        [id],
      );
      if (conflicts.length > 0) throw overlapError(conflicts);
    }

    const db = this.prisma.forTenant(actor.municipalityId);
    await db.$transaction(async (tx) => {
      if (candidate) {
        // Re-check under the per-municipality lock: a concurrent write cannot slip in between.
        await this.lockNeighborhoodWrites(tx, actor.municipalityId);
        const late = await this.databaseOverlaps(tx, actor.municipalityId, [candidate], [id]);
        if (late.length > 0) throw overlapError(late);
      }
      const updated = await tx.neighborhood.update({
        where: { id },
        data: pickFields(attributes as Partial<NeighborhoodRecord>, changed),
        select: scalarSelect,
      });
      if (geometry) {
        const g = JSON.stringify(geometry);
        await tx.$executeRaw`
          UPDATE neighborhoods SET boundary = ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(${g}::text), 4326)))
          WHERE id = ${id}::uuid AND municipality_id = ${actor.municipalityId}::uuid`;
      }
      const base = {
        entityType: 'Neighborhood',
        entityId: id,
        municipalityId: actor.municipalityId,
        userId: actor.id,
        meta,
      };
      const attributeFields = changed.filter((field) => field !== 'status');
      if (attributeFields.length > 0 || geometry) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.NEIGHBORHOOD_UPDATED,
            before: pickFields(before, attributeFields),
            // Geometries can be megabytes: the audit notes the change, not the coordinates.
            after: {
              ...pickFields(updated, attributeFields),
              ...(geometry && { boundary: `${geometry.type} güncellendi` }),
            },
          },
          tx,
        );
      }
      if (changed.includes('status')) {
        await this.audit.record(
          {
            ...base,
            action: AuditAction.NEIGHBORHOOD_STATUS_CHANGED,
            before: { status: before.status },
            after: { status: updated.status },
          },
          tx,
        );
      }
    });
    return this.get(actor, id);
  }

  /**
   * All-or-nothing import of a FeatureCollection. Every feature is validated first
   * (structure, codes, duplicates in file and in the database, ST_IsValid, area overlap
   * with other features of the file and with active neighbourhoods); only a fully
   * valid file is written, inside one transaction. Duplicate policy (MVP): an existing
   * code in the municipality is an error – no silent overwrite, no upsert.
   */
  async import(
    actor: AuthUser,
    dto: ImportNeighborhoodsDto,
    dryRun: boolean,
    meta: RequestMeta,
  ): Promise<NeighborhoodImportResult> {
    const crs = crsError(dto.crs);
    if (crs) throw importFailed(dto.features.length, [{ index: -1, code: null, message: crs }]);

    const { features, errors } = parseImportFeatures(dto.features);
    if (features.length > 0) {
      errors.push(...(await this.postgisErrors(features)));
      const existing = await this.prisma.forTenant(actor.municipalityId).neighborhood.findMany({
        where: { code: { in: features.map((f) => f.code) } },
        select: { code: true },
      });
      const taken = new Set(existing.map((row) => row.code));
      for (const feature of features) {
        if (taken.has(feature.code)) {
          errors.push({
            index: feature.index,
            code: feature.code,
            message: 'Bu kodla kayıtlı bir mahalle zaten var.',
          });
        }
      }

      // Overlaps need topologically valid geometries (ST_Intersection fails otherwise).
      const invalid = new Set(errors.map((e) => e.index));
      const valid = features.filter((feature) => !invalid.has(feature.index));
      for (const { feature, conflict } of await this.fileOverlaps(valid)) {
        errors.push(overlapImportError(conflict, feature));
      }
      const stored = await this.databaseOverlaps(
        this.prisma,
        actor.municipalityId,
        valid.map((feature) => feature.geometry),
        [],
      );
      for (const conflict of stored) {
        errors.push(overlapImportError(conflict, valid[conflict.index]));
      }
    }
    if (errors.length > 0) {
      const failedIndexes = new Set(errors.map((e) => e.index));
      throw importFailed(
        failedIndexes.size,
        errors.sort((a, b) => a.index - b.index),
      );
    }

    const codes = features.map((f) => f.code);
    if (dryRun) return { imported: 0, failed: 0, dryRun: true, codes };

    try {
      await this.insertFeatures(actor, features, meta, true);
    } catch (error) {
      // A concurrent import took a code between validation and insert: nothing was written.
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
    return { imported: features.length, failed: 0, dryRun: false, codes };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Inserts rows + geometries in one transaction (with the audit record). Returns ids. */
  private async insertFeatures(
    actor: AuthUser,
    features: ImportFeature[],
    meta: RequestMeta,
    isImport: boolean,
  ): Promise<string[]> {
    const db = this.prisma.forTenant(actor.municipalityId);
    return db.$transaction(
      async (tx) => {
        await this.lockNeighborhoodWrites(tx, actor.municipalityId);
        const late = await this.databaseOverlaps(
          tx,
          actor.municipalityId,
          features.map((feature) => feature.geometry),
          [],
        );
        if (late.length > 0) {
          throw isImport
            ? importFailed(
                new Set(late.map((conflict) => conflict.index)).size,
                late.map((conflict) => overlapImportError(conflict, features[conflict.index])),
              )
            : overlapError(late);
        }

        const rows = await tx.neighborhood.createManyAndReturn({
          data: features.map((f) => ({
            municipalityId: actor.municipalityId,
            name: f.name,
            code: f.code,
            district: f.district,
            population: f.population,
          })),
          select: { id: true, code: true },
        });
        const payload = JSON.stringify(features.map((f) => ({ code: f.code, g: f.geometry })));
        const updated = await tx.$executeRaw`
          UPDATE neighborhoods n
          SET boundary = ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(f.value->'g'), 4326)))
          FROM jsonb_array_elements(${payload}::jsonb) AS f
          WHERE n.municipality_id = ${actor.municipalityId}::uuid AND n.code = f.value->>'code'`;
        if (updated !== features.length) {
          throw new Error(`Neighbourhood import wrote ${updated}/${features.length} geometries`);
        }

        const base = { municipalityId: actor.municipalityId, userId: actor.id, meta };
        if (isImport) {
          await this.audit.record(
            {
              ...base,
              action: AuditAction.NEIGHBORHOODS_IMPORTED,
              entityType: 'Neighborhood',
              after: { imported: rows.length, codes: rows.map((r) => r.code) },
            },
            tx,
          );
        } else {
          const [f] = features;
          await this.audit.record(
            {
              ...base,
              action: AuditAction.NEIGHBORHOOD_CREATED,
              entityType: 'Neighborhood',
              entityId: rows[0].id,
              after: {
                name: f.name,
                code: f.code,
                district: f.district,
                geometryType: f.geometry.type,
              },
            },
            tx,
          );
        }
        return rows.map((row) => row.id);
      },
      { timeout: 60_000 },
    );
  }

  /**
   * ACTIVE neighbourhoods of the municipality (except `excludeIds`) whose boundary shares
   * more than OVERLAP_TOLERANCE_M2 of area with one of the candidates. ST_Intersects is
   * only the index-backed pre-filter; touching along a common border yields area 0 and
   * is accepted. Candidates must already have passed ST_IsValid.
   */
  private async databaseOverlaps(
    db: RawDb,
    municipalityId: string,
    geometries: AreaGeometry[],
    excludeIds: string[],
  ): Promise<OverlapConflict[]> {
    if (geometries.length === 0) return [];
    const payload = JSON.stringify(geometries);
    const rows = await db.$queryRaw<{ ord: number; code: string; name: string; area: number }[]>`
      WITH c AS (
        SELECT (f.ordinality - 1)::int AS ord,
               ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(f.value), 4326))) AS g
        FROM jsonb_array_elements(${payload}::jsonb) WITH ORDINALITY AS f(value, ordinality)
      )
      SELECT c.ord, n.code, n.name, x.area
      FROM c
      JOIN neighborhoods n
        ON n.municipality_id = ${municipalityId}::uuid
       AND n.status = 'ACTIVE' AND n.boundary IS NOT NULL
       AND NOT (n.id = ANY(${excludeIds}::uuid[]))
       AND ST_Intersects(n.boundary, c.g)
      CROSS JOIN LATERAL (
        SELECT ST_Area(ST_Intersection(n.boundary, c.g)::geography)::float8 AS area
      ) AS x
      WHERE x.area > ${OVERLAP_TOLERANCE_M2}::float8
      ORDER BY c.ord, x.area DESC`;
    return rows.map((row) => ({
      index: row.ord,
      code: row.code,
      name: row.name,
      source: 'database',
      overlapM2: row.area,
    }));
  }

  /** Pairs of features in one import file that overlap each other (reported on the later one). */
  private async fileOverlaps(
    features: ImportFeature[],
  ): Promise<{ feature: ImportFeature; conflict: OverlapConflict }[]> {
    if (features.length < 2) return [];
    const payload = JSON.stringify(features.map((feature) => feature.geometry));
    const rows = await this.prisma.$queryRaw<{ first: number; second: number; area: number }[]>`
      WITH c AS (
        SELECT (f.ordinality - 1)::int AS ord,
               ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(f.value), 4326))) AS g
        FROM jsonb_array_elements(${payload}::jsonb) WITH ORDINALITY AS f(value, ordinality)
      )
      SELECT a.ord AS first, b.ord AS second, x.area
      FROM c AS a
      JOIN c AS b ON a.ord < b.ord AND ST_Intersects(a.g, b.g)
      CROSS JOIN LATERAL (SELECT ST_Area(ST_Intersection(a.g, b.g)::geography)::float8 AS area) AS x
      WHERE x.area > ${OVERLAP_TOLERANCE_M2}::float8
      ORDER BY b.ord, x.area DESC`;
    return rows.map((row) => {
      const other = features[row.first];
      const feature = features[row.second];
      return {
        feature,
        conflict: {
          index: feature.index,
          code: other.code,
          name: other.name,
          source: 'file',
          overlapM2: row.area,
        },
      };
    });
  }

  /**
   * Serialises neighbourhood geometry writes per municipality for the rest of the
   * transaction, so two concurrent writes cannot both pass the overlap check.
   */
  private async lockNeighborhoodWrites(db: RawDb, municipalityId: string): Promise<void> {
    const key = `kent360:neighborhoods:${municipalityId}`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  private async storedBoundary(actor: AuthUser, id: string): Promise<AreaGeometry | null> {
    const [row] = await this.prisma.$queryRaw<{ boundary: AreaGeometry | null }[]>`
      SELECT ST_AsGeoJSON(boundary)::json AS boundary FROM neighborhoods
      WHERE id = ${id}::uuid AND municipality_id = ${actor.municipalityId}::uuid`;
    return row?.boundary ?? null;
  }

  /** ST_IsValid for a batch of structurally valid geometries, in one round-trip. */
  private async postgisErrors(features: ImportFeature[]): Promise<NeighborhoodImportError[]> {
    const payload = JSON.stringify(features.map((f) => f.geometry));
    const rows = await this.prisma.$queryRaw<
      { ord: number; valid: boolean; reason: string; empty: boolean }[]
    >`
      SELECT (f.ordinality - 1)::int AS ord,
             ST_IsValid(x.geom) AS valid, ST_IsValidReason(x.geom) AS reason, ST_IsEmpty(x.geom) AS empty
      FROM jsonb_array_elements(${payload}::jsonb) WITH ORDINALITY AS f(value, ordinality)
      CROSS JOIN LATERAL (
        SELECT ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(f.value), 4326))) AS geom
      ) AS x`;
    return rows
      .filter((row) => !row.valid || row.empty)
      .map((row) => ({
        index: features[row.ord].index,
        code: features[row.ord].code,
        message: row.empty ? 'Geometri boş.' : `Geçersiz poligon: ${row.reason}`,
      }));
  }

  private async assertValidInPostgis(geometries: AreaGeometry[]): Promise<void> {
    const errors = await this.postgisErrors(
      geometries.map((geometry, index) => ({
        index,
        name: '',
        code: '',
        district: null,
        population: null,
        geometry,
      })),
    );
    if (errors.length > 0) throw invalidGeometry(errors[0].message);
  }

  private async geoSummaries(actor: AuthUser, ids: string[]): Promise<Map<string, GeoSummaryRow>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<GeoSummaryRow[]>`
      SELECT id,
             COALESCE(ST_NumGeometries(boundary), 0)::int AS "partCount",
             (ST_Area(boundary::geography) / 1e6)::float8 AS "areaKm2",
             ST_Y(center)::float8 AS latitude,
             ST_X(center)::float8 AS longitude
      FROM neighborhoods
      WHERE municipality_id = ${actor.municipalityId}::uuid AND id = ANY(${ids}::uuid[])`;
    return new Map(rows.map((row) => [row.id, row]));
  }

  private toSummary(item: NeighborhoodRecord, geo: GeoSummaryRow | undefined): NeighborhoodSummary {
    const parts = geo?.partCount ?? 0;
    return {
      ...item,
      geometryType: parts === 0 ? null : parts === 1 ? 'Polygon' : 'MultiPolygon',
      partCount: parts,
      areaKm2: typeof geo?.areaKm2 === 'number' ? Math.round(geo.areaKm2 * 1000) / 1000 : null,
      center:
        typeof geo?.latitude === 'number' && typeof geo.longitude === 'number'
          ? { latitude: geo.latitude, longitude: geo.longitude }
          : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async load(actor: AuthUser, id: string): Promise<NeighborhoodRecord> {
    const item = await this.prisma
      .forTenant(actor.municipalityId)
      .neighborhood.findUnique({ where: { id }, select: scalarSelect });
    if (!item) throw notFound();
    return item;
  }
}

function invalidGeometry(reason: string): AppException {
  return new AppException(
    ErrorCode.INVALID_GEOMETRY,
    `Geometri geçersiz: ${reason}`,
    HttpStatus.BAD_REQUEST,
    {
      reason,
    },
  );
}

function codeTaken(): AppException {
  return AppException.conflict(
    ErrorCode.NEIGHBORHOOD_CODE_TAKEN,
    'Bu mahalle kodu zaten kullanılıyor.',
  );
}

function importFailed(failed: number, errors: NeighborhoodImportError[]): AppException {
  if (importFailureIsOverlapOnly(errors)) {
    return new AppException(
      ErrorCode.NEIGHBORHOOD_BOUNDARY_OVERLAP,
      `${failed} mahallenin sınırı başka mahallelerle çakışıyor; hiçbir kayıt içe aktarılmadı.`,
      HttpStatus.CONFLICT,
      { imported: 0, failed, errors },
    );
  }
  return new AppException(
    ErrorCode.NEIGHBORHOOD_IMPORT_FAILED,
    `${failed} mahalle doğrulanamadı; hiçbir kayıt içe aktarılmadı.`,
    HttpStatus.BAD_REQUEST,
    { imported: 0, failed, errors },
  );
}

/** Single create/update: names the colliding neighbourhood(s), never returns geometry. */
function overlapError(conflicts: OverlapConflict[]): AppException {
  const [first] = conflicts;
  const more = conflicts.length > 1 ? ` (+${conflicts.length - 1} mahalle daha)` : '';
  return new AppException(
    ErrorCode.NEIGHBORHOOD_BOUNDARY_OVERLAP,
    `${overlapMessage(first)}${more}`,
    HttpStatus.CONFLICT,
    {
      conflicts: conflicts.map((conflict) => ({
        code: conflict.code,
        name: conflict.name,
        overlapM2: Math.round(conflict.overlapM2),
      })),
    },
  );
}

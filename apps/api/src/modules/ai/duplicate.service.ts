import { Injectable } from '@nestjs/common';
import { type DuplicateCandidate, Permission, type RequestStatus } from '@kent360/shared-types';
import { Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUEST_SCOPE_COLUMNS, scopeToSql } from '../operations/domain/scope-sql';
import { requestReadScope } from '../requests/domain/request-scope';
import { DUPLICATE_RULES, duplicateExplanation, duplicateScore } from './domain/duplicate-score';

interface CandidateRow {
  id: string;
  public_number: string;
  status: RequestStatus;
  supporter_count: number;
  created_by_id: string | null;
  category_id: string | null;
  category_name: string | null;
  parent_id: string | null;
  distance: number;
  text_similarity: number;
  age_minutes: number;
}

export interface DuplicateQuery {
  latitude: number;
  longitude: number;
  description: string;
  categoryId: string | null;
  excludeRequestId?: string;
  /**
   * user: candidates the actor may know about – staff within their request scope;
   * citizens municipality-wide but only public fields (number, category, distance).
   * system: the whole municipality (stored analyses, read by staff only).
   */
  mode: 'user' | 'system';
}

/** ~0.0025° ≥ 150 m at Turkish latitudes: lets the GIST index pre-filter before the exact distance. */
const INDEX_DEGREES = 0.0025;

/**
 * Duplicate candidates (ARCHITECTURE §7): PostGIS retrieval (150 m, last 30 days, not
 * closed/rejected, same municipality) + pg_trgm text similarity, scored by
 * domain/duplicate-score.ts. Suggestions only – nothing is merged automatically.
 */
@Injectable()
export class DuplicateService {
  constructor(private readonly prisma: PrismaService) {}

  async find(actor: AuthUser, query: DuplicateQuery): Promise<DuplicateCandidate[]> {
    const mid = actor.municipalityId;
    const staff = actor.permissions.has(Permission.REQUESTS_READ);
    const scope = query.mode === 'user' && staff ? requestReadScope(actor) : null; // citizens: public fields only
    const target = query.categoryId
      ? await this.prisma.forTenant(mid).requestCategory.findUnique({
          where: { id: query.categoryId },
          select: { id: true, parentId: true },
        })
      : null;
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.longitude}::float8, ${query.latitude}::float8), 4326)`;
    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      SELECT r.id, r.public_number, r.status, r.supporter_count, r.created_by_id, r.category_id,
             c.name AS category_name, c.parent_id,
             ST_DistanceSphere(r.location, ${point}) AS distance,
             similarity(r.description, ${query.description}) AS text_similarity,
             extract(epoch FROM (now() - r.created_at)) / 60 AS age_minutes
      FROM requests r
      LEFT JOIN request_categories c ON c.id = r.category_id
      WHERE r.municipality_id = ${mid}::uuid
        AND r.location IS NOT NULL
        AND ST_DWithin(r.location, ${point}, ${INDEX_DEGREES})
        AND ST_DistanceSphere(r.location, ${point}) <= ${DUPLICATE_RULES.RADIUS_METERS}
        AND r.created_at >= now() - make_interval(days => ${DUPLICATE_RULES.MAX_AGE_DAYS})
        AND r.status NOT IN ('CLOSED', 'REJECTED')
        AND ${query.excludeRequestId ? Prisma.sql`r.id <> ${query.excludeRequestId}::uuid` : Prisma.sql`TRUE`}
        AND ${scope ? scopeToSql(scope, REQUEST_SCOPE_COLUMNS) : Prisma.sql`TRUE`}
      ORDER BY distance
      LIMIT 25`;
    if (rows.length === 0) return [];

    const followed = staff
      ? new Set<string>()
      : new Set(
          (
            await this.prisma.requestFollower.findMany({
              where: { userId: actor.id, requestId: { in: rows.map((r) => r.id) } },
              select: { requestId: true },
            })
          ).map((f) => f.requestId),
        );
    return rows
      .map((row) => {
        const input = {
          distanceMeters: Number(row.distance),
          sameCategory: target !== null && row.category_id === target.id,
          sameParent:
            target !== null &&
            row.parent_id !== null &&
            (row.parent_id === target.parentId || row.parent_id === target.id),
          textSimilarity: Number(row.text_similarity),
          ageMinutes: Math.max(0, Number(row.age_minutes)),
        };
        const { score, components, possibleDuplicate } = duplicateScore(input);
        return {
          requestId: row.id,
          publicNumber: row.public_number,
          categoryName: row.category_name,
          status: row.status,
          distanceMeters: Math.round(input.distanceMeters),
          ageMinutes: Math.round(input.ageMinutes),
          score,
          components,
          explanation: duplicateExplanation(input),
          possibleDuplicate,
          supporterCount: row.supporter_count,
          canView: staff || row.created_by_id === actor.id || followed.has(row.id),
        };
      })
      .filter((c) => c.score >= DUPLICATE_RULES.MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}

import { Injectable } from '@nestjs/common';
import { type NeighborhoodResolution } from '@kent360/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Point → neighbourhood, shared by GET /neighborhoods/resolve and request creation.
 *
 * ST_Covers (not ST_Contains) so a point exactly on a boundary line still resolves.
 * Active neighbourhoods do not overlap (see the overlap rule), so at most the
 * neighbours sharing that line match; then the smaller one wins, then the lower code –
 * a deterministic safety net. Raw SQL is not tenant-scoped: municipality_id is filtered
 * explicitly. Uses the GIST index on boundary.
 */
@Injectable()
export class NeighborhoodLocator {
  constructor(private readonly prisma: PrismaService) {}

  async locate(
    municipalityId: string,
    latitude: number,
    longitude: number,
  ): Promise<NeighborhoodResolution | null> {
    const rows = await this.prisma.$queryRaw<NeighborhoodResolution[]>`
      SELECT id, name, code FROM neighborhoods
      WHERE municipality_id = ${municipalityId}::uuid
        AND status = 'ACTIVE' AND boundary IS NOT NULL
        AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326))
      ORDER BY ST_Area(boundary) ASC, code ASC
      LIMIT 1`;
    return rows[0] ?? null;
  }
}

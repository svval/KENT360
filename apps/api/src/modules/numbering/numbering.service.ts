import { Injectable } from '@nestjs/common';
import {
  formatPublicNumber,
  type PublicNumberScope,
  yearInTimeZone,
} from '../../common/utils/public-number';
import { type PrismaService } from '../../prisma/prisma.service';

/** Root client or (tenant-scoped) transaction – anything that can run raw SQL. */
export type RawDb = Pick<PrismaService, '$queryRaw'>;

/**
 * Human-readable numbers (KNT-2026-000001, WO-2026-000001) from a per
 * municipality + scope + year counter (DATABASE_DESIGN §5).
 *
 * One atomic statement: INSERT … ON CONFLICT DO UPDATE … RETURNING. The conflicting row
 * is locked until the surrounding transaction ends, so concurrent creations queue up and
 * get consecutive values – never "MAX(number) + 1". Run it inside the transaction that
 * creates the record: a rollback also rolls the counter back (no gaps).
 */
@Injectable()
export class NumberingService {
  async next(
    db: RawDb,
    municipalityId: string,
    scope: PublicNumberScope,
    at: Date,
    timeZone: string,
  ): Promise<string> {
    const year = yearInTimeZone(at, timeZone);
    const [row] = await db.$queryRaw<{ value: number }[]>`
      INSERT INTO number_sequences (municipality_id, scope, year, last_value, updated_at)
      VALUES (${municipalityId}::uuid, ${scope}::"SequenceScope", ${year}::int, 1, now())
      ON CONFLICT (municipality_id, scope, year)
      DO UPDATE SET last_value = number_sequences.last_value + 1, updated_at = now()
      RETURNING last_value AS value`;
    return formatPublicNumber(scope, year, Number(row.value));
  }
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { type Paginated } from '@kent360/shared-types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `?page=&pageSize=&sort=` – extend it for list endpoints (docs/API_DESIGN.md §3). */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    description: 'Comma-separated fields, "-" prefix for descending (e.g. -createdAt,lastName)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^-?[A-Za-z]+(,-?[A-Za-z]+)*$/, { message: 'sort biçimi geçersiz' })
  sort?: string;
}

/** Prisma skip/take for a page. */
export function toSkipTake(query: Pick<PaginationQueryDto, 'page' | 'pageSize'>): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginated<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQueryDto, 'page' | 'pageSize'>,
): Paginated<T> {
  return {
    items,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/**
 * Turns `-createdAt,lastName` into a Prisma orderBy array. Only whitelisted fields are
 * accepted, so clients cannot sort by (and thereby probe) arbitrary columns.
 */
export function parseSort<F extends string>(
  sort: string | undefined,
  allowed: readonly F[],
  fallback: Partial<Record<F, 'asc' | 'desc'>>[],
): Partial<Record<F, 'asc' | 'desc'>>[] {
  if (!sort) return fallback;
  const orderBy = sort.split(',').map((token) => {
    const desc = token.startsWith('-');
    const field = (desc ? token.slice(1) : token) as F;
    if (!allowed.includes(field)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Gönderilen bilgiler doğrulanamadı.',
        400,
        [`sort: "${field}" alanına göre sıralama yapılamaz (izinli: ${allowed.join(', ')})`],
      );
    }
    return { [field]: desc ? 'desc' : 'asc' } as Partial<Record<F, 'asc' | 'desc'>>;
  });
  return orderBy;
}

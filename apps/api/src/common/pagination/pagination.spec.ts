import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AppException } from '../errors/app.exception';
import { PaginationQueryDto, paginated, parseSort, toSkipTake } from './pagination';

function parse(query: Record<string, string>) {
  const dto = plainToInstance(PaginationQueryDto, query);
  return { dto, errors: validateSync(dto) };
}

describe('PaginationQueryDto', () => {
  it('defaults to page 1 / 20 items and converts query strings', () => {
    expect(parse({}).dto).toMatchObject({ page: 1, pageSize: 20 });
    expect(parse({ page: '3', pageSize: '50' }).dto).toMatchObject({ page: 3, pageSize: 50 });
  });

  it.each<Record<string, string>>([
    { page: '0' },
    { pageSize: '101' },
    { page: 'abc' },
    { sort: 'name;drop' },
  ])('rejects %p', (query) => {
    expect(parse(query).errors).not.toHaveLength(0);
  });
});

describe('pagination helpers', () => {
  it('computes skip/take and meta', () => {
    expect(toSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
    expect(paginated(['a'], 41, { page: 3, pageSize: 20 }).meta).toEqual({
      page: 3,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(paginated([], 0, { page: 1, pageSize: 20 }).meta.totalPages).toBe(1);
  });
});

describe('parseSort', () => {
  const allowed = ['createdAt', 'lastName'] as const;

  it('maps fields and direction, falling back when empty', () => {
    expect(parseSort('-createdAt,lastName', allowed, [])).toEqual([
      { createdAt: 'desc' },
      { lastName: 'asc' },
    ]);
    expect(parseSort(undefined, allowed, [{ createdAt: 'desc' }])).toEqual([{ createdAt: 'desc' }]);
  });

  it('rejects fields outside the whitelist', () => {
    expect(() => parseSort('passwordHash', allowed, [])).toThrow(AppException);
  });
});

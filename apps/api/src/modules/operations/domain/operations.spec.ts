import { localDateKey, lastLocalDays, startOfLocalDay } from './local-time';
import { REQUEST_SCOPE_COLUMNS, scopeToSql, WORK_ORDER_SCOPE_COLUMNS } from './scope-sql';
import { parseBbox } from './bbox';

describe('scopeToSql', () => {
  const sqlOf = (scope: object, columns = REQUEST_SCOPE_COLUMNS) => {
    const sql = scopeToSql(scope, columns);
    return { text: sql.sql, values: sql.values };
  };

  it('maps the whole municipality to TRUE', () => {
    expect(sqlOf({}).text).toBe('TRUE');
  });

  it('binds values as parameters on allow-listed columns', () => {
    expect(sqlOf({ departmentId: 'd1' })).toEqual({
      text: 'r.department_id = ?::uuid',
      values: ['d1'],
    });
    expect(
      sqlOf(
        { OR: [{ assignedUserId: 'u1' }, { fieldTeamId: { in: ['t1', 't2'] } }] },
        WORK_ORDER_SCOPE_COLUMNS,
      ),
    ).toEqual({
      text: '(w.assigned_user_id = ?::uuid OR w.field_team_id = ANY(?::uuid[]))',
      values: ['u1', ['t1', 't2']],
    });
  });

  it('fails closed on anything it does not understand', () => {
    expect(() => sqlOf({ status: 'NEW' })).toThrow(/unsupported scope key/);
    expect(() => sqlOf({ departmentId: { not: 'd1' } })).toThrow(/unsupported value/);
    expect(() => sqlOf({ OR: [] })).toThrow(/empty OR/);
    // Column names never come from the scope object itself.
    expect(() => sqlOf({ 'r.id; DROP TABLE requests': 'x' })).toThrow();
  });
});

describe('local days', () => {
  const tz = 'Europe/Istanbul';
  it('finds local midnight (Istanbul is UTC+3)', () => {
    expect(startOfLocalDay(new Date('2026-10-04T10:00:00Z'), tz).toISOString()).toBe(
      '2026-10-03T21:00:00.000Z',
    );
    // 22:30 UTC is already the next day in Istanbul.
    expect(localDateKey(new Date('2026-10-04T22:30:00Z'), tz)).toBe('2026-10-05');
    expect(startOfLocalDay(new Date('2026-10-04T22:30:00Z'), tz).toISOString()).toBe(
      '2026-10-04T21:00:00.000Z',
    );
  });

  it('handles daylight saving zones', () => {
    // Berlin switches to winter time on 25 Oct 2026: midnight is still +02:00.
    expect(startOfLocalDay(new Date('2026-10-25T12:00:00Z'), 'Europe/Berlin').toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    );
  });

  it('lists the last N days oldest first, ending today', () => {
    const days = lastLocalDays(new Date('2026-10-04T10:00:00Z'), tz, 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-09-05');
    expect(days.at(-1)).toBe('2026-10-04');
    expect(new Set(days).size).toBe(30);
  });
});

describe('parseBbox', () => {
  it('parses west,south,east,north', () => {
    expect(parseBbox('37.30,37.00,37.45,37.10')).toEqual({
      west: 37.3,
      south: 37,
      east: 37.45,
      north: 37.1,
    });
  });
  it.each([
    '',
    '1,2,3',
    'a,b,c,d',
    '37.4,37,37.3,37.1',
    '37,37.2,37.4,37.1',
    '0,-91,1,1',
    '-181,0,1,1',
  ])('rejects %p', (value) => {
    expect(parseBbox(value)).toBeNull();
  });
});

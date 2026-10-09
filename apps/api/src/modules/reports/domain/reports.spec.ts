import { Permission } from '@kent360/shared-types';
import { type AuthUser } from '../../../common/auth/auth-user';
import { CSV_BOM, csvCell, reportFilename, toCsv } from './csv';
import { reportRange, reportScope, slaOutcome } from './report-scope';

const user = (permissions: string[], roles: string[], departmentId: string | null = null) =>
  ({
    id: 'u',
    municipalityId: 'm',
    departmentId,
    email: 'u@test',
    firstName: 'U',
    lastName: 'T',
    roles,
    permissions: new Set(permissions),
    sessionId: 's',
  }) as unknown as AuthUser;

describe('CSV', () => {
  it('neutralises formula injection in text cells', () => {
    for (const payload of ['=HYPERLINK("x")', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx']) {
      expect(csvCell(payload).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell('Karataş Mh.')).toBe('Karataş Mh.');
  });

  it('keeps own numbers numeric (also negative) with a decimal comma', () => {
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(12.46)).toBe('12,5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('quotes separators, quotes and line breaks', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('writes UTF-8 BOM, ";" and CRLF', () => {
    const csv = toCsv(['Talep No', 'Mahalle'], [['KNT-1', 'Güneykent']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(`${CSV_BOM}Talep No;Mahalle\r\nKNT-1;Güneykent\r\n`);
    expect(reportFilename('talep-raporu', '2026-10-04')).toBe(
      'kent360-talep-raporu-2026-10-04.csv',
    );
  });
});

describe('report scope and range', () => {
  const report = [Permission.REPORTS_EXPORT, Permission.REQUESTS_READ];

  it('admin → municipality, manager → own department, others → none', () => {
    expect(reportScope(user(report, ['SYSTEM_ADMIN']))).toEqual({});
    expect(reportScope(user(report, ['DEPARTMENT_MANAGER'], 'd1'))).toEqual({ departmentId: 'd1' });
    expect(reportScope(user(report, ['DEPARTMENT_MANAGER']))).toBeNull();
    expect(reportScope(user([Permission.REQUESTS_CREATE], ['CITIZEN']))).toBeNull();
    expect(reportScope(user([Permission.REQUESTS_READ], ['TEAM_LEADER'], 'd1'))).toBeNull();
  });

  it('defaults to the last 30 days and rejects reversed / huge ranges', () => {
    expect(reportRange({}, '2026-10-04')).toEqual({ from: '2026-09-05', to: '2026-10-04' });
    expect(reportRange({ dateFrom: '2026-10-01', dateTo: '2026-10-01' }, '2026-10-04')).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
    });
    expect(reportRange({ dateFrom: '2026-10-05', dateTo: '2026-10-01' }, '2026-10-04')).toBeNull();
    expect(reportRange({ dateFrom: '2020-01-01', dateTo: '2026-10-01' }, '2026-10-04')).toBeNull();
  });

  it('describes the SLA outcome of a request', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const due = new Date('2026-10-04T10:00:00Z');
    const later = new Date('2026-10-05T10:00:00Z');
    const base = { slaAtRiskAt: null, closed: false };
    expect(slaOutcome({ ...base, slaDueAt: null, resolvedAt: null }, now)).toBe('SLA yok');
    expect(
      slaOutcome({ ...base, slaDueAt: due, resolvedAt: new Date('2026-10-04T09:00:00Z') }, now),
    ).toBe('Süresinde çözüldü');
    expect(slaOutcome({ ...base, slaDueAt: due, resolvedAt: now }, now)).toBe('Geç çözüldü');
    expect(slaOutcome({ ...base, slaDueAt: due, resolvedAt: null }, now)).toBe('Aşıldı');
    expect(
      slaOutcome({ slaDueAt: later, slaAtRiskAt: due, resolvedAt: null, closed: false }, now),
    ).toBe('Riskte');
    expect(slaOutcome({ ...base, slaDueAt: later, resolvedAt: null }, now)).toBe('Süresi içinde');
  });
});

import { formatPublicNumber, parsePublicNumber } from './public-number';

describe('formatPublicNumber', () => {
  it('formats request numbers with a zero-padded sequence', () => {
    expect(formatPublicNumber('REQUEST', 2026, 1)).toBe('KNT-2026-000001');
    expect(formatPublicNumber('REQUEST', 2026, 1248)).toBe('KNT-2026-001248');
  });

  it('formats work order numbers', () => {
    expect(formatPublicNumber('WORK_ORDER', 2026, 883)).toBe('WO-2026-000883');
  });

  it('keeps growing past six digits instead of wrapping', () => {
    expect(formatPublicNumber('REQUEST', 2026, 1_234_567)).toBe('KNT-2026-1234567');
  });

  it.each([0, -1, 1.5])('rejects invalid sequence %p', (sequence) => {
    expect(() => formatPublicNumber('REQUEST', 2026, sequence)).toThrow(RangeError);
  });

  it('rejects implausible years', () => {
    expect(() => formatPublicNumber('REQUEST', 26, 1)).toThrow(RangeError);
  });
});

describe('parsePublicNumber', () => {
  it('round-trips a formatted number', () => {
    expect(parsePublicNumber('KNT-2026-001248')).toEqual({
      scope: 'REQUEST',
      year: 2026,
      sequence: 1248,
    });
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parsePublicNumber('  wo-2026-000883 ')).toEqual({
      scope: 'WORK_ORDER',
      year: 2026,
      sequence: 883,
    });
  });

  it('returns null for free text', () => {
    expect(parsePublicNumber('Karataş çukur')).toBeNull();
  });
});

import {
  formatOverlapArea,
  importFailureIsOverlapOnly,
  OVERLAP_REASON,
  OVERLAP_TOLERANCE_M2,
  overlapImportError,
  overlapMessage,
} from './overlap';

const conflict = {
  index: 2,
  code: 'KARATAS',
  name: 'Karataş',
  source: 'database' as const,
  overlapM2: 1234.56,
};

describe('neighbourhood overlap helpers', () => {
  it('uses a 1 m² tolerance', () => {
    expect(OVERLAP_TOLERANCE_M2).toBe(1);
  });

  it('formats overlap areas for people', () => {
    expect(formatOverlapArea(0.4)).toBe('1 m²');
    expect(formatOverlapArea(1234.56)).toBe('1.235 m²');
    expect(formatOverlapArea(2_500_000)).toBe('2,5 km²');
  });

  it('names the colliding neighbourhood and where it comes from', () => {
    expect(overlapMessage(conflict)).toBe(
      'Sınır, kayıtlı Karataş (KARATAS) mahallesiyle yaklaşık 1.235 m² çakışıyor.',
    );
    expect(overlapMessage({ ...conflict, source: 'file' })).toMatch(/^Sınır, dosyadaki Karataş/);
  });

  it('builds an import error without geometry', () => {
    const error = overlapImportError(conflict, { index: 5, code: 'NEW_ONE' });
    expect(error).toEqual({
      index: 5,
      code: 'NEW_ONE',
      message: expect.stringContaining('KARATAS'),
      reason: OVERLAP_REASON,
      conflict: { code: 'KARATAS', name: 'Karataş', source: 'database', overlapM2: 1235 },
    });
    expect(JSON.stringify(error)).not.toMatch(/coordinates|Polygon/);
  });

  it('reports the overlap code only when overlaps are the sole problem', () => {
    const overlap = overlapImportError(conflict, { index: 0, code: 'A' });
    expect(importFailureIsOverlapOnly([overlap, { ...overlap, index: 1 }])).toBe(true);
    expect(
      importFailureIsOverlapOnly([overlap, { index: 1, code: 'B', message: 'Geometri boş.' }]),
    ).toBe(false);
    expect(importFailureIsOverlapOnly([])).toBe(false);
  });
});

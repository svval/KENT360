import { crsError, parseImportFeatures, validateAreaGeometry } from './geojson';

const square = (x = 37.3, y = 37.05, d = 0.01) => [
  [
    [x, y],
    [x + d, y],
    [x + d, y + d],
    [x, y + d],
    [x, y],
  ],
];

const feature = (code: string, geometry: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'Feature',
  properties: { name: `Mahalle ${code}`, code, ...extra },
  geometry,
});

describe('validateAreaGeometry', () => {
  it('accepts Polygon and MultiPolygon', () => {
    expect(validateAreaGeometry({ type: 'Polygon', coordinates: square() }).ok).toBe(true);
    expect(
      validateAreaGeometry({ type: 'MultiPolygon', coordinates: [square(), square(37.4)] }).ok,
    ).toBe(true);
  });

  it.each([
    [null, /GeoJSON nesnesi/],
    [{ type: 'Point', coordinates: [37, 37] }, /Polygon veya MultiPolygon/],
    [{ type: 'Polygon', coordinates: [] }, /boş/],
    [
      {
        type: 'Polygon',
        coordinates: [
          [
            [37, 37],
            [38, 37],
            [37, 37],
          ],
        ],
      },
      /en az 4/,
    ],
    [
      {
        type: 'Polygon',
        coordinates: [
          [
            [37, 37],
            [38, 37],
            [38, 38],
            [37, 38],
          ],
        ],
      },
      /kapalı değil/,
    ],
    [{ type: 'Polygon', coordinates: square(500000, 4100000) }, /aralık dışında/],
    [
      {
        type: 'Polygon',
        coordinates: [
          [
            [37, 37],
            ['a', 37],
            [38, 38],
            [37, 37],
          ],
        ],
      },
      /sayı/,
    ],
    [{ type: 'MultiPolygon', coordinates: [[]] }, /en az bir halka/],
  ])('rejects %j', (input, message) => {
    const result = validateAreaGeometry(input);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toMatch(message);
  });
});

describe('crsError', () => {
  it('accepts missing or WGS84 CRS and rejects projected ones', () => {
    expect(crsError(undefined)).toBeNull();
    expect(crsError({ properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } })).toBeNull();
    expect(crsError({ properties: { name: 'EPSG:4326' } })).toBeNull();
    expect(crsError({ properties: { name: 'urn:ogc:def:crs:EPSG::5254' } })).toMatch(/4326/);
  });
});

describe('parseImportFeatures', () => {
  it('parses valid features and trims values', () => {
    const { features, errors } = parseImportFeatures([
      feature(' KARATAS ', { type: 'Polygon', coordinates: square() }, { district: ' Şahinbey ' }),
    ]);
    expect(errors).toEqual([]);
    expect(features[0]).toMatchObject({
      index: 0,
      code: 'KARATAS',
      district: 'Şahinbey',
      population: null,
    });
  });

  it('reports every broken feature with its index, including duplicate codes', () => {
    const { features, errors } = parseImportFeatures([
      feature('A', { type: 'Polygon', coordinates: square() }),
      feature('A', { type: 'Polygon', coordinates: square(37.5) }),
      { type: 'Feature', properties: { code: 'B' }, geometry: null },
      feature('C', { type: 'LineString', coordinates: [] }),
      feature('bad code!', { type: 'Polygon', coordinates: square() }),
      feature('D', { type: 'Polygon', coordinates: square() }, { population: -3 }),
      { type: 'Point' },
    ]);
    expect(features.map((f) => f.code)).toEqual(['A']);
    expect(errors.map((e) => e.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(errors[0].message).toMatch(/tekrar ediyor/);
  });
});

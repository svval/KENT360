import {
  DEFAULT_ON_SITE_RADIUS_METERS,
  evaluateProximity,
  onSiteRadiusFrom,
} from './field-proximity';

describe('onSiteRadiusFrom', () => {
  it('reads the municipality setting', () => {
    expect(onSiteRadiusFrom({ onSiteRadiusMeters: 250 })).toBe(250);
  });
  it.each([
    null,
    {},
    { onSiteRadiusMeters: '250' },
    { onSiteRadiusMeters: 5 },
    { onSiteRadiusMeters: 1e6 },
  ])('falls back to the default for %p', (settings) => {
    expect(onSiteRadiusFrom(settings)).toBe(DEFAULT_ON_SITE_RADIUS_METERS);
  });
});

describe('evaluateProximity', () => {
  it('accepts a position inside the radius (boundary included)', () => {
    expect(evaluateProximity(42.4, 150, false)).toEqual({
      ok: true,
      distanceMeters: 42,
      bypassed: false,
    });
    expect(evaluateProximity(150, 150, false)).toMatchObject({ ok: true });
  });

  it('refuses a position outside the radius', () => {
    expect(evaluateProximity(812.6, 150, false)).toEqual({
      ok: false,
      reason: 'TOO_FAR',
      distanceMeters: 813,
      radiusMeters: 150,
    });
  });

  it('requires a position', () => {
    expect(evaluateProximity(null, 150, false)).toEqual({
      ok: false,
      reason: 'LOCATION_REQUIRED',
    });
  });

  it('records the development bypass instead of hiding it', () => {
    expect(evaluateProximity(null, 150, true)).toEqual({
      ok: true,
      distanceMeters: null,
      bypassed: true,
    });
    expect(evaluateProximity(900, 150, true)).toEqual({
      ok: true,
      distanceMeters: 900,
      bypassed: true,
    });
  });
});

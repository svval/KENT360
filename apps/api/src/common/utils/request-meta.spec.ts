import { readCookie, requestMetaOf } from './request-meta';

describe('readCookie', () => {
  it('finds a cookie among others and decodes it', () => {
    expect(readCookie('a=1; kent360_rt=abc%2Fdef; b=2', 'kent360_rt')).toBe('abc/def');
  });

  it('returns undefined when missing or malformed', () => {
    expect(readCookie(undefined, 'x')).toBeUndefined();
    expect(readCookie('a=1; x', 'x')).toBeUndefined();
    expect(readCookie('x=%E0%A4%A', 'x')).toBeUndefined();
  });

  it('does not match on a name prefix', () => {
    expect(readCookie('kent360_rt_old=1', 'kent360_rt')).toBeUndefined();
  });
});

describe('requestMetaOf', () => {
  it('truncates values to the column limits', () => {
    const meta = requestMetaOf({ ip: '1'.repeat(100), headers: { 'user-agent': 'u'.repeat(600) } });
    expect(meta.ipAddress).toHaveLength(64);
    expect(meta.userAgent).toHaveLength(500);
  });

  it('uses null for missing values', () => {
    expect(requestMetaOf({ ip: undefined, headers: {} })).toEqual({
      ipAddress: null,
      userAgent: null,
    });
  });
});

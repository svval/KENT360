import { REDACTED } from '../audit-sanitizer';
import { auditChanges, flattenAuditData } from './audit-view';

describe('audit view', () => {
  it('flattens nested data into readable key/values', () => {
    const flat = flattenAuditData({
      status: 'NEW',
      proximity: { distanceMeters: 42, bypassed: false },
      tags: ['a', 'b'],
      items: [{ x: 1 }],
    });
    expect(Object.fromEntries(flat)).toEqual({
      status: 'NEW',
      'proximity.distanceMeters': '42',
      'proximity.bypassed': 'Hayır',
      tags: 'a, b',
      items: '1 kayıt',
    });
  });

  it('never shows secrets, bodies, prompts, headers, user agents or session ids', () => {
    const changes = auditChanges(
      { password: 'x' },
      {
        passwordHash: REDACTED,
        refreshToken: 'abc',
        authorization: 'Bearer xyz',
        cookie: 'a=b',
        headers: { host: 'x' },
        description: 'Ahmet Yılmaz 0555 …',
        prompt: 'full prompt',
        rawResponse: { reasoning: 'x' },
        userAgent: 'Mozilla',
        sessionId: 's1',
        note: REDACTED,
        status: 'ACTIVE',
      },
    );
    expect(changes).toEqual([{ field: 'status', before: null, after: 'ACTIVE' }]);
  });

  it('lists only fields that changed', () => {
    expect(
      auditChanges(
        { status: 'NEW', priority: 'HIGH' },
        { status: 'UNDER_REVIEW', priority: 'HIGH', reason: 'Kontrol' },
      ),
    ).toEqual([
      { field: 'status', before: 'NEW', after: 'UNDER_REVIEW' },
      { field: 'reason', before: null, after: 'Kontrol' },
    ]);
    expect(auditChanges(null, undefined)).toEqual([]);
  });

  it('truncates long values', () => {
    const [change] = auditChanges(null, { reason: 'x'.repeat(500) });
    expect(change.after?.length).toBe(201);
  });
});

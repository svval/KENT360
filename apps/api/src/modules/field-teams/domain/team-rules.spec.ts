import { checkTeamMembers, diffTeamMembers, MAX_TEAM_MEMBERS } from './team-rules';

describe('checkTeamMembers', () => {
  it('accepts unique members with at most one leader', () => {
    expect(
      checkTeamMembers([
        { userId: 'a', role: 'LEADER' },
        { userId: 'b', role: 'MEMBER' },
      ]),
    ).toEqual({ ok: true, leaderId: 'a' });
    expect(checkTeamMembers([])).toEqual({ ok: true, leaderId: null });
  });

  it('refuses duplicates, two leaders and oversized teams', () => {
    expect(
      checkTeamMembers([
        { userId: 'a', role: 'MEMBER' },
        { userId: 'a', role: 'LEADER' },
      ]),
    ).toMatchObject({ ok: false, reason: 'DUPLICATE_MEMBER' });
    expect(
      checkTeamMembers([
        { userId: 'a', role: 'LEADER' },
        { userId: 'b', role: 'LEADER' },
      ]),
    ).toMatchObject({ ok: false, reason: 'MULTIPLE_LEADERS' });
    const many = Array.from({ length: MAX_TEAM_MEMBERS + 1 }, (_, i) => ({
      userId: `u${i}`,
      role: 'MEMBER' as const,
    }));
    expect(checkTeamMembers(many)).toMatchObject({ ok: false, reason: 'TOO_MANY_MEMBERS' });
  });
});

describe('diffTeamMembers', () => {
  it('adds, re-joins, changes roles and removes without deleting history', () => {
    const current = [
      { userId: 'stay', role: 'MEMBER' as const, leftAt: null },
      { userId: 'promote', role: 'MEMBER' as const, leftAt: null },
      { userId: 'leave', role: 'LEADER' as const, leftAt: null },
      { userId: 'back', role: 'MEMBER' as const, leftAt: new Date() },
      { userId: 'gone', role: 'MEMBER' as const, leftAt: new Date() },
    ];
    const diff = diffTeamMembers(current, [
      { userId: 'stay', role: 'MEMBER' },
      { userId: 'promote', role: 'LEADER' },
      { userId: 'back', role: 'MEMBER' },
      { userId: 'new', role: 'MEMBER' },
    ]);
    expect(diff).toEqual({
      add: [{ userId: 'new', role: 'MEMBER' }],
      rejoin: [{ userId: 'back', role: 'MEMBER' }],
      changeRole: [{ userId: 'promote', role: 'LEADER' }],
      remove: ['leave'],
    });
  });
});

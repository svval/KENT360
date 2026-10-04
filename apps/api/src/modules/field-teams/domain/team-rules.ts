import { type FieldTeamMemberRole } from '@kent360/shared-types';

export const MAX_TEAM_MEMBERS = 30;

export interface TeamMemberInput {
  userId: string;
  role: FieldTeamMemberRole;
}

export type TeamMembersCheck =
  | { ok: true; leaderId: string | null }
  | { ok: false; reason: 'DUPLICATE_MEMBER' | 'MULTIPLE_LEADERS' | 'TOO_MANY_MEMBERS' };

/** A team has unique members, at most one leader and at most 30 people. */
export function checkTeamMembers(members: readonly TeamMemberInput[]): TeamMembersCheck {
  if (members.length > MAX_TEAM_MEMBERS) return { ok: false, reason: 'TOO_MANY_MEMBERS' };
  if (new Set(members.map((m) => m.userId)).size !== members.length) {
    return { ok: false, reason: 'DUPLICATE_MEMBER' };
  }
  const leaders = members.filter((m) => m.role === 'LEADER');
  if (leaders.length > 1) return { ok: false, reason: 'MULTIPLE_LEADERS' };
  return { ok: true, leaderId: leaders[0]?.userId ?? null };
}

export interface MembershipRow {
  userId: string;
  role: FieldTeamMemberRole;
  leftAt: Date | null;
}

/**
 * Turns the wanted member list into row changes. Members are never deleted: leaving
 * sets `leftAt` (the history of who was in the team stays), re-joining clears it.
 */
export function diffTeamMembers(
  current: readonly MembershipRow[],
  wanted: readonly TeamMemberInput[],
): {
  add: TeamMemberInput[];
  rejoin: TeamMemberInput[];
  changeRole: TeamMemberInput[];
  remove: string[];
} {
  const byUser = new Map(current.map((row) => [row.userId, row]));
  const wantedIds = new Set(wanted.map((m) => m.userId));
  const add: TeamMemberInput[] = [];
  const rejoin: TeamMemberInput[] = [];
  const changeRole: TeamMemberInput[] = [];
  for (const member of wanted) {
    const row = byUser.get(member.userId);
    if (!row) add.push(member);
    else if (row.leftAt) rejoin.push(member);
    else if (row.role !== member.role) changeRole.push(member);
  }
  const remove = current
    .filter((row) => !row.leftAt && !wantedIds.has(row.userId))
    .map((row) => row.userId);
  return { add, rejoin, changeRole, remove };
}

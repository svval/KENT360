import { Prisma } from '../../../generated/prisma/client';
import { type RequestScope } from '../../requests/domain/request-scope';
import { type WorkOrderScope } from '../../work-orders/domain/work-order-scope';

/**
 * Object scopes (requestReadScope / workOrderReadScope) are Prisma `where` fragments.
 * Raw PostGIS and aggregate queries need the same rule as SQL, so this translates the
 * few shapes those scopes produce – and nothing else:
 *   {}                         → TRUE (whole municipality)
 *   { column: '<uuid>' }       → column = $1::uuid
 *   { column: { in: [...] } }  → column = ANY($1::uuid[])
 *   { OR: [ … ] }              → ( … OR … )
 * Column names come from a fixed allow-list (never from input); values are bound
 * parameters. An unknown key throws: a scope rule that SQL does not understand must
 * fail closed instead of silently widening the result.
 */
export type ScopeColumns = Readonly<Record<string, string>>;

export const REQUEST_SCOPE_COLUMNS: ScopeColumns = {
  departmentId: 'r.department_id',
  createdById: 'r.created_by_id',
};

export const WORK_ORDER_SCOPE_COLUMNS: ScopeColumns = {
  departmentId: 'w.department_id',
  assignedUserId: 'w.assigned_user_id',
  fieldTeamId: 'w.field_team_id',
};

export function scopeToSql(
  scope: RequestScope | WorkOrderScope | object,
  columns: ScopeColumns,
): Prisma.Sql {
  const entries = Object.entries(scope as Record<string, unknown>);
  if (entries.length === 0) return Prisma.sql`TRUE`;
  const parts = entries.map(([key, value]) => {
    if (key === 'OR') {
      if (!Array.isArray(value) || value.length === 0) throw new Error('Scope SQL: empty OR');
      return Prisma.sql`(${Prisma.join(
        value.map((clause) => scopeToSql(clause as object, columns)),
        ' OR ',
      )})`;
    }
    const column = columns[key];
    if (!column) throw new Error(`Scope SQL: unsupported scope key "${key}"`);
    const identifier = Prisma.raw(column);
    if (typeof value === 'string') return Prisma.sql`${identifier} = ${value}::uuid`;
    const list = (value as { in?: unknown } | null)?.in;
    if (Array.isArray(list) && list.every((item) => typeof item === 'string')) {
      return Prisma.sql`${identifier} = ANY(${list}::uuid[])`;
    }
    throw new Error(`Scope SQL: unsupported value for "${key}"`);
  });
  return parts.length === 1 ? parts[0] : Prisma.sql`(${Prisma.join(parts, ' AND ')})`;
}

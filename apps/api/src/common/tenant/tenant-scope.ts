import { Prisma } from '../../generated/prisma/client';

/**
 * Tenant isolation for Prisma.
 *
 * `prisma.forTenant(municipalityId)` returns a client on which every query against a
 * tenant-owned model is forced into that municipality:
 *   • filters (find*, count, aggregate, groupBy, update*, delete*) get `municipalityId`
 *     merged into `where` – a caller-supplied municipalityId is overwritten, never trusted;
 *   • creates get `municipalityId` set; a conflicting value is a programming error.
 * A record of another municipality is therefore simply "not found" (404, existence is
 * not leaked), without services repeating the check by hand.
 *
 * Limits (kept deliberately small, see docs/SECURITY.md §3):
 *   • nested relation reads/writes are not rewritten – children of a scoped row belong
 *     to the same tenant by construction;
 *   • raw SQL ($queryRaw) must filter by municipality_id explicitly;
 *   • Role is not auto-scoped: system roles (municipalityId = NULL) are shared, so
 *     RolesService applies "system OR own tenant" explicitly.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'Department',
  'Neighborhood',
  'User',
  'RequestCategory',
  'Request',
  'FieldTeam',
  'WorkOrder',
  'Notification',
  'AuditLog',
  'NumberSequence',
]);

/** Tenant-owned models deliberately handled by hand (see above). */
export const TENANT_UNSCOPED_EXCEPTIONS: ReadonlySet<string> = new Set(['Role']);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

type Args = Record<string, unknown>;

function scopeData(model: string, data: unknown, municipalityId: string): unknown {
  if (Array.isArray(data)) return data.map((row) => scopeData(model, row, municipalityId));
  const row = (data ?? {}) as Args;
  if ('municipality' in row) {
    throw new Error(
      `Tenant scope: use municipalityId instead of a municipality relation (${model})`,
    );
  }
  if (row.municipalityId !== undefined && row.municipalityId !== municipalityId) {
    throw new Error(`Tenant scope: refusing to write ${model} into another municipality`);
  }
  return { ...row, municipalityId };
}

/** Pure argument rewrite – exported for unit tests. */
export function scopeTenantArgs(
  model: string,
  operation: string,
  args: unknown,
  municipalityId: string,
): Args {
  const input = (args ?? {}) as Args;
  if (!TENANT_SCOPED_MODELS.has(model)) return input;

  if (WHERE_OPERATIONS.has(operation)) {
    return { ...input, where: { ...((input.where as Args | undefined) ?? {}), municipalityId } };
  }
  if (CREATE_OPERATIONS.has(operation)) {
    return { ...input, data: scopeData(model, input.data, municipalityId) };
  }
  if (operation === 'upsert') {
    return {
      ...input,
      where: { ...((input.where as Args | undefined) ?? {}), municipalityId },
      create: scopeData(model, input.create, municipalityId),
    };
  }
  // Fail closed: an operation we do not understand must not bypass isolation.
  throw new Error(`Tenant scope: unsupported operation ${model}.${operation}`);
}

export function tenantScopeExtension(municipalityId: string) {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeTenantArgs(model, operation, args, municipalityId) as typeof args);
        },
      },
    },
  });
}

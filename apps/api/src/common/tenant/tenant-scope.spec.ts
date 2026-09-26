import { readFileSync } from 'node:fs';
import path from 'node:path';
import { scopeTenantArgs, TENANT_SCOPED_MODELS, TENANT_UNSCOPED_EXCEPTIONS } from './tenant-scope';

const MID = '01900000-0000-7000-8000-00000000000a';
const OTHER = '01900000-0000-7000-8000-00000000000b';

describe('tenant scope', () => {
  it('covers every model with a municipalityId column (schema.prisma)', () => {
    const schema = readFileSync(path.resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const tenantModels = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+municipalityId\s/m.test(body))
      .map(([, name]) => name);

    const covered = [...TENANT_SCOPED_MODELS, ...TENANT_UNSCOPED_EXCEPTIONS].sort();
    expect(covered).toEqual(tenantModels.sort());
  });

  it('forces the tenant into filters and overrides a caller-supplied municipality', () => {
    expect(scopeTenantArgs('User', 'findMany', { where: { status: 'ACTIVE' } }, MID)).toEqual({
      where: { status: 'ACTIVE', municipalityId: MID },
    });
    expect(
      scopeTenantArgs('User', 'findUnique', { where: { id: 'u1', municipalityId: OTHER } }, MID),
    ).toEqual({ where: { id: 'u1', municipalityId: MID } });
    expect(scopeTenantArgs('Request', 'count', undefined, MID)).toEqual({
      where: { municipalityId: MID },
    });
    expect(scopeTenantArgs('User', 'update', { where: { id: 'u1' }, data: { x: 1 } }, MID)).toEqual(
      { where: { id: 'u1', municipalityId: MID }, data: { x: 1 } },
    );
  });

  it('stamps the tenant on creates and rejects cross-tenant writes', () => {
    expect(scopeTenantArgs('User', 'create', { data: { email: 'a@b.c' } }, MID)).toEqual({
      data: { email: 'a@b.c', municipalityId: MID },
    });
    expect(scopeTenantArgs('User', 'createMany', { data: [{ a: 1 }, { a: 2 }] }, MID)).toEqual({
      data: [
        { a: 1, municipalityId: MID },
        { a: 2, municipalityId: MID },
      ],
    });
    expect(() =>
      scopeTenantArgs('User', 'create', { data: { municipalityId: OTHER } }, MID),
    ).toThrow(/another municipality/);
    expect(() =>
      scopeTenantArgs('User', 'create', { data: { municipality: { connect: { id: MID } } } }, MID),
    ).toThrow(/municipalityId/);
  });

  it('scopes both sides of an upsert', () => {
    expect(
      scopeTenantArgs('Department', 'upsert', { where: { id: 'd' }, create: {}, update: {} }, MID),
    ).toEqual({
      where: { id: 'd', municipalityId: MID },
      create: { municipalityId: MID },
      update: {},
    });
  });

  it('leaves global models untouched and fails closed on unknown operations', () => {
    const args = { where: { code: 'users.read' } };
    expect(scopeTenantArgs('Permission', 'findMany', args, MID)).toBe(args);
    expect(() => scopeTenantArgs('User', 'somethingNew', {}, MID)).toThrow(/unsupported/);
  });
});

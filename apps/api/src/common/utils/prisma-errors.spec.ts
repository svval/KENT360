import { Prisma } from '../../generated/prisma/client';
import { changedFields, isUniqueViolation, pickFields } from './prisma-errors';

describe('prisma helpers', () => {
  it('recognises unique violations only', () => {
    const unique = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const fk = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: 'x',
    });
    expect(isUniqueViolation(unique)).toBe(true);
    expect(isUniqueViolation(fk)).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });

  it('lists changed fields, ignoring unsent and unchanged ones', () => {
    const current = { name: 'A', code: 'X', description: null as string | null };
    expect(changedFields(current, { name: 'A', description: 'new', code: undefined })).toEqual([
      'description',
    ]);
    expect(pickFields(current, ['name', 'description'])).toEqual({ name: 'A', description: null });
  });
});

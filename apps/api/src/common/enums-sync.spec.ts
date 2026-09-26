import * as Shared from '@kent360/shared-types';
import * as Db from '../generated/prisma/enums';

/**
 * The web/mobile clients use @kent360/shared-types while the API uses Prisma's
 * generated enums. If someone edits one side only, this test fails loudly.
 */
describe('shared enums stay in sync with the Prisma schema', () => {
  const pairs = [
    ['RequestStatus', Shared.RequestStatus, Db.RequestStatus],
    ['WorkOrderStatus', Shared.WorkOrderStatus, Db.WorkOrderStatus],
    ['Priority', Shared.Priority, Db.Priority],
    ['RiskLevel', Shared.RiskLevel, Db.RiskLevel],
    ['RequestSource', Shared.RequestSource, Db.RequestSource],
    ['WorkOrderMediaType', Shared.WorkOrderMediaType, Db.WorkOrderMediaType],
    ['UserStatus', Shared.UserStatus, Db.UserStatus],
  ] as const;

  it.each(pairs)('%s', (_name, shared, db) => {
    expect(Object.values(shared).sort()).toEqual(Object.values(db).sort());
  });
});

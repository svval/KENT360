import { Injectable } from '@nestjs/common';
import { Permission, type SearchResultItem } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { type ListRequestsQueryDto } from '../requests/dto/requests.dto';
import { RequestsService } from '../requests/requests.service';
import { type ListWorkOrdersQueryDto } from '../work-orders/dto/work-orders.dto';
import { WorkOrdersService } from '../work-orders/work-orders.service';

const PER_TYPE = 5;

/**
 * Topbar search. Composed from the request and work order list queries, so it uses
 * exactly their search rules (exact number, number parts, description, address) and –
 * above all – their tenant + object scope. Nothing outside the user's lists is found.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly requests: RequestsService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async search(actor: AuthUser, q: string): Promise<SearchResultItem[]> {
    const canRequests =
      actor.permissions.has(Permission.REQUESTS_READ) ||
      actor.permissions.has(Permission.REQUESTS_READ_OWN);
    const canWorkOrders =
      actor.permissions.has(Permission.WORK_ORDERS_READ) ||
      actor.permissions.has(Permission.WORK_ORDERS_READ_ASSIGNED);
    const page = { page: 1, pageSize: PER_TYPE, search: q };
    const [requests, workOrders] = await Promise.all([
      canRequests ? this.requests.list(actor, page as ListRequestsQueryDto) : null,
      canWorkOrders
        ? this.workOrders
            .context(actor)
            .then((ctx) => this.workOrders.list(ctx, page as ListWorkOrdersQueryDto))
        : null,
    ]);
    return [
      ...(requests?.items ?? []).map((r): SearchResultItem => ({
        type: 'REQUEST',
        id: r.id,
        publicNumber: r.publicNumber,
        title: r.title,
        subtitle: r.address ?? r.neighborhood?.name ?? null,
        status: r.status,
      })),
      ...(workOrders?.items ?? []).map((w): SearchResultItem => ({
        type: 'WORK_ORDER',
        id: w.id,
        publicNumber: w.publicNumber,
        title: w.title,
        subtitle: w.fieldTeam?.name ?? w.department.name,
        status: w.status,
      })),
    ];
  }
}

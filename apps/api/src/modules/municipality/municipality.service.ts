import { Injectable } from '@nestjs/common';
import { AuditAction, type MunicipalityProfile } from '@kent360/shared-types';
import { type Prisma } from '../../generated/prisma/client';
import { type AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { changedFields, pickFields } from '../../common/utils/prisma-errors';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { type UpdateMunicipalityDto } from './dto/update-municipality.dto';

const municipalitySelect = {
  id: true,
  name: true,
  slug: true,
  city: true,
  logoUrl: true,
  primaryColor: true,
  secondaryColor: true,
  contactEmail: true,
  contactPhone: true,
  website: true,
  address: true,
  timezone: true,
  locale: true,
  mapCenterLat: true,
  mapCenterLng: true,
  mapZoom: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MunicipalitySelect;

type MunicipalityRecord = Prisma.MunicipalityGetPayload<{ select: typeof municipalitySelect }>;

function toProfile(m: MunicipalityRecord): MunicipalityProfile {
  return { ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() };
}

/**
 * The caller's own municipality – the tenant itself. There is intentionally no endpoint
 * listing municipalities: a user never learns about other tenants.
 */
@Injectable()
export class MunicipalityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(actor: AuthUser): Promise<MunicipalityProfile> {
    return toProfile(await this.load(actor.municipalityId));
  }

  async update(
    actor: AuthUser,
    dto: UpdateMunicipalityDto,
    meta: RequestMeta,
  ): Promise<MunicipalityProfile> {
    const before = await this.load(actor.municipalityId);
    const changed = changedFields(before, dto as Partial<MunicipalityRecord>);
    if (changed.length === 0) return toProfile(before);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.municipality.update({
        where: { id: actor.municipalityId },
        data: pickFields(dto as Partial<MunicipalityRecord>, changed),
        select: municipalitySelect,
      });
      await this.audit.record(
        {
          action: AuditAction.MUNICIPALITY_UPDATED,
          entityType: 'Municipality',
          entityId: actor.municipalityId,
          municipalityId: actor.municipalityId,
          userId: actor.id,
          before: pickFields(before, changed),
          after: pickFields(updated, changed),
          meta,
        },
        tx,
      );
      return toProfile(updated);
    });
  }

  private async load(id: string): Promise<MunicipalityRecord> {
    const municipality = await this.prisma.municipality.findUnique({
      where: { id },
      select: municipalitySelect,
    });
    if (!municipality) {
      throw AppException.notFound(ErrorCode.MUNICIPALITY_NOT_FOUND, 'Belediye bulunamadı.');
    }
    return municipality;
  }
}

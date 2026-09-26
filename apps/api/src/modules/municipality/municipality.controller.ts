import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type MunicipalityProfile, Permission } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, ReqMeta } from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import { UpdateMunicipalityDto } from './dto/update-municipality.dto';
import { MunicipalityService } from './municipality.service';

@ApiTags('Municipality')
@ApiBearerAuth('access-token')
@Controller('municipality')
export class MunicipalityController {
  constructor(private readonly municipality: MunicipalityService) {}

  @Get()
  @Permissions(Permission.MUNICIPALITY_READ)
  @ApiOperation({ summary: 'Oturumdaki kullanıcının belediye profili ve marka ayarları' })
  get(@CurrentUser() actor: AuthUser): Promise<MunicipalityProfile> {
    return this.municipality.get(actor);
  }

  @Patch()
  @Permissions(Permission.MUNICIPALITY_UPDATE)
  @ApiOperation({ summary: 'Belediye profilini günceller (audit: MUNICIPALITY_UPDATED)' })
  update(
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateMunicipalityDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<MunicipalityProfile> {
    return this.municipality.update(actor, dto, meta);
  }
}

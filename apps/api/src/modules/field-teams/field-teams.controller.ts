import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type FieldStaffCandidate,
  type FieldTeamDetail,
  type FieldTeamSummary,
  type Paginated,
  Permission,
} from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Permissions, ReqMeta } from '../../common/decorators/auth.decorators';
import { type RequestMeta } from '../../common/utils/request-meta';
import {
  CreateFieldTeamDto,
  FieldStaffCandidatesQueryDto,
  ListFieldTeamsQueryDto,
  SetTeamMembersDto,
  UpdateFieldTeamDto,
} from './dto/field-teams.dto';
import { FieldTeamsService } from './field-teams.service';

const uuid = new ParseUUIDPipe();

@ApiTags('Field teams')
@ApiBearerAuth('access-token')
@Controller('field-teams')
export class FieldTeamsController {
  constructor(private readonly teams: FieldTeamsService) {}

  @Get()
  @Permissions(Permission.FIELD_TEAMS_READ)
  @ApiOperation({
    summary: 'Saha ekipleri (sayfalı) – yönetici: tüm belediye · personel: kendi müdürlüğü',
  })
  list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListFieldTeamsQueryDto,
  ): Promise<Paginated<FieldTeamSummary>> {
    return this.teams.list(actor, query);
  }

  @Get('candidates')
  @Permissions(Permission.FIELD_TEAMS_MANAGE)
  @ApiOperation({ summary: 'Müdürlüğün ekiplere eklenebilecek aktif saha personeli' })
  candidates(
    @CurrentUser() actor: AuthUser,
    @Query() query: FieldStaffCandidatesQueryDto,
  ): Promise<FieldStaffCandidate[]> {
    return this.teams.candidates(actor, query.departmentId);
  }

  @Get(':id')
  @Permissions(Permission.FIELD_TEAMS_READ)
  @ApiOperation({ summary: 'Ekip detayı: üyeler, açık ve tamamlanan iş emri sayıları' })
  get(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string): Promise<FieldTeamDetail> {
    return this.teams.get(actor, id);
  }

  @Post()
  @Permissions(Permission.FIELD_TEAMS_MANAGE)
  @ApiOperation({ summary: 'Saha ekibi oluşturur (audit: FIELD_TEAM_CREATED)' })
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateFieldTeamDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<FieldTeamDetail> {
    return this.teams.create(actor, dto, meta);
  }

  @Patch(':id')
  @Permissions(Permission.FIELD_TEAMS_MANAGE)
  @ApiOperation({
    summary: 'Ekip adı / durumu (audit: FIELD_TEAM_UPDATED); açık işi olan ekip pasifleştirilemez',
  })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateFieldTeamDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<FieldTeamDetail> {
    return this.teams.update(actor, id, dto, meta);
  }

  @Put(':id/members')
  @Permissions(Permission.FIELD_TEAMS_MANAGE)
  @ApiOperation({
    summary: 'Üye listesini tümüyle belirler (audit: FIELD_TEAM_MEMBERS_CHANGED)',
    description:
      'Üyeler aynı müdürlükten, aktif ve saha yetkisi olan kullanıcılar olmalı; en fazla bir LEADER. ' +
      'Çıkarılan üyeler silinmez (leftAt).',
  })
  setMembers(
    @CurrentUser() actor: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SetTeamMembersDto,
    @ReqMeta() meta: RequestMeta,
  ): Promise<FieldTeamDetail> {
    return this.teams.setMembers(actor, id, dto, meta);
  }
}

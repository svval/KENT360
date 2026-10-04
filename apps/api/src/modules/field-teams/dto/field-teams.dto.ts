import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldTeamMemberRole, RecordStatus } from '@kent360/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { MAX_TEAM_MEMBERS } from '../domain/team-rules';

const STATUSES = Object.values(RecordStatus);
const ROLES = Object.values(FieldTeamMemberRole);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const FIELD_TEAM_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

export class ListFieldTeamsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Ad veya kod içinde arama' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;
}

export class CreateFieldTeamDto {
  @ApiProperty({ format: 'uuid', description: 'Ekibin bağlı olduğu müdürlük (sonradan değişmez)' })
  @IsUUID()
  departmentId!: string;

  @ApiProperty({ example: 'Fen İşleri – Ekip 1' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'PW_TEAM_1', description: 'Belediye içinde tekil, sonradan değişmez' })
  @Transform(trim)
  @Matches(FIELD_TEAM_CODE_PATTERN, {
    message: 'Kod BÜYÜK_HARF, rakam ve alt çizgiden oluşmalı (ör. PW_TEAM_1).',
  })
  code!: string;
}

/** `code` and `departmentId` are immutable: work orders and history refer to them. */
export class UpdateFieldTeamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: STATUSES, description: 'Silme yerine pasifleştirme' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;
}

export class TeamMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: FieldTeamMemberRole;
}

/** The complete member list (PUT semantics); at most one LEADER. */
export class SetTeamMembersDto {
  @ApiProperty({ type: [TeamMemberDto] })
  @IsArray()
  @ArrayMaxSize(MAX_TEAM_MEMBERS)
  @ValidateNested({ each: true })
  @Type(() => TeamMemberDto)
  members!: TeamMemberDto[];
}

export class FieldStaffCandidatesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  departmentId!: string;
}

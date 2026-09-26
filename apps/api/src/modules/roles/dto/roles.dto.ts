import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_PERMISSIONS, type Permission } from '@kent360/shared-types';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String], enum: ALL_PERMISSIONS })
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions!: Permission[];
}

export class CreateRoleDto extends SetRolePermissionsDto {
  @ApiProperty({
    example: 'PARK_INSPECTOR',
    description: 'UPPER_SNAKE_CASE, belediye içinde tekil',
  })
  @Matches(/^[A-Z][A-Z0-9_]{2,59}$/, {
    message: 'Rol kodu BÜYÜK_HARF_VE_ALT_ÇİZGİ biçiminde olmalı.',
  })
  code!: string;

  @ApiProperty({ example: 'Park Denetçisi' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

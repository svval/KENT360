import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Empty strings clear optional text fields. */
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const TIMEZONES = Intl.supportedValuesOf('timeZone');

/**
 * White-label profile. `slug` (the tenant code) and `status` are platform-level and
 * deliberately not editable here. `null` clears an optional field.
 */
export class UpdateMunicipalityDto {
  @ApiPropertyOptional({ example: 'Şahinbey Belediyesi' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'Gaziantep' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ nullable: true, example: 'https://www.sahinbey.bel.tr/logo.svg' })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  // Rendered as <img src>: only plain web URLs, never data:/javascript: schemes.
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: '#2563EB' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'Renk #RRGGBB biçiminde olmalı.' })
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#0891B2' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'Renk #RRGGBB biçiminde olmalı.' })
  secondaryColor?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin.' })
  @MaxLength(160)
  contactEmail?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+90 342 000 00 00' })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(/^\+?[0-9 ()-]{7,32}$/, { message: 'Telefon numarası geçersiz.' })
  contactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(255)
  website?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ example: 'Europe/Istanbul' })
  @IsOptional()
  @IsIn(TIMEZONES, { message: 'Geçerli bir IANA saat dilimi seçin.' })
  timezone?: string;

  @ApiPropertyOptional({ nullable: true, minimum: -90, maximum: 90 })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  mapCenterLat?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: -180, maximum: 180 })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  mapCenterLng?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 20 })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(1)
  @Max(20)
  mapZoom?: number | null;
}

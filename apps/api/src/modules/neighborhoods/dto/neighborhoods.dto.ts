import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecordStatus } from '@kent360/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { MAX_IMPORT_FEATURES, NEIGHBORHOOD_CODE_PATTERN } from '../domain/geojson';

const STATUSES = Object.values(RecordStatus);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

const GEOMETRY_DOC = {
  description: 'GeoJSON Polygon veya MultiPolygon, WGS84 (EPSG:4326) [boylam, enlem]',
  example: {
    type: 'Polygon',
    coordinates: [
      [
        [37.37, 37.05],
        [37.38, 37.05],
        [37.38, 37.06],
        [37.37, 37.06],
        [37.37, 37.05],
      ],
    ],
  },
};

export class ListNeighborhoodsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Ad veya kod içinde arama' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;
}

export class ResolveNeighborhoodQueryDto {
  @ApiProperty({ minimum: -90, maximum: 90, example: 37.0585 })
  @Type(() => Number)
  @IsNumber({}, { message: 'lat sayı olmalı.' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ minimum: -180, maximum: 180, example: 37.371 })
  @Type(() => Number)
  @IsNumber({}, { message: 'lng sayı olmalı.' })
  @Min(-180)
  @Max(180)
  lng!: number;
}

class NeighborhoodAttributesDto {
  @ApiPropertyOptional({ nullable: true, example: 'Şahinbey' })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(80)
  district?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  population?: number | null;
}

export class CreateNeighborhoodDto extends NeighborhoodAttributesDto {
  @ApiProperty({ example: 'Karataş' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'KARATAS',
    description: 'Belediye içinde tekil, sonradan değiştirilemez',
  })
  @Transform(trim)
  @Matches(NEIGHBORHOOD_CODE_PATTERN, { message: 'Mahalle kodu geçersiz.' })
  code!: string;

  // Shape is validated by the domain validator + ST_IsValid (friendlier errors than DTO rules).
  @ApiProperty(GEOMETRY_DOC)
  @IsObject()
  geometry!: Record<string, unknown>;
}

export class UpdateNeighborhoodDto extends NeighborhoodAttributesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: RecordStatus;

  @ApiPropertyOptional(GEOMETRY_DOC)
  @IsOptional()
  @IsObject()
  geometry?: Record<string, unknown>;
}

/** A GeoJSON FeatureCollection; each feature is validated individually by the service. */
export class ImportNeighborhoodsDto {
  @ApiProperty({ example: 'FeatureCollection' })
  @Equals('FeatureCollection', { message: 'Gövde bir GeoJSON FeatureCollection olmalı.' })
  type!: 'FeatureCollection';

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: `En fazla ${MAX_IMPORT_FEATURES} Feature; properties: name, code, district?, population?`,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'İçe aktarılacak en az bir mahalle olmalı.' })
  @ArrayMaxSize(MAX_IMPORT_FEATURES)
  features!: unknown[];

  // Common members of GIS exports (QGIS, ogr2ogr) – accepted, not stored.
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() crs?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsArray() bbox?: number[];
}

export class ImportQueryDto {
  @ApiPropertyOptional({ description: 'true: yalnızca doğrula, kaydetme' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  dryRun?: boolean;
}

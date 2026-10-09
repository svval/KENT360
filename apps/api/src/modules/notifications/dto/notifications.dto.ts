import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true: yalnızca okunmamışlar' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;
}

import { IsOptional, IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FirmType } from '../../../common/enums/index.js';

export class QueryFirmsDto {
  @ApiPropertyOptional({
    description: 'Full-text search on firm name',
    example: 'Blackstone',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: FirmType,
    description: 'Filter by firm strategy type',
  })
  @IsOptional()
  @IsEnum(FirmType)
  firm_type?: FirmType;

  @ApiPropertyOptional({
    description: 'Minimum AUM in USD (e.g. 1000000000 for $1B)',
    example: 1000000000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_aum?: number;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 25;

  @ApiPropertyOptional({
    enum: ['name', 'aum_usd', 'created_at'],
    description: 'Sort field',
    default: 'name',
  })
  @IsOptional()
  @IsString()
  sort_by?: string = 'name';

  @ApiPropertyOptional({
    enum: ['ASC', 'DESC'],
    description: 'Sort direction',
    default: 'ASC',
  })
  @IsOptional()
  @IsString()
  sort_order?: 'ASC' | 'DESC' = 'ASC';
}

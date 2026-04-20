import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsString,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  OutreachStatus,
  ContactPlatform,
} from '../../../../common/enums/index.js';

export class QueryOutreachDto {
  @ApiPropertyOptional({
    description: 'Search by person name (partial match)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Search by firm name (partial match)',
  })
  @IsOptional()
  @IsString()
  firm_name?: string;

  @ApiPropertyOptional({
    enum: OutreachStatus,
    description: 'Filter by campaign status',
  })
  @IsOptional()
  @IsEnum(OutreachStatus)
  status?: OutreachStatus;

  @ApiPropertyOptional({
    enum: ContactPlatform,
    isArray: true,
    description:
      'Filter campaigns whose contact_platforms include any of the given values. ' +
      'Accepts a single value, repeated query params, or a comma-separated list.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ContactPlatform, { each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string')
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    return [value];
  })
  contact_platforms?: ContactPlatform[];

  @ApiPropertyOptional({
    description: 'Filter by firm UUID',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  firm_id?: string;

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
  @Max(100)
  limit?: number = 25;
}

import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
    description: 'Filter by contact platform',
  })
  @IsOptional()
  @IsEnum(ContactPlatform)
  contact_platform?: ContactPlatform;

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

import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsEnum,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FirmType } from '../../../common/enums/index.js';

export class QueryRankingsDto {
  @ApiPropertyOptional({
    description: 'Score version to rank by (supports A/B comparison)',
    default: 'v1.0',
    example: 'v1.0',
  })
  @IsOptional()
  @IsString()
  score_version?: string = 'v1.0';

  @ApiPropertyOptional({
    enum: FirmType,
    description: 'Filter rankings to a specific firm type',
  })
  @IsOptional()
  @IsEnum(FirmType)
  firm_type?: FirmType;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 50,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

import {
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RoleCategory } from '../../../common/enums/index.js';

export class QueryPeopleDto {
  @ApiPropertyOptional({
    description: 'Full-text search on person name',
    example: 'John',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: RoleCategory,
    description:
      'Filter by role category (e.g. HEAD_OF_DATA, AI_HIRE, SPEAKER)',
  })
  @IsOptional()
  @IsEnum(RoleCategory)
  role_category?: RoleCategory;

  @ApiPropertyOptional({
    description: 'Filter by firm UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
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

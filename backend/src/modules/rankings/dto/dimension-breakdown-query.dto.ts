import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DimensionBreakdownQueryDto {
  @ApiPropertyOptional({
    description: 'Score version to analyze',
    default: 'v1.0',
    example: 'v1.0',
  })
  @IsOptional()
  @IsString()
  score_version?: string = 'v1.0';
}

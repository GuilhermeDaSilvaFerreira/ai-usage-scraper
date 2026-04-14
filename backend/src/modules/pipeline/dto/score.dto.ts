import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ScoreWeightsDto {
  @ApiPropertyOptional({
    description: 'Weight for AI talent density dimension',
    example: 0.2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ai_talent_density?: number;

  @ApiPropertyOptional({
    description: 'Weight for public AI activity dimension',
    example: 0.2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public_ai_activity?: number;

  @ApiPropertyOptional({
    description: 'Weight for AI hiring velocity dimension',
    example: 0.15,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ai_hiring_velocity?: number;

  @ApiPropertyOptional({
    description: 'Weight for thought leadership dimension',
    example: 0.15,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  thought_leadership?: number;

  @ApiPropertyOptional({
    description: 'Weight for vendor partnerships dimension',
    example: 0.15,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vendor_partnerships?: number;

  @ApiPropertyOptional({
    description: 'Weight for portfolio AI strategy dimension',
    example: 0.15,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  portfolio_ai_strategy?: number;
}

class ScoreThresholdsDto {
  @ApiPropertyOptional({
    description: 'Minimum signals required to produce a score',
    example: 3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  min_signals_for_score?: number;

  @ApiPropertyOptional({
    description: 'Confidence threshold for high-quality signals',
    example: 0.7,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  high_confidence_threshold?: number;
}

export class ScoreConfigDto {
  @ApiPropertyOptional({
    description: 'Scoring version label (used for A/B testing)',
    example: 'v1.1',
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({
    description: 'Dimension weights (must sum to 1.0)',
    type: ScoreWeightsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScoreWeightsDto)
  weights?: ScoreWeightsDto;

  @ApiPropertyOptional({
    description: 'Scoring thresholds',
    type: ScoreThresholdsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScoreThresholdsDto)
  thresholds?: ScoreThresholdsDto;
}

export class ScoreResponseDto {
  @ApiProperty({ example: 'Scoring job queued (version: v1.0)' })
  message: string;

  @ApiProperty({ example: '42' })
  job_id: string;

  @ApiProperty({ type: Object })
  config: object;
}

export class RescoreResponseDto {
  @ApiProperty({ example: 'Re-scoring complete (version: v1.1)' })
  message: string;

  @ApiProperty({ example: 100 })
  scored: number;

  @ApiProperty({ example: 0 })
  failed: number;
}

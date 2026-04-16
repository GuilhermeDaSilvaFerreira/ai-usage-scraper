import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FirmType } from '../../../common/enums/index.js';
import type {
  ScoringParametersJson,
  DimensionScoresJson,
} from '../../../common/interfaces/index.js';

export class FirmScoreResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  firm_id: string;

  @ApiProperty()
  score_version: string;

  @ApiProperty()
  overall_score: number;

  @ApiPropertyOptional({ nullable: true, type: Object })
  dimension_scores: DimensionScoresJson | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  rank: number | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  scoring_parameters: ScoringParametersJson | null;

  @ApiProperty()
  signal_count: number;

  @ApiProperty()
  scored_at: Date;

  @ApiProperty()
  created_at: Date;
}

export class FirmResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  website: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  aum_usd: number | null;

  @ApiPropertyOptional({ nullable: true })
  aum_source: string | null;

  @ApiPropertyOptional({ enum: FirmType, nullable: true })
  firm_type: FirmType | null;

  @ApiPropertyOptional({ nullable: true })
  headquarters: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  founded_year: number | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  is_active: boolean;

  @ApiPropertyOptional({ nullable: true })
  last_collected_at: Date | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}

export class FirmDetailResponseDto extends FirmResponseDto {
  @ApiPropertyOptional({ nullable: true, type: () => FirmScoreResponseDto })
  latest_score: FirmScoreResponseDto | null;
}

export class PaginatedFirmsResponseDto {
  @ApiProperty({ type: [FirmResponseDto] })
  items: FirmResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total_pages: number;
}

export class FirmSignalResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  firm_id: string;

  @ApiProperty()
  signal_type: string;

  @ApiProperty({ type: Object })
  signal_data: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  data_source_id: string | null;

  @ApiProperty()
  extraction_method: string;

  @ApiProperty()
  extraction_confidence: number;

  @ApiProperty()
  collected_at: Date;
}

export class PaginatedFirmSignalsResponseDto {
  @ApiProperty({ type: [FirmSignalResponseDto] })
  items: FirmSignalResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

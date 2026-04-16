import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FirmType } from '../../../common/enums/index.js';

export class RankingItemDto {
  @ApiProperty()
  rank: number;

  @ApiProperty({ format: 'uuid' })
  firm_id: string;

  @ApiPropertyOptional({ nullable: true })
  firm_name: string | undefined;

  @ApiPropertyOptional({ enum: FirmType, nullable: true })
  firm_type: FirmType | null | undefined;

  @ApiPropertyOptional({ nullable: true, type: Number })
  aum_usd: number | null | undefined;

  @ApiProperty()
  overall_score: number;

  @ApiPropertyOptional({ nullable: true, type: Object })
  dimension_scores: Record<string, unknown> | null;

  @ApiProperty()
  signal_count: number;

  @ApiProperty()
  score_version: string;

  @ApiProperty()
  scored_at: Date;
}

export class PaginatedRankingsResponseDto {
  @ApiProperty({ type: [RankingItemDto] })
  items: RankingItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total_pages: number;

  @ApiProperty()
  score_version: string;
}

export class DimensionTopFirmDto {
  @ApiProperty({ format: 'uuid' })
  firm_id: string;

  @ApiPropertyOptional({ nullable: true })
  firm_name: string | undefined;

  @ApiProperty()
  dimension_score: number;

  @ApiProperty()
  overall_score: number;
}

export class DimensionBreakdownItemDto {
  @ApiProperty()
  dimension: string;

  @ApiProperty({ type: [DimensionTopFirmDto] })
  top_firms: DimensionTopFirmDto[];
}

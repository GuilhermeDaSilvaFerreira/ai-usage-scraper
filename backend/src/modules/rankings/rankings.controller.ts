import { Controller, Get, Query as QueryDecorator } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RankingsService } from './rankings.service.js';
import {
  QueryRankingsDto,
  DimensionBreakdownQueryDto,
  PaginatedRankingsResponseDto,
  DimensionBreakdownItemDto,
} from './dto/index.js';

@ApiTags('Rankings')
@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get firm AI maturity rankings',
    description:
      'Returns firms ranked by their overall AI maturity score for a given score version. ' +
      'Supports pagination and filtering by firm type (buyout, credit, growth, etc.).',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated ranked list of firms by AI maturity',
    type: PaginatedRankingsResponseDto,
  })
  getRankings(
    @QueryDecorator() query: QueryRankingsDto,
  ): Promise<PaginatedRankingsResponseDto> {
    return this.rankingsService.getRankings(query);
  }

  @Get('dimensions')
  @ApiOperation({
    summary: 'Top firms by scoring dimension',
    description:
      'Returns the top-scoring firms broken down by each individual scoring dimension ' +
      '(AI talent, public activity, hiring, thought leadership, vendor partnerships, portfolio strategy). ' +
      'Useful for understanding which firms lead in specific areas of AI maturity.',
  })
  @ApiResponse({
    status: 200,
    description: 'Top firms per scoring dimension',
    type: [DimensionBreakdownItemDto],
  })
  getDimensionBreakdown(
    @QueryDecorator() query: DimensionBreakdownQueryDto,
  ): Promise<DimensionBreakdownItemDto[]> {
    return this.rankingsService.getDimensionBreakdown(
      query.score_version || 'v1.0',
    );
  }
}

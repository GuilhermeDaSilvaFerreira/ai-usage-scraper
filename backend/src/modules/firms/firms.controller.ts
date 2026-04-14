import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { FirmsService } from './firms.service.js';
import { QueryFirmsDto, FirmSignalsQueryDto } from './dto/index.js';

@ApiTags('Firms')
@Controller('firms')
export class FirmsController {
  constructor(private readonly firmsService: FirmsService) {}

  @Get()
  @ApiOperation({
    summary: 'List firms',
    description:
      'Returns a paginated, filterable list of PE and private credit firms. ' +
      'Supports full-text search on firm name, filtering by firm type and minimum AUM, ' +
      'and sorting by name, AUM, or creation date.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of firms',
  })
  findAll(@Query() query: QueryFirmsDto) {
    return this.firmsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get firm detail',
    description:
      'Returns full firm information including the latest score, dimension breakdown, ' +
      'score evidence, and associated people.',
  })
  @ApiParam({ name: 'id', description: 'Firm UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Firm detail with latest score and evidence',
  })
  @ApiResponse({ status: 404, description: 'Firm not found' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.firmsService.findById(id);
  }

  @Get(':id/signals')
  @ApiOperation({
    summary: 'Get firm signals',
    description:
      'Returns all raw signals extracted for a firm, with pagination. ' +
      'Each signal includes type, extraction method, confidence score, and source reference.',
  })
  @ApiParam({ name: 'id', description: 'Firm UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated list of firm signals' })
  @ApiResponse({ status: 404, description: 'Firm not found' })
  getSignals(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FirmSignalsQueryDto,
  ) {
    return this.firmsService.getSignals(id, query.page || 1, query.limit || 50);
  }

  @Get(':id/scores')
  @ApiOperation({
    summary: 'Get all score versions',
    description:
      'Returns every scoring version computed for a firm. ' +
      'Use this to compare A/B scoring configurations side-by-side.',
  })
  @ApiParam({ name: 'id', description: 'Firm UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Array of score records across all versions',
  })
  @ApiResponse({ status: 404, description: 'Firm not found' })
  getScores(@Param('id', ParseUUIDPipe) id: string) {
    return this.firmsService.getScores(id);
  }

  @Get(':id/scores/:version')
  @ApiOperation({
    summary: 'Get specific score version with evidence',
    description:
      'Returns a single score version with the full evidence chain — every data point ' +
      'that contributed to each dimension score, with source URLs and confidence levels.',
  })
  @ApiParam({ name: 'id', description: 'Firm UUID', format: 'uuid' })
  @ApiParam({
    name: 'version',
    description: 'Score version label (e.g. "v1.0", "v1.1")',
    example: 'v1.0',
  })
  @ApiResponse({
    status: 200,
    description: 'Score record with full evidence chain',
  })
  @ApiResponse({ status: 404, description: 'Score version not found' })
  getScoreByVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version') version: string,
  ) {
    return this.firmsService.getScoreByVersion(id, version);
  }
}

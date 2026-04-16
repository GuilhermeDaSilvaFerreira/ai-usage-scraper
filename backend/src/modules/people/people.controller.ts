import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { PeopleService } from './people.service.js';
import {
  QueryPeopleDto,
  PersonResponseDto,
  PaginatedPeopleResponseDto,
} from './dto/index.js';

@ApiTags('People')
@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  @ApiOperation({
    summary: 'List people across all firms',
    description:
      'Returns a paginated list of people involved in AI/tech across all firms. ' +
      'Supports full-text search, filtering by role category (e.g. HEAD_OF_DATA, AI_HIRE) ' +
      'and by firm UUID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of people with firm association',
    type: PaginatedPeopleResponseDto,
  })
  findAll(@Query() query: QueryPeopleDto): Promise<PaginatedPeopleResponseDto> {
    return this.peopleService.findAll(query);
  }
}

@ApiTags('People')
@Controller('firms/:firmId/people')
export class FirmPeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  @ApiOperation({
    summary: 'Get people at a specific firm',
    description:
      'Returns all people associated with a given firm who are relevant to AI/tech. ' +
      'Includes role category, title, LinkedIn URL (if available), and extraction confidence.',
  })
  @ApiParam({
    name: 'firmId',
    description: 'Firm UUID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'List of people at the firm',
    type: [PersonResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Firm not found' })
  findByFirm(
    @Param('firmId', ParseUUIDPipe) firmId: string,
  ): Promise<PersonResponseDto[]> {
    return this.peopleService.findByFirm(firmId);
  }
}

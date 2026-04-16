import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { OutreachService } from './outreach.service.js';
import { OutreachMessageService } from './outreach-message.service.js';
import {
  CreateOutreachDto,
  UpdateOutreachDto,
  QueryOutreachDto,
  OutreachCampaignResponseDto,
  PaginatedOutreachResponseDto,
  OutreachStatsResponseDto,
} from './dto/index.js';

@ApiTags('Outreach')
@Controller('outreach')
export class OutreachController {
  constructor(
    private readonly outreachService: OutreachService,
    private readonly outreachMessageService: OutreachMessageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List outreach campaigns with filters' })
  @ApiResponse({
    status: 200,
    description: 'Paginated campaign list',
    type: PaginatedOutreachResponseDto,
  })
  findAll(
    @Query() query: QueryOutreachDto,
  ): Promise<PaginatedOutreachResponseDto> {
    return this.outreachService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Aggregate campaign counts by status' })
  @ApiResponse({
    status: 200,
    description: 'Status counts',
    type: OutreachStatsResponseDto,
  })
  getStats(): Promise<Record<string, number>> {
    return this.outreachService.getStats();
  }

  @Get('firms/:firmId')
  @ApiOperation({ summary: 'List campaigns for a specific firm' })
  @ApiParam({ name: 'firmId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Campaigns for the firm',
    type: [OutreachCampaignResponseDto],
  })
  findByFirm(
    @Param('firmId', ParseUUIDPipe) firmId: string,
  ): Promise<OutreachCampaignResponseDto[]> {
    return this.outreachService.findByFirm(firmId);
  }

  @Get('people/:personId/campaign')
  @ApiOperation({ summary: 'Get the outreach campaign for a person' })
  @ApiParam({ name: 'personId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Campaign for the person',
    type: OutreachCampaignResponseDto,
  })
  @ApiResponse({ status: 404, description: 'No campaign found' })
  findByPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
  ): Promise<OutreachCampaignResponseDto> {
    return this.outreachService.findByPerson(personId);
  }

  @Post(':id/generate-message')
  @ApiOperation({
    summary: 'Generate a fresh outreach message via LLM for a campaign',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Updated campaign with generated message',
    type: OutreachCampaignResponseDto,
  })
  generateOutreachMessage(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OutreachCampaignResponseDto> {
    return this.outreachMessageService.generateOutreachMessage(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single campaign by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Campaign detail',
    type: OutreachCampaignResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OutreachCampaignResponseDto> {
    return this.outreachService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new outreach campaign' })
  @ApiBody({ type: CreateOutreachDto })
  @ApiResponse({
    status: 201,
    description: 'Campaign created',
    type: OutreachCampaignResponseDto,
  })
  create(@Body() dto: CreateOutreachDto): Promise<OutreachCampaignResponseDto> {
    return this.outreachService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update campaign status, notes, platform, or message',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateOutreachDto })
  @ApiResponse({
    status: 200,
    description: 'Campaign updated',
    type: OutreachCampaignResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOutreachDto,
  ): Promise<OutreachCampaignResponseDto> {
    return this.outreachService.update(id, dto);
  }
}

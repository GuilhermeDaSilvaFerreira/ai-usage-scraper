import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ScrapeJobMetadataJson } from '../../../common/interfaces/index.js';

class QueueCountsDto {
  @ApiProperty({ example: 5 })
  waiting: number;

  @ApiProperty({ example: 2 })
  active: number;

  @ApiProperty({ example: 100 })
  completed: number;

  @ApiProperty({ example: 1 })
  failed: number;

  @ApiProperty({ example: 0 })
  delayed: number;
}

class QueuesDto {
  @ApiProperty({ type: QueueCountsDto })
  seeding: QueueCountsDto;

  @ApiProperty({ type: QueueCountsDto })
  signal_collection: QueueCountsDto;

  @ApiProperty({ type: QueueCountsDto })
  people_collection: QueueCountsDto;

  @ApiProperty({ type: QueueCountsDto })
  extraction: QueueCountsDto;

  @ApiProperty({ type: QueueCountsDto })
  scoring: QueueCountsDto;

  @ApiProperty({ type: QueueCountsDto })
  outreach_campaigns: QueueCountsDto;
}

class RecentJobDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'collection' })
  type: string;

  @ApiProperty({ example: 'completed' })
  status: string;

  @ApiPropertyOptional({ example: 'Blackstone', nullable: true })
  firm_name: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  started_at: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completed_at: Date | null;

  @ApiPropertyOptional({ nullable: true })
  error_message: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata: ScrapeJobMetadataJson | null;
}

export class StatusResponseDto {
  @ApiProperty({ type: QueuesDto })
  queues: QueuesDto;

  @ApiProperty({ type: [RecentJobDto] })
  recent_jobs: RecentJobDto[];
}

import { ApiProperty } from '@nestjs/swagger';

export class CollectSingleResponseDto {
  @ApiProperty({ example: 'Collection jobs queued for firm 550e8400-...' })
  message: string;

  @ApiProperty({ example: '42' })
  signal_job_id: string;

  @ApiProperty({ example: '43' })
  people_job_id: string;
}

export class CollectBatchResponseDto {
  @ApiProperty({ example: 'Queued collection for 1000 firms' })
  message: string;

  @ApiProperty({ example: 1000, description: 'Number of firms queued' })
  firm_count: number;

  @ApiProperty({
    example: 1000,
    description: 'Signal collection jobs queued',
  })
  signal_job_count: number;

  @ApiProperty({
    example: 1000,
    description: 'People collection jobs queued',
  })
  people_job_count: number;
}

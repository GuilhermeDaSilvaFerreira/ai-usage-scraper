import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SeedRequestDto {
  @ApiProperty({
    description:
      'Desired total number of firms in the DB. If the DB already has this many, no work is done.',
    example: 1000,
  })
  @IsNumber()
  @Min(1)
  target_firm_count: number;
}

export class SeedResponseDto {
  @ApiProperty({
    example: 'Seeding job queued (target: 1000 total firms in DB)',
  })
  message: string;

  @ApiProperty({ example: '42' })
  job_id: string;

  @ApiProperty({ example: 1000 })
  target_firm_count: number;
}

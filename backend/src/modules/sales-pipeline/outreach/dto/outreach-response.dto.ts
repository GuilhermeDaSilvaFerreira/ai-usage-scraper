import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OutreachStatus,
  ContactPlatform,
} from '../../../../common/enums/index.js';

export class OutreachCampaignResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  firm_id: string;

  @ApiProperty({ format: 'uuid' })
  person_id: string;

  @ApiProperty({ enum: OutreachStatus })
  status: OutreachStatus;

  @ApiProperty({
    enum: ContactPlatform,
    isArray: true,
    description: 'Communication channels used to reach the person',
  })
  contact_platforms: ContactPlatform[];

  @ApiPropertyOptional({ nullable: true })
  contacted_by: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true })
  outreach_message: string | null;

  @ApiPropertyOptional({ nullable: true })
  first_contact_at: Date | null;

  @ApiPropertyOptional({ nullable: true })
  last_status_change_at: Date | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}

export class PaginatedOutreachResponseDto {
  @ApiProperty({ type: [OutreachCampaignResponseDto] })
  items: OutreachCampaignResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total_pages: number;
}

export class OutreachStatsResponseDto {
  @ApiProperty({ type: Number, description: 'not_contacted count' })
  not_contacted: number;

  @ApiProperty({ type: Number, description: 'first_contact_sent count' })
  first_contact_sent: number;

  @ApiProperty({ type: Number, description: 'follow_up_sent count' })
  follow_up_sent: number;

  @ApiProperty({ type: Number, description: 'replied count' })
  replied: number;

  @ApiProperty({ type: Number, description: 'under_negotiation count' })
  under_negotiation: number;

  @ApiProperty({ type: Number, description: 'declined count' })
  declined: number;

  @ApiProperty({ type: Number, description: 'closed_won count' })
  closed_won: number;

  @ApiProperty({ type: Number, description: 'closed_lost count' })
  closed_lost: number;
}

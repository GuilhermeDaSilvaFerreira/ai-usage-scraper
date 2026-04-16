import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  OutreachStatus,
  ContactPlatform,
} from '../../../../common/enums/index.js';

export class UpdateOutreachDto {
  @ApiPropertyOptional({
    enum: OutreachStatus,
    description: 'New campaign status',
  })
  @IsOptional()
  @IsEnum(OutreachStatus)
  status?: OutreachStatus;

  @ApiPropertyOptional({
    enum: ContactPlatform,
    description: 'Communication channel',
  })
  @IsOptional()
  @IsEnum(ContactPlatform)
  contact_platform?: ContactPlatform;

  @ApiPropertyOptional({ description: 'Analyst handling the outreach' })
  @IsOptional()
  @IsString()
  contacted_by?: string;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Outreach message body' })
  @IsOptional()
  @IsString()
  outreach_message?: string;
}

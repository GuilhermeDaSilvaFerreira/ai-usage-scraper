import { IsEnum, IsString, IsOptional, IsArray } from 'class-validator';
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
    isArray: true,
    description: 'Communication channels used to reach the person',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ContactPlatform, { each: true })
  contact_platforms?: ContactPlatform[];

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

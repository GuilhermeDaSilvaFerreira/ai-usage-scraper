import { IsUUID, IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactPlatform } from '../../../../common/enums/index.js';

export class CreateOutreachDto {
  @ApiProperty({ description: 'Firm UUID', format: 'uuid' })
  @IsUUID()
  firm_id!: string;

  @ApiProperty({ description: 'Person UUID', format: 'uuid' })
  @IsUUID()
  person_id!: string;

  @ApiPropertyOptional({ description: 'Analyst handling the outreach' })
  @IsOptional()
  @IsString()
  contacted_by?: string;

  @ApiPropertyOptional({
    enum: ContactPlatform,
    description: 'Communication channel',
  })
  @IsOptional()
  @IsEnum(ContactPlatform)
  contact_platform?: ContactPlatform;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleCategory } from '../../../common/enums/index.js';

export class PersonResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  firm_id: string;

  @ApiProperty()
  full_name: string;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiProperty({ enum: RoleCategory })
  role_category: RoleCategory;

  @ApiPropertyOptional({ nullable: true })
  linkedin_url: string | null;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiPropertyOptional({ nullable: true })
  bio: string | null;

  @ApiProperty()
  confidence: number;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}

export class PaginatedPeopleResponseDto {
  @ApiProperty({ type: [PersonResponseDto] })
  items: PersonResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total_pages: number;
}

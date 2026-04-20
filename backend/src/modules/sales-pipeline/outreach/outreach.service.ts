import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutreachCampaign } from '../../../database/entities/outreach-campaign.entity.js';
import { Person } from '../../../database/entities/person.entity.js';
import { OutreachStatus } from '../../../common/enums/index.js';
import { CreateOutreachDto } from './dto/create-outreach.dto.js';
import { UpdateOutreachDto } from './dto/update-outreach.dto.js';
import { QueryOutreachDto } from './dto/query-outreach.dto.js';

@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(
    @InjectRepository(OutreachCampaign)
    private readonly campaignRepo: Repository<OutreachCampaign>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
  ) {}

  async findAll(query: QueryOutreachDto) {
    const qb = this.campaignRepo
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.firm', 'firm')
      .leftJoinAndSelect('campaign.person', 'person');

    if (query.search) {
      qb.andWhere('person.full_name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.firm_name) {
      qb.andWhere('firm.name ILIKE :firmName', {
        firmName: `%${query.firm_name}%`,
      });
    }
    if (query.status) {
      qb.andWhere('campaign.status = :status', { status: query.status });
    }
    if (query.contact_platforms && query.contact_platforms.length > 0) {
      qb.andWhere('campaign.contact_platforms && :platforms', {
        platforms: query.contact_platforms,
      });
    }
    if (query.firm_id) {
      qb.andWhere('campaign.firm_id = :firmId', { firmId: query.firm_id });
    }

    qb.orderBy('campaign.updated_at', 'DESC');

    const page = query.page || 1;
    const limit = query.limit || 25;
    qb.skip((page - 1) * limit).take(limit);

    try {
      const [items, total] = await qb.getManyAndCount();
      return {
        items,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Failed to list outreach campaigns', {
        error: error.message,
      });
      throw new InternalServerErrorException(
        'Failed to list outreach campaigns',
      );
    }
  }

  async findByFirm(firmId: string) {
    try {
      return await this.campaignRepo.find({
        where: { firm_id: firmId },
        relations: ['person'],
        order: { updated_at: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Failed to list campaigns for firm ${firmId}`, {
        error: error.message,
      });
      throw new InternalServerErrorException(
        'Failed to list campaigns for firm',
      );
    }
  }

  async findByPerson(personId: string) {
    const campaign = await this.campaignRepo.findOne({
      where: { person_id: personId },
      relations: ['firm', 'person'],
      order: { created_at: 'DESC' },
    });
    if (!campaign) {
      throw new NotFoundException(
        `No outreach campaign found for person ${personId}`,
      );
    }
    return campaign;
  }

  async findOne(id: string) {
    const campaign = await this.campaignRepo.findOne({
      where: { id },
      relations: ['firm', 'person'],
    });
    if (!campaign) {
      throw new NotFoundException(`Outreach campaign ${id} not found`);
    }
    return campaign;
  }

  async create(dto: CreateOutreachDto) {
    const campaign = this.campaignRepo.create({
      firm_id: dto.firm_id,
      person_id: dto.person_id,
      contacted_by: dto.contacted_by ?? null,
      contact_platforms: dto.contact_platforms ?? [],
      notes: dto.notes ?? null,
      status: OutreachStatus.NOT_CONTACTED,
    });

    const saved = await this.campaignRepo.save(campaign);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateOutreachDto) {
    const campaign = await this.findOne(id);

    if (dto.status !== undefined) {
      campaign.status = dto.status;
      campaign.last_status_change_at = new Date();

      if (
        dto.status === OutreachStatus.FIRST_CONTACT_SENT &&
        !campaign.first_contact_at
      ) {
        campaign.first_contact_at = new Date();
      }
    }
    if (dto.contact_platforms !== undefined) {
      campaign.contact_platforms = dto.contact_platforms;
    }
    if (dto.contacted_by !== undefined && !campaign.contacted_by) {
      campaign.contacted_by = dto.contacted_by;
    }
    if (dto.notes !== undefined) {
      campaign.notes = dto.notes;
    }
    if (dto.outreach_message !== undefined) {
      campaign.outreach_message = dto.outreach_message;
    }

    await this.campaignRepo.save(campaign);
    return this.findOne(id);
  }

  async createDefaultCampaignsForFirm(firmId: string): Promise<number> {
    const people = await this.personRepo.find({
      where: { firm_id: firmId },
    });

    if (people.length === 0) return 0;

    const existingCampaigns = await this.campaignRepo.find({
      where: { firm_id: firmId },
      select: ['person_id'],
    });
    const existingPersonIds = new Set(
      existingCampaigns.map((c) => c.person_id),
    );

    const newCampaigns = people
      .filter((p) => !existingPersonIds.has(p.id))
      .map((p) =>
        this.campaignRepo.create({
          firm_id: firmId,
          person_id: p.id,
          status: OutreachStatus.NOT_CONTACTED,
          contacted_by: null,
        }),
      );

    if (newCampaigns.length > 0) {
      await this.campaignRepo.save(newCampaigns);
      this.logger.log(
        `Created ${newCampaigns.length} default outreach campaigns for firm ${firmId}`,
      );
    }

    return newCampaigns.length;
  }

  async getStats() {
    const rows: { status: OutreachStatus; count: string }[] =
      await this.campaignRepo
        .createQueryBuilder('campaign')
        .select('campaign.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('campaign.status')
        .getRawMany();

    const stats: Record<string, number> = {};
    for (const value of Object.values(OutreachStatus)) {
      stats[value] = 0;
    }
    for (const row of rows) {
      stats[row.status] = parseInt(row.count, 10);
    }

    return stats;
  }
}

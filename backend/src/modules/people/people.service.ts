import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Person } from '../../database/entities/person.entity.js';
import { QueryPeopleDto } from './dto/query-people.dto.js';

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
  ) {}

  async findAll(query: QueryPeopleDto) {
    const qb = this.personRepo
      .createQueryBuilder('person')
      .leftJoinAndSelect('person.firm', 'firm')
      .leftJoinAndSelect('person.data_source', 'data_source');

    if (query.search) {
      qb.andWhere('person.full_name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.role_category) {
      qb.andWhere('person.role_category = :role', {
        role: query.role_category,
      });
    }
    if (query.firm_id) {
      qb.andWhere('person.firm_id = :firmId', { firmId: query.firm_id });
    }

    qb.orderBy('person.full_name', 'ASC');

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
      this.logger.error('Failed to list people', {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to list people');
    }
  }

  async findByFirm(firmId: string) {
    try {
      return await this.personRepo.find({
        where: { firm_id: firmId },
        relations: ['data_source'],
        order: { role_category: 'ASC', full_name: 'ASC' },
      });
    } catch (error) {
      this.logger.error(`Failed to list people for firm ${firmId}`, {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to list people for firm');
    }
  }
}

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Firm } from '../../database/entities/firm.entity.js';
import { FirmSignal } from '../../database/entities/firm-signal.entity.js';
import { FirmScore } from '../../database/entities/firm-score.entity.js';
import { QueryFirmsDto } from './dto/query-firms.dto.js';

const SORT_FIELD_MAP: Record<string, string> = {
  name: 'firm.name',
  aum_usd: 'firm.aum_usd',
  created_at: 'firm.created_at',
};

@Injectable()
export class FirmsService {
  private readonly logger = new Logger(FirmsService.name);

  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(FirmSignal)
    private readonly signalRepo: Repository<FirmSignal>,
    @InjectRepository(FirmScore)
    private readonly scoreRepo: Repository<FirmScore>,
  ) {}

  async findAll(query: QueryFirmsDto) {
    const qb = this.firmRepo.createQueryBuilder('firm');

    if (query.search) {
      qb.andWhere('firm.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.firm_type) {
      qb.andWhere('firm.firm_type = :firmType', { firmType: query.firm_type });
    }
    if (query.min_aum) {
      qb.andWhere('firm.aum_usd >= :minAum', { minAum: query.min_aum });
    }

    const sortField = SORT_FIELD_MAP[query.sort_by || ''] || 'firm.name';
    qb.orderBy(sortField, query.sort_order || 'ASC');

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
      this.logger.error('Failed to list firms', {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to list firms');
    }
  }

  async findById(id: string) {
    try {
      const firm = await this.firmRepo.findOne({
        where: { id },
        relations: ['aliases', 'people', 'scores'],
      });
      if (!firm) throw new NotFoundException(`Firm ${id} not found`);

      const latestScore = await this.scoreRepo.findOne({
        where: { firm_id: id },
        order: { scored_at: 'DESC' },
        relations: ['evidence'],
      });

      return { ...firm, latest_score: latestScore };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to load firm ${id}`, {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to load firm');
    }
  }

  async getSignals(firmId: string, page = 1, limit = 50) {
    try {
      const [items, total] = await this.signalRepo.findAndCount({
        where: { firm_id: firmId },
        relations: ['data_source'],
        order: { collected_at: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { items, total, page, limit };
    } catch (error) {
      this.logger.error(`Failed to load signals for firm ${firmId}`, {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to load firm signals');
    }
  }

  async getScores(firmId: string) {
    try {
      return await this.scoreRepo.find({
        where: { firm_id: firmId },
        order: { scored_at: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Failed to load scores for firm ${firmId}`, {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to load firm scores');
    }
  }

  async getScoreByVersion(firmId: string, version: string) {
    try {
      const score = await this.scoreRepo.findOne({
        where: { firm_id: firmId, score_version: version },
        relations: ['evidence', 'evidence.signal'],
      });
      if (!score)
        throw new NotFoundException(
          `Score version ${version} not found for firm ${firmId}`,
        );
      return score;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to load score ${version} for firm ${firmId}`, {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to load firm score');
    }
  }
}

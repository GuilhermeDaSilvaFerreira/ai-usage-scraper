import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FirmScore } from '../../database/entities/firm-score.entity.js';
import { DIMENSION_SCORE_KEYS } from '../../common/interfaces/index.js';
import { QueryRankingsDto } from './dto/query-rankings.dto.js';

@Injectable()
export class RankingsService {
  private readonly logger = new Logger(RankingsService.name);

  constructor(
    @InjectRepository(FirmScore)
    private readonly scoreRepo: Repository<FirmScore>,
  ) {}

  async getRankings(query: QueryRankingsDto) {
    const qb = this.scoreRepo
      .createQueryBuilder('score')
      .leftJoinAndSelect('score.firm', 'firm')
      .where('score.score_version = :version', {
        version: query.score_version || 'v1.0',
      })
      .andWhere('firm.is_active = true');

    if (query.firm_type) {
      qb.andWhere('firm.firm_type = :firmType', {
        firmType: query.firm_type,
      });
    }

    qb.orderBy('score.overall_score', 'DESC');

    const page = query.page || 1;
    const limit = query.limit || 50;
    qb.skip((page - 1) * limit).take(limit);

    try {
      const [items, total] = await qb.getManyAndCount();

      return {
        items: items.map((score, idx) => ({
          rank: (page - 1) * limit + idx + 1,
          firm_id: score.firm_id,
          firm_name: score.firm?.name,
          firm_type: score.firm?.firm_type,
          aum_usd: score.firm?.aum_usd,
          overall_score: score.overall_score,
          dimension_scores: score.dimension_scores,
          signal_count: score.signal_count,
          score_version: score.score_version,
          scored_at: score.scored_at,
        })),
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
        score_version: query.score_version || 'v1.0',
      };
    } catch (error) {
      this.logger.error('Failed to load rankings', {
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException('Failed to load rankings');
    }
  }

  async getDimensionBreakdown(scoreVersion = 'v1.0') {
    try {
      const scores = await this.scoreRepo.find({
        where: { score_version: scoreVersion },
        relations: ['firm'],
        order: { overall_score: 'DESC' },
        take: 100,
      });

      return DIMENSION_SCORE_KEYS.map((dim) => ({
        dimension: dim,
        top_firms: scores
          .filter((s) => s.dimension_scores?.[dim])
          .sort(
            (a, b) =>
              b.dimension_scores?.[dim]?.raw_score ??
              0 - (a.dimension_scores?.[dim]?.raw_score ?? 0),
          )
          .slice(0, 10)
          .map((s) => ({
            firm_id: s.firm_id,
            firm_name: s.firm?.name,
            dimension_score: s.dimension_scores?.[dim]?.raw_score ?? 0,
            overall_score: s.overall_score,
          })),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to load dimension breakdown for ${scoreVersion}`,
        { error: error.message, stack: error.stack },
      );
      throw new InternalServerErrorException(
        'Failed to load dimension breakdown',
      );
    }
  }
}

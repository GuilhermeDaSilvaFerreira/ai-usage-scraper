import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RankingsService } from './rankings.service';
import { FirmScore } from '../../database/entities/firm-score.entity';

const mockQueryBuilder = {
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
};

const mockScoreRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  find: jest.fn(),
};

describe('RankingsService', () => {
  let service: RankingsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RankingsService,
        { provide: getRepositoryToken(FirmScore), useValue: mockScoreRepo },
      ],
    }).compile();

    service = module.get(RankingsService);
    jest.clearAllMocks();
    mockScoreRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('getRankings', () => {
    const makeScore = (idx: number) => ({
      firm_id: `firm-${idx}`,
      firm: {
        name: `Firm ${idx}`,
        firm_type: 'hedge_fund',
        aum_usd: 1_000_000 * idx,
      },
      overall_score: 100 - idx,
      dimension_scores: {},
      signal_count: 10 + idx,
      score_version: 'v1.0',
      scored_at: new Date('2025-01-01'),
    });

    it('returns ranked items with default score_version v1.0', async () => {
      const scores = [makeScore(1), makeScore(2)];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([scores, 2]);

      const result = await service.getRankings({});

      expect(mockScoreRepo.createQueryBuilder).toHaveBeenCalledWith('score');
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'score.firm',
        'firm',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'score.score_version = :version',
        { version: 'v1.0' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'firm.is_active = true',
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'score.overall_score',
        'DESC',
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].rank).toBe(1);
      expect(result.items[1].rank).toBe(2);
      expect(result.items[0].firm_name).toBe('Firm 1');
      expect(result.score_version).toBe('v1.0');
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.total_pages).toBe(1);
    });

    it('computes correct rank offset on page > 1', async () => {
      const scores = [makeScore(1)];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([scores, 51]);

      const result = await service.getRankings({ page: 2, limit: 50 });

      expect(result.items[0].rank).toBe(51);
    });

    it('applies custom score_version', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getRankings({ score_version: 'v2.0' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'score.score_version = :version',
        { version: 'v2.0' },
      );
      expect(result.score_version).toBe('v2.0');
    });

    it('applies firm_type filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getRankings({ firm_type: 'hedge_fund' as any });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'firm.firm_type = :firmType',
        { firmType: 'hedge_fund' },
      );
    });

    it('does not filter by firm_type when not provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getRankings({});

      const firmTypeCalls = mockQueryBuilder.andWhere.mock.calls.filter(
        (call: any[]) => call[0] === 'firm.firm_type = :firmType',
      );
      expect(firmTypeCalls).toHaveLength(0);
    });

    it('applies firm_name filter (ILIKE)', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getRankings({ firm_name: 'Black' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'firm.name ILIKE :firmName',
        { firmName: '%Black%' },
      );
    });

    it('does not apply firm_name filter when blank', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getRankings({ firm_name: '   ' });

      const nameCalls = mockQueryBuilder.andWhere.mock.calls.filter(
        (call: any[]) => call[0] === 'firm.name ILIKE :firmName',
      );
      expect(nameCalls).toHaveLength(0);
    });

    it('maps score fields correctly in result items', async () => {
      const score = makeScore(1);
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[score], 1]);

      const result = await service.getRankings({});

      expect(result.items[0]).toEqual({
        rank: 1,
        firm_id: score.firm_id,
        firm_name: score.firm.name,
        firm_type: score.firm.firm_type,
        aum_usd: score.firm.aum_usd,
        overall_score: score.overall_score,
        dimension_scores: score.dimension_scores,
        signal_count: score.signal_count,
        score_version: score.score_version,
        scored_at: score.scored_at,
      });
    });

    it('handles score with null firm gracefully', async () => {
      const score = {
        ...makeScore(1),
        firm: undefined,
      };
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[score], 1]);

      const result = await service.getRankings({});

      expect(result.items[0].firm_name).toBeUndefined();
      expect(result.items[0].firm_type).toBeUndefined();
      expect(result.items[0].aum_usd).toBeUndefined();
    });

    it('paginates with custom page and limit', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 200]);

      const result = await service.getRankings({ page: 3, limit: 20 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(40);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result).toMatchObject({
        total: 200,
        page: 3,
        limit: 20,
        total_pages: 10,
      });
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockQueryBuilder.getManyAndCount.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(service.getRankings({})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getDimensionBreakdown', () => {
    const EXPECTED_DIMENSIONS = [
      'ai_talent_density',
      'public_ai_activity',
      'ai_hiring_velocity',
      'thought_leadership',
      'vendor_partnerships',
      'portfolio_ai_strategy',
    ];

    it('returns breakdown for all six dimensions', async () => {
      const scores = [
        {
          firm_id: 'f1',
          firm: { name: 'Alpha' },
          overall_score: 90,
          dimension_scores: {
            ai_talent_density: { raw_score: 8 },
            public_ai_activity: { raw_score: 7 },
            ai_hiring_velocity: { raw_score: 6 },
            thought_leadership: { raw_score: 5 },
            vendor_partnerships: { raw_score: 4 },
            portfolio_ai_strategy: { raw_score: 3 },
          },
        },
      ];
      mockScoreRepo.find.mockResolvedValue(scores);

      const result = await service.getDimensionBreakdown('v1.0');

      expect(mockScoreRepo.find).toHaveBeenCalledWith({
        where: { score_version: 'v1.0' },
        relations: ['firm'],
        order: { overall_score: 'DESC' },
        take: 100,
      });
      expect(result).toHaveLength(6);
      expect(result.map((d: any) => d.dimension)).toEqual(EXPECTED_DIMENSIONS);
    });

    it('uses default score version v1.0', async () => {
      mockScoreRepo.find.mockResolvedValue([]);

      await service.getDimensionBreakdown();

      expect(mockScoreRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { score_version: 'v1.0' },
        }),
      );
    });

    it('includes top_firms with correct fields', async () => {
      const scores = [
        {
          firm_id: 'f1',
          firm: { name: 'Alpha' },
          overall_score: 95,
          dimension_scores: { ai_talent_density: { raw_score: 9 } },
        },
        {
          firm_id: 'f2',
          firm: { name: 'Beta' },
          overall_score: 80,
          dimension_scores: { ai_talent_density: { raw_score: 7 } },
        },
      ];
      mockScoreRepo.find.mockResolvedValue(scores);

      const result = await service.getDimensionBreakdown('v1.0');
      const talentDim = result.find(
        (d: any) => d.dimension === 'ai_talent_density',
      );

      expect(talentDim?.top_firms).toHaveLength(2);
      expect(talentDim?.top_firms?.[0]).toEqual(
        expect.objectContaining({
          firm_id: expect.any(String),
          firm_name: expect.any(String),
          dimension_score: expect.any(Number),
          overall_score: expect.any(Number),
        }),
      );
    });

    it('filters out scores missing dimension data', async () => {
      const scores = [
        {
          firm_id: 'f1',
          firm: { name: 'Alpha' },
          overall_score: 95,
          dimension_scores: { ai_talent_density: { raw_score: 9 } },
        },
        {
          firm_id: 'f2',
          firm: { name: 'Beta' },
          overall_score: 80,
          dimension_scores: {},
        },
      ];
      mockScoreRepo.find.mockResolvedValue(scores);

      const result = await service.getDimensionBreakdown('v1.0');
      const talentDim = result.find(
        (d: any) => d.dimension === 'ai_talent_density',
      );

      expect(talentDim?.top_firms).toHaveLength(1);
      expect(talentDim?.top_firms?.[0].firm_name).toBe('Alpha');
    });

    it('limits top_firms to 10 per dimension', async () => {
      const scores = Array.from({ length: 15 }, (_, i) => ({
        firm_id: `f${i}`,
        firm: { name: `Firm ${i}` },
        overall_score: 100 - i,
        dimension_scores: { ai_talent_density: { raw_score: 100 - i } },
      }));
      mockScoreRepo.find.mockResolvedValue(scores);

      const result = await service.getDimensionBreakdown('v1.0');
      const talentDim = result.find(
        (d: any) => d.dimension === 'ai_talent_density',
      );

      expect(talentDim?.top_firms).toHaveLength(10);
    });

    it('returns empty top_firms when no scores exist', async () => {
      mockScoreRepo.find.mockResolvedValue([]);

      const result = await service.getDimensionBreakdown('v1.0');

      result.forEach((dim: any) => {
        expect(dim.top_firms).toEqual([]);
      });
    });

    it('handles null dimension_scores gracefully', async () => {
      const scores = [
        {
          firm_id: 'f1',
          firm: { name: 'Alpha' },
          overall_score: 80,
          dimension_scores: null,
        },
      ];
      mockScoreRepo.find.mockResolvedValue(scores);

      const result = await service.getDimensionBreakdown('v1.0');

      result.forEach((dim: any) => {
        expect(dim.top_firms).toEqual([]);
      });
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockScoreRepo.find.mockRejectedValue(new Error('db error'));

      await expect(service.getDimensionBreakdown('v1.0')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});

import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FirmsService } from './firms.service';
import { Firm } from '../../database/entities/firm.entity';
import { FirmSignal } from '../../database/entities/firm-signal.entity';
import { FirmScore } from '../../database/entities/firm-score.entity';

const mockQueryBuilder = {
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
};

const mockFirmRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  findOne: jest.fn(),
};

const mockSignalRepo = {
  findAndCount: jest.fn(),
};

const mockScoreRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
};

describe('FirmsService', () => {
  let service: FirmsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FirmsService,
        { provide: getRepositoryToken(Firm), useValue: mockFirmRepo },
        { provide: getRepositoryToken(FirmSignal), useValue: mockSignalRepo },
        { provide: getRepositoryToken(FirmScore), useValue: mockScoreRepo },
      ],
    }).compile();

    service = module.get(FirmsService);
    jest.clearAllMocks();
    mockFirmRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('findAll', () => {
    it('returns paginated firms with no filters', async () => {
      const firms = [{ id: '1', name: 'Firm A' }];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([firms, 1]);

      const result = await service.findAll({});

      expect(mockFirmRepo.createQueryBuilder).toHaveBeenCalledWith('firm');
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('firm.name', 'ASC');
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(25);
      expect(result).toEqual({
        items: firms,
        total: 1,
        page: 1,
        limit: 25,
        total_pages: 1,
      });
    });

    it('applies search ILIKE filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ search: 'Black' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'firm.name ILIKE :search',
        { search: '%Black%' },
      );
    });

    it('applies firm_type filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ firm_type: 'hedge_fund' as any });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'firm.firm_type = :firmType',
        { firmType: 'hedge_fund' },
      );
    });

    it('applies min_aum filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ min_aum: 1_000_000_000 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'firm.aum_usd >= :minAum',
        { minAum: 1_000_000_000 },
      );
    });

    it('uses mapped sort field and custom order', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sort_by: 'aum_usd', sort_order: 'DESC' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'firm.aum_usd',
        'DESC',
      );
    });

    it('falls back to firm.name for unknown sort_by', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ sort_by: 'unknown_field' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('firm.name', 'ASC');
    });

    it('paginates with custom page and limit', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 50]);

      const result = await service.findAll({ page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        items: [],
        total: 50,
        page: 3,
        limit: 10,
        total_pages: 5,
      });
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockQueryBuilder.getManyAndCount.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(service.findAll({})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findById', () => {
    it('returns firm with latest_score when found', async () => {
      const firm = { id: 'uuid-1', name: 'Firm A' };
      const latestScore = { id: 'score-1', overall_score: 85 };
      mockFirmRepo.findOne.mockResolvedValue(firm);
      mockScoreRepo.findOne.mockResolvedValue(latestScore);

      const result = await service.findById('uuid-1');

      expect(mockFirmRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        relations: ['aliases', 'people', 'scores'],
      });
      expect(mockScoreRepo.findOne).toHaveBeenCalledWith({
        where: { firm_id: 'uuid-1' },
        order: { scored_at: 'DESC' },
        relations: ['evidence'],
      });
      expect(result).toEqual({ ...firm, latest_score: latestScore });
    });

    it('returns firm with latest_score as null when no score exists', async () => {
      const firm = { id: 'uuid-1', name: 'Firm A' };
      mockFirmRepo.findOne.mockResolvedValue(firm);
      mockScoreRepo.findOne.mockResolvedValue(null);

      const result = await service.findById('uuid-1');

      expect(result).toEqual({ ...firm, latest_score: null });
    });

    it('throws NotFoundException when firm not found', async () => {
      mockFirmRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockFirmRepo.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.findById('uuid-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getSignals', () => {
    it('returns paginated signals', async () => {
      const signals = [{ id: 's1' }];
      mockSignalRepo.findAndCount.mockResolvedValue([signals, 1]);

      const result = await service.getSignals('firm-1', 2, 10);

      expect(mockSignalRepo.findAndCount).toHaveBeenCalledWith({
        where: { firm_id: 'firm-1' },
        relations: ['data_source'],
        order: { collected_at: 'DESC' },
        skip: 10,
        take: 10,
      });
      expect(result).toEqual({ items: signals, total: 1, page: 2, limit: 10 });
    });

    it('uses default page=1 and limit=50', async () => {
      mockSignalRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.getSignals('firm-1');

      expect(mockSignalRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockSignalRepo.findAndCount.mockRejectedValue(new Error('timeout'));

      await expect(service.getSignals('firm-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getScores', () => {
    it('returns scores ordered by scored_at DESC', async () => {
      const scores = [{ id: 'sc1', overall_score: 90 }];
      mockScoreRepo.find.mockResolvedValue(scores);

      const result = await service.getScores('firm-1');

      expect(mockScoreRepo.find).toHaveBeenCalledWith({
        where: { firm_id: 'firm-1' },
        order: { scored_at: 'DESC' },
      });
      expect(result).toEqual(scores);
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockScoreRepo.find.mockRejectedValue(new Error('db error'));

      await expect(service.getScores('firm-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getScoreByVersion', () => {
    it('returns score when found', async () => {
      const score = { id: 'sc1', score_version: 'v1.0' };
      mockScoreRepo.findOne.mockResolvedValue(score);

      const result = await service.getScoreByVersion('firm-1', 'v1.0');

      expect(mockScoreRepo.findOne).toHaveBeenCalledWith({
        where: { firm_id: 'firm-1', score_version: 'v1.0' },
        relations: ['evidence', 'evidence.signal'],
      });
      expect(result).toEqual(score);
    });

    it('throws NotFoundException when score not found', async () => {
      mockScoreRepo.findOne.mockResolvedValue(null);

      await expect(service.getScoreByVersion('firm-1', 'v2.0')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockScoreRepo.findOne.mockRejectedValue(new Error('db error'));

      await expect(service.getScoreByVersion('firm-1', 'v1.0')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});

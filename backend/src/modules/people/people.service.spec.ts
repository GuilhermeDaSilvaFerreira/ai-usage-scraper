import { InternalServerErrorException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PeopleService } from './people.service';
import { Person } from '../../database/entities/person.entity';

const mockQueryBuilder = {
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
};

const mockPersonRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  find: jest.fn(),
};

describe('PeopleService', () => {
  let service: PeopleService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PeopleService,
        { provide: getRepositoryToken(Person), useValue: mockPersonRepo },
      ],
    }).compile();

    service = module.get(PeopleService);
    jest.clearAllMocks();
    mockPersonRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('findAll', () => {
    it('returns paginated people with no filters', async () => {
      const people = [{ id: 'p1', full_name: 'John Doe' }];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([people, 1]);

      const result = await service.findAll({});

      expect(mockPersonRepo.createQueryBuilder).toHaveBeenCalledWith('person');
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'person.firm',
        'firm',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'person.data_source',
        'data_source',
      );
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'person.full_name',
        'ASC',
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(25);
      expect(result).toEqual({
        items: people,
        total: 1,
        page: 1,
        limit: 25,
        total_pages: 1,
      });
    });

    it('applies search ILIKE filter on full_name', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ search: 'John' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'person.full_name ILIKE :search',
        { search: '%John%' },
      );
    });

    it('applies role_category filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ role_category: 'HEAD_OF_DATA' as any });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'person.role_category = :role',
        { role: 'HEAD_OF_DATA' },
      );
    });

    it('applies firm_id filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ firm_id: 'firm-uuid' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'person.firm_id = :firmId',
        { firmId: 'firm-uuid' },
      );
    });

    it('applies all filters simultaneously', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        search: 'Jane',
        role_category: 'AI_HIRE' as any,
        firm_id: 'firm-uuid',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(3);
    });

    it('paginates with custom page and limit', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 100]);

      const result = await service.findAll({ page: 4, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(30);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        items: [],
        total: 100,
        page: 4,
        limit: 10,
        total_pages: 10,
      });
    });

    it('computes total_pages correctly with remainder', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 27]);

      const result = await service.findAll({ limit: 10 });

      expect(result.total_pages).toBe(3);
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockQueryBuilder.getManyAndCount.mockRejectedValue(
        new Error('connection refused'),
      );

      await expect(service.findAll({})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findByFirm', () => {
    it('returns people for a given firm', async () => {
      const people = [
        { id: 'p1', full_name: 'Alice' },
        { id: 'p2', full_name: 'Bob' },
      ];
      mockPersonRepo.find.mockResolvedValue(people);

      const result = await service.findByFirm('firm-uuid');

      expect(mockPersonRepo.find).toHaveBeenCalledWith({
        where: { firm_id: 'firm-uuid' },
        relations: ['data_source'],
        order: { role_category: 'ASC', full_name: 'ASC' },
      });
      expect(result).toEqual(people);
    });

    it('returns empty array when no people found', async () => {
      mockPersonRepo.find.mockResolvedValue([]);

      const result = await service.findByFirm('empty-firm');

      expect(result).toEqual([]);
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockPersonRepo.find.mockRejectedValue(new Error('db timeout'));

      await expect(service.findByFirm('firm-uuid')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});

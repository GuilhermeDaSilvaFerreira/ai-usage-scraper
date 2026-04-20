import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutreachService } from './outreach.service';
import { OutreachCampaign } from '../../../database/entities/outreach-campaign.entity';
import { Person } from '../../../database/entities/person.entity';
import { OutreachStatus, ContactPlatform } from '../../../common/enums';

const mockQueryBuilder = {
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
  getRawMany: jest.fn(),
};

const mockCampaignRepo = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn(),
};

const mockPersonRepo = {
  find: jest.fn(),
};

describe('OutreachService', () => {
  let service: OutreachService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OutreachService,
        {
          provide: getRepositoryToken(OutreachCampaign),
          useValue: mockCampaignRepo,
        },
        { provide: getRepositoryToken(Person), useValue: mockPersonRepo },
      ],
    }).compile();

    service = module.get(OutreachService);
    jest.clearAllMocks();
    mockCampaignRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('findAll', () => {
    it('returns paginated campaigns with no filters', async () => {
      const campaigns = [{ id: 'c1' }];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([campaigns, 1]);

      const result = await service.findAll({} as any);

      expect(mockCampaignRepo.createQueryBuilder).toHaveBeenCalledWith(
        'campaign',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledTimes(2);
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'campaign.updated_at',
        'DESC',
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(25);
      expect(result).toEqual({
        items: campaigns,
        total: 1,
        page: 1,
        limit: 25,
        total_pages: 1,
      });
    });

    it('applies search filter on person name', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ search: 'John' } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'person.full_name ILIKE :search',
        { search: '%John%' },
      );
    });

    it('applies firm_name filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ firm_name: 'Acme' } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'firm.name ILIKE :firmName',
        { firmName: '%Acme%' },
      );
    });

    it('applies status filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        status: OutreachStatus.REPLIED,
      } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'campaign.status = :status',
        { status: OutreachStatus.REPLIED },
      );
    });

    it('applies contact_platforms filter (overlap)', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({
        contact_platforms: [ContactPlatform.EMAIL, ContactPlatform.LINKEDIN],
      } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'campaign.contact_platforms && :platforms',
        {
          platforms: [ContactPlatform.EMAIL, ContactPlatform.LINKEDIN],
        },
      );
    });

    it('does not apply contact_platforms filter when empty', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ contact_platforms: [] } as any);

      const platformCalls = mockQueryBuilder.andWhere.mock.calls.filter(
        (call: any[]) => call[0] === 'campaign.contact_platforms && :platforms',
      );
      expect(platformCalls).toHaveLength(0);
    });

    it('applies firm_id filter', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ firm_id: 'firm-uuid' } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'campaign.firm_id = :firmId',
        { firmId: 'firm-uuid' },
      );
    });

    it('paginates with custom page and limit', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 60]);

      const result = await service.findAll({ page: 3, limit: 10 } as any);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        items: [],
        total: 60,
        page: 3,
        limit: 10,
        total_pages: 6,
      });
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockQueryBuilder.getManyAndCount.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(service.findAll({} as any)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findByFirm', () => {
    it('returns campaigns for firm', async () => {
      const campaigns = [{ id: 'c1', firm_id: 'f1' }];
      mockCampaignRepo.find.mockResolvedValue(campaigns);

      const result = await service.findByFirm('f1');

      expect(mockCampaignRepo.find).toHaveBeenCalledWith({
        where: { firm_id: 'f1' },
        relations: ['person'],
        order: { updated_at: 'DESC' },
      });
      expect(result).toEqual(campaigns);
    });

    it('throws InternalServerErrorException on DB error', async () => {
      mockCampaignRepo.find.mockRejectedValue(new Error('timeout'));

      await expect(service.findByFirm('f1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findByPerson', () => {
    it('returns campaign when found', async () => {
      const campaign = { id: 'c1', person_id: 'p1' };
      mockCampaignRepo.findOne.mockResolvedValue(campaign);

      const result = await service.findByPerson('p1');

      expect(mockCampaignRepo.findOne).toHaveBeenCalledWith({
        where: { person_id: 'p1' },
        relations: ['firm', 'person'],
        order: { created_at: 'DESC' },
      });
      expect(result).toEqual(campaign);
    });

    it('throws NotFoundException when not found', async () => {
      mockCampaignRepo.findOne.mockResolvedValue(null);

      await expect(service.findByPerson('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('returns campaign when found', async () => {
      const campaign = { id: 'c1' };
      mockCampaignRepo.findOne.mockResolvedValue(campaign);

      const result = await service.findOne('c1');

      expect(mockCampaignRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'c1' },
        relations: ['firm', 'person'],
      });
      expect(result).toEqual(campaign);
    });

    it('throws NotFoundException when not found', async () => {
      mockCampaignRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates campaign with NOT_CONTACTED status and returns with relations', async () => {
      const dto = {
        firm_id: 'f1',
        person_id: 'p1',
        contacted_by: 'analyst',
        contact_platforms: [ContactPlatform.EMAIL, ContactPlatform.LINKEDIN],
        notes: 'test note',
      };
      const saved = { id: 'new-id', ...dto };
      const full = { ...saved, firm: {}, person: {} };

      mockCampaignRepo.create.mockReturnValue(saved);
      mockCampaignRepo.save.mockResolvedValue(saved);
      mockCampaignRepo.findOne.mockResolvedValue(full);

      const result = await service.create(dto);

      expect(mockCampaignRepo.create).toHaveBeenCalledWith({
        firm_id: 'f1',
        person_id: 'p1',
        contacted_by: 'analyst',
        contact_platforms: [ContactPlatform.EMAIL, ContactPlatform.LINKEDIN],
        notes: 'test note',
        status: OutreachStatus.NOT_CONTACTED,
      });
      expect(mockCampaignRepo.save).toHaveBeenCalledWith(saved);
      expect(result).toEqual(full);
    });

    it('defaults optional fields (platforms to empty array)', async () => {
      const dto = { firm_id: 'f1', person_id: 'p1' };
      const saved = { id: 'new-id' };
      mockCampaignRepo.create.mockReturnValue(saved);
      mockCampaignRepo.save.mockResolvedValue(saved);
      mockCampaignRepo.findOne.mockResolvedValue(saved);

      await service.create(dto as any);

      expect(mockCampaignRepo.create).toHaveBeenCalledWith({
        firm_id: 'f1',
        person_id: 'p1',
        contacted_by: null,
        contact_platforms: [],
        notes: null,
        status: OutreachStatus.NOT_CONTACTED,
      });
    });
  });

  describe('update', () => {
    const baseCampaign = () => ({
      id: 'c1',
      status: OutreachStatus.NOT_CONTACTED,
      contacted_by: null as string | null,
      contact_platforms: [] as ContactPlatform[],
      notes: null as string | null,
      outreach_message: null as string | null,
      first_contact_at: null as Date | null,
      last_status_change_at: null as Date | null,
    });

    it('updates status and sets last_status_change_at', async () => {
      const campaign = baseCampaign();
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', { status: OutreachStatus.REPLIED });

      expect(campaign.status).toBe(OutreachStatus.REPLIED);
      expect(campaign.last_status_change_at).toBeInstanceOf(Date);
    });

    it('sets first_contact_at only on FIRST_CONTACT_SENT when not already set', async () => {
      const campaign = baseCampaign();
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', {
        status: OutreachStatus.FIRST_CONTACT_SENT,
      });

      expect(campaign.first_contact_at).toBeInstanceOf(Date);
    });

    it('does not overwrite first_contact_at if already set', async () => {
      const existingDate = new Date('2024-01-01');
      const campaign = { ...baseCampaign(), first_contact_at: existingDate };
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', {
        status: OutreachStatus.FIRST_CONTACT_SENT,
      });

      expect(campaign.first_contact_at).toBe(existingDate);
    });

    it('sets contacted_by only if not already set', async () => {
      const campaign = baseCampaign();
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', { contacted_by: 'analyst-1' });

      expect(campaign.contacted_by).toBe('analyst-1');
    });

    it('does not overwrite contacted_by if already set', async () => {
      const campaign = { ...baseCampaign(), contacted_by: 'original' };
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', { contacted_by: 'new-analyst' });

      expect(campaign.contacted_by).toBe('original');
    });

    it('updates contact_platforms (multiple channels)', async () => {
      const campaign = baseCampaign();
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', {
        contact_platforms: [ContactPlatform.LINKEDIN, ContactPlatform.EMAIL],
      });

      expect(campaign.contact_platforms).toEqual([
        ContactPlatform.LINKEDIN,
        ContactPlatform.EMAIL,
      ]);
    });

    it('updates notes', async () => {
      const campaign = baseCampaign();
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', { notes: 'updated notes' });

      expect(campaign.notes).toBe('updated notes');
    });

    it('updates outreach_message', async () => {
      const campaign = baseCampaign();
      mockCampaignRepo.findOne
        .mockResolvedValueOnce(campaign)
        .mockResolvedValueOnce(campaign);
      mockCampaignRepo.save.mockResolvedValue(campaign);

      await service.update('c1', { outreach_message: 'Hello!' });

      expect(campaign.outreach_message).toBe('Hello!');
    });

    it('throws NotFoundException when campaign not found', async () => {
      mockCampaignRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('missing', { status: OutreachStatus.REPLIED }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createDefaultCampaignsForFirm', () => {
    it('returns 0 when firm has no people', async () => {
      mockPersonRepo.find.mockResolvedValue([]);

      const result = await service.createDefaultCampaignsForFirm('f1');

      expect(result).toBe(0);
      expect(mockCampaignRepo.save).not.toHaveBeenCalled();
    });

    it('creates campaigns only for people without existing ones', async () => {
      const people = [
        { id: 'p1', firm_id: 'f1' },
        { id: 'p2', firm_id: 'f1' },
        { id: 'p3', firm_id: 'f1' },
      ];
      const existingCampaigns = [{ person_id: 'p1' }];

      mockPersonRepo.find.mockResolvedValue(people);
      mockCampaignRepo.find.mockResolvedValue(existingCampaigns);
      mockCampaignRepo.create.mockImplementation((dto) => ({ ...dto }));
      mockCampaignRepo.save.mockResolvedValue([]);

      const result = await service.createDefaultCampaignsForFirm('f1');

      expect(result).toBe(2);
      expect(mockCampaignRepo.create).toHaveBeenCalledTimes(2);
      expect(mockCampaignRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            firm_id: 'f1',
            person_id: 'p2',
            status: OutreachStatus.NOT_CONTACTED,
          }),
          expect.objectContaining({
            firm_id: 'f1',
            person_id: 'p3',
            status: OutreachStatus.NOT_CONTACTED,
          }),
        ]),
      );
    });

    it('returns 0 when all people already have campaigns', async () => {
      const people = [{ id: 'p1', firm_id: 'f1' }];
      const existingCampaigns = [{ person_id: 'p1' }];

      mockPersonRepo.find.mockResolvedValue(people);
      mockCampaignRepo.find.mockResolvedValue(existingCampaigns);

      const result = await service.createDefaultCampaignsForFirm('f1');

      expect(result).toBe(0);
      expect(mockCampaignRepo.save).not.toHaveBeenCalled();
    });

    it('creates campaigns for all people when none exist', async () => {
      const people = [
        { id: 'p1', firm_id: 'f1' },
        { id: 'p2', firm_id: 'f1' },
      ];

      mockPersonRepo.find.mockResolvedValue(people);
      mockCampaignRepo.find.mockResolvedValue([]);
      mockCampaignRepo.create.mockImplementation((dto) => ({ ...dto }));
      mockCampaignRepo.save.mockResolvedValue([]);

      const result = await service.createDefaultCampaignsForFirm('f1');

      expect(result).toBe(2);
      expect(mockCampaignRepo.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStats', () => {
    it('returns counts per status with defaults for missing statuses', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { status: OutreachStatus.NOT_CONTACTED, count: '5' },
        { status: OutreachStatus.REPLIED, count: '3' },
      ]);

      const result = await service.getStats();

      expect(result[OutreachStatus.NOT_CONTACTED]).toBe(5);
      expect(result[OutreachStatus.REPLIED]).toBe(3);
      expect(result[OutreachStatus.FIRST_CONTACT_SENT]).toBe(0);
      expect(result[OutreachStatus.FOLLOW_UP_SENT]).toBe(0);
      expect(result[OutreachStatus.UNDER_NEGOTIATION]).toBe(0);
      expect(result[OutreachStatus.DECLINED]).toBe(0);
      expect(result[OutreachStatus.CLOSED_WON]).toBe(0);
      expect(result[OutreachStatus.CLOSED_LOST]).toBe(0);
    });

    it('returns all zeros when no campaigns exist', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getStats();

      for (const value of Object.values(OutreachStatus)) {
        expect(result[value]).toBe(0);
      }
    });
  });
});

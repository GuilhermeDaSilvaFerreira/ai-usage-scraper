import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { OutreachMessageService } from './outreach-message.service';
import { OutreachCampaign } from '../../../database/entities/outreach-campaign.entity';
import { Person } from '../../../database/entities/person.entity';
import { Firm } from '../../../database/entities/firm.entity';
import { FirmSignal } from '../../../database/entities/firm-signal.entity';
import { FirmScore } from '../../../database/entities/firm-score.entity';
import { AnthropicService } from '../../../integrations/anthropic/anthropic.service';
import { OpenAIService } from '../../../integrations/openai/openai.service';

const mockCampaignRepo = {
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  save: jest.fn(),
};

const mockPersonRepo = {};
const mockFirmRepo = {};

const mockSignalRepo = {
  find: jest.fn(),
};

const mockScoreRepo = {
  findOne: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

const mockAnthropicService = {
  generateCompletion: jest.fn(),
};

const mockOpenAIService = {
  generateCompletion: jest.fn(),
};

const makePerson = (overrides = {}) => ({
  id: 'person-1',
  full_name: 'Jane Smith',
  title: 'Managing Director',
  role_category: 'Operations',
  bio: 'Senior leader with 15 years of experience in PE.',
  ...overrides,
});

const makeFirm = (overrides = {}) => ({
  id: 'firm-1',
  name: 'Alpha Capital',
  firm_type: 'private_equity',
  aum_usd: 5_000_000_000,
  description: 'Global PE firm.',
  ...overrides,
});

const makeCampaign = (overrides = {}) => ({
  id: 'campaign-1',
  person: makePerson(),
  firm: makeFirm(),
  outreach_message: null,
  ...overrides,
});

describe('OutreachMessageService', () => {
  let service: OutreachMessageService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OutreachMessageService,
        {
          provide: getRepositoryToken(OutreachCampaign),
          useValue: mockCampaignRepo,
        },
        { provide: getRepositoryToken(Person), useValue: mockPersonRepo },
        { provide: getRepositoryToken(Firm), useValue: mockFirmRepo },
        {
          provide: getRepositoryToken(FirmSignal),
          useValue: mockSignalRepo,
        },
        {
          provide: getRepositoryToken(FirmScore),
          useValue: mockScoreRepo,
        },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AnthropicService, useValue: mockAnthropicService },
        { provide: OpenAIService, useValue: mockOpenAIService },
      ],
    }).compile();

    service = module.get(OutreachMessageService);
    jest.clearAllMocks();
  });

  describe('generateOutreachMessage', () => {
    it('throws NotFoundException when campaign not found', async () => {
      mockCampaignRepo.findOne.mockResolvedValue(null);

      await expect(service.generateOutreachMessage('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('generates message using anthropic provider (default)', async () => {
      const campaign = makeCampaign();
      const updatedCampaign = { ...campaign, outreach_message: 'Hello Jane' };

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);
      mockAnthropicService.generateCompletion.mockResolvedValue('Hello Jane');
      mockCampaignRepo.save.mockResolvedValue(updatedCampaign);
      mockCampaignRepo.findOneOrFail.mockResolvedValue(updatedCampaign);

      const result = await service.generateOutreachMessage('campaign-1');

      expect(mockAnthropicService.generateCompletion).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Jane Smith'),
      );
      expect(mockOpenAIService.generateCompletion).not.toHaveBeenCalled();
      expect(mockCampaignRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ outreach_message: 'Hello Jane' }),
      );
      expect(result).toEqual(updatedCampaign);
    });

    it('generates message using openai provider when configured', async () => {
      const campaign = makeCampaign();
      const updatedCampaign = { ...campaign, outreach_message: 'Hi Jane' };

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue('openai');
      mockOpenAIService.generateCompletion.mockResolvedValue('Hi Jane');
      mockCampaignRepo.save.mockResolvedValue(updatedCampaign);
      mockCampaignRepo.findOneOrFail.mockResolvedValue(updatedCampaign);

      const result = await service.generateOutreachMessage('campaign-1');

      expect(mockOpenAIService.generateCompletion).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Jane Smith'),
      );
      expect(mockAnthropicService.generateCompletion).not.toHaveBeenCalled();
      expect(result).toEqual(updatedCampaign);
    });

    it('throws InternalServerErrorException when LLM returns null', async () => {
      const campaign = makeCampaign();

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);
      mockAnthropicService.generateCompletion.mockResolvedValue(null);

      await expect(
        service.generateOutreachMessage('campaign-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when LLM throws error', async () => {
      const campaign = makeCampaign();

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);
      mockAnthropicService.generateCompletion.mockRejectedValue(
        new Error('API down'),
      );

      await expect(
        service.generateOutreachMessage('campaign-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('builds context with signals and score data', async () => {
      const signals = [
        {
          signal_type: 'ai_hiring',
          signal_data: { title: 'Hiring ML Engineer' },
          extraction_confidence: 0.9,
          data_source: {
            title: 'Job Board',
            url: 'https://example.com',
            content_snippet: 'Looking for ML engineer...',
          },
        },
      ];
      const score = { overall_score: 85, rank: 3 };
      const campaign = makeCampaign();

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue(signals);
      mockScoreRepo.findOne.mockResolvedValue(score);
      mockConfigService.get.mockReturnValue(undefined);
      mockAnthropicService.generateCompletion.mockResolvedValue('Dear Jane');
      mockCampaignRepo.save.mockResolvedValue(campaign);
      mockCampaignRepo.findOneOrFail.mockResolvedValue(campaign);

      await service.generateOutreachMessage('campaign-1');

      const userPrompt =
        mockAnthropicService.generateCompletion.mock.calls[0][1];
      expect(userPrompt).toContain(
        'AI SCORE: Overall AI score: 85/100 (rank #3)',
      );
      expect(userPrompt).toContain('Hiring ML Engineer');
    });

    it('builds context without score', async () => {
      const campaign = makeCampaign();

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);
      mockAnthropicService.generateCompletion.mockResolvedValue('Message');
      mockCampaignRepo.save.mockResolvedValue(campaign);
      mockCampaignRepo.findOneOrFail.mockResolvedValue(campaign);

      await service.generateOutreachMessage('campaign-1');

      const userPrompt =
        mockAnthropicService.generateCompletion.mock.calls[0][1];
      expect(userPrompt).toContain('No score available yet');
    });

    it('includes person title, role, bio, firm details in user prompt', async () => {
      const campaign = makeCampaign();

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);
      mockAnthropicService.generateCompletion.mockResolvedValue('Msg');
      mockCampaignRepo.save.mockResolvedValue(campaign);
      mockCampaignRepo.findOneOrFail.mockResolvedValue(campaign);

      await service.generateOutreachMessage('campaign-1');

      const userPrompt =
        mockAnthropicService.generateCompletion.mock.calls[0][1];
      expect(userPrompt).toContain('PERSON: Jane Smith');
      expect(userPrompt).toContain('TITLE: Managing Director');
      expect(userPrompt).toContain('ROLE: Operations');
      expect(userPrompt).toContain('BIO:');
      expect(userPrompt).toContain('FIRM: Alpha Capital');
      expect(userPrompt).toContain('TYPE: private_equity');
      expect(userPrompt).toContain('AUM: $5.0B');
    });

    it('system prompt contains Soal Labs context', async () => {
      const campaign = makeCampaign();

      mockCampaignRepo.findOne.mockResolvedValue(campaign);
      mockSignalRepo.find.mockResolvedValue([]);
      mockScoreRepo.findOne.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);
      mockAnthropicService.generateCompletion.mockResolvedValue('Msg');
      mockCampaignRepo.save.mockResolvedValue(campaign);
      mockCampaignRepo.findOneOrFail.mockResolvedValue(campaign);

      await service.generateOutreachMessage('campaign-1');

      const systemPrompt =
        mockAnthropicService.generateCompletion.mock.calls[0][0];
      expect(systemPrompt).toContain('Soal Labs');
      expect(systemPrompt).toContain('outreach message');
    });
  });
});

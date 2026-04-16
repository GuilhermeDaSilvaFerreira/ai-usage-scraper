import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ScoringProcessor, SCORING_QUEUE } from './scoring.processor';
import { ScoringService } from './scoring.service';
import { OUTREACH_CAMPAIGNS_QUEUE } from '../../sales-pipeline/outreach/outreach-campaign.processor';

const mockScoringService = {
  scoreFirm: jest.fn(),
  scoreAllFirms: jest.fn(),
};

const mockOutreachQueue = {
  add: jest.fn(),
};

describe('ScoringProcessor', () => {
  let processor: ScoringProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ScoringProcessor,
        { provide: ScoringService, useValue: mockScoringService },
        {
          provide: getQueueToken(OUTREACH_CAMPAIGNS_QUEUE),
          useValue: mockOutreachQueue,
        },
      ],
    }).compile();

    processor = module.get(ScoringProcessor);
    jest.clearAllMocks();
  });

  it('scores all firms when scoreAll is true', async () => {
    const batchResult = { scored: 10, skipped: 2 };
    mockScoringService.scoreAllFirms.mockResolvedValue(batchResult);

    const job = {
      data: { scoreAll: true },
      id: 'job-batch',
    } as any;

    const result = await processor.process(job);

    expect(mockScoringService.scoreAllFirms).toHaveBeenCalledWith(
      expect.any(Object),
      'job-batch',
    );
    expect(result).toEqual({ success: true, scored: 10, skipped: 2 });
  });

  it('scores single firm and enqueues outreach campaign', async () => {
    const score = { id: 'score-1', overall_score: 85 };
    mockScoringService.scoreFirm.mockResolvedValue(score);
    mockOutreachQueue.add.mockResolvedValue({});

    const job = {
      data: { firmId: 'f1' },
      id: 'job-single',
    } as any;

    const result = await processor.process(job);

    expect(mockScoringService.scoreFirm).toHaveBeenCalledWith(
      'f1',
      expect.any(Object),
    );
    expect(mockOutreachQueue.add).toHaveBeenCalledWith(
      'create-campaigns',
      { firmId: 'f1' },
      { jobId: 'outreach-f1' },
    );
    expect(result).toEqual({
      success: true,
      scoreId: 'score-1',
      overall_score: 85,
    });
  });

  it('returns skipped when scoreFirm returns null', async () => {
    mockScoringService.scoreFirm.mockResolvedValue(null);

    const job = {
      data: { firmId: 'f1' },
      id: 'job-skip',
    } as any;

    const result = await processor.process(job);

    expect(result).toEqual({
      success: true,
      skipped: true,
      reason: 'no_signals',
    });
    expect(mockOutreachQueue.add).not.toHaveBeenCalled();
  });

  it('throws error when neither firmId nor scoreAll provided', async () => {
    const job = {
      data: {},
      id: 'job-bad',
    } as any;

    await expect(processor.process(job)).rejects.toThrow(
      'Either firmId or scoreAll must be provided',
    );
  });
});

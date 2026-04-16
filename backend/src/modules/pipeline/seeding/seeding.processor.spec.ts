import { Test } from '@nestjs/testing';
import { SeedingProcessor } from './seeding.processor';
import { SeedingService } from './seeding.service';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service';

const mockSeedingService = {
  seed: jest.fn(),
};

const mockOrchestrator = {
  isAutoChainEnabled: jest.fn(),
  triggerCollectionForAllFirms: jest.fn(),
};

describe('SeedingProcessor', () => {
  let processor: SeedingProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SeedingProcessor,
        { provide: SeedingService, useValue: mockSeedingService },
        {
          provide: PipelineOrchestratorService,
          useValue: mockOrchestrator,
        },
      ],
    }).compile();

    processor = module.get(SeedingProcessor);
    jest.clearAllMocks();
  });

  it('seeds firms and returns result without auto-chaining', async () => {
    const seedResult = { firmsSeeded: 20 };
    mockSeedingService.seed.mockResolvedValue(seedResult);
    mockOrchestrator.isAutoChainEnabled.mockReturnValue(false);

    const job = {
      data: { targetFirmCount: 20 },
      id: 'job-seed',
    } as any;

    const result = await processor.process(job);

    expect(mockSeedingService.seed).toHaveBeenCalledWith(20, 'job-seed');
    expect(
      mockOrchestrator.triggerCollectionForAllFirms,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, firmsSeeded: 20 });
  });

  it('seeds firms and triggers collection when auto-chain enabled', async () => {
    const seedResult = { firmsSeeded: 10 };
    const collectionResult = { jobsCreated: 10 };
    mockSeedingService.seed.mockResolvedValue(seedResult);
    mockOrchestrator.isAutoChainEnabled.mockReturnValue(true);
    mockOrchestrator.triggerCollectionForAllFirms.mockResolvedValue(
      collectionResult,
    );

    const job = {
      data: { targetFirmCount: 10 },
      id: 'job-chain',
    } as any;

    const result = await processor.process(job);

    expect(mockOrchestrator.triggerCollectionForAllFirms).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      firmsSeeded: 10,
      autoChain: {
        collectionTriggered: true,
        jobsCreated: 10,
      },
    });
  });

  it('re-throws when seeding fails', async () => {
    const error = new Error('seeding failed');
    mockSeedingService.seed.mockRejectedValue(error);

    const job = {
      data: { targetFirmCount: 5 },
      id: 'job-fail',
    } as any;

    await expect(processor.process(job)).rejects.toThrow('seeding failed');
  });
});

import { Test } from '@nestjs/testing';
import { CollectionProcessor } from './collection.processor';
import { CollectionService } from './collection.service';

const mockCollectionService = {
  collectForFirm: jest.fn(),
};

describe('CollectionProcessor', () => {
  let processor: CollectionProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CollectionProcessor,
        { provide: CollectionService, useValue: mockCollectionService },
      ],
    }).compile();

    processor = module.get(CollectionProcessor);
    jest.clearAllMocks();
  });

  it('calls collectForFirm and returns success with count', async () => {
    mockCollectionService.collectForFirm.mockResolvedValue(5);

    const job = {
      data: { firmId: 'f1', firmName: 'Alpha Capital' },
      id: 'job-123',
    } as any;

    const result = await processor.process(job);

    expect(mockCollectionService.collectForFirm).toHaveBeenCalledWith(
      'f1',
      'job-123',
    );
    expect(result).toEqual({ success: true, sourcesCollected: 5 });
  });

  it('re-throws when collectForFirm fails', async () => {
    const error = new Error('scrape failed');
    mockCollectionService.collectForFirm.mockRejectedValue(error);

    const job = {
      data: { firmId: 'f1', firmName: 'Alpha Capital' },
      id: 'job-456',
    } as any;

    await expect(processor.process(job)).rejects.toThrow('scrape failed');
  });
});

import { Test } from '@nestjs/testing';
import { PeopleCollectionProcessor } from './people-collection.processor';
import { PeopleCollectionService } from './people-collection.service';

const mockPeopleCollectionService = {
  collectPeopleForFirm: jest.fn(),
};

describe('PeopleCollectionProcessor', () => {
  let processor: PeopleCollectionProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PeopleCollectionProcessor,
        {
          provide: PeopleCollectionService,
          useValue: mockPeopleCollectionService,
        },
      ],
    }).compile();

    processor = module.get(PeopleCollectionProcessor);
    jest.clearAllMocks();
  });

  it('calls collectPeopleForFirm and returns success with count', async () => {
    mockPeopleCollectionService.collectPeopleForFirm.mockResolvedValue(3);

    const job = {
      data: { firmId: 'f1', firmName: 'Beta Partners' },
      id: 'job-789',
    } as any;

    const result = await processor.process(job);

    expect(
      mockPeopleCollectionService.collectPeopleForFirm,
    ).toHaveBeenCalledWith('f1', 'job-789');
    expect(result).toEqual({ success: true, sourcesCollected: 3 });
  });

  it('re-throws when collectPeopleForFirm fails', async () => {
    const error = new Error('people scrape failed');
    mockPeopleCollectionService.collectPeopleForFirm.mockRejectedValue(error);

    const job = {
      data: { firmId: 'f1', firmName: 'Beta Partners' },
      id: 'job-000',
    } as any;

    await expect(processor.process(job)).rejects.toThrow(
      'people scrape failed',
    );
  });
});

import { Test } from '@nestjs/testing';
import { OutreachCampaignProcessor } from './outreach-campaign.processor';
import { OutreachService } from './outreach.service';

const mockOutreachService = {
  createDefaultCampaignsForFirm: jest.fn(),
};

describe('OutreachCampaignProcessor', () => {
  let processor: OutreachCampaignProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OutreachCampaignProcessor,
        { provide: OutreachService, useValue: mockOutreachService },
      ],
    }).compile();

    processor = module.get(OutreachCampaignProcessor);
    jest.clearAllMocks();
  });

  it('creates default campaigns for firm and returns result', async () => {
    mockOutreachService.createDefaultCampaignsForFirm.mockResolvedValue(4);

    const job = {
      data: { firmId: 'f1' },
      id: 'job-outreach',
    } as any;

    const result = await processor.process(job);

    expect(
      mockOutreachService.createDefaultCampaignsForFirm,
    ).toHaveBeenCalledWith('f1');
    expect(result).toEqual({
      success: true,
      firmId: 'f1',
      campaignsCreated: 4,
    });
  });

  it('returns 0 campaigns when firm has no people', async () => {
    mockOutreachService.createDefaultCampaignsForFirm.mockResolvedValue(0);

    const job = {
      data: { firmId: 'f2' },
      id: 'job-empty',
    } as any;

    const result = await processor.process(job);

    expect(result).toEqual({
      success: true,
      firmId: 'f2',
      campaignsCreated: 0,
    });
  });
});

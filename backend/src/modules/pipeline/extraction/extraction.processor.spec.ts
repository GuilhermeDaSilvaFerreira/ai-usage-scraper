import { Test } from '@nestjs/testing';
import { ExtractionProcessor } from './extraction.processor';
import { ExtractionPipelineService } from './extraction-pipeline.service';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service';

const mockExtractionPipeline = {
  process: jest.fn(),
};

const mockOrchestrator = {
  onExtractionComplete: jest.fn(),
};

describe('ExtractionProcessor', () => {
  let processor: ExtractionProcessor;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExtractionProcessor,
        {
          provide: ExtractionPipelineService,
          useValue: mockExtractionPipeline,
        },
        {
          provide: PipelineOrchestratorService,
          useValue: mockOrchestrator,
        },
      ],
    }).compile();

    processor = module.get(ExtractionProcessor);
    jest.clearAllMocks();
  });

  it('processes extraction and returns success with signal info', async () => {
    const signals = [
      { extraction_method: 'llm' },
      { extraction_method: 'regex' },
      { extraction_method: 'llm' },
    ];
    mockExtractionPipeline.process.mockResolvedValue(signals);
    mockOrchestrator.onExtractionComplete.mockResolvedValue(undefined);

    const job = {
      data: {
        dataSourceId: 'ds-1',
        firmId: 'f1',
        firmName: 'Alpha Capital',
        content: 'some content',
        url: 'https://example.com',
        sourceType: 'web',
      },
      id: 'job-123',
    } as any;

    const result = await processor.process(job);

    expect(mockExtractionPipeline.process).toHaveBeenCalledWith(
      {
        content: 'some content',
        url: 'https://example.com',
        sourceType: 'web',
        firmName: 'Alpha Capital',
      },
      'f1',
      'ds-1',
    );
    expect(result).toEqual({
      success: true,
      signalsExtracted: 3,
      methods: ['llm', 'regex'],
    });
    expect(mockOrchestrator.onExtractionComplete).toHaveBeenCalledWith('f1');
  });

  it('calls onExtractionComplete even when extraction fails', async () => {
    const error = new Error('extraction failed');
    mockExtractionPipeline.process.mockRejectedValue(error);
    mockOrchestrator.onExtractionComplete.mockResolvedValue(undefined);

    const job = {
      data: {
        dataSourceId: 'ds-1',
        firmId: 'f1',
        firmName: 'Alpha Capital',
        content: 'content',
        url: 'https://example.com',
        sourceType: 'web',
      },
      id: 'job-456',
    } as any;

    await expect(processor.process(job)).rejects.toThrow('extraction failed');
    expect(mockOrchestrator.onExtractionComplete).toHaveBeenCalledWith('f1');
  });
});

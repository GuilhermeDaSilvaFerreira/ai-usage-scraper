import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ExtractionPipelineService } from './extraction-pipeline.service.js';
import { EXTRACTION_QUEUE } from '../collection/collection.service.js';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service.js';
import { JobLogger } from '../../../common/utils/index.js';

export interface ExtractionJobData {
  dataSourceId: string;
  firmId: string;
  firmName: string;
  content: string;
  url: string;
  sourceType: string;
}

@Processor(EXTRACTION_QUEUE, {
  concurrency: 10,
  lockDuration: 300000,
  lockRenewTime: 150000,
})
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);
  private readonly jobLogger = new JobLogger(ExtractionProcessor.name);

  constructor(
    private readonly extractionPipeline: ExtractionPipelineService,
    private readonly orchestrator: PipelineOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<ExtractionJobData>): Promise<any> {
    const { dataSourceId, firmId, firmName, content, url, sourceType } =
      job.data;
    this.logger.log(`Processing extraction for ${firmName} from ${url}`);
    this.jobLogger.log(`Processing extraction for ${firmName} from ${url}`);

    try {
      const signals = await this.extractionPipeline.process(
        { content, url, sourceType, firmName },
        firmId,
        dataSourceId,
      );

      return {
        success: true,
        signalsExtracted: signals.length,
        methods: [...new Set(signals.map((s) => s.extraction_method))],
      };
    } catch (error) {
      this.logger.error(`Extraction failed for ${firmName}: ${error}`);
      this.jobLogger.error(`Extraction failed for ${firmName}: ${error}`);
      throw error;
    } finally {
      await this.orchestrator.onExtractionComplete(firmId);
    }
  }
}

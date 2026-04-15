import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { Firm } from '../../../database/entities/firm.entity.js';
import { FirmAlias } from '../../../database/entities/firm-alias.entity.js';
import { DataSource as DataSourceEntity } from '../../../database/entities/data-source.entity.js';
import { ScrapeJob } from '../../../database/entities/scrape-job.entity.js';
import {
  JobType,
  JobStatus,
  DataSourceTarget,
} from '../../../common/enums/index.js';
import {
  computeContentHash,
  truncate,
  JobLogger,
} from '../../../common/utils/index.js';
import {
  NewsCollector,
  CollectedContent,
} from './collectors/news.collector.js';
import { HiringCollector } from './collectors/hiring.collector.js';
import { ConferenceCollector } from './collectors/conference.collector.js';
import { WebsiteCollector } from './collectors/website.collector.js';
import { LinkedInCollector } from './collectors/linkedin.collector.js';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service.js';

export const COLLECTION_QUEUE = 'signal-collection';
export const EXTRACTION_QUEUE = 'extraction';

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);
  private readonly jobLogger = new JobLogger(CollectionService.name);

  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(FirmAlias)
    private readonly aliasRepo: Repository<FirmAlias>,
    @InjectRepository(DataSourceEntity)
    private readonly dataSourceRepo: Repository<DataSourceEntity>,
    @InjectRepository(ScrapeJob)
    private readonly jobRepo: Repository<ScrapeJob>,
    @InjectQueue(EXTRACTION_QUEUE)
    private readonly extractionQueue: Queue,
    private readonly orchestrator: PipelineOrchestratorService,
    private readonly newsCollector: NewsCollector,
    private readonly hiringCollector: HiringCollector,
    private readonly conferenceCollector: ConferenceCollector,
    private readonly websiteCollector: WebsiteCollector,
    private readonly linkedInCollector: LinkedInCollector,
  ) {}

  async collectForFirm(firmId: string, queueJobId?: string): Promise<number> {
    const firm = await this.firmRepo.findOneByOrFail({ id: firmId });
    this.logger.log(`Starting signal collection for: ${firm.name}`);
    this.jobLogger.log(`Starting signal collection for: ${firm.name}`);

    const aliases = await this.aliasRepo.find({ where: { firm_id: firmId } });
    const aliasNames = aliases
      .map((a) => a.alias_name)
      .filter((name) => name !== firm.name);
    const searchNames =
      aliasNames.length > 0 ? [firm.name, ...aliasNames] : [firm.name];

    const job = this.jobRepo.create({
      firm_id: firmId,
      job_type: JobType.COLLECT_SIGNALS,
      status: JobStatus.RUNNING,
      started_at: new Date(),
      queue_job_id: queueJobId ?? null,
    });
    await this.jobRepo.save(job);

    try {
      const [
        newsResults,
        hiringResults,
        conferenceResults,
        websiteResults,
        linkedinResults,
      ] = await Promise.allSettled([
        this.newsCollector.collect(searchNames),
        this.hiringCollector.collect(searchNames, firm.website),
        this.conferenceCollector.collect(searchNames),
        this.websiteCollector.collectForSignals(firm.name, firm.website),
        this.linkedInCollector.collectSignals(searchNames),
      ]);

      const allContent: CollectedContent[] = [];
      for (const result of [
        newsResults,
        hiringResults,
        conferenceResults,
        websiteResults,
        linkedinResults,
      ]) {
        if (result.status === 'fulfilled') {
          allContent.push(...result.value);
        }
      }

      const contentHashes = allContent.map((c) =>
        computeContentHash(c.content),
      );
      const existingHashes = new Set(
        (
          await this.dataSourceRepo
            .createQueryBuilder('ds')
            .select('ds.raw_content_hash')
            .where('ds.raw_content_hash IN (:...hashes)', {
              hashes: contentHashes.length > 0 ? contentHashes : [''],
            })
            .getMany()
        ).map((ds) => ds.raw_content_hash),
      );

      const newContent = allContent.filter(
        (c, i) => !existingHashes.has(contentHashes[i]),
      );

      const dataSources = newContent.map((content) =>
        this.dataSourceRepo.create({
          source_type: content.sourceType,
          target_entity: DataSourceTarget.FIRM_SIGNALS,
          url: content.url,
          title: content.title,
          raw_content_hash: computeContentHash(content.content),
          content_snippet: truncate(content.content, 5000),
          reliability_score: this.assessReliability(content),
          metadata: {
            ...content.metadata,
            published_date: content.publishedDate,
            firm_id: firmId,
            firm_name: firm.name,
          },
        }),
      );

      const savedSources =
        dataSources.length > 0
          ? await this.dataSourceRepo.save(dataSources)
          : [];
      const saved = savedSources.length;

      if (savedSources.length > 0) {
        await this.extractionQueue.addBulk(
          savedSources.map((ds, i) => ({
            name: 'extract',
            data: {
              dataSourceId: ds.id,
              firmId,
              firmName: firm.name,
              content: newContent[i].content,
              url: newContent[i].url,
              sourceType: newContent[i].sourceType,
            },
            opts: { jobId: uuidv7() },
          })),
        );
        await this.orchestrator.trackExtractionBatch(
          firmId,
          savedSources.length,
        );
      } else {
        await this.orchestrator.onCollectionCompleteNoExtractions(firmId);
      }

      job.status = JobStatus.COMPLETED;
      job.completed_at = new Date();
      job.metadata = {
        total_collected: allContent.length,
        new_sources: saved,
        duplicates_skipped: allContent.length - saved,
      };
      await this.jobRepo.save(job);

      await this.firmRepo.update(firmId, { last_collected_at: new Date() });

      this.logger.log(
        `Signal collection complete for ${firm.name}: ${saved} new sources saved`,
      );
      this.jobLogger.log(
        `Signal collection complete for ${firm.name}: ${saved} new sources saved`,
      );
      return saved;
    } catch (error) {
      job.status = JobStatus.FAILED;
      job.error_message = String(error);
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      throw error;
    }
  }

  private assessReliability(content: CollectedContent): number {
    const url = content.url.toLowerCase();

    if (url.includes('sec.gov') || url.includes('.gov')) return 0.95;
    if (url.includes('linkedin.com')) return 0.7;
    if (url.includes('bloomberg.com') || url.includes('reuters.com'))
      return 0.9;
    if (url.includes('wsj.com') || url.includes('ft.com')) return 0.9;
    if (url.includes('techcrunch.com') || url.includes('businessinsider.com'))
      return 0.75;

    return 0.5;
  }
}

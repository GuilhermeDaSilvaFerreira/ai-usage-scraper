import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { Firm } from '../../database/entities/firm.entity.js';
import { FirmAlias } from '../../database/entities/firm-alias.entity.js';
import { DataSource as DataSourceEntity } from '../../database/entities/data-source.entity.js';
import { Person } from '../../database/entities/person.entity.js';
import { FirmSignal } from '../../database/entities/firm-signal.entity.js';
import { FirmScore } from '../../database/entities/firm-score.entity.js';
import { ScoreEvidence } from '../../database/entities/score-evidence.entity.js';
import { ScrapeJob } from '../../database/entities/scrape-job.entity.js';

import { PipelineController } from './pipeline.controller.js';

import { SeedingService, SEEDING_QUEUE } from './seeding/seeding.service.js';
import { SeedingProcessor } from './seeding/seeding.processor.js';
import { SecEdgarSource } from './seeding/sources/sec-edgar.source.js';
import { ExaSearchSource } from './seeding/sources/exa-search.source.js';
import { PublicRankingsSource } from './seeding/sources/public-rankings.source.js';
import { EntityResolutionService } from './seeding/entity-resolution.service.js';
import { FirmEnrichmentService } from './seeding/firm-enrichment.service.js';

import {
  CollectionService,
  COLLECTION_QUEUE,
  EXTRACTION_QUEUE,
} from './collection/collection.service.js';
import { CollectionProcessor } from './collection/collection.processor.js';
import {
  PeopleCollectionService,
  PEOPLE_COLLECTION_QUEUE,
} from './collection/people-collection.service.js';
import { PeopleCollectionProcessor } from './collection/people-collection.processor.js';
import { NewsCollector } from './collection/collectors/news.collector.js';
import { HiringCollector } from './collection/collectors/hiring.collector.js';
import { ConferenceCollector } from './collection/collectors/conference.collector.js';
import { WebsiteCollector } from './collection/collectors/website.collector.js';
import { LinkedInCollector } from './collection/collectors/linkedin.collector.js';

import { ExtractionPipelineService } from './extraction/extraction-pipeline.service.js';
import { ExtractionProcessor } from './extraction/extraction.processor.js';
import { RegexExtractor } from './extraction/extractors/regex.extractor.js';
import { NlpExtractor } from './extraction/extractors/nlp.extractor.js';
import { HeuristicExtractor } from './extraction/extractors/heuristic.extractor.js';
import { LlmExtractor } from './extraction/extractors/llm.extractor.js';

import { ScoringService } from './scoring/scoring.service.js';
import {
  ScoringProcessor,
  SCORING_QUEUE,
} from './scoring/scoring.processor.js';
import { ScoringEngine } from './scoring/scoring-engine.js';
import { AiTalentDimension } from './scoring/dimensions/ai-talent.dimension.js';
import { PublicActivityDimension } from './scoring/dimensions/public-activity.dimension.js';
import { HiringSignalsDimension } from './scoring/dimensions/hiring-signals.dimension.js';
import { ThoughtLeadershipDimension } from './scoring/dimensions/thought-leadership.dimension.js';
import { VendorPartnershipsDimension } from './scoring/dimensions/vendor-partnerships.dimension.js';
import { PortfolioStrategyDimension } from './scoring/dimensions/portfolio-strategy.dimension.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Firm,
      FirmAlias,
      DataSourceEntity,
      Person,
      FirmSignal,
      FirmScore,
      ScoreEvidence,
      ScrapeJob,
    ]),
    BullModule.registerQueue(
      { name: SEEDING_QUEUE },
      { name: COLLECTION_QUEUE },
      { name: PEOPLE_COLLECTION_QUEUE },
      { name: EXTRACTION_QUEUE },
      { name: SCORING_QUEUE },
    ),
  ],
  controllers: [PipelineController],
  providers: [
    // Seeding
    SeedingService,
    SeedingProcessor,
    SecEdgarSource,
    ExaSearchSource,
    PublicRankingsSource,
    EntityResolutionService,
    FirmEnrichmentService,

    // Signal collection
    CollectionService,
    CollectionProcessor,

    // People collection
    PeopleCollectionService,
    PeopleCollectionProcessor,

    // Shared collectors
    NewsCollector,
    HiringCollector,
    ConferenceCollector,
    WebsiteCollector,
    LinkedInCollector,

    // Extraction
    ExtractionPipelineService,
    ExtractionProcessor,
    RegexExtractor,
    NlpExtractor,
    HeuristicExtractor,
    LlmExtractor,

    // Scoring
    ScoringService,
    ScoringProcessor,
    ScoringEngine,
    AiTalentDimension,
    PublicActivityDimension,
    HiringSignalsDimension,
    ThoughtLeadershipDimension,
    VendorPartnershipsDimension,
    PortfolioStrategyDimension,
  ],
  exports: [
    SeedingService,
    CollectionService,
    PeopleCollectionService,
    ScoringService,
  ],
})
export class PipelineModule {}

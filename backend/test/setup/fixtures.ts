import { v7 as uuidv7 } from 'uuid';
import { TestingModule } from '@nestjs/testing';
import { getRepo } from './test-db';
import { Firm } from '../../src/database/entities/firm.entity';
import { Person } from '../../src/database/entities/person.entity';
import { FirmSignal } from '../../src/database/entities/firm-signal.entity';
import { FirmScore } from '../../src/database/entities/firm-score.entity';
import { ScoreEvidence } from '../../src/database/entities/score-evidence.entity';
import { DataSource } from '../../src/database/entities/data-source.entity';
import { FirmAlias } from '../../src/database/entities/firm-alias.entity';
import { ScrapeJob } from '../../src/database/entities/scrape-job.entity';
import { OutreachCampaign } from '../../src/database/entities/outreach-campaign.entity';
import { FirmType } from '../../src/common/enums/firm-type.enum';
import { RoleCategory } from '../../src/common/enums/role-category.enum';
import { SignalType } from '../../src/common/enums/signal-type.enum';
import { SourceType } from '../../src/common/enums/source-type.enum';
import { DataSourceTarget } from '../../src/common/enums/data-source-target.enum';
import { ExtractionMethod } from '../../src/common/enums/extraction-method.enum';
import {
  OutreachStatus,
  ContactPlatform,
} from '../../src/common/enums/outreach-status.enum';
import { JobType, JobStatus } from '../../src/common/enums/job-type.enum';

let counter = 0;
function seq() {
  return ++counter;
}

export async function createFirm(
  module: TestingModule,
  overrides: Partial<Firm> = {},
): Promise<Firm> {
  const n = seq();
  const repo = getRepo(module, Firm);
  const firm = repo.create({
    id: uuidv7(),
    name: `Test Firm ${n}`,
    slug: `test-firm-${n}`,
    firm_type: FirmType.BUYOUT,
    is_active: true,
    ...overrides,
  });
  return repo.save(firm);
}

export async function createPerson(
  module: TestingModule,
  firmId: string,
  overrides: Partial<Person> = {},
): Promise<Person> {
  const n = seq();
  const repo = getRepo(module, Person);
  const person = repo.create({
    id: uuidv7(),
    firm_id: firmId,
    full_name: `Test Person ${n}`,
    title: 'Managing Director',
    role_category: RoleCategory.OTHER,
    confidence: 0.8,
    ...overrides,
  });
  return repo.save(person);
}

export async function createDataSource(
  module: TestingModule,
  overrides: Partial<DataSource> = {},
): Promise<DataSource> {
  const n = seq();
  const repo = getRepo(module, DataSource);
  const ds = repo.create({
    id: uuidv7(),
    source_type: SourceType.NEWS,
    target_entity: DataSourceTarget.FIRM_SIGNALS,
    url: `https://example.com/article-${n}`,
    title: `Test Source ${n}`,
    content_snippet: 'Some test content snippet for the data source.',
    reliability_score: 0.7,
    ...overrides,
  });
  return repo.save(ds);
}

export async function createFirmSignal(
  module: TestingModule,
  firmId: string,
  overrides: Partial<FirmSignal> = {},
): Promise<FirmSignal> {
  const n = seq();
  const repo = getRepo(module, FirmSignal);
  const signal = repo.create({
    id: uuidv7(),
    firm_id: firmId,
    signal_type: SignalType.AI_NEWS_MENTION,
    signal_data: {
      title: `Test signal ${n}`,
      description: 'AI initiative detected',
    },
    extraction_method: ExtractionMethod.HEURISTIC,
    extraction_confidence: 0.8,
    ...overrides,
  });
  return repo.save(signal);
}

export async function createFirmScore(
  module: TestingModule,
  firmId: string,
  overrides: Partial<FirmScore> = {},
): Promise<FirmScore> {
  const repo = getRepo(module, FirmScore);
  const score = repo.create({
    id: uuidv7(),
    firm_id: firmId,
    score_version: 'v1.0',
    overall_score: 75.5,
    dimension_scores: {
      ai_talent_density: {
        dimension: 'ai_talent_density',
        raw_score: 80,
        weighted_score: 20,
        signal_count: 2,
        max_possible: 100,
      },
    },
    signal_count: 5,
    rank: 1,
    scoring_parameters: {
      weights: {
        ai_talent_density: 0.25,
        public_ai_activity: 0.2,
        ai_hiring_velocity: 0.2,
        thought_leadership: 0.15,
        vendor_partnerships: 0.1,
        portfolio_ai_strategy: 0.1,
      },
      thresholds: {
        min_signals_for_score: 1,
        high_confidence_threshold: 0.7,
      },
    },
    ...overrides,
  });
  return repo.save(score);
}

export async function createScoreEvidence(
  module: TestingModule,
  scoreId: string,
  signalId: string,
  overrides: Partial<ScoreEvidence> = {},
): Promise<ScoreEvidence> {
  const repo = getRepo(module, ScoreEvidence);
  const evidence = repo.create({
    id: uuidv7(),
    firm_score_id: scoreId,
    firm_signal_id: signalId,
    dimension: 'ai_talent_density',
    weight_applied: 0.25,
    points_contributed: 10,
    reasoning: 'Signal indicates AI talent presence',
    ...overrides,
  });
  return repo.save(evidence);
}

export async function createOutreachCampaign(
  module: TestingModule,
  firmId: string,
  personId: string,
  overrides: Partial<OutreachCampaign> = {},
): Promise<OutreachCampaign> {
  const repo = getRepo(module, OutreachCampaign);
  const campaign = repo.create({
    id: uuidv7(),
    firm_id: firmId,
    person_id: personId,
    status: OutreachStatus.NOT_CONTACTED,
    ...overrides,
  });
  return repo.save(campaign);
}

export async function createScrapeJob(
  module: TestingModule,
  overrides: Partial<ScrapeJob> = {},
): Promise<ScrapeJob> {
  const repo = getRepo(module, ScrapeJob);
  const job = repo.create({
    id: uuidv7(),
    job_type: JobType.COLLECT,
    status: JobStatus.COMPLETED,
    started_at: new Date(),
    completed_at: new Date(),
    ...overrides,
  });
  return repo.save(job);
}

export async function createFirmAlias(
  module: TestingModule,
  firmId: string,
  aliasName: string,
): Promise<FirmAlias> {
  const repo = getRepo(module, FirmAlias);
  const alias = repo.create({
    id: uuidv7(),
    firm_id: firmId,
    alias_name: aliasName,
    source: 'test',
  });
  return repo.save(alias);
}

export {
  FirmType,
  RoleCategory,
  SignalType,
  SourceType,
  DataSourceTarget,
  ExtractionMethod,
  OutreachStatus,
  ContactPlatform,
  JobType,
  JobStatus,
};

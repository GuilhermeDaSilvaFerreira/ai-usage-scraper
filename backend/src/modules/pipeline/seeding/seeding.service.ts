import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Firm } from '../../../database/entities/firm.entity.js';
import { FirmAlias } from '../../../database/entities/firm-alias.entity.js';
import { DataSource as DataSourceEntity } from '../../../database/entities/data-source.entity.js';
import { ScrapeJob } from '../../../database/entities/scrape-job.entity.js';
import { SourceType } from '../../../common/enums/source-type.enum.js';
import { DataSourceTarget } from '../../../common/enums/data-source-target.enum.js';
import { JobType, JobStatus } from '../../../common/enums/job-type.enum.js';
import {
  createSlug,
  cleanFirmName,
  CommonLogger,
} from '../../../common/utils/index.js';
import { SecEdgarSource } from './sources/sec-edgar.source.js';
import { ExaSearchSource } from './sources/exa-search.source.js';
import { PublicRankingsSource } from './sources/public-rankings.source.js';
import { EntityResolutionService } from './entity-resolution.service.js';
import { FirmEnrichmentService } from './firm-enrichment.service.js';
import { SeedFirmCandidate } from './sources/sec-edgar.source.js';

export const SEEDING_QUEUE = 'seeding';

interface MergedFirm extends SeedFirmCandidate {
  aliases: string[];
  sources: string[];
}

const MAX_ROUNDS = 5;

@Injectable()
export class SeedingService {
  private readonly logger = new CommonLogger(SeedingService.name);
  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(FirmAlias)
    private readonly aliasRepo: Repository<FirmAlias>,
    @InjectRepository(DataSourceEntity)
    private readonly dataSourceRepo: Repository<DataSourceEntity>,
    @InjectRepository(ScrapeJob)
    private readonly jobRepo: Repository<ScrapeJob>,
    private readonly secEdgarSource: SecEdgarSource,
    private readonly exaSearchSource: ExaSearchSource,
    private readonly publicRankingsSource: PublicRankingsSource,
    private readonly entityResolution: EntityResolutionService,
    private readonly firmEnrichment: FirmEnrichmentService,
  ) {}

  async seed(
    target: number,
    queueJobId?: string,
  ): Promise<{
    firmsCreated: number;
    firmsUpdated: number;
    firmsEnriched: number;
    firmsInDb: number;
    targetFirmCount: number;
    rounds: number;
  }> {
    const job = this.jobRepo.create({
      job_type: JobType.SEED,
      status: JobStatus.RUNNING,
      started_at: new Date(),
      queue_job_id: queueJobId ?? null,
      metadata: { target_firm_count: target },
    });
    await this.jobRepo.save(job);

    try {
      const existingCount = await this.firmRepo.count();
      this.logger.log(
        `Starting seeding — target: ${target} total firms in DB, currently: ${existingCount}`,
      );

      if (existingCount >= target) {
        this.logger.log(
          `DB already has ${existingCount} firms (>= target ${target}). Skipping discovery, running enrichment only.`,
        );

        const enrichResult = await this.firmEnrichment.enrichFirmsWithGaps();

        job.status = JobStatus.COMPLETED;
        job.completed_at = new Date();
        job.metadata = {
          target_firm_count: target,
          firms_created: 0,
          firms_updated: 0,
          firms_enriched: enrichResult.enriched,
          firms_in_db: existingCount,
          rounds: 0,
        };
        await this.jobRepo.save(job);

        return {
          firmsCreated: 0,
          firmsUpdated: 0,
          firmsEnriched: enrichResult.enriched,
          firmsInDb: existingCount,
          targetFirmCount: target,
          rounds: 0,
        };
      }

      let totalCreated = 0;
      let totalUpdated = 0;
      let round = 0;
      let currentCount = existingCount;
      let consecutiveEmptyRounds = 0;

      while (currentCount < target && round < MAX_ROUNDS) {
        round++;
        const deficit = target - currentCount;
        this.logger.log(
          `Round ${round}/${MAX_ROUNDS}: ${currentCount}/${target} firms in DB, need ${deficit} more`,
        );

        const lookupTarget = Math.ceil(deficit * (1 + round * 0.5));
        const pageOffset = round - 1;

        const [secCandidates, exaCandidates, publicCandidates] =
          await Promise.all([
            this.secEdgarSource.discoverFirms(lookupTarget, pageOffset),
            this.exaSearchSource.discoverFirms(lookupTarget, pageOffset),
            round <= 2
              ? this.publicRankingsSource.discoverFirms()
              : Promise.resolve([]),
          ]);

        this.logger.log(
          `Round ${round} raw candidates — SEC: ${secCandidates.length}, Exa: ${exaCandidates.length}, Public: ${publicCandidates.length}`,
        );

        const allCandidates = [
          ...secCandidates,
          ...exaCandidates,
          ...publicCandidates,
        ];

        const merged = this.entityResolution.deduplicate(allCandidates);
        this.logger.log(
          `Round ${round} after dedup: ${merged.length} unique firms`,
        );

        const selected = this.diversifiedSelect(merged, deficit);
        this.logger.log(
          `Round ${round}: selected ${selected.length} firms to persist`,
        );

        const { created, updated } = await this.persistFirms(selected);
        totalCreated += created;
        totalUpdated += updated;
        currentCount = await this.firmRepo.count();

        this.logger.log(
          `Round ${round} result: ${created} created, ${updated} updated (DB now has ${currentCount}/${target} firms)`,
        );

        if (created === 0) {
          consecutiveEmptyRounds++;
          this.logger.warn(
            `No new firms created this round (${consecutiveEmptyRounds} consecutive empty round(s))`,
          );
          if (consecutiveEmptyRounds >= 2) {
            this.logger.warn(
              'Two consecutive rounds with no new firms — stopping',
            );
            break;
          }
        } else {
          consecutiveEmptyRounds = 0;
        }
      }

      this.logger.log('Starting firm enrichment phase...');
      const enrichResult = await this.firmEnrichment.enrichFirmsWithGaps();

      job.status = JobStatus.COMPLETED;
      job.completed_at = new Date();
      job.metadata = {
        target_firm_count: target,
        firms_created: totalCreated,
        firms_updated: totalUpdated,
        firms_in_db: currentCount,
        firms_enriched: enrichResult.enriched,
        rounds: round,
      };
      await this.jobRepo.save(job);

      this.logger.log(
        `Seeding complete: ${totalCreated} created, ${totalUpdated} updated, ${enrichResult.enriched} enriched across ${round} round(s). DB now has ${currentCount} firms.`,
      );

      return {
        firmsCreated: totalCreated,
        firmsUpdated: totalUpdated,
        firmsEnriched: enrichResult.enriched,
        firmsInDb: currentCount,
        targetFirmCount: target,
        rounds: round,
      };
    } catch (error) {
      job.status = JobStatus.FAILED;
      job.error_message = String(error);
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      this.logger.error(`Seeding failed: ${error}`);
      throw error;
    }
  }

  /**
   * Select firms from the merged pool with proportional representation across
   * sources so that SEC Edgar and Exa don't get drowned out by Wikipedia/seed data.
   */
  private diversifiedSelect(merged: MergedFirm[], limit: number): MergedFirm[] {
    const buckets: Record<string, MergedFirm[]> = {
      sec_edgar: [],
      exa: [],
      public_ranking: [],
    };

    for (const firm of merged) {
      const primarySource = firm.sources[0] || firm.source;
      if (primarySource.startsWith('sec_edgar')) {
        buckets.sec_edgar.push(firm);
      } else if (primarySource.startsWith('exa')) {
        buckets.exa.push(firm);
      } else {
        buckets.public_ranking.push(firm);
      }
    }

    for (const arr of Object.values(buckets)) {
      arr.sort((a, b) => (b.aumUsd ?? 0) - (a.aumUsd ?? 0));
    }

    this.logger.log(
      `Source buckets — SEC: ${buckets.sec_edgar.length}, Exa: ${buckets.exa.length}, Public: ${buckets.public_ranking.length}`,
    );

    const weights = { sec_edgar: 0.3, exa: 0.3, public_ranking: 0.4 };
    const selected = new Map<string, MergedFirm>();

    for (const [source, weight] of Object.entries(weights)) {
      const quota = Math.ceil(limit * weight);
      const bucket = buckets[source];
      for (let i = 0; i < Math.min(quota, bucket.length); i++) {
        const key = createSlug(bucket[i].name);
        if (!selected.has(key)) {
          selected.set(key, bucket[i]);
        }
      }
    }

    // Backfill if any bucket was under-represented: take from any source
    if (selected.size < limit) {
      const allSorted = [...merged].sort(
        (a, b) => (b.aumUsd ?? 0) - (a.aumUsd ?? 0),
      );
      for (const firm of allSorted) {
        if (selected.size >= limit) break;
        const key = createSlug(firm.name);
        if (!selected.has(key)) {
          selected.set(key, firm);
        }
      }
    }

    return Array.from(selected.values());
  }

  private async persistFirms(
    candidates: MergedFirm[],
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const candidate of candidates) {
      const cleaned = cleanFirmName(candidate.name);
      if (!cleaned) {
        this.logger.debug(`Skipped invalid name: "${candidate.name}"`);
        continue;
      }

      const slug = createSlug(cleaned);
      if (!slug || slug.length < 2) {
        this.logger.debug(`Skipped invalid slug for: "${cleaned}"`);
        continue;
      }

      let firm = await this.firmRepo.findOne({ where: { slug } });

      if (firm) {
        let changed = false;
        if (
          candidate.aumUsd &&
          (!firm.aum_usd || candidate.aumUsd > Number(firm.aum_usd))
        ) {
          firm.aum_usd = candidate.aumUsd;
          changed = true;
        }
        if (!firm.website && candidate.website) {
          firm.website = candidate.website;
          changed = true;
        }
        if (!firm.headquarters && candidate.headquarters) {
          firm.headquarters = candidate.headquarters;
          changed = true;
        }
        if (!firm.firm_type && candidate.firmType) {
          firm.firm_type = candidate.firmType;
          changed = true;
        }
        if (!firm.sec_crd_number && candidate.secCrdNumber) {
          firm.sec_crd_number = candidate.secCrdNumber;
          changed = true;
        }
        if (changed) {
          await this.firmRepo.save(firm);
          updated++;
        }
      } else {
        firm = this.firmRepo.create({
          name: cleaned,
          slug,
          website: candidate.website || null,
          aum_usd: candidate.aumUsd || null,
          aum_source: candidate.source,
          firm_type: candidate.firmType || null,
          headquarters: candidate.headquarters || null,
          sec_crd_number: candidate.secCrdNumber || null,
          is_active: true,
        });
        await this.firmRepo.save(firm);
        created++;
        this.logger.debug(
          `Created firm: "${cleaned}" (source: ${candidate.source})`,
        );
      }

      if ('aliases' in candidate) {
        const aliases = candidate.aliases;
        for (const aliasName of aliases) {
          const cleanedAlias = cleanFirmName(aliasName);
          if (!cleanedAlias) continue;
          const exists = await this.aliasRepo.findOne({
            where: { firm_id: firm.id, alias_name: cleanedAlias },
          });
          if (!exists) {
            await this.aliasRepo.save(
              this.aliasRepo.create({
                firm_id: firm.id,
                alias_name: cleanedAlias,
                source: candidate.source,
              }),
            );
          }
        }
      }

      const srcList: string[] = candidate.sources
        ? candidate.sources
        : [candidate.source];
      for (const src of srcList) {
        const sourceType = this.mapSourceType(src);
        const ds = this.dataSourceRepo.create({
          source_type: sourceType,
          target_entity: DataSourceTarget.FIRMS,
          url: null,
          title: `Seeding: ${cleaned}`,
          reliability_score: 0.6,
          metadata: { firm_name: cleaned, seed_source: src },
        });
        await this.dataSourceRepo.save(ds);

        if (!firm.data_source_id) {
          firm.data_source_id = ds.id;
          await this.firmRepo.save(firm);
        }
      }
    }

    return { created, updated };
  }

  private mapSourceType(source: string): SourceType {
    if (source.startsWith('sec_edgar')) return SourceType.SEC_EDGAR;
    if (source.startsWith('exa')) return SourceType.EXA_SEARCH;
    if (source.startsWith('public_ranking')) return SourceType.PUBLIC_RANKING;
    return SourceType.EXA_SEARCH;
  }
}

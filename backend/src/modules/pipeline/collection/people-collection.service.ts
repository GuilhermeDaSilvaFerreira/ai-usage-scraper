import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Firm } from '../../../database/entities/firm.entity.js';
import { FirmAlias } from '../../../database/entities/firm-alias.entity.js';
import { DataSource as DataSourceEntity } from '../../../database/entities/data-source.entity.js';
import { Person } from '../../../database/entities/person.entity.js';
import { ScrapeJob } from '../../../database/entities/scrape-job.entity.js';
import {
  JobType,
  JobStatus,
  DataSourceTarget,
  RoleCategory,
} from '../../../common/enums/index.js';
import {
  computeContentHash,
  truncate,
  CommonLogger,
} from '../../../common/utils/index.js';
import { CollectedContent } from './collectors/news.collector.js';
import { LinkedInCollector } from './collectors/linkedin.collector.js';
import { WebsiteCollector } from './collectors/website.collector.js';

export { PEOPLE_COLLECTION_QUEUE } from './collection.constants.js';

@Injectable()
export class PeopleCollectionService {
  private readonly logger = new CommonLogger(PeopleCollectionService.name);
  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    @InjectRepository(FirmAlias)
    private readonly aliasRepo: Repository<FirmAlias>,
    @InjectRepository(DataSourceEntity)
    private readonly dataSourceRepo: Repository<DataSourceEntity>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    @InjectRepository(ScrapeJob)
    private readonly jobRepo: Repository<ScrapeJob>,
    private readonly linkedInCollector: LinkedInCollector,
    private readonly websiteCollector: WebsiteCollector,
  ) {}

  async collectPeopleForFirm(
    firmId: string,
    queueJobId?: string,
  ): Promise<number> {
    const firm = await this.firmRepo.findOneByOrFail({ id: firmId });
    this.logger.log(`Starting people collection for: ${firm.name}`);

    const aliases = await this.aliasRepo.find({ where: { firm_id: firmId } });
    const aliasNames = aliases
      .map((a) => a.alias_name)
      .filter((name) => name !== firm.name);
    const searchNames =
      aliasNames.length > 0 ? [firm.name, ...aliasNames] : [firm.name];

    const job = this.jobRepo.create({
      firm_id: firmId,
      job_type: JobType.COLLECT_PEOPLE,
      status: JobStatus.RUNNING,
      started_at: new Date(),
      queue_job_id: queueJobId ?? null,
    });
    await this.jobRepo.save(job);

    try {
      const [linkedinResults, websiteResults] = await Promise.allSettled([
        this.linkedInCollector.collectPeople(searchNames),
        this.websiteCollector.collectForPeople(firm.name, firm.website),
      ]);

      const allContent: CollectedContent[] = [];
      for (const result of [linkedinResults, websiteResults]) {
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
          target_entity: DataSourceTarget.PEOPLE,
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

      let peopleCreated = 0;
      for (let i = 0; i < savedSources.length; i++) {
        const created = await this.extractAndSavePeople(
          newContent[i],
          savedSources[i].id,
          firmId,
        );
        peopleCreated += created;
      }

      job.status = JobStatus.COMPLETED;
      job.completed_at = new Date();
      job.metadata = {
        total_collected: allContent.length,
        new_sources: savedSources.length,
        duplicates_skipped: allContent.length - savedSources.length,
        people_created: peopleCreated,
      };
      await this.jobRepo.save(job);

      this.logger.log(
        `People collection complete for ${firm.name}: ${savedSources.length} sources, ${peopleCreated} people`,
      );

      return savedSources.length;
    } catch (error) {
      job.status = JobStatus.FAILED;
      job.error_message = String(error);
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      throw error;
    }
  }

  private async extractAndSavePeople(
    content: CollectedContent,
    dataSourceId: string,
    firmId: string,
  ): Promise<number> {
    const people = this.parsePeopleFromContent(content);
    let created = 0;

    for (const person of people) {
      const existing = await this.personRepo.findOne({
        where: { firm_id: firmId, full_name: person.fullName },
      });
      if (existing) continue;

      await this.personRepo.save(
        this.personRepo.create({
          firm_id: firmId,
          full_name: person.fullName,
          title: person.title,
          role_category: person.roleCategory,
          linkedin_url: person.linkedinUrl,
          email: person.email,
          data_source_id: dataSourceId,
          confidence: person.confidence,
        }),
      );
      created++;
    }

    return created;
  }

  private parsePeopleFromContent(content: CollectedContent): ParsedPerson[] {
    const people: ParsedPerson[] = [];

    if (content.url.includes('linkedin.com')) {
      const person = this.parseLinkedInProfile(content);
      if (person) people.push(person);
    } else {
      const websitePeople = this.parseWebsiteTeamPage(content);
      people.push(...websitePeople);
    }

    return people;
  }

  /**
   * LinkedIn profile titles typically follow:
   * "FirstName LastName - Title at Company | LinkedIn"
   * "FirstName LastName | Title | LinkedIn"
   */
  private parseLinkedInProfile(content: CollectedContent): ParsedPerson | null {
    const title = content.title || '';

    const dashMatch = title.match(
      /^(.+?)\s*[-–—]\s*(.+?)(?:\s+at\s+.+?)?\s*\|/,
    );
    const pipeMatch = title.match(/^(.+?)\s*\|\s*(.+?)\s*\|/);
    const match = dashMatch || pipeMatch;

    if (!match) return null;

    const fullName = match[1].trim();
    const roleTitle = match[2].trim();

    if (fullName.length < 3 || fullName.split(' ').length < 2) return null;

    const roleCategory = this.inferRoleCategory(roleTitle);
    if (!this.isAiRelevantRole(roleTitle)) return null;

    return {
      fullName,
      title: roleTitle,
      roleCategory,
      linkedinUrl: content.url,
      email: this.extractEmail(content.content),
      confidence: 0.75,
    };
  }

  private parseWebsiteTeamPage(content: CollectedContent): ParsedPerson[] {
    const people: ParsedPerson[] = [];
    const text = content.content;

    const patterns = [
      /(?:^|\n)\s*([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+)\s*[-–—,]\s*((?:Chief|Head|VP|Director|Partner|Managing|Senior|Principal)[^,\n]{5,60})/gm,
      /(?:^|\n)\s*([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+)\s*\n\s*((?:Chief|Head|VP|Director|Partner|Managing|Senior|Principal)[^,\n]{5,60})/gm,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const fullName = match[1].trim();
        const roleTitle = match[2].trim();

        if (fullName.length < 3) continue;

        const roleCategory = this.inferRoleCategory(roleTitle);
        const surroundingText = text.slice(
          Math.max(0, match.index - 200),
          match.index + match[0].length + 200,
        );

        people.push({
          fullName,
          title: roleTitle,
          roleCategory,
          linkedinUrl: null,
          email: this.extractEmail(surroundingText),
          confidence: 0.5,
        });
      }
    }

    return people;
  }

  private isAiRelevantRole(title: string): boolean {
    const lower = title.toLowerCase();
    const aiKeywords = [
      'data',
      'ai',
      'artificial intelligence',
      'machine learning',
      'technology',
      'cto',
      'cdo',
      'chief technology',
      'chief data',
      'chief digital',
      'chief information',
      'head of tech',
      'head of data',
      'head of ai',
      'vp engineering',
      'vp technology',
      'vp data',
      'analytics',
      'digital',
      'innovation',
    ];
    return aiKeywords.some((kw) => lower.includes(kw));
  }

  private inferRoleCategory(title: string): RoleCategory {
    const lower = title.toLowerCase();
    if (lower.includes('chief data') || lower.includes('head of data'))
      return RoleCategory.HEAD_OF_DATA;
    if (
      lower.includes('chief technology') ||
      lower.includes('cto') ||
      lower.includes('head of tech')
    )
      return RoleCategory.HEAD_OF_TECH;
    if (lower.includes('operating partner'))
      return RoleCategory.OPERATING_PARTNER;
    if (lower.includes('hire') || lower.includes('appointed'))
      return RoleCategory.AI_HIRE;
    return RoleCategory.OTHER;
  }

  private extractEmail(text: string): string | null {
    const match = text.match(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    );
    return match ? match[0].toLowerCase() : null;
  }

  private assessReliability(content: CollectedContent): number {
    const url = content.url.toLowerCase();
    if (url.includes('linkedin.com')) return 0.7;
    return 0.5;
  }
}

interface ParsedPerson {
  fullName: string;
  title: string | null;
  roleCategory: RoleCategory;
  linkedinUrl: string | null;
  email: string | null;
  confidence: number;
}

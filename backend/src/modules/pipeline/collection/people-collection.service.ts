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
import {
  WebsiteCollector,
  MailtoPair,
} from './collectors/website.collector.js';
import {
  SecAdvCollector,
  SecAdvPerson,
} from './collectors/sec-adv.collector.js';
import { LlmPeopleExtractor } from './llm-people-extractor.js';
import { LlmExtractedPerson } from '../../../integrations/openai/openai.service.js';

export { PEOPLE_COLLECTION_QUEUE } from './collection.constants.js';

const MAX_BIO_LENGTH = 1500;

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
    private readonly secAdvCollector: SecAdvCollector,
    private readonly llmExtractor: LlmPeopleExtractor,
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
      const [linkedinResults, websiteResults, secAdvResults] =
        await Promise.allSettled([
          this.linkedInCollector.collectPeople(searchNames),
          this.websiteCollector.collectForPeople(firm.name, firm.website),
          this.secAdvCollector.collectForPeople(firm.name, firm.sec_crd_number),
        ]);

      const allContent: CollectedContent[] = [];
      for (const result of [linkedinResults, websiteResults, secAdvResults]) {
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

      const llmResults = await this.llmExtractor.extractForFirm(
        firm.name,
        newContent,
      );

      let peopleCreated = 0;
      for (let i = 0; i < savedSources.length; i++) {
        const created = await this.extractAndSavePeople(
          newContent[i],
          savedSources[i].id,
          firmId,
          llmResults.get(newContent[i].url) ?? null,
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
    llmPeople: LlmExtractedPerson[] | null,
  ): Promise<number> {
    const people = this.parsePeopleFromContent(content, llmPeople);
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
          bio: person.bio,
          data_source_id: dataSourceId,
          confidence: person.confidence,
        }),
      );
      created++;
    }

    return created;
  }

  private parsePeopleFromContent(
    content: CollectedContent,
    llmPeople: LlmExtractedPerson[] | null,
  ): ParsedPerson[] {
    const parsedPeople = (content.metadata as { parsedPeople?: SecAdvPerson[] })
      ?.parsedPeople;
    if (Array.isArray(parsedPeople) && parsedPeople.length > 0) {
      return parsedPeople.map((p) => ({
        fullName: p.fullName,
        title: p.title,
        bio: p.bio ? truncate(p.bio, MAX_BIO_LENGTH) : null,
        roleCategory: this.inferRoleCategory(p.title || ''),
        linkedinUrl: null,
        email: null,
        confidence: 0.85,
      }));
    }

    if (llmPeople && llmPeople.length > 0) {
      return this.fromLlmPeople(content, llmPeople);
    }

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

  private fromLlmPeople(
    content: CollectedContent,
    llmPeople: LlmExtractedPerson[],
  ): ParsedPerson[] {
    const isLinkedIn = content.url.includes('linkedin.com');
    const mailtoPairs =
      (content.metadata as { mailtoPairs?: MailtoPair[] })?.mailtoPairs ?? [];

    const out: ParsedPerson[] = [];
    for (const p of llmPeople) {
      const title = p.title ?? '';
      const roleCategory = this.inferRoleCategory(title);

      if (isLinkedIn && !this.isAiRelevantRole(title, roleCategory)) {
        continue;
      }

      const linkedinUrl = p.linkedinUrl ?? (isLinkedIn ? content.url : null);
      const email =
        p.email ??
        (mailtoPairs.length > 0
          ? this.findMailtoEmailFor(p.fullName, mailtoPairs)
          : null);

      out.push({
        fullName: p.fullName,
        title: title || null,
        bio: p.bio ? truncate(p.bio, MAX_BIO_LENGTH) : null,
        roleCategory,
        linkedinUrl,
        email,
        confidence: p.confidence,
      });
    }
    return out;
  }

  /**
   * LinkedIn profile titles typically follow:
   * "FirstName LastName - Title at Company | LinkedIn"
   * "FirstName LastName | Title | LinkedIn"
   *
   * The Exa snippet (`content.content`) usually contains the public "About"
   * section, which we use as bio. LinkedIn never exposes member emails to
   * scrapers, so email is intentionally always null on this path.
   */
  private parseLinkedInProfile(content: CollectedContent): ParsedPerson | null {
    const title = content.title || '';

    const dashMatch = title.match(
      /^(.+?)\s*[-–—]\s*(.+?)(?:\s+at\s+.+?)?\s*\|/,
    );
    const pipeMatch = title.match(/^(.+?)\s*\|\s*(.+?)\s*\|/);
    const match = dashMatch || pipeMatch;

    let fullName: string;
    let roleTitle: string;

    if (match) {
      fullName = match[1].trim();
      roleTitle = match[2].trim();
    } else {
      // Fallback: try to recover name/title from the snippet body, which Exa
      // populates with the rendered LinkedIn page text.
      const snippetMatch = content.content.match(
        /^([A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){1,3})\s*[|\-–—]\s*([^|\n]{3,80})/u,
      );
      if (!snippetMatch) return null;
      fullName = snippetMatch[1].trim();
      roleTitle = snippetMatch[2].trim();
    }

    if (fullName.length < 3 || fullName.split(' ').length < 2) return null;

    const roleCategory = this.inferRoleCategory(roleTitle);
    if (!this.isAiRelevantRole(roleTitle, roleCategory)) return null;

    return {
      fullName,
      title: roleTitle,
      bio: this.extractLinkedInBio(content.content, fullName),
      roleCategory,
      linkedinUrl: content.url,
      email: null,
      confidence: 0.75,
    };
  }

  private extractLinkedInBio(text: string, fullName: string): string | null {
    if (!text || text.length < 50) return null;

    const aboutIdx = text.search(/\bAbout\b\s*[:\n]/i);
    if (aboutIdx !== -1) {
      const after = text
        .slice(aboutIdx + 'About'.length)
        .replace(/^[\s:.\-–—]+/, '')
        .trim();
      if (after.length > 30) return truncate(after, MAX_BIO_LENGTH);
    }

    const nameIdx = text.toLowerCase().indexOf(fullName.toLowerCase());
    const start = nameIdx === -1 ? 0 : nameIdx + fullName.length;
    const tail = text
      .slice(start)
      .replace(/^[\s|\-–—:,]+/, '')
      .trim();
    if (tail.length > 50) return truncate(tail, MAX_BIO_LENGTH);

    return truncate(text.trim(), MAX_BIO_LENGTH);
  }

  private parseWebsiteTeamPage(content: CollectedContent): ParsedPerson[] {
    const people: ParsedPerson[] = [];
    const text = content.content;
    const mailtoPairs =
      (content.metadata as { mailtoPairs?: MailtoPair[] })?.mailtoPairs ?? [];

    const patterns = [
      /(?:^|\n)\s*([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+)\s*[-–—,]\s*((?:Chief|Head|VP|Director|Partner|Managing|Senior|Principal)[^,\n]{5,60})/gm,
      /(?:^|\n)\s*([A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+)\s*\n\s*((?:Chief|Head|VP|Director|Partner|Managing|Senior|Principal)[^,\n]{5,60})/gm,
    ];

    const seen = new Set<string>();

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const fullName = match[1].trim();
        const roleTitle = match[2].trim();

        if (fullName.length < 3) continue;
        if (seen.has(fullName.toLowerCase())) continue;
        seen.add(fullName.toLowerCase());

        const roleCategory = this.inferRoleCategory(roleTitle);
        const surroundingText = text.slice(
          Math.max(0, match.index - 200),
          match.index + match[0].length + 600,
        );

        const bio = this.extractWebsiteBio(text, match.index, match[0].length);
        const email =
          this.findMailtoEmailFor(fullName, mailtoPairs) ??
          this.extractEmail(surroundingText);

        people.push({
          fullName,
          title: roleTitle,
          bio,
          roleCategory,
          linkedinUrl: null,
          email,
          confidence: 0.5,
        });
      }
    }

    return people;
  }

  private extractWebsiteBio(
    text: string,
    matchIndex: number,
    matchLength: number,
  ): string | null {
    const startOfBio = matchIndex + matchLength;
    if (startOfBio >= text.length) return null;

    let bioEnd = Math.min(text.length, startOfBio + MAX_BIO_LENGTH);

    // Stop at the next "Name - Title" / "Name\nTitle" boundary so we don't
    // bleed into the next bio.
    const nextName = text
      .slice(startOfBio + 50, bioEnd)
      .search(
        /\b[A-Z][a-z]+ (?:[A-Z]\. )?[A-Z][a-z]+\s*(?:[-–—,]|\n)\s*(?:Chief|Head|VP|Director|Partner|Managing|Senior|Principal)/,
      );
    if (nextName !== -1) {
      bioEnd = startOfBio + 50 + nextName;
    }

    const raw = text
      .slice(startOfBio, bioEnd)
      .replace(/^[\s,.\-–—:|]+/, '')
      .trim();
    if (raw.length < 30) return null;

    return truncate(raw, MAX_BIO_LENGTH);
  }

  private isAiRelevantRole(title: string, category: RoleCategory): boolean {
    if (
      category === RoleCategory.HEAD_OF_DATA ||
      category === RoleCategory.HEAD_OF_TECH ||
      category === RoleCategory.OPERATING_PARTNER ||
      category === RoleCategory.AI_HIRE
    ) {
      return true;
    }

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

  private findMailtoEmailFor(
    fullName: string,
    pairs: MailtoPair[],
  ): string | null {
    if (pairs.length === 0) return null;

    const lowerName = fullName.toLowerCase();
    const parts = lowerName.split(/\s+/).filter((p) => p.length > 1);
    const surname = parts[parts.length - 1];

    for (const pair of pairs) {
      const ctx = pair.context.toLowerCase();
      if (ctx.includes(lowerName)) return pair.email;
    }
    if (!surname) return null;
    for (const pair of pairs) {
      const ctx = pair.context.toLowerCase();
      if (ctx.includes(surname)) return pair.email;
    }
    return null;
  }

  private extractEmail(text: string): string | null {
    const direct = text.match(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    );
    if (direct) return direct[0].toLowerCase();

    // Common obfuscations: name [at] firm [dot] com, name (at) firm.com
    const obfuscated = text.match(
      /\b([A-Za-z0-9._%+-]+)\s*[[(]\s*at\s*[\])]\s*([A-Za-z0-9.-]+)(?:\s*[[(]\s*dot\s*[\])]\s*([a-z]{2,}))?(\.[A-Za-z0-9.-]+)?\b/i,
    );
    if (obfuscated) {
      const [, local, domain, dotTld, suffix] = obfuscated;
      const tld = dotTld ? `.${dotTld}` : suffix || '';
      if (!tld) return null;
      const candidate = `${local}@${domain}${tld}`.toLowerCase();
      if (/.+@.+\..+/.test(candidate)) return candidate;
    }

    return null;
  }

  private assessReliability(content: CollectedContent): number {
    const url = content.url.toLowerCase();
    if (url.includes('linkedin.com')) return 0.7;
    if (url.includes('adviserinfo.sec.gov')) return 0.9;
    return 0.5;
  }
}

interface ParsedPerson {
  fullName: string;
  title: string | null;
  bio: string | null;
  roleCategory: RoleCategory;
  linkedinUrl: string | null;
  email: string | null;
  confidence: number;
}

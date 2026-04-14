import { Injectable, Logger } from '@nestjs/common';
import { ExaService } from '../../../../integrations/exa/exa.service.js';
import { SourceType } from '../../../../common/enums/index.js';
import { CollectedContent } from './news.collector.js';
import { extractHttpErrorDetails } from '../../../../common/utils/index.js';

@Injectable()
export class LinkedInCollector {
  private readonly logger = new Logger(LinkedInCollector.name);

  constructor(private readonly exa: ExaService) {}

  async collectPeople(firmNames: string[]): Promise<CollectedContent[]> {
    const primaryName = firmNames[0];

    const queryTemplates = [
      (name: string) =>
        `"${name}" AI data chief technology officer site:linkedin.com`,
      (name: string) =>
        `"${name}" "head of data" OR "chief data officer" OR "VP technology" site:linkedin.com`,
      (name: string) =>
        `"${name}" "head of AI" OR "VP engineering" OR "CTO" site:linkedin.com`,
    ];

    const results = await this.runQueries(firmNames, queryTemplates, {
      includeDomains: ['linkedin.com'],
    });

    this.logger.debug(
      `Collected ${results.length} LinkedIn people items for ${primaryName}`,
    );
    return results;
  }

  async collectSignals(firmNames: string[]): Promise<CollectedContent[]> {
    const primaryName = firmNames[0];

    const queryTemplates = [
      (name: string) =>
        `"${name}" AI implementation OR adoption OR strategy site:linkedin.com`,
      (name: string) =>
        `"${name}" machine learning OR "generative AI" OR GPT OR LLM site:linkedin.com`,
      (name: string) =>
        `"${name}" artificial intelligence partnership OR investment linkedin`,
    ];

    const results = await this.runQueries(firmNames, queryTemplates, {
      includeDomains: ['linkedin.com'],
      startPublishedDate: this.getOneYearAgo(),
    });

    this.logger.debug(
      `Collected ${results.length} LinkedIn signal items for ${primaryName}`,
    );
    return results;
  }

  private async runQueries(
    firmNames: string[],
    queryTemplates: Array<(name: string) => string>,
    searchOpts: { includeDomains?: string[]; startPublishedDate?: string },
  ): Promise<CollectedContent[]> {
    const results: CollectedContent[] = [];

    const queries = firmNames.flatMap((name) =>
      queryTemplates.map((tpl) => tpl(name)),
    );

    for (const query of queries) {
      try {
        const searchResults = await this.exa.search(query, {
          numResults: 5,
          ...searchOpts,
        });

        for (const r of searchResults) {
          if (r.text && r.text.length > 50) {
            results.push({
              url: r.url,
              title: r.title,
              content: r.text,
              sourceType: SourceType.LINKEDIN,
              publishedDate: r.publishedDate,
              metadata: { query },
            });
          }
        }
      } catch (error) {
        this.logger.warn(`LinkedIn search failed for "${query}"`, {
          ...extractHttpErrorDetails(error),
        });
      }
    }

    return results;
  }

  private getOneYearAgo(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0];
  }
}

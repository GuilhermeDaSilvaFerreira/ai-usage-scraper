import { Injectable, Logger } from '@nestjs/common';
import { ExaService } from '../../../../integrations/exa/exa.service.js';
import { SourceType } from '../../../../common/enums/index.js';
import { CollectedContent } from './news.collector.js';

@Injectable()
export class HiringCollector {
  private readonly logger = new Logger(HiringCollector.name);

  constructor(private readonly exa: ExaService) {}

  async collect(
    firmNames: string[],
    website?: string | null,
  ): Promise<CollectedContent[]> {
    const results: CollectedContent[] = [];
    const primaryName = firmNames[0];

    const queryTemplates = [
      (name: string) =>
        `"${name}" hiring "data scientist" OR "machine learning" OR "AI engineer" OR "chief data officer"`,
      (name: string) =>
        `"${name}" job opening artificial intelligence analytics`,
      (name: string) => `"${name}" careers data technology engineering`,
    ];

    const queries = firmNames.flatMap((name) =>
      queryTemplates.map((tpl) => tpl(name)),
    );

    if (website) {
      queries.push(
        `site:${new URL(website).hostname} careers data AI technology`,
      );
    }

    for (const query of queries) {
      try {
        const searchResults = await this.exa.search(query, {
          numResults: 5,
          startPublishedDate: this.getSixMonthsAgo(),
        });

        for (const r of searchResults) {
          if (r.text && r.text.length > 50) {
            results.push({
              url: r.url,
              title: r.title,
              content: r.text,
              sourceType: SourceType.HIRING_BOARD,
              publishedDate: r.publishedDate,
              metadata: { query },
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Hiring search failed for "${query}": ${error}`);
      }
    }

    this.logger.debug(
      `Collected ${results.length} hiring items for ${primaryName}`,
    );
    return results;
  }

  private getSixMonthsAgo(): string {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date.toISOString().split('T')[0];
  }
}

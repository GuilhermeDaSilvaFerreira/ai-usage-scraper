import { Injectable, Logger } from '@nestjs/common';
import { ExaService } from '../../../../integrations/exa/exa.service.js';
import { SourceType } from '../../../../common/enums/index.js';
import { extractHttpErrorDetails } from '../../../../common/utils/index.js';

export interface CollectedContent {
  url: string;
  title: string;
  content: string;
  sourceType: SourceType;
  publishedDate?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NewsCollector {
  private readonly logger = new Logger(NewsCollector.name);

  constructor(private readonly exa: ExaService) {}

  async collect(firmNames: string[]): Promise<CollectedContent[]> {
    const results: CollectedContent[] = [];
    const primaryName = firmNames[0];

    const queryTemplates = [
      (name: string) => `"${name}" artificial intelligence AI adoption`,
      (name: string) => `"${name}" machine learning data science technology`,
      (name: string) => `"${name}" AI partnership technology investment`,
      (name: string) => `"${name}" digital transformation data analytics`,
    ];

    const queries = firmNames.flatMap((name) =>
      queryTemplates.map((tpl) => tpl(name)),
    );

    for (const query of queries) {
      try {
        const searchResults = await this.exa.search(query, {
          numResults: 5,
          category: 'news',
          startPublishedDate: this.getOneYearAgo(),
        });

        for (const r of searchResults) {
          if (r.text && r.text.length > 100) {
            results.push({
              url: r.url,
              title: r.title,
              content: r.text,
              sourceType: SourceType.NEWS,
              publishedDate: r.publishedDate,
              metadata: { query, score: r.score },
            });
          }
        }
      } catch (error) {
        this.logger.warn(`News search failed for query "${query}"`, {
          ...extractHttpErrorDetails(error),
        });
      }
    }

    this.logger.debug(
      `Collected ${results.length} news items for ${primaryName}`,
    );
    return results;
  }

  private getOneYearAgo(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0];
  }
}

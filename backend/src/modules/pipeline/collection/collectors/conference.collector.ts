import { Injectable, Logger } from '@nestjs/common';
import { ExaService } from '../../../../integrations/exa/exa.service.js';
import { SourceType } from '../../../../common/enums/index.js';
import { CollectedContent } from './news.collector.js';
import { extractHttpErrorDetails } from '../../../../common/utils/index.js';

@Injectable()
export class ConferenceCollector {
  private readonly logger = new Logger(ConferenceCollector.name);

  constructor(private readonly exa: ExaService) {}

  async collect(firmNames: string[]): Promise<CollectedContent[]> {
    const results: CollectedContent[] = [];
    const primaryName = firmNames[0];

    const queryTemplates = [
      (name: string) =>
        `"${name}" conference speaker AI artificial intelligence panel`,
      (name: string) => `"${name}" keynote presentation technology data summit`,
      (name: string) => `"${name}" podcast AI private equity technology`,
      (name: string) =>
        `"${name}" thought leadership AI machine learning whitepaper`,
    ];

    const queries = firmNames.flatMap((name) =>
      queryTemplates.map((tpl) => tpl(name)),
    );

    for (const query of queries) {
      try {
        const searchResults = await this.exa.search(query, {
          numResults: 5,
          startPublishedDate: this.getTwoYearsAgo(),
        });

        for (const r of searchResults) {
          if (r.text && r.text.length > 100) {
            const sourceType = this.classifySource(r.url, r.title);
            results.push({
              url: r.url,
              title: r.title,
              content: r.text,
              sourceType,
              publishedDate: r.publishedDate,
              metadata: { query, author: r.author },
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Conference search failed for "${query}"`, {
          ...extractHttpErrorDetails(error),
        });
      }
    }

    this.logger.debug(
      `Collected ${results.length} conference/thought-leadership items for ${primaryName}`,
    );
    return results;
  }

  private classifySource(url: string, title: string): SourceType {
    const lower = (url + ' ' + title).toLowerCase();
    if (lower.includes('podcast') || lower.includes('episode'))
      return SourceType.PODCAST;
    if (lower.includes('conference') || lower.includes('summit'))
      return SourceType.CONFERENCE;
    return SourceType.CONFERENCE;
  }

  private getTwoYearsAgo(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 2);
    return date.toISOString().split('T')[0];
  }
}

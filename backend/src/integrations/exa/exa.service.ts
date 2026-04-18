import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Exa from 'exa-js';
import { exaRateLimiter } from '../../common/utils/index.js';

export interface ExaSearchResult {
  url: string;
  title: string;
  text: string;
  publishedDate?: string;
  author?: string;
  score?: number;
}

@Injectable()
export class ExaService {
  private readonly logger = new Logger(ExaService.name);
  private client: Exa | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('scrapers.exaApiKey');
    if (apiKey) {
      this.client = new Exa(apiKey);
    } else {
      this.logger.warn(
        'scrapers.exaApiKey not set; Exa searches will be skipped',
      );
    }
  }

  async search(
    query: string,
    options?: {
      numResults?: number;
      category?: string;
      startPublishedDate?: string;
      includeDomains?: string[];
    },
  ): Promise<ExaSearchResult[]> {
    if (!this.client) return [];

    return exaRateLimiter.wrap(async () => {
      try {
        const result = await this.client!.searchAndContents(query, {
          numResults: options?.numResults ?? 10,
          text: true,
          category: options?.category,
          startPublishedDate: options?.startPublishedDate,
          includeDomains: options?.includeDomains,
        });

        return (result.results ?? []).map((r) => ({
          url: r.url ?? '',
          title: r.title ?? '',
          text: r.text ?? '',
          publishedDate: r.publishedDate,
          author: r.author,
          score: r.score,
        }));
      } catch (error) {
        this.logger.error(`Exa search failed for "${query}": ${error}`);
        return [];
      }
    });
  }

  async findSimilar(url: string, numResults = 5): Promise<ExaSearchResult[]> {
    if (!this.client) return [];

    return exaRateLimiter.wrap(async () => {
      try {
        const result = await this.client!.findSimilarAndContents(url, {
          numResults,
          text: true,
        });

        return (result.results ?? []).map((r) => ({
          url: r.url ?? '',
          title: r.title ?? '',
          text: r.text ?? '',
          publishedDate: r.publishedDate,
          author: r.author,
          score: r.score,
        }));
      } catch (error) {
        this.logger.error(`Exa findSimilar failed for "${url}": ${error}`);
        return [];
      }
    });
  }
}

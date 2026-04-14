import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  webRateLimiter,
  extractHttpErrorDetails,
} from '../../../../common/utils/index.js';
import { SourceType } from '../../../../common/enums/index.js';
import { CollectedContent } from './news.collector.js';

const SIGNAL_PATHS = [
  '/',
  '/about',
  '/technology',
  '/data',
  '/innovation',
  '/portfolio',
];

const PEOPLE_PATHS = ['/team', '/people', '/leadership', '/about/team'];

@Injectable()
export class WebsiteCollector {
  private readonly logger = new Logger(WebsiteCollector.name);

  async collect(
    firmName: string,
    website?: string | null,
    paths?: string[],
  ): Promise<CollectedContent[]> {
    if (!website) return [];
    const results: CollectedContent[] = [];

    const pagePaths = paths ?? [...SIGNAL_PATHS, ...PEOPLE_PATHS];

    for (const path of pagePaths) {
      try {
        const url = new URL(path, website).toString();
        const content = await this.fetchPage(url);
        if (content && content.length > 100) {
          results.push({
            url,
            title: `${firmName} - ${path}`,
            content,
            sourceType: SourceType.FIRM_WEBSITE,
            metadata: { path },
          });
        }
      } catch {
        // Page doesn't exist or is blocked; continue
      }
    }

    this.logger.debug(
      `Collected ${results.length} website pages for ${firmName}`,
    );
    return results;
  }

  async collectForSignals(
    firmName: string,
    website?: string | null,
  ): Promise<CollectedContent[]> {
    return this.collect(firmName, website, SIGNAL_PATHS);
  }

  async collectForPeople(
    firmName: string,
    website?: string | null,
  ): Promise<CollectedContent[]> {
    return this.collect(firmName, website, PEOPLE_PATHS);
  }

  private async fetchPage(url: string): Promise<string | null> {
    return webRateLimiter.wrap(async () => {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PEIntelligenceBot/1.0)',
          },
          timeout: 15000,
          maxRedirects: 3,
        });

        const html = response.data as string;
        const $ = cheerio.load(html);

        $('script, style, nav, footer, header').remove();

        return $('body').text().replace(/\s+/g, ' ').trim();
      } catch (error) {
        this.logger.debug('Failed to fetch page', {
          ...extractHttpErrorDetails(error),
        });
        return null;
      }
    });
  }
}

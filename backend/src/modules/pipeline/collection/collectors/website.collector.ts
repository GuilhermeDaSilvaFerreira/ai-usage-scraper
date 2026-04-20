import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  webRateLimiter,
  extractHttpErrorDetails,
} from '../../../../common/utils/index.js';
import { SourceType } from '../../../../common/enums/index.js';
import { ExaService } from '../../../../integrations/exa/exa.service.js';
import { CollectedContent } from './news.collector.js';

const SIGNAL_PATHS = [
  '/',
  '/about',
  '/technology',
  '/data',
  '/innovation',
  '/portfolio',
];

const PEOPLE_PATHS = [
  '/team',
  '/people',
  '/our-team',
  '/our-people',
  '/leadership',
  '/management',
  '/professionals',
  '/who-we-are',
  '/about/team',
  '/about/leadership',
  '/about/people',
  '/firm/leadership',
  '/firm/team',
  '/company/team',
];

export interface MailtoPair {
  email: string;
  context: string;
}

@Injectable()
export class WebsiteCollector {
  private readonly logger = new Logger(WebsiteCollector.name);

  constructor(private readonly exa: ExaService) {}

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
        const fetched = await this.fetchPage(url);
        if (fetched && fetched.text.length > 100) {
          results.push({
            url,
            title: `${firmName} - ${path}`,
            content: fetched.text,
            sourceType: SourceType.FIRM_WEBSITE,
            metadata: {
              path,
              ...(fetched.mailtoPairs.length > 0 && {
                mailtoPairs: fetched.mailtoPairs,
              }),
            },
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
    if (!website) return [];

    const direct = await this.collect(firmName, website, PEOPLE_PATHS);

    if (direct.length === 0) {
      const exaFallback = await this.collectViaExa(firmName, website);
      if (exaFallback.length > 0) {
        this.logger.debug(
          `Website fallback via Exa contents returned ${exaFallback.length} pages for ${firmName}`,
        );
        return exaFallback;
      }
    }

    this.logger.debug(
      `Collected ${direct.length} website pages for ${firmName}`,
    );
    return direct;
  }

  private async collectViaExa(
    firmName: string,
    website: string,
  ): Promise<CollectedContent[]> {
    const candidateUrls = PEOPLE_PATHS.map((p) => {
      try {
        return new URL(p, website).toString();
      } catch {
        return null;
      }
    }).filter((u): u is string => u !== null);

    if (candidateUrls.length === 0) return [];

    const fetched = await this.exa.getContents(candidateUrls);
    return fetched
      .filter((r) => r.text && r.text.length > 100)
      .map((r) => ({
        url: r.url,
        title: r.title || `${firmName} - team`,
        content: r.text,
        sourceType: SourceType.FIRM_WEBSITE,
        metadata: { source: 'exa_contents' },
      }));
  }

  private async fetchPage(
    url: string,
  ): Promise<{ text: string; mailtoPairs: MailtoPair[] } | null> {
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

        const mailtoPairs: MailtoPair[] = [];
        $('a[href^="mailto:"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const email = href
            .replace(/^mailto:/i, '')
            .split('?')[0]
            .trim();
          if (!email || !/.+@.+\..+/.test(email)) return;

          const anchorText = $(el).text().trim();
          const parentText = $(el).parent().text().replace(/\s+/g, ' ').trim();
          const context = (
            anchorText && anchorText.length > 2
              ? `${anchorText} | ${parentText}`
              : parentText
          ).slice(0, 200);

          mailtoPairs.push({ email: email.toLowerCase(), context });
        });

        $('script, style, nav, footer, header').remove();

        const text = $('body').text().replace(/\s+/g, ' ').trim();

        return { text, mailtoPairs };
      } catch (error) {
        this.logger.debug('Failed to fetch page', {
          ...extractHttpErrorDetails(error),
        });
        return null;
      }
    });
  }
}

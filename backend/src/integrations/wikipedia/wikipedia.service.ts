import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  webRateLimiter,
  extractHttpErrorDetails,
} from '../../common/utils/index.js';

export interface WikipediaFirmInfo {
  pageTitle: string;
  url: string;
  description?: string;
  foundedYear?: number;
  headquarters?: string;
  aumUsd?: number;
  numEmployees?: number;
}

interface OpenSearchResponse {
  0: string;
  1: string[];
  2: string[];
  3: string[];
}

interface SummaryResponse {
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
  type?: string;
}

interface ParseResponse {
  parse?: {
    title?: string;
    wikitext?: { '*': string };
  };
}

const COMPANY_HINTS = [
  /\b(private equity|investment management|asset management|hedge fund|investment firm|venture capital|holding company|financial services|company|firm)\b/i,
];

@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent':
          'PEIntelligence/1.0 (firm enrichment; contact: admin@example.com)',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Resolve a firm name to the most likely Wikipedia page and extract
   * structured fields from its summary + infobox.
   * Returns null when no plausible page is found.
   */
  async getFirmInfo(firmName: string): Promise<WikipediaFirmInfo | null> {
    const candidate = await this.resolvePageTitle(firmName);
    if (!candidate) return null;

    const [summary, wikitext] = await Promise.all([
      this.fetchSummary(candidate),
      this.fetchWikitext(candidate),
    ]);

    if (!summary && !wikitext) return null;

    const info: WikipediaFirmInfo = {
      pageTitle: candidate,
      url:
        summary?.content_urls?.desktop?.page ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(
          candidate.replace(/\s+/g, '_'),
        )}`,
    };

    if (summary?.extract && summary.extract.length > 30) {
      info.description = summary.extract.slice(0, 500).trim();
    }

    if (wikitext) {
      const parsed = this.parseInfobox(wikitext);
      if (parsed.foundedYear) info.foundedYear = parsed.foundedYear;
      if (parsed.headquarters) info.headquarters = parsed.headquarters;
      if (parsed.aumUsd) info.aumUsd = parsed.aumUsd;
      if (parsed.numEmployees) info.numEmployees = parsed.numEmployees;
    }

    return info;
  }

  private async resolvePageTitle(firmName: string): Promise<string | null> {
    return webRateLimiter.wrap(async () => {
      try {
        const resp = await this.http.get<unknown>(
          'https://en.wikipedia.org/w/api.php',
          {
            params: {
              action: 'opensearch',
              search: firmName,
              limit: 5,
              namespace: 0,
              format: 'json',
            },
          },
        );

        const data = resp.data as OpenSearchResponse | undefined;
        const titles = data?.[1] ?? [];
        const descriptions = data?.[2] ?? [];
        if (titles.length === 0) return null;

        const nameLower = firmName.toLowerCase();
        const scored = titles.map((title, i) => ({
          title,
          description: descriptions[i] || '',
          score: this.scoreCandidate(nameLower, title, descriptions[i] || ''),
        }));

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        return best.score > 0 ? best.title : null;
      } catch (error) {
        this.logger.debug('Wikipedia opensearch failed', {
          firmName,
          ...extractHttpErrorDetails(error),
        });
        return null;
      }
    });
  }

  private scoreCandidate(
    nameLower: string,
    title: string,
    description: string,
  ): number {
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    let score = 0;

    if (titleLower === nameLower) score += 10;
    else if (titleLower.startsWith(nameLower)) score += 5;
    else if (titleLower.includes(nameLower)) score += 3;
    else return 0;

    if (
      titleLower.includes('(company)') ||
      titleLower.includes('(firm)') ||
      titleLower.includes('(investment')
    ) {
      score += 3;
    }

    if (COMPANY_HINTS.some((re) => re.test(descLower))) score += 4;

    if (
      descLower.includes('disambiguation') ||
      descLower.includes('person') ||
      descLower.includes('actor') ||
      descLower.includes('musician')
    ) {
      score -= 5;
    }

    return score;
  }

  private async fetchSummary(title: string): Promise<SummaryResponse | null> {
    return webRateLimiter.wrap(async () => {
      try {
        const resp = await this.http.get<SummaryResponse>(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            title.replace(/\s+/g, '_'),
          )}`,
        );
        return resp.data;
      } catch (error) {
        this.logger.debug('Wikipedia summary fetch failed', {
          title,
          ...extractHttpErrorDetails(error),
        });
        return null;
      }
    });
  }

  private async fetchWikitext(title: string): Promise<string | null> {
    return webRateLimiter.wrap(async () => {
      try {
        const resp = await this.http.get<ParseResponse>(
          'https://en.wikipedia.org/w/api.php',
          {
            params: {
              action: 'parse',
              page: title,
              prop: 'wikitext',
              format: 'json',
              redirects: 1,
            },
          },
        );
        return resp.data?.parse?.wikitext?.['*'] ?? null;
      } catch (error) {
        this.logger.debug('Wikipedia wikitext fetch failed', {
          title,
          ...extractHttpErrorDetails(error),
        });
        return null;
      }
    });
  }

  /**
   * Pulls structured fields from the first {{Infobox company}} (or similar)
   * found in the page wikitext. Tolerates the many formatting variants
   * used by Wikipedia editors.
   */
  parseInfobox(wikitext: string): {
    foundedYear?: number;
    headquarters?: string;
    aumUsd?: number;
    numEmployees?: number;
  } {
    const infobox = this.extractInfoboxBlock(wikitext);
    if (!infobox) return {};

    const fields = this.parseInfoboxFields(infobox);
    const result: {
      foundedYear?: number;
      headquarters?: string;
      aumUsd?: number;
      numEmployees?: number;
    } = {};

    const foundedRaw =
      fields['founded'] || fields['foundation'] || fields['formation'];
    if (foundedRaw) {
      const yearMatch = foundedRaw.match(/(\d{4})/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        if (year >= 1800 && year <= new Date().getFullYear()) {
          result.foundedYear = year;
        }
      }
    }

    const hqRaw =
      fields['hq_location'] ||
      fields['hq_location_city'] ||
      fields['headquarters'] ||
      fields['location'] ||
      fields['location_city'];
    if (hqRaw) {
      const cleaned = this.stripWikitext(hqRaw);
      const country =
        fields['hq_location_country'] || fields['location_country'];
      const hq = country
        ? `${cleaned}, ${this.stripWikitext(country)}`
        : cleaned;
      if (hq.length > 1 && hq.length < 100) {
        result.headquarters = hq;
      }
    }

    const aumRaw = fields['aum'] || fields['assets'] || fields['assets_under_management'];
    if (aumRaw) {
      const aum = this.parseMoneyAmount(aumRaw);
      if (aum) result.aumUsd = aum;
    }

    const empRaw = fields['num_employees'] || fields['employees'];
    if (empRaw) {
      const cleaned = this.stripWikitext(empRaw).replace(/[,~]/g, '');
      const numMatch = cleaned.match(/([\d,.]+)\s*(?:\(|$)/);
      if (numMatch) {
        const n = parseInt(numMatch[1].replace(/[.,]/g, ''), 10);
        if (n > 0 && n < 10_000_000) result.numEmployees = n;
      }
    }

    return result;
  }

  /**
   * Returns the inner contents of the first {{Infobox ...}} template,
   * excluding the surrounding `{{` and `}}` braces. Tracks template
   * nesting so nested templates inside fields don't terminate early.
   */
  private extractInfoboxBlock(wikitext: string): string | null {
    const start = wikitext.search(/\{\{\s*Infobox\b/i);
    if (start === -1) return null;

    const innerStart = start + 2;
    let depth = 1;
    let i = innerStart;
    while (i < wikitext.length) {
      if (wikitext.startsWith('{{', i)) {
        depth++;
        i += 2;
      } else if (wikitext.startsWith('}}', i)) {
        depth--;
        if (depth === 0) return wikitext.slice(innerStart, i);
        i += 2;
      } else {
        i++;
      }
    }
    return null;
  }

  /**
   * Splits an infobox body into `key = value` pairs at top-level `|` only,
   * ignoring `|` inside nested templates and wikilinks.
   */
  private parseInfoboxFields(infobox: string): Record<string, string> {
    const fields: Record<string, string> = {};
    let depth = 0;
    let buf = '';
    const segments: string[] = [];

    for (let i = 0; i < infobox.length; i++) {
      const ch = infobox[i];
      const next = infobox[i + 1];
      if (ch === '{' && next === '{') {
        depth++;
        buf += '{{';
        i++;
      } else if (ch === '}' && next === '}') {
        depth--;
        buf += '}}';
        i++;
      } else if (ch === '[' && next === '[') {
        depth++;
        buf += '[[';
        i++;
      } else if (ch === ']' && next === ']') {
        depth--;
        buf += ']]';
        i++;
      } else if (ch === '|' && depth === 0) {
        segments.push(buf);
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf) segments.push(buf);

    for (const seg of segments) {
      const eq = seg.indexOf('=');
      if (eq === -1) continue;
      const key = seg.slice(0, eq).trim().toLowerCase().replace(/\s+/g, '_');
      const value = seg.slice(eq + 1).trim();
      if (key && value) fields[key] = value;
    }
    return fields;
  }

  private stripWikitext(s: string): string {
    return s
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1')
      .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '')
      .replace(/<ref\b[^>]*\/>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/'{2,}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parses values like "$73.2 billion (2024)", "US$1.2 trillion", "€500M".
   * Returns the amount in USD (assumes USD if currency is omitted/$/US$).
   * Non-USD currencies return undefined to avoid silently storing bad data.
   */
  parseMoneyAmount(raw: string): number | undefined {
    const cleaned = this.stripWikitext(raw);
    const match = cleaned.match(
      /(US\$|\$|€|£|¥)?\s*([\d,.]+)\s*(trillion|billion|million|tn|bn|mn|t|b|m)\b/i,
    );
    if (!match) return undefined;

    const currency = (match[1] || '$').toUpperCase();
    if (currency !== '$' && currency !== 'US$') return undefined;

    const num = parseFloat(match[2].replace(/,/g, ''));
    if (!Number.isFinite(num)) return undefined;

    const unit = match[3].toLowerCase();
    let multiplier = 1;
    if (unit.startsWith('t')) multiplier = 1_000_000_000_000;
    else if (unit.startsWith('b')) multiplier = 1_000_000_000;
    else if (unit.startsWith('m')) multiplier = 1_000_000;

    const amount = num * multiplier;
    return amount > 0 ? amount : undefined;
  }
}

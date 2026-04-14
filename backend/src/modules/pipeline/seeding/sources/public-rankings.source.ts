import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  webRateLimiter,
  parseAumString,
  cleanFirmName,
  extractHttpErrorDetails,
} from '../../../../common/utils/index.js';
import { FirmType } from '../../../../common/enums/index.js';
import { SeedFirmCandidate } from './sec-edgar.source.js';

interface RankingSource {
  name: string;
  url: string;
  parser: (html: string) => SeedFirmCandidate[];
}

interface SeedFirmJson {
  name: string;
  aum?: number;
  type?: string;
  hq?: string;
  website?: string;
}

const FIRM_TYPE_MAP: Record<string, FirmType> = {
  buyout: FirmType.BUYOUT,
  growth: FirmType.GROWTH,
  credit: FirmType.CREDIT,
  direct_lending: FirmType.DIRECT_LENDING,
  distressed: FirmType.DISTRESSED,
  mezzanine: FirmType.MEZZANINE,
  secondaries: FirmType.SECONDARIES,
  multi_strategy: FirmType.MULTI_STRATEGY,
};

@Injectable()
export class PublicRankingsSource {
  private readonly logger = new Logger(PublicRankingsSource.name);

  private readonly sources: RankingSource[] = [
    {
      name: 'Wikipedia PE Firms',
      url: 'https://en.wikipedia.org/wiki/List_of_private_equity_firms',
      parser: this.parseWikipediaList.bind(this),
    },
  ];

  async discoverFirms(): Promise<SeedFirmCandidate[]> {
    const candidates: SeedFirmCandidate[] = [];

    for (const source of this.sources) {
      this.logger.log(`Fetching public ranking: ${source.name}`);
      try {
        const html = await webRateLimiter.wrap(async () => {
          const resp = await axios.get(source.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; PEIntelligenceBot/1.0)',
            },
            timeout: 30000,
          });
          return resp.data as string;
        });

        const parsed = source.parser(html);
        candidates.push(...parsed);
        this.logger.log(`${source.name}: extracted ${parsed.length} firms`);
      } catch (error) {
        this.logger.error(`Failed to fetch ${source.name}`, {
          ...extractHttpErrorDetails(error),
        });
      }
    }

    const seedFirms = this.loadSeedFirms();
    candidates.push(...seedFirms);

    this.logger.log(
      `Public rankings discovered ${candidates.length} firm candidates`,
    );
    return candidates;
  }

  private parseWikipediaList(html: string): SeedFirmCandidate[] {
    const candidates: SeedFirmCandidate[] = [];
    const seen = new Set<string>();
    const $ = cheerio.load(html);

    $('table.wikitable tbody tr').each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const name = this.extractFirmNameFromRow($, cells);
      if (!name) return;

      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const { hq, aum } = this.extractColumnsAfterName($, cells);

      let aumUsd: number | undefined;
      if (aum) {
        const parsed = parseAumString(aum);
        if (parsed) aumUsd = parsed;
      }

      candidates.push({
        name,
        headquarters: hq || undefined,
        aumUsd,
        source: 'public_ranking:wikipedia',
      });
    });

    return candidates;
  }

  /**
   * Tries to extract a valid firm name from a table row by inspecting the
   * first few cells. Skips purely numeric cells (rank columns), prefers
   * text from <a> tags (linked firm names) over raw cell text.
   */
  private extractFirmNameFromRow(
    $: ReturnType<typeof cheerio.load>,
    cells: ReturnType<ReturnType<typeof cheerio.load>>,
  ): string | null {
    for (let i = 0; i < Math.min(cells.length, 3); i++) {
      const cell = $(cells[i]);
      const link = cell.find('a').first();
      let text = (link.length ? link.text() : cell.text()).trim();

      text = text.replace(/\[\d+\]/g, '').trim();

      if (/^\d+$/.test(text)) continue;
      if (text.length < 2) continue;

      const cleaned = cleanFirmName(text);
      if (!cleaned) continue;

      return cleaned;
    }
    return null;
  }

  /**
   * After identifying the name column, grabs the next two columns as
   * headquarters and AUM respectively.
   */
  private extractColumnsAfterName(
    $: ReturnType<typeof cheerio.load>,
    cells: ReturnType<ReturnType<typeof cheerio.load>>,
  ): { hq: string | undefined; aum: string | undefined } {
    let nameColIdx = 0;
    for (let i = 0; i < Math.min(cells.length, 3); i++) {
      const cell = $(cells[i]);
      const link = cell.find('a').first();
      const text = (link.length ? link.text() : cell.text())
        .replace(/\[\d+\]/g, '')
        .trim();

      if (/^\d+$/.test(text) || text.length < 2) continue;
      if (!cleanFirmName(text)) continue;
      nameColIdx = i;
      break;
    }

    const hqIdx = nameColIdx + 1;
    const aumIdx = nameColIdx + 2;

    const hq =
      hqIdx < cells.length
        ? $(cells[hqIdx]).text().trim() || undefined
        : undefined;
    const aum =
      aumIdx < cells.length
        ? $(cells[aumIdx]).text().trim() || undefined
        : undefined;

    return { hq, aum };
  }

  private loadSeedFirms(): SeedFirmCandidate[] {
    const candidates: string[] = [
      join(__dirname, 'seed-firms.json'),
      join(
        process.cwd(),
        'src',
        'modules',
        'pipeline',
        'seeding',
        'sources',
        'seed-firms.json',
      ),
      join(
        process.cwd(),
        'dist',
        'src',
        'modules',
        'pipeline',
        'seeding',
        'sources',
        'seed-firms.json',
      ),
    ];

    for (const filePath of candidates) {
      if (!existsSync(filePath)) continue;

      try {
        const raw = readFileSync(filePath, 'utf-8');
        const firms: SeedFirmJson[] = JSON.parse(raw);
        this.logger.log(
          `Loaded ${firms.length} firms from seed-firms.json (${filePath})`,
        );

        return firms.map((f) => ({
          name: f.name,
          aumUsd: f.aum,
          firmType: f.type ? FIRM_TYPE_MAP[f.type] : undefined,
          headquarters: f.hq,
          website: f.website,
          source: 'public_ranking:seed_file',
        }));
      } catch (error) {
        this.logger.warn(`Failed to parse ${filePath}`, {
          error: error.message,
          stack: error.stack,
        });
      }
    }

    this.logger.error(`seed-firms.json not found in any candidate path`, {
      candidates: candidates.join(', '),
    });
    return [];
  }
}

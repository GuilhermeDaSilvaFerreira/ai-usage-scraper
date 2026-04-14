import { Injectable, Logger } from '@nestjs/common';
import { ExaService } from '../../../../integrations/exa/exa.service.js';
import { FirmType } from '../../../../common/enums/index.js';
import {
  parseAumString,
  cleanFirmName,
} from '../../../../common/utils/index.js';
import { SeedFirmCandidate } from './sec-edgar.source.js';

const EXA_QUERIES = [
  // Global ranking lists
  'largest private equity firms by AUM ranking',
  'top 100 private equity firms assets under management',
  'top 50 private equity firms 2024 2025',
  'PE 100 largest private equity firms global',
  'PEI 300 private equity ranking',
  'biggest alternative asset managers private equity',

  // Strategy-specific
  'top buyout firms assets under management ranking',
  'largest leveraged buyout firms by fund size',
  'biggest private credit firms direct lending AUM',
  'top growth equity firms by fund size ranking',
  'largest private debt managers by AUM ranking',
  'top direct lending firms AUM ranking 2024',
  'largest distressed debt private equity firms',
  'top mezzanine capital firms AUM ranking',
  'largest secondaries private equity firms by AUM',
  'top infrastructure private equity firms ranking',

  // Regional
  'largest European private equity firms by AUM',
  'top UK private equity firms ranking',
  'biggest private equity firms in Asia',
  'top private equity firms Middle East',
  'largest Nordic private equity firms',
  'top French private equity firms AUM',
  'German private equity firms ranking',
  'top Canadian private equity firms',

  // Mid-market
  'top middle market private equity firms',
  'mid-market private equity firms AUM ranking',
  'best middle market PE firms by fund size',
  'lower middle market private equity firms list',

  // Sector-focused
  'top healthcare private equity firms ranking',
  'largest technology-focused private equity firms',
  'top energy private equity firms by AUM',
  'financial services private equity firms ranking',
  'top industrials private equity firms',

  // Extended queries for subsequent rounds
  'private equity firms list comprehensive',
  'venture capital and growth equity firms ranking',
  'top real estate private equity firms',
  'largest hedge fund to private equity crossover firms',
  'emerging market private equity firms',
  'private equity firms Southeast Asia ranking',
  'Latin America private equity firms AUM',
  'Australian private equity firms ranking',
  'Japanese private equity firms list',
  'top private equity firms India',
];

const PE_SUFFIXES =
  /(?:Capital|Partners|Management|Group|Advisors?|Investments?|Holdings?|Equity|Credit|Lending|Associates|Fund|Ventures|Financial|Securities|Asset)/;

@Injectable()
export class ExaSearchSource {
  private readonly logger = new Logger(ExaSearchSource.name);

  constructor(private readonly exa: ExaService) {}

  async discoverFirms(
    targetFirmCount: number,
    pageOffset = 0,
  ): Promise<SeedFirmCandidate[]> {
    const candidates: SeedFirmCandidate[] = [];

    const scaleFactor = targetFirmCount / 500;
    const totalQueryCount = Math.max(
      6,
      Math.min(EXA_QUERIES.length, Math.ceil(EXA_QUERIES.length * scaleFactor)),
    );
    const numResults = Math.min(30, Math.ceil(15 * Math.max(1, scaleFactor)));

    const startIdx = pageOffset * Math.ceil(totalQueryCount / 2);
    const queries = EXA_QUERIES.slice(
      startIdx,
      startIdx + totalQueryCount,
    ).filter(Boolean);

    if (queries.length === 0) {
      this.logger.log(`Exa: no remaining queries for pageOffset=${pageOffset}`);
      return [];
    }

    this.logger.log(
      `Exa: running ${queries.length} queries (${numResults} results each, offset=${pageOffset})`,
    );

    for (const query of queries) {
      this.logger.log(`Searching Exa for: "${query}"`);
      try {
        const results = await this.exa.search(query, {
          numResults,
          category: 'company',
        });

        for (const result of results) {
          const extracted = this.extractFirmsFromText(result.text, result.url);
          candidates.push(...extracted);
        }
      } catch (error) {
        this.logger.error(`Exa search failed for "${query}"`, {
          error: error.message,
          stack: error.stack,
        });
      }
    }

    this.logger.log(`Exa discovered ${candidates.length} firm candidates`);
    return candidates;
  }

  private extractFirmsFromText(
    text: string,
    sourceUrl: string,
  ): SeedFirmCandidate[] {
    const candidates: SeedFirmCandidate[] = [];
    const seen = new Set<string>();

    // Normalize newlines and collapse whitespace for cleaner matching
    const normalized = text.replace(/\r\n/g, '\n');

    const firmPatterns = [
      // Numbered list: "1. Blackstone Capital — $100 billion"
      // Only space (not \s) in the character class to avoid matching across lines
      new RegExp(
        `(?:^|\\n)\\s*\\d+[.)]\\s+((?:[A-Z][A-Za-z &'()-]+ ?)+${PE_SUFFIXES.source})\\s*[-–—]?\\s*(?:\\$?([\\d,.]+)\\s*(?:billion|B|bn|trillion|T|million|M))?`,
        'gm',
      ),
      // "Apollo Capital has approximately $100 billion"
      // Case-sensitive: must start with uppercase
      new RegExp(
        `((?:[A-Z][A-Za-z]+ ?)+${PE_SUFFIXES.source})\\s+(?:has|manages|with|oversees)\\s+(?:approximately\\s+|over\\s+|more\\s+than\\s+)?\\$?([\\d,.]+)\\s*(?:billion|B|bn|trillion|T)`,
        'g',
      ),
      // "Apollo Capital, a leading private equity"
      new RegExp(
        `((?:[A-Z][A-Za-z]+ ?)+${PE_SUFFIXES.source})\\s*,\\s*(?:a\\s+)?(?:leading|top|major|global|prominent)\\s+(?:private\\s+)?(?:equity|credit|debt|lending|investment)`,
        'g',
      ),
    ];

    for (const pattern of firmPatterns) {
      let match;
      while ((match = pattern.exec(normalized)) !== null) {
        const rawName = match[1].trim();

        const name = cleanFirmName(rawName);
        if (!name) continue;
        if (name.length < 3 || name.length > 200) continue;

        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const aumStr = match[2];
        let aumUsd: number | undefined;
        if (aumStr) {
          const textAfterNum = normalized
            .slice(match.index + match[0].indexOf(aumStr))
            .slice(0, 30);
          const parsed = parseAumString(aumStr + ' ' + textAfterNum);
          if (parsed) aumUsd = parsed;
        }

        candidates.push({
          name,
          aumUsd,
          firmType: this.inferFirmTypeFromContext(normalized, match.index),
          source: `exa:${sourceUrl}`,
        });
      }
    }

    return candidates;
  }

  private inferFirmTypeFromContext(
    text: string,
    position: number,
  ): FirmType | undefined {
    const context = text
      .slice(Math.max(0, position - 200), position + 200)
      .toLowerCase();
    if (context.includes('buyout') || context.includes('leveraged'))
      return FirmType.BUYOUT;
    if (context.includes('growth equity') || context.includes('growth capital'))
      return FirmType.GROWTH;
    if (context.includes('private credit') || context.includes('private debt'))
      return FirmType.CREDIT;
    if (context.includes('direct lending')) return FirmType.DIRECT_LENDING;
    if (context.includes('distressed')) return FirmType.DISTRESSED;
    if (context.includes('mezzanine')) return FirmType.MEZZANINE;
    if (context.includes('secondar')) return FirmType.SECONDARIES;
    if (context.includes('infrastructure')) return FirmType.BUYOUT;
    return undefined;
  }
}

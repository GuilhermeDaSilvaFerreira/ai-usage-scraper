import { Injectable, Logger } from '@nestjs/common';
import { SecEdgarService } from '../../../../integrations/sec-edgar/sec-edgar.service.js';
import { FirmType } from '../../../../common/enums/index.js';

export interface SeedFirmCandidate {
  name: string;
  website?: string;
  headquarters?: string;
  secCrdNumber?: string;
  firmType?: FirmType;
  aumUsd?: number;
  source: string;
}

const PE_SEARCH_QUERIES = [
  'private equity fund',
  'buyout fund manager',
  'private credit fund',
  'direct lending fund',
  'growth equity fund',
  'distressed debt fund',
  'mezzanine fund',
  'secondaries fund',
  'private equity capital',
  'private equity management',
  'alternative investment fund',
  'leveraged buyout',
  'private debt fund',
  'credit opportunities fund',
  'special situations fund',
  'middle market private equity',
];

@Injectable()
export class SecEdgarSource {
  private readonly logger = new Logger(SecEdgarSource.name);

  constructor(private readonly secEdgar: SecEdgarService) {}

  async discoverFirms(
    targetFirmCount: number,
    pageOffset = 0,
  ): Promise<SeedFirmCandidate[]> {
    const candidates: SeedFirmCandidate[] = [];

    const scaleFactor = targetFirmCount / 500;
    const queryCount = Math.max(
      6,
      Math.min(
        PE_SEARCH_QUERIES.length,
        Math.ceil(PE_SEARCH_QUERIES.length * scaleFactor),
      ),
    );
    const queries = PE_SEARCH_QUERIES.slice(0, queryCount);

    this.logger.log(
      `SEC EDGAR: running ${queries.length}/${PE_SEARCH_QUERIES.length} queries (offset=${pageOffset})`,
    );

    for (const query of queries) {
      this.logger.log(`Searching SEC EDGAR for: "${query}"`);
      try {
        const results = await this.secEdgar.searchFirms(query);
        for (const firm of results) {
          if (!firm.name) continue;
          candidates.push({
            name: firm.name,
            headquarters:
              [firm.addresses.business.city, firm.addresses.business.state]
                .filter(Boolean)
                .join(', ') || undefined,
            secCrdNumber: firm.cik || undefined,
            firmType: this.inferFirmType(query),
            source: 'sec_edgar',
          });
        }
      } catch (error) {
        this.logger.error(`SEC EDGAR search failed for "${query}"`, {
          error: error.message,
          stack: error.stack,
        });
      }
    }

    const baseBulkPages = Math.max(0, Math.min(20, Math.ceil(8 * scaleFactor)));
    const startPage = pageOffset * baseBulkPages;
    const endPage = startPage + baseBulkPages;

    if (baseBulkPages > 0) {
      this.logger.log(
        `SEC EDGAR: fetching bulk adviser pages ${startPage}–${endPage - 1}...`,
      );
      for (let page = startPage; page < endPage; page++) {
        try {
          const advisers = await this.secEdgar.searchInvestmentAdvisers(
            page,
            100,
          );
          for (const adviser of advisers) {
            if (!adviser.name) continue;
            candidates.push({
              name: adviser.name,
              headquarters:
                [
                  adviser.addresses.business.city,
                  adviser.addresses.business.state,
                ]
                  .filter(Boolean)
                  .join(', ') || undefined,
              secCrdNumber: adviser.cik || undefined,
              source: 'sec_edgar:adviser_bulk',
            });
          }
        } catch (error) {
          this.logger.error(`SEC EDGAR adviser page ${page} failed`, {
            error: error.message,
            stack: error.stack,
          });
        }
      }
    }

    this.logger.log(
      `SEC EDGAR discovered ${candidates.length} firm candidates`,
    );
    return candidates;
  }

  private inferFirmType(query: string): FirmType | undefined {
    if (query.includes('buyout') || query.includes('leveraged'))
      return FirmType.BUYOUT;
    if (query.includes('growth')) return FirmType.GROWTH;
    if (query.includes('credit') || query.includes('debt'))
      return FirmType.CREDIT;
    if (query.includes('direct lending')) return FirmType.DIRECT_LENDING;
    if (query.includes('distressed') || query.includes('special situations'))
      return FirmType.DISTRESSED;
    if (query.includes('mezzanine')) return FirmType.MEZZANINE;
    if (query.includes('secondaries')) return FirmType.SECONDARIES;
    return undefined;
  }
}

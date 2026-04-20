import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Or, Equal, Repository } from 'typeorm';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Firm } from '../../../database/entities/firm.entity.js';
import { FirmType } from '../../../common/enums/index.js';
import { ExaService } from '../../../integrations/exa/exa.service.js';
import { WikipediaService } from '../../../integrations/wikipedia/wikipedia.service.js';
import {
  secEdgarRateLimiter,
  extractHttpErrorDetails,
  CommonLogger,
} from '../../../common/utils/index.js';
import { ConfigService } from '@nestjs/config';

interface EnrichmentResult {
  enriched: number;
  skipped: number;
  failed: number;
}

const ENRICHMENT_BATCH_SIZE = 15;

const FIRM_TYPE_KEYWORDS: Record<string, FirmType> = {
  buyout: FirmType.BUYOUT,
  'leveraged buyout': FirmType.BUYOUT,
  lbo: FirmType.BUYOUT,
  'growth equity': FirmType.GROWTH,
  'growth capital': FirmType.GROWTH,
  'venture growth': FirmType.GROWTH,
  'private credit': FirmType.CREDIT,
  'private debt': FirmType.CREDIT,
  'credit opportunities': FirmType.CREDIT,
  'direct lending': FirmType.DIRECT_LENDING,
  'senior lending': FirmType.DIRECT_LENDING,
  distressed: FirmType.DISTRESSED,
  'special situations': FirmType.DISTRESSED,
  mezzanine: FirmType.MEZZANINE,
  'subordinated debt': FirmType.MEZZANINE,
  secondaries: FirmType.SECONDARIES,
  'secondary investments': FirmType.SECONDARIES,
  'multi-strategy': FirmType.MULTI_STRATEGY,
  'multi strategy': FirmType.MULTI_STRATEGY,
  diversified: FirmType.MULTI_STRATEGY,
};

@Injectable()
export class FirmEnrichmentService {
  private readonly logger = new CommonLogger(FirmEnrichmentService.name);
  private readonly secEdgarUserAgent: string;

  constructor(
    @InjectRepository(Firm)
    private readonly firmRepo: Repository<Firm>,
    private readonly exa: ExaService,
    private readonly wikipedia: WikipediaService,
    private readonly config: ConfigService,
  ) {
    this.secEdgarUserAgent =
      this.config.get<string>('SEC_EDGAR_USER_AGENT') ||
      'PEIntelligence admin@example.com';
  }

  async enrichFirmsWithGaps(): Promise<EnrichmentResult> {
    const firms = await this.firmRepo.find({
      where: [
        { website: IsNull() },
        { description: IsNull() },
        { firm_type: IsNull() },
        { headquarters: Or(IsNull(), Equal('')) },
        { founded_year: IsNull() },
        { sec_crd_number: IsNull() },
        { aum_usd: IsNull() },
      ],
    });

    this.logger.log(
      `Enrichment: found ${firms.length} firms with missing data`,
    );

    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < firms.length; i += ENRICHMENT_BATCH_SIZE) {
      const batch = firms.slice(i, i + ENRICHMENT_BATCH_SIZE);
      const batchNum = Math.floor(i / ENRICHMENT_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(firms.length / ENRICHMENT_BATCH_SIZE);
      this.logger.log(
        `Enrichment batch ${batchNum}/${totalBatches} (${batch.length} firms)`,
      );

      const results = await Promise.allSettled(
        batch.map((firm) => {
          const missing = this.getMissingFields(firm);
          if (missing.length === 0) return Promise.resolve('skipped' as const);
          return this.enrichSingleFirm(firm, missing);
        }),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          failed++;
          this.logger.warn(`Enrichment failed: ${result.reason}`);
        } else if (result.value === 'skipped') {
          skipped++;
        } else if (result.value === true) {
          enriched++;
        } else {
          skipped++;
        }
      }
    }

    this.logger.log(
      `Enrichment complete: ${enriched} enriched, ${skipped} skipped, ${failed} failed`,
    );

    return { enriched, skipped, failed };
  }

  private getMissingFields(firm: Firm): string[] {
    const missing: string[] = [];
    if (!firm.website) missing.push('website');
    if (!firm.description) missing.push('description');
    if (!firm.firm_type) missing.push('firm_type');
    if (!firm.headquarters) missing.push('headquarters');
    if (!firm.founded_year) missing.push('founded_year');
    if (!firm.sec_crd_number) missing.push('sec_crd_number');
    if (!firm.aum_usd) missing.push('aum_usd');
    return missing;
  }

  private async enrichSingleFirm(
    firm: Firm,
    missing: string[],
  ): Promise<boolean> {
    let changed = false;

    const wantsExaFields = missing.some((f) =>
      [
        'website',
        'description',
        'firm_type',
        'founded_year',
        'headquarters',
        'aum_usd',
      ].includes(f),
    );

    // Run Exa (search-grounded prose) and Wikipedia (structured infobox) in
    // parallel. They cover different long-tails of firms, so combining them
    // boosts fill rate without lengthening the critical path.
    const [exaData, wikiData] = await Promise.all([
      wantsExaFields ? this.enrichFromExa(firm.name) : Promise.resolve({}),
      wantsExaFields
        ? this.enrichFromWikipedia(firm.name)
        : Promise.resolve({}),
    ]);

    // Wikipedia first: infobox values are typically high-quality structured
    // data. Exa fills any remaining gaps from search snippets.
    if (this.applyEnrichment(firm, wikiData)) changed = true;
    if (this.applyEnrichment(firm, exaData)) changed = true;

    if (
      firm.website &&
      missing.some((f) =>
        ['description', 'founded_year', 'headquarters'].includes(f),
      )
    ) {
      const webData = await this.enrichFromWebsite(firm.website, firm.name);
      if (this.applyEnrichment(firm, webData)) changed = true;
    }

    if (
      missing.includes('sec_crd_number') ||
      (!firm.headquarters && missing.includes('headquarters'))
    ) {
      const secData = await this.enrichFromSecMultiStrategy(firm.name);
      if (secData.secCrdNumber && !firm.sec_crd_number) {
        firm.sec_crd_number = secData.secCrdNumber;
        changed = true;
      }
      if (secData.headquarters && !firm.headquarters) {
        firm.headquarters = secData.headquarters;
        changed = true;
      }
    }

    if (changed) {
      await this.firmRepo.save(firm);
      const stillMissing = this.getMissingFields(firm);
      this.logger.debug(
        `Enriched "${firm.name}" — ${stillMissing.length === 0 ? 'all fields filled' : `still missing: ${stillMissing.join(', ')}`}`,
      );
    }

    return changed;
  }

  /**
   * Copy any non-null fields from an enrichment result onto the firm,
   * but only when the firm doesn't already have a value for that field.
   * Returns true if anything changed.
   */
  private applyEnrichment(
    firm: Firm,
    data: Partial<{
      website: string;
      description: string;
      firmType: FirmType;
      foundedYear: number;
      headquarters: string;
      aumUsd: number;
    }>,
  ): boolean {
    let changed = false;
    if (data.website && !firm.website) {
      firm.website = data.website;
      changed = true;
    }
    if (data.description && !firm.description) {
      firm.description = data.description;
      changed = true;
    }
    if (data.firmType && !firm.firm_type) {
      firm.firm_type = data.firmType;
      changed = true;
    }
    if (data.foundedYear && !firm.founded_year) {
      firm.founded_year = data.foundedYear;
      changed = true;
    }
    if (data.headquarters && !firm.headquarters) {
      firm.headquarters = data.headquarters;
      changed = true;
    }
    if (data.aumUsd && !firm.aum_usd) {
      firm.aum_usd = data.aumUsd;
      changed = true;
    }
    return changed;
  }

  private async enrichFromWikipedia(firmName: string): Promise<
    Partial<{
      description: string;
      foundedYear: number;
      headquarters: string;
      aumUsd: number;
    }>
  > {
    try {
      const info = await this.wikipedia.getFirmInfo(firmName);
      if (!info) return {};
      const result: Partial<{
        description: string;
        foundedYear: number;
        headquarters: string;
        aumUsd: number;
      }> = {};
      if (info.description) result.description = info.description;
      if (info.foundedYear) result.foundedYear = info.foundedYear;
      if (info.headquarters) result.headquarters = info.headquarters;
      if (info.aumUsd) result.aumUsd = info.aumUsd;
      return result;
    } catch (error) {
      this.logger.debug('Wikipedia enrichment failed', {
        firmName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private async enrichFromExa(firmName: string): Promise<
    Partial<{
      website: string;
      description: string;
      firmType: FirmType;
      foundedYear: number;
      headquarters: string;
      aumUsd: number;
    }>
  > {
    const results = await this.exa.search(
      `"${firmName}" private equity firm overview`,
      { numResults: 3 },
    );

    if (results.length === 0) return {};

    const combined = results.map((r) => r.text).join('\n');
    const topUrl = results[0].url;
    const result: Partial<{
      website: string;
      description: string;
      firmType: FirmType;
      foundedYear: number;
      headquarters: string;
      aumUsd: number;
    }> = {};

    for (const r of results) {
      try {
        const host = new URL(r.url).hostname.replace(/^www\./, '');
        const isOwnSite =
          !host.includes('wikipedia') &&
          !host.includes('bloomberg') &&
          !host.includes('reuters') &&
          !host.includes('pitchbook') &&
          !host.includes('crunchbase');
        if (isOwnSite) {
          result.website = r.url.replace(/\/+$/, '');
          break;
        }
      } catch (error) {
        this.logger.error('Error enriching from Exa', {
          error: error.message,
          stack: error.stack,
        });
      }
    }
    if (!result.website && topUrl) {
      result.website = topUrl;
    }

    const topText = results[0].text;
    if (topText && topText.length > 30) {
      const cleaned = stripMarkdown(topText);
      const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 5);
      const desc = sentences.join(' ').slice(0, 500).trim();
      if (desc.length > 20) {
        result.description = desc;
      }
    }

    const lower = combined.toLowerCase();
    for (const [keyword, type] of Object.entries(FIRM_TYPE_KEYWORDS)) {
      if (lower.includes(keyword)) {
        result.firmType = type;
        break;
      }
    }

    const foundedMatch = combined.match(
      /(?:founded|established|started|launched|created)\s+(?:in\s+)?(\d{4})/i,
    );
    if (foundedMatch) {
      const year = parseInt(foundedMatch[1], 10);
      if (year >= 1900 && year <= new Date().getFullYear()) {
        result.foundedYear = year;
      }
    }

    const hqMatch = combined.match(
      /(?:headquartered|based|offices?)\s+in\s+([A-Z][A-Za-z\s,]+(?:,\s*[A-Z]{2,})?)(?:\.|,|\s)/,
    );
    if (hqMatch) {
      const hq = hqMatch[1].trim().replace(/\s+/g, ' ');
      if (hq.length > 3 && hq.length < 100) {
        result.headquarters = hq;
      }
    }

    const aumMatch = combined.match(
      /(?:manages?|AUM|assets?\s+under\s+management)\s+(?:of\s+)?(?:approximately\s+|over\s+|more\s+than\s+)?\$?([\d,.]+)\s*(billion|B|bn|trillion|T|million|M)/i,
    );
    if (aumMatch) {
      const num = parseFloat(aumMatch[1].replace(/,/g, ''));
      const unit = aumMatch[2].toLowerCase();
      let multiplier = 1;
      if (unit.startsWith('t')) multiplier = 1_000_000_000_000;
      else if (unit.startsWith('b')) multiplier = 1_000_000_000;
      else if (unit.startsWith('m')) multiplier = 1_000_000;
      result.aumUsd = num * multiplier;
    }

    return result;
  }

  /**
   * Pull description / founded / HQ from the firm's own website, but route
   * the requests through Exa.getContents instead of direct axios. Exa renders
   * JS and uses residential IPs, so it bypasses Cloudflare/Akamai WAFs that
   * routinely 403 our crawler on enterprise PE/IB sites.
   */
  private async enrichFromWebsite(
    website: string,
    firmName: string,
  ): Promise<
    Partial<{
      description: string;
      foundedYear: number;
      headquarters: string;
    }>
  > {
    const result: Partial<{
      description: string;
      foundedYear: number;
      headquarters: string;
    }> = {};

    const pagesToTry = [
      '/',
      '/about',
      '/about-us',
      '/firm',
      '/our-firm',
      '/who-we-are',
      '/company',
      '/overview',
    ];

    let urls: string[];
    try {
      urls = pagesToTry.map((p) => new URL(p, website).toString());
    } catch (error) {
      this.logger.debug('Invalid firm website URL', {
        website,
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }

    const contents = await this.exa.getContents(urls);
    if (contents.length === 0) return result;

    for (const page of contents) {
      const text = (page.text || '').replace(/\s+/g, ' ').trim();
      if (text.length < 50) continue;

      if (!result.description) {
        const desc = this.extractDescription(text, firmName);
        if (desc) result.description = desc;
      }

      if (!result.foundedYear) {
        const match = text.match(
          /(?:founded|established|since|started)\s+(?:in\s+)?(\d{4})/i,
        );
        if (match) {
          const year = parseInt(match[1], 10);
          if (year >= 1900 && year <= new Date().getFullYear()) {
            result.foundedYear = year;
          }
        }
      }

      if (!result.headquarters) {
        const hqMatch = text.match(
          /(?:headquartered|based|offices?)\s+in\s+([A-Z][A-Za-z\s,]+(?:,\s*[A-Z]{2,})?)(?:\.|,|\s)/,
        );
        if (hqMatch) {
          const hq = hqMatch[1].trim();
          if (hq.length > 3 && hq.length < 100) {
            result.headquarters = hq;
          }
        }
      }

      if (result.description && result.foundedYear && result.headquarters) {
        break;
      }
    }

    return result;
  }

  private async enrichFromSecMultiStrategy(
    firmName: string,
  ): Promise<Partial<{ secCrdNumber: string; headquarters: string }>> {
    const edgarResult = await this.searchEdgarCompanyHtml(firmName);
    if (edgarResult.secCrdNumber) return edgarResult;

    const simplified = simplifyFirmName(firmName);
    if (simplified !== firmName) {
      const simplifiedResult = await this.searchEdgarCompanyHtml(simplified);
      if (simplifiedResult.secCrdNumber) return simplifiedResult;
    }

    const eftsResult = await this.searchEftsBroad(firmName);
    if (eftsResult.secCrdNumber) return eftsResult;

    const iapdResult = await this.searchIapd(firmName);
    if (iapdResult.secCrdNumber) return iapdResult;

    const exaResult = await this.searchCrdViaExa(firmName);
    if (exaResult.secCrdNumber) return exaResult;

    this.logger.debug(
      `SEC CRD: no CIK/CRD found for "${firmName}" after all strategies`,
    );

    return {};
  }

  private async searchEdgarCompanyHtml(
    firmName: string,
  ): Promise<Partial<{ secCrdNumber: string; headquarters: string }>> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const resp = await axios.get(
          'https://www.sec.gov/cgi-bin/browse-edgar',
          {
            params: {
              company: firmName,
              CIK: '',
              type: '',
              dateb: '',
              owner: 'include',
              count: 10,
              search_text: '',
              action: 'getcompany',
            },
            headers: {
              'User-Agent': this.secEdgarUserAgent,
              Accept: 'text/html',
            },
            timeout: 15000,
          },
        );

        const $ = cheerio.load(resp.data as string);

        const singleCik = $('input[name="CIK"]').val() as string | undefined;
        if (singleCik) {
          return { secCrdNumber: singleCik.replace(/^0+/, '') };
        }

        const rows = $('table.tableFile2 tr').toArray();
        const nameLower = firmName.toLowerCase();
        for (const row of rows.slice(1)) {
          const cells = $(row).find('td');
          if (cells.length < 2) continue;
          const companyName = $(cells[1]).text().trim().toLowerCase();
          const cikLink = $(cells[0]).find('a').attr('href') || '';
          const cikMatch =
            cikLink.match(/CIK=(\d+)/i) || cikLink.match(/(\d{7,10})/);
          if (!cikMatch) continue;

          if (
            companyName.includes(nameLower) ||
            nameLower.includes(companyName) ||
            this.fuzzyNameMatch(firmName, $(cells[1]).text().trim())
          ) {
            return { secCrdNumber: cikMatch[1].replace(/^0+/, '') };
          }
        }

        return {};
      } catch (error) {
        this.logger.error('Error searching Edgar company HTML', {
          ...extractHttpErrorDetails(error),
        });

        return {};
      }
    });
  }

  private async searchEftsBroad(
    firmName: string,
  ): Promise<Partial<{ secCrdNumber: string; headquarters: string }>> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const resp = await axios.get(
          'https://efts.sec.gov/LATEST/search-index',
          {
            params: {
              q: `"${firmName}"`,
              from: 0,
              size: 5,
            },
            headers: {
              'User-Agent': this.secEdgarUserAgent,
              Accept: 'application/json',
            },
            timeout: 15000,
          },
        );

        const hits = resp.data?.hits?.hits || [];
        if (hits.length === 0) return {};

        const nameLower = firmName.toLowerCase();
        for (const hit of hits) {
          const src = hit._source || {};
          const entityName = (
            src.entity_name ||
            src.display_names?.[0] ||
            ''
          ).toLowerCase();
          if (
            entityName.includes(nameLower) ||
            nameLower.includes(entityName)
          ) {
            const result: Partial<{
              secCrdNumber: string;
              headquarters: string;
            }> = {};
            if (src.cik)
              result.secCrdNumber = String(src.cik).replace(/^0+/, '');
            const city = src.city;
            const state = src.state;
            if (city || state) {
              result.headquarters = [city, state].filter(Boolean).join(', ');
            }
            return result;
          }
        }

        const firstSrc = hits[0]._source || {};
        if (firstSrc.cik) {
          return { secCrdNumber: String(firstSrc.cik).replace(/^0+/, '') };
        }

        return {};
      } catch (error) {
        this.logger.error('Error searching Efts broad', {
          ...extractHttpErrorDetails(error),
        });

        return {};
      }
    });
  }

  private async searchIapd(
    firmName: string,
  ): Promise<Partial<{ secCrdNumber: string; headquarters: string }>> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const resp = await axios.get(
          'https://api.adviserinfo.sec.gov/IAPD/Content/Search/api/OrganizationSearch',
          {
            params: {
              SearchValue: firmName,
              SearchScope: '',
              CompanyType: '',
              PageNum: 1,
              PageSize: 5,
            },
            headers: {
              'User-Agent': this.secEdgarUserAgent,
              Accept: 'application/json',
            },
            timeout: 15000,
          },
        );

        const results = resp.data?.Results || resp.data?.results || [];
        if (results.length === 0) return {};

        const nameLower = firmName.toLowerCase();
        for (const r of results) {
          const orgName = (r.OrgName || r.orgName || '').toLowerCase();
          if (
            orgName.includes(nameLower) ||
            nameLower.includes(orgName) ||
            this.fuzzyNameMatch(firmName, r.OrgName || r.orgName || '')
          ) {
            const crd =
              r.CRDNumber || r.crdNumber || r.OrgCRDNumber || r.orgCRDNumber;
            if (crd) {
              const result: Partial<{
                secCrdNumber: string;
                headquarters: string;
              }> = {
                secCrdNumber: String(crd),
              };
              const city = r.City || r.city;
              const state = r.State || r.state;
              if (city || state) {
                result.headquarters = [city, state].filter(Boolean).join(', ');
              }
              return result;
            }
          }
        }

        const first = results[0];
        const crd =
          first.CRDNumber ||
          first.crdNumber ||
          first.OrgCRDNumber ||
          first.orgCRDNumber;
        if (crd) return { secCrdNumber: String(crd) };

        return {};
      } catch (error) {
        this.logger.warn('IAPD search failed', {
          ...extractHttpErrorDetails(error),
        });

        return {};
      }
    });
  }

  private async searchCrdViaExa(
    firmName: string,
  ): Promise<Partial<{ secCrdNumber: string }>> {
    try {
      const results = await this.exa.search(
        `"${firmName}" SEC CIK OR CRD number site:sec.gov OR site:advfn.com OR site:finra.org`,
        { numResults: 2 },
      );

      if (results.length === 0) return {};

      const combined = results.map((r) => r.text).join('\n');

      const crdMatch = combined.match(
        /(?:CRD|CRD\s*#|CRD\s*Number)[:\s#]*(\d{4,10})/i,
      );
      if (crdMatch) return { secCrdNumber: crdMatch[1] };

      const cikMatch = combined.match(
        /(?:CIK|CIK\s*#|CIK\s*Number)[:\s#]*(?:0*)(\d{1,10})/i,
      );
      if (cikMatch) return { secCrdNumber: cikMatch[1] };

      const cikUrlMatch = combined.match(/CIK=0*(\d+)/);
      if (cikUrlMatch) return { secCrdNumber: cikUrlMatch[1] };

      return {};
    } catch {
      return {};
    }
  }

  private fuzzyNameMatch(name1: string, name2: string): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(
          /\b(llc|lp|inc|corp|ltd|group|partners|capital|management|advisors|advisory)\b/g,
          '',
        )
        .replace(/\s+/g, ' ')
        .trim();
    const n1 = normalize(name1);
    const n2 = normalize(name2);
    return n1.includes(n2) || n2.includes(n1);
  }

  private extractDescription(text: string, firmName: string): string | null {
    const nameEscaped = firmName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aboutPattern = new RegExp(
      `(${nameEscaped}[^.]*(?:is|was|are)\\s[^.]+\\.[^.]*\\.?)`,
      'i',
    );
    const match = text.match(aboutPattern);
    if (match && match[1].length > 30) {
      return stripMarkdown(match[1].slice(0, 500).trim());
    }

    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
    const relevant = sentences
      .filter(
        (s) =>
          s.toLowerCase().includes(firmName.toLowerCase()) ||
          s.toLowerCase().includes('invest') ||
          s.toLowerCase().includes('capital') ||
          s.toLowerCase().includes('fund'),
      )
      .slice(0, 4);

    if (relevant.length > 0) {
      const desc = stripMarkdown(relevant.join(' ').slice(0, 500).trim());
      if (desc.length > 30) return desc;
    }

    return null;
  }
}

function simplifyFirmName(name: string): string {
  return name
    .replace(
      /\b(Group|Partners|Capital|Management|Advisors|Advisory|LLC|LP|Inc|Corp|Ltd|AG|PLC|BDC|Credit|Private Equity)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '') // # headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // *bold*/*italic*
    .replace(/_([^_]+)_/g, '$1') // _italic_
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // ![alt](img)
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code
    .replace(/^>\s+/gm, '') // blockquotes
    .replace(/^[-*+]\s+/gm, '') // list markers
    .replace(/^\d+\.\s+/gm, '') // numbered lists
    .replace(/\s+/g, ' ')
    .trim();
}

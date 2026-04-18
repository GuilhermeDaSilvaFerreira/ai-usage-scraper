import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  secEdgarRateLimiter,
  extractHttpErrorDetails,
} from '../../common/utils/index.js';

export interface EdgarFiling {
  cik: string;
  companyName: string;
  formType: string;
  dateFiled: string;
  fileUrl: string;
}

export interface EdgarFirmInfo {
  cik: string;
  name: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  addresses: {
    business: { street: string; city: string; state: string; zip: string };
  };
  filings: EdgarFiling[];
}

interface EdgarHitSource {
  cik?: string;
  entity_name?: string;
  display_names?: string[];
  entity_type?: string;
  sic?: string;
  sic_description?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface EdgarSearchHit {
  _source?: EdgarHitSource;
}

interface EdgarFilingsData {
  recent?: {
    cik?: string;
    form?: string[];
    filingDate?: string[];
    primaryDocument?: string[];
  };
}

@Injectable()
export class SecEdgarService {
  private readonly logger = new Logger(SecEdgarService.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.httpClient = axios.create({
      baseURL: 'https://efts.sec.gov',
      headers: this.getCommonHeaders(),
      timeout: 30000,
    });
  }

  private getCommonHeaders(): Record<string, string> {
    return {
      'User-Agent':
        this.config.get<string>('scrapers.secEdgarUserAgent') ||
        'PEIntelligence admin@example.com',
      Accept: 'application/json',
    };
  }

  async searchFirms(query: string): Promise<EdgarFirmInfo[]> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const response = await this.httpClient.get('/LATEST/search-index', {
          params: {
            q: query,
            dateRange: 'custom',
            forms: 'ADV',
            from: 0,
            size: 40,
          },
        });

        const hits = response.data?.hits?.hits || [];
        return hits.map((hit: EdgarSearchHit) => this.mapToFirmInfo(hit));
      } catch (error) {
        this.logger.error(`SEC EDGAR search failed for "${query}"`, {
          ...extractHttpErrorDetails(error),
        });
        return [];
      }
    });
  }

  async getCompanyByName(name: string): Promise<EdgarFirmInfo[]> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const response = await axios.get(
          `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(name)}%22&forms=ADV`,
          {
            headers: this.getCommonHeaders(),
            timeout: 30000,
          },
        );

        const hits = response.data?.hits?.hits || [];
        return hits.map((hit: EdgarSearchHit) => this.mapToFirmInfo(hit));
      } catch (error) {
        this.logger.warn(`SEC EDGAR company name lookup failed for "${name}"`, {
          ...extractHttpErrorDetails(error),
        });
        return [];
      }
    });
  }

  async getCompanyByCik(cik: string): Promise<EdgarFirmInfo | null> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const paddedCik = cik.padStart(10, '0');
        const response = await axios.get(
          `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
          {
            headers: this.getCommonHeaders(),
            timeout: 30000,
          },
        );

        const data = response.data;
        return {
          cik: data.cik,
          name: data.name,
          entityType: data.entityType || '',
          sic: data.sic || '',
          sicDescription: data.sicDescription || '',
          addresses: {
            business: {
              street: data.addresses?.business?.street1 || '',
              city: data.addresses?.business?.city || '',
              state: data.addresses?.business?.stateOrCountry || '',
              zip: data.addresses?.business?.zipCode || '',
            },
          },
          filings: this.mapFilings(data.filings),
        };
      } catch (error) {
        this.logger.error(`SEC EDGAR CIK lookup failed for "${cik}"`, {
          ...extractHttpErrorDetails(error),
        });
        return null;
      }
    });
  }

  async searchInvestmentAdvisers(
    page = 0,
    pageSize = 100,
  ): Promise<EdgarFirmInfo[]> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const response = await axios.get(
          'https://efts.sec.gov/LATEST/search-index',
          {
            params: {
              forms: 'ADV',
              from: page * pageSize,
              size: pageSize,
            },
            headers: this.getCommonHeaders(),
            timeout: 30000,
          },
        );

        const hits = response.data?.hits?.hits || [];
        return hits.map((hit: EdgarSearchHit) => this.mapToFirmInfo(hit));
      } catch (error) {
        this.logger.error('SEC EDGAR adviser search failed', {
          ...extractHttpErrorDetails(error),
        });
        return [];
      }
    });
  }

  private mapToFirmInfo(hit: EdgarSearchHit): EdgarFirmInfo {
    const source = hit._source ?? {};
    return {
      cik: source.cik || '',
      name: source.entity_name || source.display_names?.[0] || '',
      entityType: source.entity_type || '',
      sic: source.sic || '',
      sicDescription: source.sic_description || '',
      addresses: {
        business: {
          street: source.street || '',
          city: source.city || '',
          state: source.state || '',
          zip: source.zip || '',
        },
      },
      filings: [],
    };
  }

  private mapFilings(filingsData: EdgarFilingsData): EdgarFiling[] {
    if (!filingsData?.recent) return [];
    const recent = filingsData.recent;
    const filings: EdgarFiling[] = [];
    const count = Math.min(recent.form?.length || 0, 20);

    for (let i = 0; i < count; i++) {
      filings.push({
        cik: recent.cik || '',
        companyName: '',
        formType: recent.form?.[i] || '',
        dateFiled: recent.filingDate?.[i] || '',
        fileUrl: recent.primaryDocument?.[i] || '',
      });
    }

    return filings;
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  secEdgarRateLimiter,
  extractHttpErrorDetails,
  CommonLogger,
} from '../../../../common/utils/index.js';
import { SourceType } from '../../../../common/enums/index.js';
import { CollectedContent } from './news.collector.js';

export interface SecAdvPerson {
  fullName: string;
  title: string | null;
  bio: string | null;
}

interface IapdOrgHit {
  OrgName?: string;
  orgName?: string;
  CRDNumber?: string | number;
  crdNumber?: string | number;
  OrgCRDNumber?: string | number;
  orgCRDNumber?: string | number;
}

interface IapdIndividualSource {
  ind_firstname?: string;
  ind_middlename?: string;
  ind_lastname?: string;
  ind_namesuffix?: string;
  ind_other_names?: string[];
  ind_current_employments?: Array<{
    firm_name?: string;
    position?: string;
    title?: string;
    positions?: string;
    branch_offices?: Array<{ city?: string; state?: string }>;
  }>;
  ind_other_business_activities?: string;
  ind_PK?: string | number;
  IndvlPK?: string | number;
  IndvlFirstName?: string;
  IndvlMiddleName?: string;
  IndvlLastName?: string;
  IndvlSuffix?: string;
  Title?: string;
  Position?: string;
  CRDNumber?: string | number;
}

interface IapdIndividualHit {
  _source?: IapdIndividualSource;
  ind_firstname?: string;
  ind_lastname?: string;
}

const IAPD_BASE = 'https://api.adviserinfo.sec.gov';
const ORG_SEARCH_URL = `${IAPD_BASE}/Search/api/Search/OrganizationSearch`;
const INDIVIDUAL_SEARCH_URL = `${IAPD_BASE}/Search/api/Search/IndividualSearch`;
const FIRM_SUMMARY_URL = (crd: string) =>
  `https://adviserinfo.sec.gov/firm/summary/${crd}`;

const MAX_INDIVIDUALS = 25;

/**
 * Collects firm principals from the SEC's Investment Adviser Public Disclosure
 * (IAPD) database. For SEC-registered investment advisers (i.e. most PE
 * firms), Form ADV Schedule A lists direct owners and senior officers, which
 * is a far more authoritative source than scraping team pages.
 *
 * The collector emits one CollectedContent item with a structured
 * `metadata.parsedPeople` payload, which PeopleCollectionService consumes
 * directly without going through the brittle regex parsers.
 */
@Injectable()
export class SecAdvCollector {
  private readonly logger = new CommonLogger(SecAdvCollector.name);
  private readonly userAgent: string;

  constructor(private readonly config: ConfigService) {
    this.userAgent =
      this.config.get<string>('SEC_EDGAR_USER_AGENT') ||
      this.config.get<string>('scrapers.secEdgarUserAgent') ||
      'PEIntelligence admin@example.com';
  }

  async collectForPeople(
    firmName: string,
    storedSecCrdNumber?: string | null,
  ): Promise<CollectedContent[]> {
    // Look up the firm's CRD via IAPD by name (the stored sec_crd_number may
    // actually be a CIK from EDGAR; the IAPD individual search needs CRD).
    const crd = await this.lookupFirmCrd(firmName, storedSecCrdNumber);
    if (!crd) {
      this.logger.debug(
        `No IAPD CRD found for "${firmName}" — skipping ADV principals`,
      );
      return [];
    }

    const individuals = await this.fetchIndividualsForFirm(crd);
    if (individuals.length === 0) {
      this.logger.debug(`IAPD returned 0 individuals for CRD ${crd}`);
      return [];
    }

    const parsedPeople = individuals
      .map((src) => this.toPerson(src))
      .filter((p): p is SecAdvPerson => p !== null)
      .slice(0, MAX_INDIVIDUALS);

    if (parsedPeople.length === 0) return [];

    this.logger.debug(
      `Collected ${parsedPeople.length} ADV principals for "${firmName}" (CRD ${crd})`,
    );

    const summaryUrl = FIRM_SUMMARY_URL(crd);
    const content = parsedPeople
      .map((p) => `${p.fullName}${p.title ? ` — ${p.title}` : ''}`)
      .join('\n');

    return [
      {
        url: summaryUrl,
        title: `${firmName} — SEC Form ADV principals`,
        content,
        sourceType: SourceType.SEC_EDGAR,
        metadata: {
          source: 'iapd',
          firmCrd: crd,
          parsedPeople,
        },
      },
    ];
  }

  private async lookupFirmCrd(
    firmName: string,
    storedSecCrdNumber?: string | null,
  ): Promise<string | null> {
    if (storedSecCrdNumber) {
      const trimmed = String(storedSecCrdNumber).replace(/^0+/, '');
      if (/^\d{1,7}$/.test(trimmed)) {
        const verified = await this.verifyCrd(trimmed);
        if (verified) return trimmed;
      }
    }

    return secEdgarRateLimiter.wrap(async () => {
      try {
        const resp = await axios.get(ORG_SEARCH_URL, {
          params: {
            SearchValue: firmName,
            SearchScope: '',
            CompanyType: '',
            PageNum: 1,
            PageSize: 5,
          },
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'application/json',
          },
          timeout: 15000,
        });

        const results: IapdOrgHit[] =
          resp.data?.Results || resp.data?.results || [];
        if (results.length === 0) return null;

        const nameLower = firmName.toLowerCase();
        for (const r of results) {
          const orgName = String(r.OrgName || r.orgName || '').toLowerCase();
          if (orgName.includes(nameLower) || nameLower.includes(orgName)) {
            const crd =
              r.CRDNumber || r.crdNumber || r.OrgCRDNumber || r.orgCRDNumber;
            if (crd) return String(crd);
          }
        }

        const first = results[0];
        const crd =
          first.CRDNumber ||
          first.crdNumber ||
          first.OrgCRDNumber ||
          first.orgCRDNumber;
        return crd ? String(crd) : null;
      } catch (error) {
        this.logger.warn('IAPD organization search failed', {
          firmName,
          ...extractHttpErrorDetails(error),
        });
        return null;
      }
    });
  }

  private async verifyCrd(crd: string): Promise<boolean> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const resp = await axios.get(ORG_SEARCH_URL, {
          params: {
            SearchValue: crd,
            SearchScope: 'CRD',
            PageNum: 1,
            PageSize: 1,
          },
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'application/json',
          },
          timeout: 10000,
        });
        const results = resp.data?.Results || resp.data?.results || [];
        return results.length > 0;
      } catch {
        return false;
      }
    });
  }

  private async fetchIndividualsForFirm(
    firmCrd: string,
  ): Promise<IapdIndividualSource[]> {
    return secEdgarRateLimiter.wrap(async () => {
      try {
        const resp = await axios.get(INDIVIDUAL_SEARCH_URL, {
          params: {
            query: '*',
            firmCRD: firmCrd,
            hl: false,
            nrows: MAX_INDIVIDUALS,
            start: 0,
            r: 25,
            sort: 'score+desc',
          },
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'application/json',
          },
          timeout: 15000,
        });

        const data = resp.data as Record<string, unknown> | undefined;

        const esHits = (data?.hits as { hits?: IapdIndividualHit[] })?.hits;
        if (Array.isArray(esHits) && esHits.length > 0) {
          return esHits
            .map((h) => h._source ?? (h as IapdIndividualSource))
            .filter(Boolean);
        }

        const flatResults = (data?.Results || data?.results) as
          | IapdIndividualSource[]
          | undefined;
        if (Array.isArray(flatResults)) return flatResults;

        return [];
      } catch (error) {
        this.logger.warn('IAPD individual search failed', {
          firmCrd,
          ...extractHttpErrorDetails(error),
        });
        return [];
      }
    });
  }

  private toPerson(src: IapdIndividualSource): SecAdvPerson | null {
    const first = (src.ind_firstname || src.IndvlFirstName || '').trim();
    const middle = (src.ind_middlename || src.IndvlMiddleName || '').trim();
    const last = (src.ind_lastname || src.IndvlLastName || '').trim();
    const suffix = (src.ind_namesuffix || src.IndvlSuffix || '').trim();

    if (!first || !last) return null;

    const fullName = [first, middle, last, suffix]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (fullName.length < 3) return null;

    const employments = src.ind_current_employments ?? [];
    const primaryEmployment = employments[0];
    const title =
      primaryEmployment?.title ||
      primaryEmployment?.position ||
      primaryEmployment?.positions ||
      src.Title ||
      src.Position ||
      null;

    const bioParts: string[] = [];
    if (employments.length > 0) {
      const employmentList = employments
        .slice(0, 3)
        .map((e) => {
          const role = e.title || e.position || e.positions;
          return role && e.firm_name
            ? `${role} at ${e.firm_name}`
            : role || e.firm_name || '';
        })
        .filter(Boolean);
      if (employmentList.length > 0) {
        bioParts.push(`Current roles: ${employmentList.join('; ')}.`);
      }
    }
    if (src.ind_other_business_activities) {
      bioParts.push(
        `Other activities: ${src.ind_other_business_activities.slice(0, 400)}.`,
      );
    }
    if (src.ind_other_names && src.ind_other_names.length > 0) {
      bioParts.push(`Also known as: ${src.ind_other_names.join(', ')}.`);
    }

    const bio = bioParts.length > 0 ? bioParts.join(' ') : null;

    return {
      fullName,
      title: title ? String(title).trim() || null : null,
      bio,
    };
  }
}

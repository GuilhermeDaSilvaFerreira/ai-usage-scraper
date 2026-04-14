import { Injectable, Logger } from '@nestjs/common';
import { distance as levenshtein } from 'fastest-levenshtein';
import {
  normalizeFirmName,
  extractDomain,
} from '../../../common/utils/index.js';
import { SeedFirmCandidate } from './sources/sec-edgar.source.js';

interface MergedFirm extends SeedFirmCandidate {
  aliases: string[];
  sources: string[];
}

@Injectable()
export class EntityResolutionService {
  private readonly logger = new Logger(EntityResolutionService.name);

  private static readonly LEVENSHTEIN_THRESHOLD = 0.15;

  deduplicate(candidates: SeedFirmCandidate[]): MergedFirm[] {
    const merged: MergedFirm[] = [];

    for (const candidate of candidates) {
      const normalizedName = normalizeFirmName(candidate.name);
      if (!normalizedName || normalizedName.length < 2) continue;

      const existingIdx = this.findMatch(merged, candidate);

      if (existingIdx !== -1) {
        this.mergeInto(merged[existingIdx], candidate);
      } else {
        merged.push({
          ...candidate,
          aliases: [candidate.name],
          sources: [candidate.source],
        });
      }
    }

    this.logger.log(
      `Entity resolution: ${candidates.length} candidates -> ${merged.length} unique firms`,
    );
    return merged;
  }

  private findMatch(
    existing: MergedFirm[],
    candidate: SeedFirmCandidate,
  ): number {
    const candidateNorm = normalizeFirmName(candidate.name);
    const candidateDomain = candidate.website
      ? extractDomain(candidate.website)
      : null;

    for (let i = 0; i < existing.length; i++) {
      const existingNorm = normalizeFirmName(existing[i].name);

      if (candidateNorm === existingNorm) return i;

      if (
        candidateDomain &&
        existing[i].website &&
        extractDomain(existing[i].website!) === candidateDomain
      ) {
        return i;
      }

      const maxLen = Math.max(candidateNorm.length, existingNorm.length);
      if (maxLen === 0) continue;
      const dist = levenshtein(candidateNorm, existingNorm);
      if (dist / maxLen <= EntityResolutionService.LEVENSHTEIN_THRESHOLD) {
        return i;
      }

      for (const alias of existing[i].aliases) {
        const aliasNorm = normalizeFirmName(alias);
        if (aliasNorm === candidateNorm) return i;
      }
    }

    return -1;
  }

  private mergeInto(target: MergedFirm, candidate: SeedFirmCandidate): void {
    if (!target.aliases.includes(candidate.name)) {
      target.aliases.push(candidate.name);
    }
    if (!target.sources.includes(candidate.source)) {
      target.sources.push(candidate.source);
    }

    if (!target.website && candidate.website) {
      target.website = candidate.website;
    }
    if (!target.aumUsd && candidate.aumUsd) {
      target.aumUsd = candidate.aumUsd;
    }
    if (candidate.aumUsd && target.aumUsd && candidate.aumUsd > target.aumUsd) {
      target.aumUsd = candidate.aumUsd;
    }
    if (!target.firmType && candidate.firmType) {
      target.firmType = candidate.firmType;
    }
    if (!target.headquarters && candidate.headquarters) {
      target.headquarters = candidate.headquarters;
    }
    if (!target.secCrdNumber && candidate.secCrdNumber) {
      target.secCrdNumber = candidate.secCrdNumber;
    }
  }
}

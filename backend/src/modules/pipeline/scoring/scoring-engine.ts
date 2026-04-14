import { Injectable } from '@nestjs/common';
import { FirmSignal } from '../../../database/entities/firm-signal.entity.js';
import {
  ScoringConfig,
  ScoringResult,
  DimensionScore,
  EvidenceEntry,
  DEFAULT_SCORING_CONFIG,
} from '../../../common/interfaces/index.js';
import { AiTalentDimension } from './dimensions/ai-talent.dimension.js';
import { PublicActivityDimension } from './dimensions/public-activity.dimension.js';
import { HiringSignalsDimension } from './dimensions/hiring-signals.dimension.js';
import { ThoughtLeadershipDimension } from './dimensions/thought-leadership.dimension.js';
import { VendorPartnershipsDimension } from './dimensions/vendor-partnerships.dimension.js';
import { PortfolioStrategyDimension } from './dimensions/portfolio-strategy.dimension.js';
import { BaseDimension } from './dimensions/base.dimension.js';

@Injectable()
export class ScoringEngine {
  private readonly dimensionScorers: Map<string, BaseDimension>;

  constructor(
    private readonly aiTalent: AiTalentDimension,
    private readonly publicActivity: PublicActivityDimension,
    private readonly hiringSignals: HiringSignalsDimension,
    private readonly thoughtLeadership: ThoughtLeadershipDimension,
    private readonly vendorPartnerships: VendorPartnershipsDimension,
    private readonly portfolioStrategy: PortfolioStrategyDimension,
  ) {
    this.dimensionScorers = new Map<string, BaseDimension>();
    this.dimensionScorers.set('ai_talent_density', this.aiTalent);
    this.dimensionScorers.set('public_ai_activity', this.publicActivity);
    this.dimensionScorers.set('ai_hiring_velocity', this.hiringSignals);
    this.dimensionScorers.set('thought_leadership', this.thoughtLeadership);
    this.dimensionScorers.set('vendor_partnerships', this.vendorPartnerships);
    this.dimensionScorers.set('portfolio_ai_strategy', this.portfolioStrategy);
  }

  scoreFirm(
    signals: FirmSignal[],
    config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  ): ScoringResult {
    if (signals.length < config.thresholds.minSignalsForScore) {
      return {
        overallScore: 0,
        dimensions: [],
        signalCount: signals.length,
        evidence: [],
      };
    }

    const dimensions: DimensionScore[] = [];
    const allEvidence: EvidenceEntry[] = [];
    let overallScore = 0;

    const weights = config.weights;

    for (const [dimensionKey, scorer] of this.dimensionScorers.entries()) {
      const weight =
        (weights as unknown as Record<string, number>)[dimensionKey] ?? 0;
      const result = scorer.score(signals);

      const normalizedScore =
        result.maxPossible > 0
          ? (result.rawScore / result.maxPossible) * 100
          : 0;
      const weightedScore = normalizedScore * weight;

      dimensions.push({
        dimension: dimensionKey,
        rawScore: Math.round(normalizedScore * 100) / 100,
        weightedScore: Math.round(weightedScore * 100) / 100,
        signalCount: result.signalCount,
        maxPossible: 100,
      });

      overallScore += weightedScore;
      allEvidence.push(...result.evidence);
    }

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      dimensions,
      signalCount: signals.length,
      evidence: allEvidence,
    };
  }
}

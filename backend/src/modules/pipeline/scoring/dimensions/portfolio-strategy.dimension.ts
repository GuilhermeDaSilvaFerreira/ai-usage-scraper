import { Injectable } from '@nestjs/common';
import { FirmSignal } from '../../../../database/entities/firm-signal.entity.js';
import { SignalType } from '../../../../common/enums/index.js';
import { BaseDimension, DimensionScoreResult } from './base.dimension.js';
import type { EvidenceEntry } from '../../../../common/interfaces/index.js';

@Injectable()
export class PortfolioStrategyDimension extends BaseDimension {
  readonly name = 'portfolio_ai_strategy';
  readonly relevantSignalTypes = [
    SignalType.PORTFOLIO_AI_INITIATIVE,
    SignalType.AI_CASE_STUDY,
  ];

  score(signals: FirmSignal[]): DimensionScoreResult {
    const relevant = this.filterRelevant(signals);
    const evidence: EvidenceEntry[] = [];
    let rawScore = 0;
    const maxPossible = 100;

    const portfolioInitiatives = relevant.filter(
      (s) => s.signal_type === SignalType.PORTFOLIO_AI_INITIATIVE,
    );
    const initiativePoints = Math.min(portfolioInitiatives.length * 20, 60);
    rawScore += initiativePoints;
    evidence.push(
      ...this.buildCappedEvidence(portfolioInitiatives, 20, initiativePoints, (s) =>
        `Portfolio AI initiative: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const caseStudies = relevant.filter(
      (s) =>
        s.signal_type === SignalType.AI_CASE_STUDY &&
        JSON.stringify(s.signal_data).toLowerCase().includes('portfolio'),
    );
    const caseStudyPoints = Math.min(caseStudies.length * 15, 40);
    rawScore += caseStudyPoints;
    evidence.push(
      ...this.buildCappedEvidence(caseStudies, 15, caseStudyPoints, (s) =>
        `Portfolio-related AI case study: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    return {
      rawScore: this.clamp(rawScore, 0, maxPossible),
      maxPossible,
      signalCount: relevant.length,
      evidence,
    };
  }
}

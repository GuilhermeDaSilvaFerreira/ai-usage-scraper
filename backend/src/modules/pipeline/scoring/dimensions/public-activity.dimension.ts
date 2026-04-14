import { Injectable } from '@nestjs/common';
import { FirmSignal } from '../../../../database/entities/firm-signal.entity.js';
import { SignalType } from '../../../../common/enums/index.js';
import { BaseDimension, DimensionScoreResult } from './base.dimension.js';
import type { EvidenceEntry } from '../../../../common/interfaces/index.js';

@Injectable()
export class PublicActivityDimension extends BaseDimension {
  readonly name = 'public_ai_activity';
  readonly relevantSignalTypes = [
    SignalType.AI_NEWS_MENTION,
    SignalType.AI_CASE_STUDY,
    SignalType.LINKEDIN_AI_ACTIVITY,
  ];

  score(signals: FirmSignal[]): DimensionScoreResult {
    const relevant = this.filterRelevant(signals);
    const evidence: EvidenceEntry[] = [];
    let rawScore = 0;
    const maxPossible = 100;

    const newsMentions = relevant.filter(
      (s) => s.signal_type === SignalType.AI_NEWS_MENTION,
    );
    const newsPoints = Math.min(newsMentions.length * 8, 40);
    rawScore += newsPoints;
    evidence.push(
      ...this.buildCappedEvidence(newsMentions, 8, newsPoints, (s) =>
        `AI news mention: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const caseStudies = relevant.filter(
      (s) => s.signal_type === SignalType.AI_CASE_STUDY,
    );
    const caseStudyPoints = Math.min(caseStudies.length * 15, 35);
    rawScore += caseStudyPoints;
    evidence.push(
      ...this.buildCappedEvidence(caseStudies, 15, caseStudyPoints, (s) =>
        `AI case study: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const linkedinActivity = relevant.filter(
      (s) => s.signal_type === SignalType.LINKEDIN_AI_ACTIVITY,
    );
    const linkedinPoints = Math.min(linkedinActivity.length * 5, 25);
    rawScore += linkedinPoints;
    evidence.push(
      ...this.buildCappedEvidence(linkedinActivity, 5, linkedinPoints, (s) =>
        `LinkedIn AI activity: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
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

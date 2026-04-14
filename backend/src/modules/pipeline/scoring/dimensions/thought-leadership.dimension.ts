import { Injectable } from '@nestjs/common';
import { FirmSignal } from '../../../../database/entities/firm-signal.entity.js';
import { SignalType } from '../../../../common/enums/index.js';
import { BaseDimension, DimensionScoreResult } from './base.dimension.js';
import type { EvidenceEntry } from '../../../../common/interfaces/index.js';

@Injectable()
export class ThoughtLeadershipDimension extends BaseDimension {
  readonly name = 'thought_leadership';
  readonly relevantSignalTypes = [
    SignalType.AI_CONFERENCE_TALK,
    SignalType.AI_PODCAST,
    SignalType.AI_RESEARCH,
  ];

  score(signals: FirmSignal[]): DimensionScoreResult {
    const relevant = this.filterRelevant(signals);
    const evidence: EvidenceEntry[] = [];
    let rawScore = 0;
    const maxPossible = 100;

    const conferenceTalks = relevant.filter(
      (s) => s.signal_type === SignalType.AI_CONFERENCE_TALK,
    );
    const conferencePoints = Math.min(conferenceTalks.length * 15, 40);
    rawScore += conferencePoints;
    evidence.push(
      ...this.buildCappedEvidence(conferenceTalks, 15, conferencePoints, (s) =>
        `AI conference talk: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const podcasts = relevant.filter(
      (s) => s.signal_type === SignalType.AI_PODCAST,
    );
    const podcastPoints = Math.min(podcasts.length * 12, 30);
    rawScore += podcastPoints;
    evidence.push(
      ...this.buildCappedEvidence(podcasts, 12, podcastPoints, (s) =>
        `AI podcast appearance: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const research = relevant.filter(
      (s) => s.signal_type === SignalType.AI_RESEARCH,
    );
    const researchPoints = Math.min(research.length * 15, 30);
    rawScore += researchPoints;
    evidence.push(
      ...this.buildCappedEvidence(research, 15, researchPoints, (s) =>
        `AI research publication: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
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

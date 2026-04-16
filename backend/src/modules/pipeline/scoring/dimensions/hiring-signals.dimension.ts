import { Injectable } from '@nestjs/common';
import { FirmSignal } from '../../../../database/entities/firm-signal.entity.js';
import { SignalType } from '../../../../common/enums/index.js';
import { BaseDimension, DimensionScoreResult } from './base.dimension.js';
import type { EvidenceEntry } from '../../../../common/interfaces/index.js';

@Injectable()
export class HiringSignalsDimension extends BaseDimension {
  readonly name = 'ai_hiring_velocity';
  readonly relevantSignalTypes = [SignalType.AI_HIRING];

  score(signals: FirmSignal[]): DimensionScoreResult {
    const relevant = this.filterRelevant(signals);
    const evidence: EvidenceEntry[] = [];
    let rawScore = 0;
    const maxPossible = 100;

    const recentCutoff = new Date();
    recentCutoff.setMonth(recentCutoff.getMonth() - 6);

    const recentHires = relevant.filter(
      (s) => new Date(s.collected_at) >= recentCutoff,
    );
    const olderHires = relevant.filter(
      (s) => new Date(s.collected_at) < recentCutoff,
    );

    const recentPoints = Math.min(recentHires.length * 12, 50);
    rawScore += recentPoints;
    evidence.push(
      ...this.buildCappedEvidence(
        recentHires,
        12,
        recentPoints,
        (s) =>
          `Recent AI hiring signal (last 6 months): ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const olderPoints = Math.min(olderHires.length * 5, 25);
    rawScore += olderPoints;
    evidence.push(
      ...this.buildCappedEvidence(
        olderHires,
        5,
        olderPoints,
        (s) =>
          `Historical AI hiring signal: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const diversityBonus = this.calculateRoleDiversity(relevant);
    rawScore += diversityBonus;
    if (diversityBonus > 0) {
      evidence.push({
        signalId: relevant[0]?.id || '',
        dimension: this.name,
        weightApplied: diversityBonus,
        pointsContributed: diversityBonus,
        reasoning: `Role diversity bonus: multiple distinct AI roles detected`,
      });
    }

    return {
      rawScore: this.clamp(rawScore, 0, maxPossible),
      maxPossible,
      signalCount: relevant.length,
      evidence,
    };
  }

  private calculateRoleDiversity(signals: FirmSignal[]): number {
    const roles = new Set<string>();
    for (const s of signals) {
      const data = JSON.stringify(s.signal_data).toLowerCase();
      if (data.includes('data scientist')) roles.add('data_scientist');
      if (data.includes('ml engineer') || data.includes('machine learning'))
        roles.add('ml_engineer');
      if (data.includes('data engineer')) roles.add('data_engineer');
      if (data.includes('chief') || data.includes('head'))
        roles.add('leadership');
      if (data.includes('analytics')) roles.add('analytics');
    }
    return Math.min(roles.size * 5, 25);
  }
}

import { Injectable } from '@nestjs/common';
import { FirmSignal } from '../../../../database/entities/firm-signal.entity.js';
import { SignalType } from '../../../../common/enums/index.js';
import { BaseDimension, DimensionScoreResult } from './base.dimension.js';
import type { EvidenceEntry } from '../../../../common/interfaces/index.js';

@Injectable()
export class AiTalentDimension extends BaseDimension {
  readonly name = 'ai_talent_density';
  readonly relevantSignalTypes = [
    SignalType.AI_TEAM_GROWTH,
    SignalType.AI_HIRING,
  ];

  score(signals: FirmSignal[]): DimensionScoreResult {
    const relevant = this.filterRelevant(signals);
    const evidence: EvidenceEntry[] = [];
    let rawScore = 0;
    const maxPossible = 100;

    const seniorHires = relevant.filter((s) => {
      const data = s.signal_data || {};
      const context = JSON.stringify(data).toLowerCase();
      return (
        context.includes('chief') ||
        context.includes('head of') ||
        context.includes('vp') ||
        context.includes('director') ||
        context.includes('managing director')
      );
    });

    const seniorHirePoints = Math.min(seniorHires.length * 15, 45);
    rawScore += seniorHirePoints;
    evidence.push(
      ...this.buildCappedEvidence(
        seniorHires,
        15,
        seniorHirePoints,
        (s) =>
          `Senior AI/tech hire detected: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const teamGrowthSignals = relevant.filter(
      (s) => s.signal_type === SignalType.AI_TEAM_GROWTH,
    );
    const teamGrowthPoints = Math.min(teamGrowthSignals.length * 10, 30);
    rawScore += teamGrowthPoints;
    evidence.push(
      ...this.buildCappedEvidence(
        teamGrowthSignals,
        10,
        teamGrowthPoints,
        (s) =>
          `AI team growth signal: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
      ),
    );

    const generalHires = relevant.filter((s) => {
      const data = s.signal_data || {};
      const context = JSON.stringify(data).toLowerCase();
      return (
        s.signal_type === SignalType.AI_HIRING &&
        !context.includes('chief') &&
        !context.includes('head of')
      );
    });
    const generalHirePoints = Math.min(generalHires.length * 5, 25);
    rawScore += generalHirePoints;
    evidence.push(
      ...this.buildCappedEvidence(
        generalHires,
        5,
        generalHirePoints,
        (s) =>
          `AI hiring signal: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
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

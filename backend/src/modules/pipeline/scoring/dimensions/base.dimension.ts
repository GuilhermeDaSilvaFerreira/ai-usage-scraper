import { FirmSignal } from '../../../../database/entities/firm-signal.entity.js';
import { EvidenceEntry } from '../../../../common/interfaces/index.js';
import type { DimensionScoreKey } from '../../../../common/interfaces/index.js';

export interface DimensionScoreResult {
  rawScore: number;
  maxPossible: number;
  signalCount: number;
  evidence: EvidenceEntry[];
}

export abstract class BaseDimension {
  abstract readonly name: DimensionScoreKey;
  abstract readonly relevantSignalTypes: string[];

  abstract score(signals: FirmSignal[]): DimensionScoreResult;

  protected filterRelevant(signals: FirmSignal[]): FirmSignal[] {
    return signals.filter((s) =>
      this.relevantSignalTypes.includes(s.signal_type),
    );
  }

  protected clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  protected confidenceWeightedCount(signals: FirmSignal[]): number {
    return signals.reduce((sum, s) => sum + s.extraction_confidence, 0);
  }

  protected buildCappedEvidence(
    signals: FirmSignal[],
    perUnitWeight: number,
    cappedTotal: number,
    reasoning: (s: FirmSignal) => string,
  ): EvidenceEntry[] {
    const evidence: EvidenceEntry[] = [];
    let distributed = 0;

    for (const s of signals) {
      const remaining = cappedTotal - distributed;
      const contributed = Math.max(0, Math.min(perUnitWeight, remaining));
      distributed += contributed;

      evidence.push({
        signalId: s.id,
        dimension: this.name,
        weightApplied: perUnitWeight,
        pointsContributed: contributed,
        reasoning: reasoning(s),
      });
    }

    return evidence;
  }
}

import { Injectable } from '@nestjs/common';
import { FirmSignal } from '../../../../database/entities/firm-signal.entity.js';
import { SignalType } from '../../../../common/enums/index.js';
import { BaseDimension, DimensionScoreResult } from './base.dimension.js';
import type { EvidenceEntry } from '../../../../common/interfaces/index.js';

@Injectable()
export class VendorPartnershipsDimension extends BaseDimension {
  readonly name = 'vendor_partnerships';
  readonly relevantSignalTypes = [
    SignalType.AI_VENDOR_PARTNERSHIP,
    SignalType.TECH_STACK_SIGNAL,
  ];

  score(signals: FirmSignal[]): DimensionScoreResult {
    const relevant = this.filterRelevant(signals);
    const evidence: EvidenceEntry[] = [];
    let rawScore = 0;
    const maxPossible = 100;

    const partnerships = relevant.filter(
      (s) => s.signal_type === SignalType.AI_VENDOR_PARTNERSHIP,
    );
    const uniqueVendors = new Set(
      partnerships.map(
        (s) =>
          (s.signal_data?.vendor_name as string)?.toLowerCase() || 'unknown',
      ),
    );

    const partnerPoints = Math.min(uniqueVendors.size * 20, 60);
    rawScore += partnerPoints;
    evidence.push(
      ...this.buildCappedEvidence(
        partnerships,
        20,
        partnerPoints,
        (s) =>
          `AI vendor partnership: ${s.signal_data?.vendor_name || 'unknown'}`,
      ),
    );

    const techStackSignals = relevant.filter(
      (s) => s.signal_type === SignalType.TECH_STACK_SIGNAL,
    );
    const techStackPoints = Math.min(techStackSignals.length * 10, 40);
    rawScore += techStackPoints;
    evidence.push(
      ...this.buildCappedEvidence(
        techStackSignals,
        10,
        techStackPoints,
        (s) =>
          `Tech stack signal: ${JSON.stringify(s.signal_data).slice(0, 200)}`,
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

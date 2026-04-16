import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { FirmScore } from './firm-score.entity.js';
import { FirmSignal } from './firm-signal.entity.js';
import { UuidV7Entity } from './base.entity.js';
import type { DimensionScoreKey } from '../../common/interfaces/scoring.interfaces.js';

@Entity('score_evidence')
export class ScoreEvidence extends UuidV7Entity {
  @Column({ type: 'uuid' })
  @Index()
  firm_score_id: string;

  @ManyToOne(() => FirmScore, (score) => score.evidence, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'firm_score_id' })
  score: FirmScore;

  @Column({ type: 'uuid' })
  firm_signal_id: string;

  @ManyToOne(() => FirmSignal, (signal) => signal.evidence_entries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'firm_signal_id' })
  signal: FirmSignal;

  @Column({ type: 'varchar', length: 200 })
  dimension: DimensionScoreKey;

  @Column({ type: 'float', default: 0 })
  weight_applied: number;

  @Column({ type: 'float', default: 0 })
  points_contributed: number;

  @Column({ type: 'text', nullable: true })
  reasoning: string | null;
}

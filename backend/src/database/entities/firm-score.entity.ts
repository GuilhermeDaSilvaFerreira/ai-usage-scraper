import {
  Entity,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import type {
  DimensionScoresJson,
  ScoringParametersJson,
} from '../../common/interfaces/index.js';
import { Firm } from './firm.entity.js';
import { ScoreEvidence } from './score-evidence.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('firm_scores')
@Unique(['firm_id', 'score_version'])
export class FirmScore extends UuidV7Entity {
  @Column({ type: 'uuid' })
  @Index()
  firm_id!: string;

  @ManyToOne(() => Firm, (firm) => firm.scores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'firm_id' })
  firm!: Firm;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  score_version!: string;

  @Column({ type: 'float', default: 0 })
  overall_score!: number;

  @Column({ type: 'jsonb', nullable: true })
  dimension_scores!: DimensionScoresJson | null;

  @Column({ type: 'int', nullable: true })
  rank!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  scoring_parameters!: ScoringParametersJson | null;

  @Column({ type: 'int', default: 0 })
  signal_count!: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  scored_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @OneToMany(() => ScoreEvidence, (evidence) => evidence.score)
  evidence!: ScoreEvidence[];
}

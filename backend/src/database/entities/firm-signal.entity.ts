import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { SignalType } from '../../common/enums/index.js';
import { ExtractionMethod } from '../../common/enums/index.js';
import type { SignalDataJson } from '../../common/interfaces/index.js';
import { Firm } from './firm.entity.js';
import { DataSource } from './data-source.entity.js';
import { ScoreEvidence } from './score-evidence.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('firm_signals')
export class FirmSignal extends UuidV7Entity {
  @Column({ type: 'uuid' })
  @Index()
  firm_id!: string;

  @ManyToOne(() => Firm, (firm) => firm.signals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'firm_id' })
  firm!: Firm;

  @Column({ type: 'enum', enum: SignalType })
  @Index()
  signal_type!: SignalType;

  @Column({ type: 'jsonb' })
  signal_data!: SignalDataJson;

  @Column({ type: 'uuid', nullable: true })
  data_source_id!: string | null;

  @ManyToOne(() => DataSource, (ds) => ds.signals, { nullable: true })
  @JoinColumn({ name: 'data_source_id' })
  data_source!: DataSource | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  collected_at!: Date;

  @Column({ type: 'enum', enum: ExtractionMethod })
  extraction_method!: ExtractionMethod;

  @Column({ type: 'float', default: 0.5 })
  extraction_confidence!: number;

  @OneToMany(() => ScoreEvidence, (evidence) => evidence.signal)
  evidence_entries!: ScoreEvidence[];
}

import { Entity, Column, CreateDateColumn, OneToMany, Index } from 'typeorm';
import { SourceType, DataSourceTarget } from '../../common/enums/index.js';
import type { DataSourceMetadataJson } from '../../common/interfaces/index.js';
import { Firm } from './firm.entity.js';
import { FirmSignal } from './firm-signal.entity.js';
import { Person } from './person.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('data_sources')
export class DataSource extends UuidV7Entity {
  @Column({ type: 'enum', enum: SourceType })
  source_type: SourceType;

  @Column({ type: 'enum', enum: DataSourceTarget })
  @Index()
  target_entity: DataSourceTarget;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  @Index()
  url: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  title: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  retrieved_at: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index()
  raw_content_hash: string | null;

  @Column({ type: 'text', nullable: true })
  content_snippet: string | null;

  @Column({ type: 'float', default: 0.5 })
  reliability_score: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: DataSourceMetadataJson | null;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Firm, (firm) => firm.data_source)
  firms: Firm[];

  @OneToMany(() => FirmSignal, (signal) => signal.data_source)
  signals: FirmSignal[];

  @OneToMany(() => Person, (person) => person.data_source)
  people: Person[];
}

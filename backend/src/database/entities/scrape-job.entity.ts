import {
  Entity,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { JobType, JobStatus } from '../../common/enums/index.js';
import type { ScrapeJobMetadataJson } from '../../common/interfaces/index.js';
import { Firm } from './firm.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('scrape_jobs')
export class ScrapeJob extends UuidV7Entity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  firm_id!: string | null;

  @ManyToOne(() => Firm, (firm) => firm.scrape_jobs, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'firm_id' })
  firm!: Firm | null;

  @Column({ type: 'enum', enum: JobType })
  @Index()
  job_type!: JobType;

  @Column({
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.PENDING,
  })
  @Index()
  status!: JobStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  queue_job_id!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at!: Date | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'int', default: 0 })
  retry_count!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: ScrapeJobMetadataJson | null;

  @CreateDateColumn()
  created_at!: Date;
}

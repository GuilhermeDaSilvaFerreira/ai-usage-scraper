import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { FirmType } from '../../common/enums/index.js';
import { FirmAlias } from './firm-alias.entity.js';
import { Person } from './person.entity.js';
import { FirmSignal } from './firm-signal.entity.js';
import { FirmScore } from './firm-score.entity.js';
import { ScrapeJob } from './scrape-job.entity.js';
import { OutreachCampaign } from './outreach-campaign.entity.js';
import { DataSource } from './data-source.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('firms')
export class Firm extends UuidV7Entity {
  @Column({ type: 'varchar', length: 500 })
  @Index()
  name!: string;

  @Column({ type: 'varchar', length: 500, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  website!: string | null;

  @Column({
    type: 'numeric',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  aum_usd!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  aum_source!: string | null;

  @Column({ type: 'enum', enum: FirmType, nullable: true })
  firm_type!: FirmType | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  headquarters!: string | null;

  @Column({ type: 'int', nullable: true })
  founded_year!: number | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sec_crd_number!: string | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  last_collected_at!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  data_source_id!: string | null;

  @ManyToOne(() => DataSource, (ds) => ds.firms, { nullable: true })
  @JoinColumn({ name: 'data_source_id' })
  data_source!: DataSource | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => FirmAlias, (alias) => alias.firm)
  aliases!: FirmAlias[];

  @OneToMany(() => Person, (person) => person.firm)
  people!: Person[];

  @OneToMany(() => FirmSignal, (signal) => signal.firm)
  signals!: FirmSignal[];

  @OneToMany(() => FirmScore, (score) => score.firm)
  scores!: FirmScore[];

  @OneToMany(() => ScrapeJob, (job) => job.firm)
  scrape_jobs!: ScrapeJob[];

  @OneToMany(() => OutreachCampaign, (campaign) => campaign.firm)
  outreach_campaigns!: OutreachCampaign[];
}

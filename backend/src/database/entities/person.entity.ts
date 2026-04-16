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
import { RoleCategory } from '../../common/enums/index.js';
import { Firm } from './firm.entity.js';
import { DataSource } from './data-source.entity.js';
import { OutreachCampaign } from './outreach-campaign.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('people')
export class Person extends UuidV7Entity {
  @Column({ type: 'uuid' })
  @Index()
  firm_id!: string;

  @ManyToOne(() => Firm, (firm) => firm.people, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'firm_id' })
  firm!: Firm;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  full_name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title!: string | null;

  @Column({
    type: 'enum',
    enum: RoleCategory,
    default: RoleCategory.OTHER,
  })
  role_category!: RoleCategory;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  linkedin_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ type: 'uuid', nullable: true })
  data_source_id!: string | null;

  @ManyToOne(() => DataSource, (ds) => ds.people, { nullable: true })
  @JoinColumn({ name: 'data_source_id' })
  data_source!: DataSource | null;

  @Column({ type: 'float', default: 0.5 })
  confidence!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => OutreachCampaign, (campaign) => campaign.person)
  outreach_campaigns!: OutreachCampaign[];
}

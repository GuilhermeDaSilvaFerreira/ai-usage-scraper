import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OutreachStatus, ContactPlatform } from '../../common/enums/index.js';
import { Firm } from './firm.entity.js';
import { Person } from './person.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('outreach_campaigns')
export class OutreachCampaign extends UuidV7Entity {
  @Column({ type: 'uuid' })
  @Index()
  firm_id: string;

  @ManyToOne(() => Firm, (firm) => firm.outreach_campaigns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'firm_id' })
  firm: Firm;

  @Column({ type: 'uuid' })
  @Index()
  person_id: string;

  @ManyToOne(() => Person, (person) => person.outreach_campaigns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'person_id' })
  person: Person;

  @Column({
    type: 'enum',
    enum: OutreachStatus,
    default: OutreachStatus.NOT_CONTACTED,
  })
  @Index()
  status: OutreachStatus;

  @Column({
    type: 'enum',
    enum: ContactPlatform,
    array: true,
    default: [],
  })
  contact_platforms: ContactPlatform[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  contacted_by: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  outreach_message: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  first_contact_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_status_change_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

import {
  Entity,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Firm } from './firm.entity.js';
import { UuidV7Entity } from './base.entity.js';

@Entity('firm_aliases')
export class FirmAlias extends UuidV7Entity {
  @Column({ type: 'uuid' })
  firm_id!: string;

  @ManyToOne(() => Firm, (firm) => firm.aliases, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'firm_id' })
  firm!: Firm;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  alias_name!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  source!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}

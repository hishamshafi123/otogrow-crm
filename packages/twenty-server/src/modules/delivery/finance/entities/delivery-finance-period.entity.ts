import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryFinancePeriod', schema: 'core' })
@Index(['workspaceId', 'month'], { unique: true })
@Check("status IN ('OPEN','LOCKED')")
@Check('revision > 0')
@Check("month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(month,4)<>'0000'")
@Check('length(btrim(reason)) > 0')
export class DeliveryFinancePeriodEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) month: string;
  @Column({ type: 'text' }) status: 'OPEN' | 'LOCKED';
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'text' }) changedByName: string;
  @UpdateDateColumn({ type: 'timestamptz' }) changedAt: Date;
  @Column({ type: 'text' }) reason: string;
}

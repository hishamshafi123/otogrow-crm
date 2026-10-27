import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryFinanceForecastAnchor', schema: 'core' })
@Index(['workspaceId', 'currency'], { unique: true })
@Check('revision > 0')
@Check('length(btrim(note)) > 0')
export class DeliveryFinanceForecastAnchorEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) currency: string;
  @Column({ type: 'bigint' }) amountMicros: string;
  @Column({ type: 'date' }) closingDate: string;
  @Column({ type: 'text' }) timezone: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'text', nullable: true }) evidenceUrl: string | null;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'text' }) changedByName: string;
  @UpdateDateColumn({ type: 'timestamptz' }) changedAt: Date;
}

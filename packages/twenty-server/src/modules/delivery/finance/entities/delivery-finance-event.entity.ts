import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
@Entity({ name: 'deliveryFinanceEvent', schema: 'core' })
@Index(['workspaceId', 'sourceType', 'sourceId', 'createdAt', 'id'])
export class DeliveryFinanceEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) sourceType:
    | 'PLAN'
    | 'ENTRY'
    | 'PAYMENT'
    | 'SETTLEMENT'
    | 'MATCH'
    | 'PERIOD'
    | 'FORECAST_ANCHOR'
    | 'FORECAST_ITEM'
    | 'FORECAST_REALIZATION'
    | 'EXPORT_PROFILE'
    | 'EXPORT_BATCH';
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'jsonb', nullable: true }) before: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'jsonb' }) after: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

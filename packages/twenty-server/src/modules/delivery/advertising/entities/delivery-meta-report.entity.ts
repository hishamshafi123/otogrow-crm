import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type MetaReport } from 'src/modules/delivery/advertising/delivery-meta.types';

@Entity({ name: 'deliveryMetaReport', schema: 'core' })
@Index(['workspaceId', 'position'])
@Index(['workspaceId', 'accountId', 'date', 'position'])
@Index(['workspaceId', 'managerId', 'status', 'position'])
@Index(['workspaceId', 'marketerId', 'status', 'position'])
export class DeliveryMetaReportEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'bigint', generated: 'increment' }) position: string;
  @Column({ type: 'text' }) accountId: string;
  @Column({ type: 'date' }) date: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'uuid', nullable: true }) managerId: string | null;
  @Column({ type: 'uuid', nullable: true }) marketerId: string | null;
  @Column({ type: 'text' }) status: MetaReport['status'];
  @Column({ type: 'jsonb' }) report: MetaReport;
  @Column({ type: 'timestamptz' }) checkedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) archivedAt: Date | null;
}

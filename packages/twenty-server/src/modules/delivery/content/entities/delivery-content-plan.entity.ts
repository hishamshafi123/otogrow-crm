import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
@Entity({ name: 'deliveryContentPlan', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'id'], { unique: true })
@Check('revision>0 AND length(btrim(title)) BETWEEN 1 AND 200')
@Check('("engagementId" IS NULL)=(service IS NULL)')
export class DeliveryContentPlanEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text' }) purpose: string;
  @Column({ type: 'uuid', nullable: true }) engagementId: string | null;
  @Column({ type: 'text', nullable: true }) service: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}

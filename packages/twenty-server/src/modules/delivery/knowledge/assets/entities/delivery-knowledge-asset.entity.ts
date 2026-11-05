import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';

@Entity({ name: 'deliveryKnowledgeAsset', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'sourceId', 'id'], { unique: true })
@Index(['workspaceId', 'uploadedBy', 'state'])
@Check("state IN ('PENDING','READY','FAILED')")
@Check('size>0 AND size<=20971520 AND "sourceRevision">=0')
@Check("sha256 ~ '^[a-f0-9]{64}$' AND \"inputHash\" ~ '^[a-f0-9]{64}$'")
@Check(
  "\"mimeType\" IN ('image/png','image/jpeg','image/webp','application/pdf')",
)
@Check('length(btrim(name)) BETWEEN 1 AND 200')
@Check(
  '(state=\'READY\' AND "readyAt" IS NOT NULL AND "failureReason" IS NULL) OR (state=\'PENDING\' AND "readyAt" IS NULL AND "failureReason" IS NULL) OR (state=\'FAILED\' AND "readyAt" IS NULL AND "failureReason" IS NOT NULL)',
)
export class DeliveryKnowledgeAssetEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'integer' }) sourceRevision: number;
  @Column({ type: 'uuid' }) uploadedBy: string;
  @Column({ type: 'uuid' }) uploaderUserWorkspaceId: string;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) mimeType: string;
  @Column({ type: 'integer' }) size: number;
  @Column({ type: 'text' }) sha256: string;
  @Column({ type: 'text', default: 'PENDING' }) state:
    | 'PENDING'
    | 'READY'
    | 'FAILED';
  @Column({ type: 'text', nullable: true }) failureReason: string | null;
  @Column({ type: 'timestamptz', nullable: true }) readyAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) cleanedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}

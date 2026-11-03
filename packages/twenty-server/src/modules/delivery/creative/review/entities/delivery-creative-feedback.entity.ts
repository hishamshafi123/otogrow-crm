import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { type DeliveryCreativeReviewTargetDTO } from 'src/modules/delivery/creative/review/delivery-creative-review.dto';
@Entity({ name: 'deliveryCreativeFeedback', schema: 'core' })
@Index(['workspaceId', 'taskId', 'id'], { unique: true })
@Index([
  'workspaceId',
  'taskId',
  'targetKind',
  'assetId',
  'submissionVersion',
  'id',
])
@Check('revision>0')
@Check('length(btrim(body)) BETWEEN 1 AND 6000')
@Check("status IN ('OPEN','ADDRESSED','RESOLVED')")
@Check(
  `("targetKind"='ASSET' AND "submissionVersion" IS NULL) OR ("targetKind"='SUBMISSION' AND "submissionVersion" IS NOT NULL AND "submissionVersion">0)`,
)
@Check(
  `("anchorKind"='GENERAL' AND "startMs" IS NULL AND "endMs" IS NULL) OR ("anchorKind"='TIME' AND "startMs" IS NOT NULL AND "startMs" BETWEEN 0 AND 2147483647 AND "endMs" IS NULL) OR ("anchorKind"='RANGE' AND "startMs" IS NOT NULL AND "endMs" IS NOT NULL AND "startMs" BETWEEN 0 AND 2147483647 AND "endMs">"startMs" AND "endMs"<=2147483647)`,
)
export class DeliveryCreativeFeedbackEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) targetKind: 'ASSET' | 'SUBMISSION';
  @Column({ type: 'integer', nullable: true }) submissionVersion: number | null;
  @Column({ type: 'uuid' }) assetId: string;
  @Column({ type: 'jsonb' }) target: DeliveryCreativeReviewTargetDTO;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'text' }) anchorKind: 'GENERAL' | 'TIME' | 'RANGE';
  @Column({ type: 'integer', nullable: true }) startMs: number | null;
  @Column({ type: 'integer', nullable: true }) endMs: number | null;
  @Column({ type: 'text' }) status: 'OPEN' | 'ADDRESSED' | 'RESOLVED';
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'text' }) createdByName: string;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'jsonb', nullable: true })
  correction: DeliveryCreativeReviewTargetDTO | null;
  @ManyToOne(() => DeliveryTaskEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
  ])
  task: Relation<DeliveryTaskEntity>;
}

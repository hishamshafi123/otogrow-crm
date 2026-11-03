import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryReleaseEntity } from './delivery-release.entity';
import { type ReleaseSavedBody } from '../delivery-release.types';
@Entity({ name: 'deliveryReleaseVersion', schema: 'core' })
@Index(['workspaceId', 'releaseId', 'version'], { unique: true })
@Check('version>0')
@Check(`jsonb_typeof(body)='object'`)
@Check(
  `CASE WHEN jsonb_typeof(body->'work')='array' AND jsonb_typeof(body->'tasks')='array' AND jsonb_typeof(body->'checks')='array' THEN jsonb_array_length(body->'work')<=30 AND jsonb_array_length(body->'tasks')<=30 AND jsonb_array_length(body->'checks')<=30 ELSE false END`,
)
@Check(`COALESCE(body->>'sourceFingerprint' ~ '^[a-f0-9]{64}$', false)`)
export class DeliveryReleaseVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) releaseId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'jsonb' }) body: ReleaseSavedBody;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryReleaseEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'releaseId', referencedColumnName: 'id' },
  ])
  release: Relation<DeliveryReleaseEntity>;
}

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
import { DeliveryContentVariantEntity } from './delivery-content-variant.entity';
import { type ContentSavedBody } from '../delivery-content.types';
@Entity({ name: 'deliveryContentVersion', schema: 'core' })
@Index(['workspaceId', 'variantId', 'version'], { unique: true })
@Check('version>0')
@Check(`jsonb_typeof(body)='object' AND octet_length(body::text)<=100000`)
@Check(`COALESCE(body->>'sourceFingerprint' ~ '^[a-f0-9]{64}$', false)`)
@Check(
  `COALESCE(jsonb_typeof(body->'account')='object' AND jsonb_typeof(body->'accountId')='string' AND body->>'accountId'=body->'account'->>'id' AND jsonb_typeof(body->'ownerId')='string' AND jsonb_typeof(body->'reviewerId')='string' AND jsonb_typeof(body->'caption')='string' AND jsonb_typeof(body->'plannedAt')='string' AND jsonb_typeof(body->'plannedLocal')='string' AND jsonb_typeof(body->'timezone')='string' AND body->>'format' IN ('TEXT','IMAGE','VIDEO') AND (body->'asset'='null'::jsonb OR jsonb_typeof(body->'asset')='object'),false)`,
)
@Check(
  `CASE WHEN jsonb_typeof(body->'contributorIds')='array' THEN jsonb_array_length(body->'contributorIds') BETWEEN 1 AND 50 ELSE false END`,
)
export class DeliveryContentVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) variantId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'jsonb' }) body: ContentSavedBody;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryContentVariantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'variantId', referencedColumnName: 'id' },
  ])
  variant: Relation<DeliveryContentVariantEntity>;
}

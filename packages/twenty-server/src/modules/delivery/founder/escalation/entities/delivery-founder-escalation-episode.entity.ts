import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryFounderEscalationRuleEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-rule.entity';
import { type DeliveryFounderExceptionDTO } from 'src/modules/delivery/founder/delivery-founder.dto';
@Entity({ name: 'deliveryFounderEscalationEpisode', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'ruleId', 'sourceKey'], {
  unique: true,
  where: "status IN ('OPEN','UNAVAILABLE')",
})
@Check('revision > 0')
@Check(`status IN ('OPEN','UNAVAILABLE','RESOLVED','WITHDRAWN')`)
export class DeliveryFounderEscalationEpisodeEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) ruleId: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) sourceKey: string;
  @Column({ type: 'text' }) condition: string;
  @Column({ type: 'text' }) status:
    | 'OPEN'
    | 'UNAVAILABLE'
    | 'RESOLVED'
    | 'WITHDRAWN';
  @Column({ type: 'jsonb' }) source: DeliveryFounderExceptionDTO;
  @Column({ type: 'timestamptz' }) firstSeenAt: Date;
  @Column({ type: 'timestamptz' }) lastSeenAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) acknowledgedAt: Date | null;
  @Column({ type: 'text', nullable: true }) acknowledgedByName: string | null;
  @Column({ type: 'text', nullable: true }) acknowledgementReason:
    | string
    | null;
  @ManyToOne(() => DeliveryFounderEscalationRuleEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'ruleId', referencedColumnName: 'id' },
  ])
  rule: Relation<DeliveryFounderEscalationRuleEntity>;
}

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
import { DeliveryFounderEscalationEpisodeEntity } from 'src/modules/delivery/founder/escalation/entities/delivery-founder-escalation-episode.entity';
import { type DeliveryFounderExceptionDTO } from 'src/modules/delivery/founder/delivery-founder.dto';
@Entity({ name: 'deliveryFounderEscalationNotice', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'commandId'], { unique: true })
@Index(['workspaceId', 'episodeId', 'sequence'], {
  unique: true,
  where: "kind='ALERT'",
})
@Check(
  `kind IN ('ALERT','RULE_SAVED','RULE_ENABLED','RULE_PAUSED','ACKNOWLEDGED')`,
)
@Check(
  `(kind='ALERT' AND "episodeId" IS NOT NULL AND sequence>0 AND "commandId" IS NULL) OR (kind<>'ALERT' AND sequence=0 AND "commandId" IS NOT NULL AND "requestHash" IS NOT NULL)`,
)
export class DeliveryFounderEscalationNoticeEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) ruleId: string;
  @Column({ type: 'uuid', nullable: true }) episodeId: string | null;
  @Column({ type: 'text' }) kind:
    | 'ALERT'
    | 'RULE_SAVED'
    | 'RULE_ENABLED'
    | 'RULE_PAUSED'
    | 'ACKNOWLEDGED';
  @Column({ type: 'integer' }) sequence: number;
  @Column({ type: 'integer' }) ruleRevision: number;
  @Column({ type: 'uuid', nullable: true }) commandId: string | null;
  @Column({ type: 'text', nullable: true }) requestHash: string | null;
  @Column({ type: 'jsonb' }) ruleSnapshot: Record<string, unknown>;
  @Column({ type: 'jsonb', nullable: true })
  source: DeliveryFounderExceptionDTO | null;
  @Column({ type: 'uuid' }) recipientId: string;
  @Column({ type: 'text' }) recipientName: string;
  @Column({ type: 'text' }) priority: 'NORMAL' | 'URGENT';
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryFounderEscalationRuleEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'ruleId', referencedColumnName: 'id' },
  ])
  rule: Relation<DeliveryFounderEscalationRuleEntity>;
  @ManyToOne(() => DeliveryFounderEscalationEpisodeEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'episodeId', referencedColumnName: 'id' },
  ])
  episode: Relation<DeliveryFounderEscalationEpisodeEntity>;
}

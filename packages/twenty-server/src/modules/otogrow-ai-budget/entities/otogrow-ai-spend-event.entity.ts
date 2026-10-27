import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
@Entity({ name: 'otogrowAiSpendEvent', schema: 'core' })
@Index(['workspaceId', 'createdAt', 'id'])
@Index(['workspaceId', 'spendId', 'createdAt', 'id'])
export class OtogrowAiSpendEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'uuid', nullable: true }) spendId: string | null;
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'jsonb' }) before: Record<string, unknown>;
  @Column({ type: 'jsonb' }) after: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) evidenceReference: string | null;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

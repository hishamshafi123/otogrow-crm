import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type OtogrowAiBudgetScope } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';
@Entity({ name: 'otogrowAiBudget', schema: 'core' })
@Index(['workspaceId', 'scope', 'scopeId'], { unique: true })
export class OtogrowAiBudgetEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) scope: OtogrowAiBudgetScope;
  @Column({ type: 'uuid' }) scopeId: string;
  @Column({ type: 'text' }) scopeName: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'boolean' }) enabled: boolean;
  @Column({ type: 'bigint' }) capMicroUsd: string;
  @Column({ type: 'bigint' }) openingSpentMicroUsd: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type OtogrowAiPriceKind,
  type OtogrowAiPricing,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';
@Entity({ name: 'otogrowAiPrice', schema: 'core' })
@Index(['workspaceId', 'modelId', 'kind'], { unique: true })
export class OtogrowAiPriceEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) modelId: string;
  @Column({ type: 'text' }) kind: OtogrowAiPriceKind;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'boolean' }) enabled: boolean;
  @Column({ type: 'text' }) source: string;
  @Column({ type: 'timestamptz' }) verifiedAt: Date;
  @Column({ type: 'jsonb' }) pricing: OtogrowAiPricing;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

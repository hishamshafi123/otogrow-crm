import { Column, CreateDateColumn, PrimaryColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
export abstract class DeliveryFinanceRelationEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'uuid' }) cashId: string;
  @Column({ type: 'text' }) cashTitle: string;
  @Column({ type: 'text' }) targetTitle: string;
  @Column({ type: 'text' }) currency: string;
  @Column({ type: 'bigint' }) amountMicros: string;
  @Column({ type: 'text', default: 'ACTIVE' }) status: 'ACTIVE' | 'REVERSED';
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'text', nullable: true }) projectName: string | null;
  @Column({ type: 'text' }) requestHash: string;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'text' }) createdByName: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'uuid', nullable: true }) reversedBy: string | null;
  @Column({ type: 'text', nullable: true }) reversedByName: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reversedAt: Date | null;
  @Column({ type: 'text', nullable: true }) reversalReason: string | null;
}

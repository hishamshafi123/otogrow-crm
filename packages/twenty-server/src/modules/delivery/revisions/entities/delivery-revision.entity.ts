import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryRevision', schema: 'core' })
@Index(['workspaceId', 'taskId', 'round'], { unique: true })
@Index(['workspaceId', 'taskId', 'taskRevision'], { unique: true })
@Index(['workspaceId', 'createdAt'])
export class DeliveryRevisionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'integer' }) round: number;
  @Column({ type: 'integer' }) taskRevision: number;
  @Column({ type: 'integer', nullable: true }) submissionVersion: number | null;
  @Column({ type: 'text' }) source: string;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'text', default: 'UNCLASSIFIED' }) cause: string;
  @Column({ type: 'integer', nullable: true }) effortMinutes: number | null;
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  internalCost: number | null;
  @Column({
    type: 'bigint',
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  proposedCharge: number;
  @Column({ type: 'text', nullable: true }) currency: string | null;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

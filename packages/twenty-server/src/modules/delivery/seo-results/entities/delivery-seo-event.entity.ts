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
import { DeliverySeoReportEntity } from './delivery-seo-report.entity';
import { DeliverySeoVersionEntity } from './delivery-seo-version.entity';
@Entity({ name: 'deliverySeoEvent', schema: 'core' })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'reportId', 'revision'], { unique: true })
@Check('revision>0 AND version>0')
@Check("action IN ('SAVE','SUBMIT','APPROVE','REQUEST_CHANGES')")
@Check("status IN ('DRAFT','SUBMITTED','APPROVED','CHANGES_REQUESTED')")
export class DeliverySeoEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) reportId: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'text' }) status: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliverySeoReportEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'reportId', referencedColumnName: 'id' },
  ])
  report: Relation<DeliverySeoReportEntity>;
  @ManyToOne(() => DeliverySeoVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'reportId', referencedColumnName: 'reportId' },
    { name: 'version', referencedColumnName: 'version' },
  ])
  savedVersion: Relation<DeliverySeoVersionEntity>;
}

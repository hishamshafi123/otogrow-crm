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
import { type SeoSavedBody } from '../delivery-seo-results.types';
@Entity({ name: 'deliverySeoVersion', schema: 'core' })
@Index(['workspaceId', 'reportId', 'version'], { unique: true })
@Check('version>0')
@Check(`jsonb_typeof(body)='object'`)
export class DeliverySeoVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) reportId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'jsonb' }) body: SeoSavedBody;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliverySeoReportEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'reportId', referencedColumnName: 'id' },
  ])
  report: Relation<DeliverySeoReportEntity>;
}

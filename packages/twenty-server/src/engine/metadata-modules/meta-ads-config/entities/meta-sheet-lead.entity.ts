import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { type MetaLead } from 'src/engine/metadata-modules/meta-ads-config/services/meta-graph-api.service';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'metaSheetLead', schema: 'core' })
@Index('IDX_META_SHEET_LEAD_SOURCE', ['workspaceId', 'formId', 'leadId'], {
  unique: true,
})
export class MetaSheetLeadEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  formId: string;

  @Column({ type: 'text' })
  leadId: string;

  @Column({ type: 'uuid', nullable: true })
  personId: string | null;

  @Column({ type: 'jsonb' })
  answers: MetaLead;

  @Column({ type: 'boolean', default: false })
  skipped: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { type FormFieldDefinition } from 'src/engine/metadata-modules/form/constants/form-field-definition.constant';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Index('IDX_FORM_WORKSPACE_ID', ['workspaceId'])
@Entity({ name: 'form', schema: 'core' })
export class FormEntity
  extends WorkspaceRelatedEntity
  implements Required<FormEntity>
{
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  name: string;

  // Exposed in public URLs instead of the primary key
  @Column({ type: 'uuid', unique: true, default: () => 'uuid_generate_v4()' })
  publicId: string;

  @Column({ type: 'jsonb' })
  fields: FormFieldDefinition[];

  @Column({ type: 'text', nullable: true })
  successMessage: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}

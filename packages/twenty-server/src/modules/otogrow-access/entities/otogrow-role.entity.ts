import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'otogrowRole', schema: 'core' })
@Index(['workspaceId', 'name'], { unique: true })
export class OtogrowRoleEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', array: true, default: [] })
  capabilities: string[];

  @Column({ type: 'integer', default: 0 })
  revision: number;
}

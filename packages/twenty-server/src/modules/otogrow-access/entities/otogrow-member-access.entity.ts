import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'otogrowMemberAccess', schema: 'core' })
@Index(['workspaceId', 'workspaceMemberId'], { unique: true })
export class OtogrowMemberAccessEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceMemberId: string;

  @Column({ type: 'integer', default: 0 })
  revision: number;
}

import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { OtogrowRoleEntity } from 'src/modules/otogrow-access/entities/otogrow-role.entity';

@Entity({ name: 'otogrowRoleAssignment', schema: 'core' })
@Index(['workspaceId', 'workspaceMemberId', 'roleId'], { unique: true })
export class OtogrowRoleAssignmentEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceMemberId: string;

  @Column({ type: 'uuid' })
  roleId: string;

  @ManyToOne(() => OtogrowRoleEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'roleId' })
  role: Relation<OtogrowRoleEntity>;
}

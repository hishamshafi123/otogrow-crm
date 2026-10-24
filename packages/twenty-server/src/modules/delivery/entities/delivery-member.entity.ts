import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryMember', schema: 'core' })
@Index(['workspaceId', 'workspaceMemberId'], { unique: true })
export class DeliveryMemberEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceMemberId: string;

  @Column({ type: 'text', default: 'MEMBER' })
  access: 'ADMIN' | 'MANAGER' | 'MEMBER';

  @Column({ type: 'text', default: '' })
  roleLabel: string;
}

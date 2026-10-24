import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryProject', schema: 'core' })
@Index(['workspaceId'])
export class DeliveryProjectEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'jsonb', default: [] })
  memberIds: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

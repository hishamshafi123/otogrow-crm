import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryAvailability', schema: 'core' })
@Index(['workspaceId', 'memberId', 'date'], { unique: true })
export class DeliveryAvailabilityEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) memberId: string;
  @Column({ type: 'date' }) date: string;
  @Column({ type: 'integer', nullable: true }) minutes: number | null;
  @Column({ type: 'integer', default: 1 }) revision: number;
}

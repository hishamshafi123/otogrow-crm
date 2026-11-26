import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_DRIVE_SYNC_JOB,
  DeliveryDriveService,
} from 'src/modules/delivery/deliverables/delivery-drive.service';

@Processor(MessageQueue.driveSyncQueue)
export class DeliveryDriveSyncJob {
  constructor(private readonly driveService: DeliveryDriveService) {}

  @Process(DELIVERY_DRIVE_SYNC_JOB)
  async handle(data: { workspaceId: string; deliverableId: string }) {
    await this.driveService.syncDeliverableToDrive(
      data.workspaceId,
      data.deliverableId,
    );
  }
}

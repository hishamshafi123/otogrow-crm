import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_STUDIO_JOB,
  DeliveryStudioService,
} from 'src/modules/delivery/studio/delivery-studio.service';

@Processor(MessageQueue.aiQueue)
export class DeliveryStudioJob {
  constructor(private readonly studio: DeliveryStudioService) {}

  @Process(DELIVERY_STUDIO_JOB)
  async handle(data: { workspaceId: string; jobId: string }) {
    await this.studio.executeJob(data.workspaceId, data.jobId);
  }
}

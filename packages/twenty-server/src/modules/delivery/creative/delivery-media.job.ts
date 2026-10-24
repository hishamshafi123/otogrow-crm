import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_MEDIA_JOB,
  DeliveryMediaService,
} from 'src/modules/delivery/creative/delivery-media.service';

@Processor(MessageQueue.aiQueue)
export class DeliveryMediaJob {
  constructor(private readonly service: DeliveryMediaService) {}
  @Process(DELIVERY_MEDIA_JOB)
  async handle(data: { workspaceId: string; taskId: string; runId: string }) {
    await this.service.execute(data.workspaceId, data.taskId, data.runId);
  }
}

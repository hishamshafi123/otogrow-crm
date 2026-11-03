import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_ATLAS_JOB,
  DeliveryAtlasService,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.service';

@Processor(MessageQueue.aiQueue)
export class DeliveryAtlasJob {
  constructor(private readonly atlas: DeliveryAtlasService) {}
  @Process(DELIVERY_ATLAS_JOB)
  async handle(input: { workspaceId: string; runId: string }) {
    await this.atlas.execute(input.workspaceId, input.runId);
  }
}

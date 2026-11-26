import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_HOOK_RENDER_JOB,
  DeliveryVideoHooksService,
} from 'src/modules/delivery/deliverables/delivery-video-hooks.service';

@Processor(MessageQueue.mediaRenderQueue)
export class DeliveryHookRenderJob {
  constructor(private readonly hooksService: DeliveryVideoHooksService) {}

  @Process(DELIVERY_HOOK_RENDER_JOB)
  async handle(data: { workspaceId: string; variationId: string }) {
    await this.hooksService.processRenderJob(data.workspaceId, data.variationId);
  }
}

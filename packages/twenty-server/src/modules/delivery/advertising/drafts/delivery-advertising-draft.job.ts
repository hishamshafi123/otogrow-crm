import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_ADVERTISING_DRAFT_JOB,
  DeliveryAdvertisingDraftService,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.service';

@Processor(MessageQueue.aiQueue)
export class DeliveryAdvertisingDraftJob {
  constructor(private readonly drafts: DeliveryAdvertisingDraftService) {}
  @Process(DELIVERY_ADVERTISING_DRAFT_JOB)
  async handle(input: { runId: string }) {
    await this.drafts.execute(input.runId);
  }
}

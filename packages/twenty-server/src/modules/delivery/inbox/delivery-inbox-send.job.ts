import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_INBOX_SEND_JOB,
  DeliveryInboxReplyService,
} from './delivery-inbox-reply.service';

@Processor(MessageQueue.messagingQueue)
export class DeliveryInboxSendJob {
  constructor(private readonly service: DeliveryInboxReplyService) {}
  @Process(DELIVERY_INBOX_SEND_JOB)
  handle(data: { replyId: string }) {
    return this.service.execute(data.replyId);
  }
}

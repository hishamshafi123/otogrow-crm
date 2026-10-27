import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { DELIVERY_REMINDER_JOB } from 'src/modules/delivery/operations/delivery-reminder.constants';
import { DeliveryReminderService } from 'src/modules/delivery/operations/delivery-reminder.service';

@Processor(MessageQueue.messagingQueue)
export class DeliveryReminderJob {
  constructor(private readonly service: DeliveryReminderService) {}

  @Process(DELIVERY_REMINDER_JOB)
  async handle(data: { outboxId: string }) {
    await this.service.execute(data.outboxId);
  }
}

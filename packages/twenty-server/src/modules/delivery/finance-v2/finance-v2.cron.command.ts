import { Command, CommandRunner } from 'nest-commander';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  DELIVERY_FINANCE_V2_CRON_JOB_NAME,
  DELIVERY_FINANCE_V2_CRON_PATTERN,
} from 'src/modules/delivery/finance-v2/finance-v2.cron.job';

@Command({
  name: 'cron:delivery:finance-v2',
  description:
    'Registers daily cron job for Finance V2 recurring expenses, payday payroll adjustments, and recurring invoice PDFs',
})
export class DeliveryFinanceV2CronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: DELIVERY_FINANCE_V2_CRON_JOB_NAME,
      data: undefined,
      options: {
        repeat: { pattern: DELIVERY_FINANCE_V2_CRON_PATTERN },
      },
    });
  }
}

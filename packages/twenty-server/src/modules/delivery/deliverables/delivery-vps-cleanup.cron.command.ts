import { Command, CommandRunner } from 'nest-commander';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  DELIVERY_VPS_CLEANUP_CRON_JOB_NAME,
  DELIVERY_VPS_CLEANUP_CRON_PATTERN,
} from 'src/modules/delivery/deliverables/delivery-vps-cleanup.cron.job';

@Command({
  name: 'cron:delivery:vps-cleanup',
  description:
    'Registers hourly cron job to purge local VPS deliverable videos 24 hours after confirmed Google Drive sync',
})
export class DeliveryVpsCleanupCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: DELIVERY_VPS_CLEANUP_CRON_JOB_NAME,
      data: undefined,
      options: {
        repeat: { pattern: DELIVERY_VPS_CLEANUP_CRON_PATTERN },
      },
    });
  }
}

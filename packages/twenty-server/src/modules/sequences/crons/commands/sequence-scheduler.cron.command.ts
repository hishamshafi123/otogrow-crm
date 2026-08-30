import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  SEQUENCE_SCHEDULER_CRON_JOB_NAME,
  SEQUENCE_SCHEDULER_CRON_PATTERN,
} from 'src/modules/sequences/constants/sequence.constant';

@Command({
  name: 'cron:sequences:scheduler',
  description:
    'Starts a cron job that enqueues due sequence enrollment steps every 5 minutes',
})
export class SequenceSchedulerCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: SEQUENCE_SCHEDULER_CRON_JOB_NAME,
      data: undefined,
      options: {
        repeat: { pattern: SEQUENCE_SCHEDULER_CRON_PATTERN },
      },
    });
  }
}

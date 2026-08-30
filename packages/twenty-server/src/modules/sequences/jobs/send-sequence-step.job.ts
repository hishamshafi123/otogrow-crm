import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { SEND_SEQUENCE_STEP_JOB } from 'src/modules/sequences/constants/sequence.constant';
import { SequenceSendService } from 'src/modules/sequences/services/sequence-send.service';
import { type SendSequenceStepJobData } from 'src/modules/sequences/types/send-sequence-step-job-data.type';

@Processor(MessageQueue.emailQueue)
export class SendSequenceStepJob {
  constructor(private readonly sequenceSendService: SequenceSendService) {}

  @Process(SEND_SEQUENCE_STEP_JOB)
  async handle(data: SendSequenceStepJobData): Promise<void> {
    await this.sequenceSendService.processSendJob(data);
  }
}

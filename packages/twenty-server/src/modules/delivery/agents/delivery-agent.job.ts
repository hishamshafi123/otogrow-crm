import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  DELIVERY_AGENT_JOB,
  DeliveryAgentService,
} from 'src/modules/delivery/agents/delivery-agent.service';

@Processor(MessageQueue.aiQueue)
export class DeliveryAgentJob {
  constructor(private readonly service: DeliveryAgentService) {}

  @Process(DELIVERY_AGENT_JOB)
  async handle(data: { runId: string }) {
    await this.service.execute(data.runId);
  }
}

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  OTOGROW_ACTIVITY_ANALYSIS_JOB,
  OtogrowActivityAnalysisService,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.service';

@Processor(MessageQueue.aiQueue)
export class OtogrowActivityAnalysisJob {
  constructor(private readonly analysis: OtogrowActivityAnalysisService) {}
  @Process(OTOGROW_ACTIVITY_ANALYSIS_JOB)
  async handle(input: { runId: string }) {
    await this.analysis.execute(input.runId);
  }
}

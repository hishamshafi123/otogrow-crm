import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { LEAD_ASSIGNMENT_PERSON_CREATED_JOB } from 'src/modules/lead-assignment/constants/lead-assignment.constant';
import { LeadAssignmentService } from 'src/modules/lead-assignment/services/lead-assignment.service';
import { type LeadAssignmentPersonCreatedJobData } from 'src/modules/lead-assignment/types/lead-assignment-job-data.type';

@Processor(MessageQueue.leadAssignmentQueue)
export class LeadAssignmentJob {
  constructor(private readonly leadAssignmentService: LeadAssignmentService) {}

  @Process(LEAD_ASSIGNMENT_PERSON_CREATED_JOB)
  async handlePersonCreated(
    data: LeadAssignmentPersonCreatedJobData,
  ): Promise<void> {
    await this.leadAssignmentService.assignPersonToSetter(
      data.workspaceId,
      data.personId,
    );
  }
}

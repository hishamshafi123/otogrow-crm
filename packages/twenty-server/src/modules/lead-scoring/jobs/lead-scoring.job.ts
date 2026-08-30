import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  LEAD_SCORING_CHANNEL_MESSAGE_JOB,
  LEAD_SCORING_FORM_SUBMISSION_JOB,
  LEAD_SCORING_RECOMPUTE_PERSON_JOB,
  LEAD_SCORING_SEQUENCE_ENROLLMENT_JOB,
} from 'src/modules/lead-scoring/constants/lead-scoring.constant';
import { LeadScoringService } from 'src/modules/lead-scoring/services/lead-scoring.service';
import {
  type LeadScoringChannelMessageJobData,
  type LeadScoringFormSubmissionJobData,
  type LeadScoringRecomputePersonJobData,
  type LeadScoringSequenceEnrollmentJobData,
} from 'src/modules/lead-scoring/types/lead-scoring-job-data.type';

@Processor(MessageQueue.leadScoringQueue)
export class LeadScoringJob {
  constructor(private readonly leadScoringService: LeadScoringService) {}

  @Process(LEAD_SCORING_RECOMPUTE_PERSON_JOB)
  async handleRecomputePerson(
    data: LeadScoringRecomputePersonJobData,
  ): Promise<void> {
    await this.leadScoringService.recomputePerson(
      data.workspaceId,
      data.personId,
    );
  }

  @Process(LEAD_SCORING_FORM_SUBMISSION_JOB)
  async handleFormSubmission(
    data: LeadScoringFormSubmissionJobData,
  ): Promise<void> {
    await this.leadScoringService.handleFormSubmission(
      data.workspaceId,
      data.noteId,
      data.personId,
    );
  }

  @Process(LEAD_SCORING_CHANNEL_MESSAGE_JOB)
  async handleInboundChannelMessage(
    data: LeadScoringChannelMessageJobData,
  ): Promise<void> {
    await this.leadScoringService.handleInboundChannelMessage(
      data.workspaceId,
      data.channelMessageId,
    );
  }

  @Process(LEAD_SCORING_SEQUENCE_ENROLLMENT_JOB)
  async handleSequenceEnrollment(
    data: LeadScoringSequenceEnrollmentJobData,
  ): Promise<void> {
    await this.leadScoringService.handleSequenceEnrollment(
      data.workspaceId,
      data.sequenceEnrollmentId,
      data.trigger,
    );
  }
}

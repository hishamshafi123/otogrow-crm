import { Module } from '@nestjs/common';

import { LeadScoringJob } from 'src/modules/lead-scoring/jobs/lead-scoring.job';
import { LeadScoringChannelMessageListener } from 'src/modules/lead-scoring/listeners/lead-scoring-channel-message.listener';
import { LeadScoringFormSubmissionListener } from 'src/modules/lead-scoring/listeners/lead-scoring-form-submission.listener';
import { LeadScoringPersonListener } from 'src/modules/lead-scoring/listeners/lead-scoring-person.listener';
import { LeadScoringSequenceEnrollmentListener } from 'src/modules/lead-scoring/listeners/lead-scoring-sequence-enrollment.listener';
import { LeadScoringService } from 'src/modules/lead-scoring/services/lead-scoring.service';

@Module({
  providers: [
    LeadScoringService,
    LeadScoringJob,
    LeadScoringPersonListener,
    LeadScoringFormSubmissionListener,
    LeadScoringChannelMessageListener,
    LeadScoringSequenceEnrollmentListener,
  ],
  exports: [LeadScoringService],
})
export class LeadScoringModule {}

import { Module } from '@nestjs/common';

import { SequencesModule } from 'src/modules/sequences/sequences.module';
import { SequenceEnrollWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/sequence/sequence-enroll.workflow-action';
import { SequenceUnenrollWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/sequence/sequence-unenroll.workflow-action';

@Module({
  imports: [SequencesModule],
  providers: [SequenceEnrollWorkflowAction, SequenceUnenrollWorkflowAction],
  exports: [SequenceEnrollWorkflowAction, SequenceUnenrollWorkflowAction],
})
export class SequenceActionModule {}

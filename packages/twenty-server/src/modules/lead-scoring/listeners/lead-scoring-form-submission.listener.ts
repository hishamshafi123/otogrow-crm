import { Injectable } from '@nestjs/common';

import { type ObjectRecordCreateEvent } from 'twenty-shared/database-events';
import { isDefined } from 'twenty-shared/utils';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { LEAD_SCORING_FORM_SUBMISSION_JOB } from 'src/modules/lead-scoring/constants/lead-scoring.constant';
import { type LeadScoringFormSubmissionJobData } from 'src/modules/lead-scoring/types/lead-scoring-job-data.type';
import { type NoteTargetWorkspaceEntity } from 'src/modules/note/standard-objects/note-target.workspace-entity';

// A form submission creates a note titled `Form submission: {form.name}` with
// a noteTarget pointing at the person; the noteTarget event is what carries
// both ids, so form provenance is resolved from the note in the job
@Injectable()
export class LeadScoringFormSubmissionListener {
  constructor(
    @InjectMessageQueue(MessageQueue.leadScoringQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @OnDatabaseBatchEvent('noteTarget', DatabaseEventAction.CREATED)
  async handleCreatedEvent(
    payload: WorkspaceEventBatch<
      ObjectRecordCreateEvent<NoteTargetWorkspaceEntity>
    >,
  ) {
    for (const event of payload.events) {
      const noteId = event.properties.after.noteId;
      const personId = event.properties.after.targetPersonId;

      if (!isDefined(noteId) || !isDefined(personId)) {
        continue;
      }

      await this.messageQueueService.add<LeadScoringFormSubmissionJobData>(
        LEAD_SCORING_FORM_SUBMISSION_JOB,
        { workspaceId: payload.workspaceId, noteId, personId },
      );
    }
  }
}

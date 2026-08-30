import { Injectable } from '@nestjs/common';

import {
  type ObjectRecordCreateEvent,
  type ObjectRecordUpdateEvent,
} from 'twenty-shared/database-events';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { objectRecordChangedProperties } from 'src/engine/core-modules/event-emitter/utils/object-record-changed-properties.util';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { LEAD_SCORING_SEQUENCE_ENROLLMENT_JOB } from 'src/modules/lead-scoring/constants/lead-scoring.constant';
import { type LeadScoringSequenceEnrollmentJobData } from 'src/modules/lead-scoring/types/lead-scoring-job-data.type';
import { type SequenceEnrollmentWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-enrollment.workspace-entity';

@Injectable()
export class LeadScoringSequenceEnrollmentListener {
  constructor(
    @InjectMessageQueue(MessageQueue.leadScoringQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @OnDatabaseBatchEvent('sequenceEnrollment', DatabaseEventAction.CREATED)
  async handleCreatedEvent(
    payload: WorkspaceEventBatch<
      ObjectRecordCreateEvent<SequenceEnrollmentWorkspaceEntity>
    >,
  ) {
    for (const event of payload.events) {
      await this.messageQueueService.add<LeadScoringSequenceEnrollmentJobData>(
        LEAD_SCORING_SEQUENCE_ENROLLMENT_JOB,
        {
          workspaceId: payload.workspaceId,
          sequenceEnrollmentId: event.recordId,
          trigger: 'ENROLLED',
        },
      );
    }
  }

  @OnDatabaseBatchEvent('sequenceEnrollment', DatabaseEventAction.UPDATED)
  async handleUpdatedEvent(
    payload: WorkspaceEventBatch<
      ObjectRecordUpdateEvent<SequenceEnrollmentWorkspaceEntity>
    >,
  ) {
    for (const event of payload.events) {
      const changedProperties = objectRecordChangedProperties(
        event.properties.before,
        event.properties.after,
      );

      if (
        !changedProperties.includes('status') ||
        !['REPLIED', 'COMPLETED'].includes(event.properties.after.status)
      ) {
        continue;
      }

      await this.messageQueueService.add<LeadScoringSequenceEnrollmentJobData>(
        LEAD_SCORING_SEQUENCE_ENROLLMENT_JOB,
        {
          workspaceId: payload.workspaceId,
          sequenceEnrollmentId: event.recordId,
          trigger: 'STATUS_CHANGED',
        },
      );
    }
  }
}

import { Injectable } from '@nestjs/common';

import { type ObjectRecordCreateEvent } from 'twenty-shared/database-events';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { LEAD_ASSIGNMENT_PERSON_CREATED_JOB } from 'src/modules/lead-assignment/constants/lead-assignment.constant';
import { type LeadAssignmentPersonCreatedJobData } from 'src/modules/lead-assignment/types/lead-assignment-job-data.type';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

@Injectable()
export class LeadAssignmentPersonListener {
  constructor(
    @InjectMessageQueue(MessageQueue.leadAssignmentQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @OnDatabaseBatchEvent('person', DatabaseEventAction.CREATED)
  async handleCreatedEvent(
    payload: WorkspaceEventBatch<
      ObjectRecordCreateEvent<PersonWorkspaceEntity>
    >,
  ) {
    for (const event of payload.events) {
      // Only sourced leads enter round-robin assignment; manually created
      // contacts without a leadSource stay untouched
      if (!isNonEmptyString(event.properties.after?.leadSource)) {
        continue;
      }

      if (!isDefined(event.recordId)) {
        continue;
      }

      await this.messageQueueService.add<LeadAssignmentPersonCreatedJobData>(
        LEAD_ASSIGNMENT_PERSON_CREATED_JOB,
        { workspaceId: payload.workspaceId, personId: event.recordId },
      );
    }
  }
}

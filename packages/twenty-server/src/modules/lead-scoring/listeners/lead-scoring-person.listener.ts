import { Injectable } from '@nestjs/common';

import {
  type ObjectRecordCreateEvent,
  type ObjectRecordUpdateEvent,
} from 'twenty-shared/database-events';
import { isDefined } from 'twenty-shared/utils';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import {
  LEAD_SCORING_RECOMPUTE_LOCK_TTL_MS,
  LEAD_SCORING_RECOMPUTE_PERSON_JOB,
} from 'src/modules/lead-scoring/constants/lead-scoring.constant';
import { type LeadScoringRecomputePersonJobData } from 'src/modules/lead-scoring/types/lead-scoring-job-data.type';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

@Injectable()
export class LeadScoringPersonListener {
  constructor(
    @InjectMessageQueue(MessageQueue.leadScoringQueue)
    private readonly messageQueueService: MessageQueueService,
    @InjectCacheStorage(CacheStorageNamespace.ModuleLeadScoring)
    private readonly cacheStorageService: CacheStorageService,
  ) {}

  @OnDatabaseBatchEvent('person', DatabaseEventAction.CREATED)
  async handleCreatedEvent(
    payload: WorkspaceEventBatch<
      ObjectRecordCreateEvent<PersonWorkspaceEntity>
    >,
  ) {
    for (const event of payload.events) {
      await this.enqueueRecompute(payload.workspaceId, event.recordId);
    }
  }

  @OnDatabaseBatchEvent('person', DatabaseEventAction.UPDATED)
  async handleUpdatedEvent(
    payload: WorkspaceEventBatch<
      ObjectRecordUpdateEvent<PersonWorkspaceEntity>
    >,
  ) {
    for (const event of payload.events) {
      // Debounce: a burst of person writes collapses into one recompute per
      // window, including the write-back of leadScore itself
      const lockAcquired = await this.cacheStorageService.acquireLock(
        `lead-scoring:recompute:${payload.workspaceId}:${event.recordId}`,
        LEAD_SCORING_RECOMPUTE_LOCK_TTL_MS,
      );

      if (lockAcquired) {
        await this.enqueueRecompute(payload.workspaceId, event.recordId);
      }
    }
  }

  private async enqueueRecompute(workspaceId: string, personId: string) {
    if (!isDefined(personId)) {
      return;
    }

    await this.messageQueueService.add<LeadScoringRecomputePersonJobData>(
      LEAD_SCORING_RECOMPUTE_PERSON_JOB,
      { workspaceId, personId },
    );
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { InjectObjectMetadataRepository } from 'src/engine/object-metadata-repository/object-metadata-repository.decorator';
import { TimelineActivityRepository } from 'src/modules/timeline/repositories/timeline-activity.repository';
import { TimelineActivityTypeCacheService } from 'src/modules/timeline/services/timeline-activity-type-cache.service';
import { TimelineActivityWorkspaceEntity } from 'src/modules/timeline/standard-objects/timeline-activity.workspace-entity';

@Injectable()
export class CallTimelineService {
  constructor(
    @InjectObjectMetadataRepository(TimelineActivityWorkspaceEntity)
    private readonly timelineActivityRepository: TimelineActivityRepository,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    private readonly timelineActivityTypeCacheService: TimelineActivityTypeCacheService,
  ) {}

  async upsertPersonCallActivity({
    workspaceId,
    personId,
    callId,
  }: {
    workspaceId: string;
    personId: string;
    callId: string;
  }): Promise<void> {
    const callObjectMetadata = await this.objectMetadataRepository.findOne({
      where: { nameSingular: 'call', workspaceId },
    });

    if (!isDefined(callObjectMetadata)) {
      return;
    }

    const resolveTimelineActivityTypeId =
      await this.timelineActivityTypeCacheService.getTimelineActivityTypeResolver(
        workspaceId,
      );

    const timelineActivityTypeId = resolveTimelineActivityTypeId({
      action: 'linked',
      objectUniversalIdentifier: STANDARD_OBJECTS.call.universalIdentifier,
    });

    if (!isDefined(timelineActivityTypeId)) {
      return;
    }

    await this.timelineActivityRepository.upsertTimelineActivities({
      objectSingularName: 'person',
      workspaceId,
      payloads: [
        {
          name: 'call.linked',
          timelineActivityTypeId,
          properties: {},
          recordId: personId,
          linkedObjectMetadataId: callObjectMetadata.id,
          linkedRecordId: callId,
          linkedRecordCachedName: '',
        },
      ],
    });
  }
}

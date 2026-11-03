import { ConflictException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { DeliveryAdvertisingReviewEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-review.entity';
import { type AdvertisingSourceKind } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

export const assertLegacyAdvertisingAssignmentAvailable = async (
  manager: EntityManager,
  workspaceId: string,
  sourceKind: AdvertisingSourceKind,
  sourceId: string,
) => {
  if (
    await manager
      .getRepository(DeliveryAdvertisingReviewEntity)
      .existsBy({ workspaceId, sourceKind, sourceId, state: 'ASSIGNED' })
  )
    throw new ConflictException(
      'This report already uses reviewed recommendation packets. Open Advertising to add explicit follow-up work instead of another generic task.',
    );
};

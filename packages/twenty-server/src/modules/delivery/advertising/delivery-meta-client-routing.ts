import { BadRequestException } from '@nestjs/common';
import { type DeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';

export type MetaClientRouting = {
  engagementId?: string | null;
  projectId: string | null;
  managerId: string | null;
  marketerId: string | null;
};

export const hasPerformanceMarketingService = (services: string[]) =>
  services.some(
    (service) =>
      service.trim().toLowerCase().replace(/[_-]+/g, ' ') ===
      'performance marketing',
  );

export const resolveMetaClientRouting = (
  operations: DeliveryOperations,
  source: MetaClientRouting,
): MetaClientRouting => {
  if (!source.engagementId)
    return {
      engagementId: null,
      projectId: source.projectId,
      managerId: source.managerId,
      marketerId: source.marketerId,
    };
  const engagement = operations.clients?.engagements.find(
    (item) => item.id === source.engagementId,
  );
  if (
    !engagement ||
    !hasPerformanceMarketingService(engagement.services) ||
    !engagement.advertising ||
    engagement.advertising.channel !== 'META' ||
    (source.projectId && source.projectId !== engagement.projectId)
  )
    throw new BadRequestException(
      'Choose a client with the performance marketing service and Meta responsibilities configured in Clients.',
    );
  return {
    engagementId: engagement.id,
    projectId: engagement.projectId,
    managerId: engagement.advertising.managerId,
    marketerId: engagement.advertising.marketerId,
  };
};

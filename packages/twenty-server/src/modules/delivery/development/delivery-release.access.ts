import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type DeliveryReleaseEntity } from './entities/delivery-release.entity';
import { type DeliveryReleaseEventEntity } from './entities/delivery-release-event.entity';
export type ReleaseAccess = Awaited<
  ReturnType<OtogrowAccessService['accessForUser']>
>;

export const managerAccess = (access: ReleaseAccess) =>
  access.capabilities.some((capability) =>
    ['workspace.admin', 'delivery.manage'].includes(capability),
  );

export const editable = (
  release: DeliveryReleaseEntity,
  access: ReleaseAccess,
) =>
  ['DRAFT', 'CHANGES_REQUESTED'].includes(release.status) &&
  (managerAccess(access) ||
    [release.createdBy, release.ownerId].includes(access.memberId));

export const eventReceipt = (event: DeliveryReleaseEventEntity) => ({
  workspaceId: event.workspaceId,
  actorId: event.actorId,
  userWorkspaceId: event.userWorkspaceId,
  requestId: event.requestId,
  inputHash: event.inputHash,
  releaseId: event.releaseId,
  action: event.action,
  note: event.note,
  evidenceUrl: event.evidenceUrl,
  environment: event.environment,
  commitSha: event.commitSha,
  actorName: event.actorName,
  revision: event.revision,
  version: event.version,
  status: event.status,
  createdAt: event.createdAt.toISOString(),
});

import { ForbiddenException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { type DeliveryAgentActor } from 'src/modules/delivery/agents/delivery-agent-access';

export type DeliveryAssistantActor = Awaited<
  ReturnType<DeliveryService['actor']>
>;
export const readDeliveryAgentActor = async (
  manager: EntityManager,
  delivery: DeliveryService,
  workspace: WorkspaceEntity,
  memberId: string,
  userWorkspaceId: string,
): Promise<DeliveryAssistantActor> => {
  const active: { id: string }[] = await manager.query(
    `SELECT m.id FROM ${delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" WHERE m.id=$1 AND m."deletedAt" IS NULL AND u.id=$2 AND u."workspaceId"=$3 AND u."deletedAt" IS NULL`,
    [memberId, userWorkspaceId, workspace.id],
  );
  if (!active.length)
    throw new ForbiddenException('Your workspace access has changed.');
  return delivery.actor(workspace, memberId, userWorkspaceId, manager);
};
export const canAccessDeliveryAgentProject = (
  actor: DeliveryAgentActor,
  memberId: string,
  memberIds: string[],
) => canAccessDeliveryProject(actor.isManager, memberId, memberIds);
export const deliveryAgentProjectScopeSql = (
  managerParameter: string,
  memberParameter: string,
) =>
  `((${managerParameter})::boolean OR project."memberIds" @> (${memberParameter})::jsonb)`;
export const canReadDeliveryAgentRun = (
  actor: DeliveryAgentActor,
  memberId: string,
  initiatorId: string,
) => actor.isManager || memberId === initiatorId;

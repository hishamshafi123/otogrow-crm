import { isDefined } from 'twenty-shared/utils';
import { type DeliveryAgentConfiguration } from 'src/modules/delivery/agents/delivery-agent.types';

export type DeliveryAgentActor = {
  isAdmin: boolean;
  isManager: boolean;
  roleIds: string[];
};

export const canUseDeliveryAgent = (
  configuration: DeliveryAgentConfiguration,
  actor: DeliveryAgentActor,
) => {
  if (isDefined(configuration.roleIds))
    return configuration.roleIds.some((roleId) =>
      actor.roleIds.includes(roleId),
    );
  const level = actor.isAdmin
    ? 'ADMIN'
    : actor.isManager
      ? 'MANAGER'
      : 'MEMBER';
  return configuration.roles.includes(level);
};

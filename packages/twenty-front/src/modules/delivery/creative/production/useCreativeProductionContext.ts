import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { GET_CREATIVE_CONTEXT } from '@/delivery/creative/production/creative-production.graphql';
import { type DeliveryCreativeContextQuery } from '~/generated-metadata/graphql';

export const useCreativeProductionContext = () => {
  const access = useAssistantAccess();
  const query = useQuery<DeliveryCreativeContextQuery>(GET_CREATIVE_CONTEXT, {
    variables: { identity: access.source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: !access.permission.ready,
  });
  const matches = (
    value: Pick<
      DeliveryCreativeContextQuery['deliveryCreativeContext'],
      'workspaceId' | 'memberId' | 'userWorkspaceId' | 'actor'
    >,
  ) =>
    access.permission.matches(value) &&
    value.actor.memberId === value.memberId &&
    value.actor.isManager === access.permission.manager &&
    value.actor.isAdmin === access.administrator &&
    fastDeepEqual(
      [...value.actor.roleIds].sort(),
      [...(access.permission.access?.roleIds ?? [])].sort(),
    ) &&
    fastDeepEqual(
      [...value.actor.capabilities].sort(),
      [...(access.permission.access?.capabilities ?? [])].sort(),
    );
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeContext,
    source: access.source,
    enabled: access.permission.ready,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches,
  });
  return {
    ...access,
    ...reading,
    query,
    matches,
    denied: access.permission.denied || isOtogrowAccessDenied(query.error),
  };
};

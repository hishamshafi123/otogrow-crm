import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { GET_ADVERTISING_CONTEXT } from '@/delivery/advertising/workbench/delivery-advertising.graphql';
import { type DeliveryAdvertisingContextQuery } from '~/generated-metadata/graphql';

export const useAdvertisingContext = (valid: boolean) => {
  const access = useAssistantAccess();
  const query = useQuery<DeliveryAdvertisingContextQuery>(
    GET_ADVERTISING_CONTEXT,
    {
      variables: { identity: access.source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !valid || !access.permission.ready,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingContext,
    source: access.source,
    enabled: valid && access.permission.ready,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
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
      ),
  });
  return {
    ...access,
    ...reading,
    query,
    denied: access.permission.denied || isOtogrowAccessDenied(query.error),
  };
};

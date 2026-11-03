import { useCallback, useLayoutEffect, useRef } from 'react';
import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { GET_INBOX_CONTEXT } from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import { type DeliveryInboxContextQuery } from '~/generated-metadata/graphql';
type InboxIdentity = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  actor: {
    memberId: string;
    isAdmin: boolean;
    isManager: boolean;
    roleIds: string[];
    capabilities: string[];
  };
};
export const useInboxAccess = () => {
  const access = useAssistantAccess();
  const query = useQuery<DeliveryInboxContextQuery>(GET_INBOX_CONTEXT, {
    variables: { identity: access.source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: !access.permission.ready,
  });
  const matches = (value: InboxIdentity) =>
    access.permission.matches(value) &&
    value.actor.memberId === value.memberId &&
    value.actor.isAdmin === access.administrator &&
    value.actor.isManager === access.permission.manager &&
    fastDeepEqual(
      [...value.actor.roleIds].sort(),
      [...(access.permission.access?.roleIds ?? [])].sort(),
    ) &&
    fastDeepEqual(
      [...value.actor.capabilities].sort(),
      [...(access.permission.access?.capabilities ?? [])].sort(),
    );
  const reading = useAssistantRead({
    value: query.data?.deliveryInboxContext,
    source: access.source,
    enabled: access.permission.ready,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches,
  });
  // oxlint-disable-next-line twenty/no-state-useref -- Confirmed thread denial must invalidate pending private responses before disposal.
  const lifetime = useRef({ active: true, epoch: 0 });
  useLayoutEffect(() => {
    const boundary = lifetime.current;
    boundary.active = true;
    boundary.epoch++;
    return () => {
      boundary.active = false;
      boundary.epoch++;
    };
  }, [access.source]);
  const invalidate = useCallback(() => {
    lifetime.current.epoch++;
  }, []);
  const capture = useCallback(() => {
    const epoch = lifetime.current.epoch;
    return () => lifetime.current.active && lifetime.current.epoch === epoch;
  }, []);
  return {
    ...access,
    ...reading,
    query,
    matches,
    invalidate,
    capture,
    denied: access.permission.denied || isOtogrowAccessDenied(query.error),
  };
};

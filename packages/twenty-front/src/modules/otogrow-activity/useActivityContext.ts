import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { GET_ACTIVITY_CONTEXT } from '@/otogrow-activity/activity-reads.graphql';
import { type OtogrowActivityContextQuery } from '~/generated-metadata/graphql';

export type ActivityIdentity = Pick<
  OtogrowActivityContextQuery['otogrowActivityContext'],
  'workspaceId' | 'memberId' | 'userWorkspaceId' | 'actor' | 'scope'
>;
export const useActivityContext = () => {
  const access = useAssistantAccess();
  const query = useQuery<OtogrowActivityContextQuery>(GET_ACTIVITY_CONTEXT, {
    variables: { identity: access.source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !access.permission.ready || !access.administrator,
  });
  const reading = useAssistantRead({
    value: query.data?.otogrowActivityContext,
    source: access.source,
    enabled: access.permission.ready && access.administrator,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      access.permission.matches(value) &&
      value.actor.isAdmin &&
      value.actor.memberId === value.memberId &&
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

export const matchesActivityIdentity = (
  state: ReturnType<typeof useActivityContext>,
  value: ActivityIdentity,
) =>
  state.permission.matches(value) &&
  value.scope === state.data?.scope &&
  fastDeepEqual(value.actor, state.data?.actor);

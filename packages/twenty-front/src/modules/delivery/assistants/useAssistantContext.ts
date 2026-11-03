import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { type DeliveryAssistantContextQuery } from '~/generated-metadata/graphql';
import { GET_ASSISTANT_CONTEXT } from '@/delivery/assistants/delivery-assistants.graphql';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

export const useAssistantContext = (taskId: string | null, valid = true) => {
  const access = useAssistantAccess();
  const source = `${access.source}:${taskId ?? 'library'}`;
  const query = useQuery<DeliveryAssistantContextQuery>(GET_ASSISTANT_CONTEXT, {
    variables: { input: { taskId }, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: !valid || !access.permission.ready,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryAssistantContext,
    source,
    enabled: valid && access.permission.ready,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
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
      ) &&
      (taskId === null
        ? value.selectedTask == null
        : value.selectedTask?.id === taskId),
  });
  const scope = `${access.source}:${JSON.stringify(reading.data ? { projects: reading.data.projects.map(({ id, revision }) => ({ id, revision })), models: reading.data.models.map(({ id }) => id).sort(), task: reading.data.selectedTask ? { id: reading.data.selectedTask.id, revision: reading.data.selectedTask.revision, state: reading.data.selectedTask.state } : null } : null)}`;
  return {
    ...access,
    ...reading,
    query,
    scope,
    canConfigure:
      access.administrator &&
      reading.data?.canConfigure === true &&
      reading.data.actor.isAdmin,
    denied: isOtogrowAccessDenied(query.error),
  };
};

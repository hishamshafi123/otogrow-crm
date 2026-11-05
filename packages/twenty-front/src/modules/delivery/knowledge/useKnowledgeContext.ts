import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { GET_KNOWLEDGE_CONTEXT } from '@/delivery/knowledge/knowledge-read.graphql';
import { type DeliveryKnowledgeContextQuery } from '~/generated-metadata/graphql';

export const useKnowledgeContext = (
  projectId: string | null,
  valid: boolean,
) => {
  const access = useAssistantAccess();
  const source = `${access.source}:${projectId ?? 'projects'}`;
  const query = useQuery<DeliveryKnowledgeContextQuery>(GET_KNOWLEDGE_CONTEXT, {
    variables: { input: { projectId }, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: !valid || !access.permission.ready,
  });
  const matches = (
    value: DeliveryKnowledgeContextQuery['deliveryKnowledgeContext'],
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
    ) &&
    (projectId === null
      ? value.selectedProject === null
      : value.selectedProject?.id === projectId);
  const reading = useAssistantRead({
    value: query.data?.deliveryKnowledgeContext,
    source,
    enabled: valid && access.permission.ready,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches,
  });
  return {
    ...access,
    ...reading,
    query,
    denied: access.permission.denied || isOtogrowAccessDenied(query.error),
    scope: `${source}:${reading.data?.selectedProject?.revision ?? ''}:${reading.data?.selectedProject?.companyId ?? ''}`,
  };
};

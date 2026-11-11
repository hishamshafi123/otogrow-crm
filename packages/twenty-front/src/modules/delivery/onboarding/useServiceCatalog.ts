import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';

type ServiceCatalog = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  services: string[];
};
export const GET_SERVICE_CATALOG = gql`
  query DeliveryClientServiceCatalog {
    deliveryClientServiceCatalog {
      workspaceId
      memberId
      userWorkspaceId
      services
    }
  }
`;
export const ADD_CLIENT_SERVICE = gql`
  mutation AddDeliveryClientService($name: String!) {
    addDeliveryClientService(name: $name) {
      workspaceId
      memberId
      userWorkspaceId
      services
    }
  }
`;
export const useServiceCatalog = () => {
  const permission = useWorkflowAccess();
  const authority = `${permission.scope}:${JSON.stringify(permission.access)}`;
  const query = useQuery<{ deliveryClientServiceCatalog: ServiceCatalog }>(
    GET_SERVICE_CATALOG,
    {
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      variables: { identity: authority },
      skip: !permission.manager,
    },
  );
  const [mutate] = useMutation<{ addDeliveryClientService: ServiceCatalog }>(
    ADD_CLIENT_SERVICE,
  );
  const [saved, setSaved] = useState<{
    authority: string;
    data: ServiceCatalog;
  } | null>(null);
  const begin = useFinanceExportRequestGuard(authority, permission.manager);
  const [deniedAuthority, setDeniedAuthority] = useState<string | null>(null);
  const denied =
    deniedAuthority === authority || isOtogrowAccessDenied(query.error);
  const candidate = query.data?.deliveryClientServiceCatalog;
  const readable =
    !denied && permission.manager && permission.matches(candidate);
  const currentSaved =
    !denied &&
    saved?.authority === authority &&
    permission.manager &&
    permission.matches(saved.data)
      ? saved.data
      : null;
  return {
    services: [
      ...new Set([
        ...(readable ? (candidate?.services ?? []) : []),
        ...(currentSaved?.services ?? []),
      ]),
    ],
    loading: query.loading,
    unavailable:
      Boolean(query.error) ||
      denied ||
      (!query.loading && !readable && !currentSaved),
    canAdd: permission.manager && !denied,
    retry: async () => {
      const current = begin();
      await permission.refetch();
      const refreshed = await query.refetch();
      if (
        current() &&
        permission.matches(refreshed.data?.deliveryClientServiceCatalog)
      )
        setDeniedAuthority(null);
    },
    add: async (name: string) => {
      const current = begin();
      if (!current() || denied) return null;
      let result: ServiceCatalog | undefined;
      try {
        result = (await mutate({ variables: { name } })).data
          ?.addDeliveryClientService;
      } catch (error) {
        if (current() && isOtogrowAccessDenied(error))
          setDeniedAuthority(authority);
        throw error;
      }
      if (!current() || !result || !permission.matches(result)) return null;
      setSaved({ authority, data: result });
      return result.services;
    },
  };
};

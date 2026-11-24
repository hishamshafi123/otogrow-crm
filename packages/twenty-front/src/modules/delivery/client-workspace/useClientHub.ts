import { useCallback, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  GET_CLIENT_HUB,
  UPDATE_CLIENT_ROSTER,
} from '@/delivery/client-workspace/client-hub.graphql';
import {
  type ClientHubSnapshot,
  type ClientRosterUpdateInput,
} from '@/delivery/client-workspace/client-hub.types';

export const useClientHub = (enabled = true) => {
  const permission = useWorkflowAccess();
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const query = useQuery<{ deliveryClientHub: ClientHubSnapshot }>(
    GET_CLIENT_HUB,
    {
      fetchPolicy: 'network-only',
      notifyOnNetworkStatusChange: true,
      skip: !enabled || !permission.manager,
    },
  );

  const [mutateRoster] = useMutation<{
    updateDeliveryClientRoster: {
      workspaceId: string;
      memberId: string;
      userWorkspaceId: string;
      includedIds: string[];
      excludedIds: string[];
      effectiveClientIds: string[];
    };
  }>(UPDATE_CLIENT_ROSTER);

  const candidate = query.data?.deliveryClientHub;
  const data = candidate && permission.matches(candidate) ? candidate : null;

  const updateRoster = useCallback(
    async (input: ClientRosterUpdateInput): Promise<boolean> => {
      if (!permission.manager || updating) return false;
      setUpdating(true);
      setUpdateError(null);
      try {
        const result = await mutateRoster({ variables: { input } });
        const payload = result.data?.updateDeliveryClientRoster;
        if (!payload || !permission.matches(payload)) {
          setUpdateError('Could not verify your updated client roster.');
          return false;
        }
        await query.refetch();
        return true;
      } catch (error) {
        setUpdateError(
          error instanceof Error
            ? error.message
            : 'Unable to update your client list. Please try again.',
        );
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [mutateRoster, permission, query, updating],
  );

  return {
    data,
    loading: query.loading,
    error: query.error,
    updating,
    updateError,
    clearUpdateError: () => setUpdateError(null),
    refetch: query.refetch,
    updateRoster,
  };
};

import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { isValidUuid } from 'twenty-shared/utils';
import {
  type DeliveryAtlasRunsQuery,
  type CancelDeliveryAtlasGenerationMutation,
  type ResumeDeliveryAtlasGenerationMutation,
} from '~/generated-metadata/graphql';
import { type AtlasRun } from '@/delivery/creative/atlas/atlas.types';
import {
  GET_ATLAS_RUNS,
  CANCEL_ATLAS_GENERATION,
  RESUME_ATLAS_GENERATION,
} from '@/delivery/creative/atlas/delivery-atlas.graphql';
import { useAtlasAccess } from '@/delivery/creative/atlas/useAtlasAccess';
import { useAtlasRead } from '@/delivery/creative/atlas/useAtlasRead';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
export const useAtlasRuns = (
  taskId: string,
  beforeId: string | null,
  enabled = true,
) => {
  const { t } = useLingui();
  const access = useAtlasAccess();
  const validCursor = beforeId === null || isValidUuid(beforeId);
  const source = `${access.source}:${taskId}:${beforeId ?? ''}`;
  const query = useQuery<DeliveryAtlasRunsQuery>(GET_ATLAS_RUNS, {
    variables: { input: { taskId, beforeId }, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 10000,
    skip: !enabled || !access.permission.ready || !validCursor,
  });
  const reading = useAtlasRead({
    value: query.data?.deliveryAtlasRuns,
    source,
    enabled: enabled && access.permission.ready && validCursor,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (data) =>
      access.permission.matches(data) && data.taskId === taskId,
  });
  const [cancel] = useMutation<CancelDeliveryAtlasGenerationMutation>(
    CANCEL_ATLAS_GENERATION,
  );
  const [resume] = useMutation<ResumeDeliveryAtlasGenerationMutation>(
    RESUME_ATLAS_GENERATION,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ source, error: '', notice: '' });
  if (message.source !== source) setMessage({ source, error: '', notice: '' });
  useDeliveryDraftStatus({ dirty: false, saving: busy });
  // oxlint-disable-next-line twenty/no-state-useref -- A late job-action response cannot restore a prior identity or page.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [source, access.permission.ready]);
  const action = async (run: AtlasRun, kind: 'cancel' | 'resume') => {
    if (
      busy ||
      !reading.data?.items.some(
        (item) =>
          item.id === run.id &&
          (kind === 'cancel'
            ? item.canCancel
            : item.canResume && item.providerPredictionId != null),
      )
    )
      return false;
    const started = epoch.current;
    setBusy(true);
    setMessage({ source, error: '', notice: '' });
    try {
      const options = { variables: { input: { taskId, runId: run.id } } };
      const result =
        kind === 'cancel'
          ? (await cancel(options)).data?.cancelDeliveryAtlasGeneration
          : (await resume(options)).data?.resumeDeliveryAtlasGeneration;
      if (
        !result ||
        result.workspaceId !== run.workspaceId ||
        result.memberId !== run.memberId ||
        result.userWorkspaceId !== run.userWorkspaceId ||
        result.taskId !== taskId ||
        result.id !== run.id
      )
        throw new Error();
      if (started !== epoch.current) return true;
      setMessage({
        source,
        error: '',
        notice:
          kind === 'cancel'
            ? t`Local publication was cancelled. Atlas may continue processing or charging; review the retained reservation and cost state.`
            : t`A status check was requested for the existing Atlas prediction. No generation submission was repeated.`,
      });
      try {
        await query.refetch();
      } catch {
        if (started === epoch.current)
          setMessage({
            source,
            error: '',
            notice: t`The action was recorded. Refresh saved requests to verify current status.`,
          });
      }
      return true;
    } catch {
      if (started === epoch.current)
        setMessage({
          source,
          error: t`The request action was not confirmed. Refresh this saved job before trying again.`,
          notice: '',
        });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    ...access,
    ...reading,
    query,
    validCursor,
    busy,
    action,
    error: message.source === source ? message.error : '',
    notice: message.source === source ? message.notice : '',
  };
};

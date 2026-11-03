import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import {
  type SaveDeliveryAssistantMutation,
  type PreviewDeliveryAssistantMutation,
  type StartDeliveryAssistantMutation,
  type CancelDeliveryAssistantRunMutation,
  type DecideDeliveryAssistantRunMutation,
  type SaveDeliveryAssistantInput,
  type PreviewDeliveryAssistantInput,
  type StartDeliveryAssistantInput,
  type DecideDeliveryAssistantInput,
} from '~/generated-metadata/graphql';
import {
  SAVE_ASSISTANT,
  PREVIEW_ASSISTANT,
  START_ASSISTANT,
  CANCEL_ASSISTANT_RUN,
  DECIDE_ASSISTANT_RUN,
} from '@/delivery/assistants/delivery-assistants.graphql';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';

type AssistantIdentity = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
};
type AssistantContextState = ReturnType<typeof useAssistantContext>;
export const useAssistantCommands = (
  state: AssistantContextState,
  onChanged: () => Promise<unknown>,
) => {
  const { t } = useLingui();
  const [saveMutation] =
    useMutation<SaveDeliveryAssistantMutation>(SAVE_ASSISTANT);
  const [previewMutation] =
    useMutation<PreviewDeliveryAssistantMutation>(PREVIEW_ASSISTANT);
  const [startMutation] =
    useMutation<StartDeliveryAssistantMutation>(START_ASSISTANT);
  const [cancelMutation] =
    useMutation<CancelDeliveryAssistantRunMutation>(CANCEL_ASSISTANT_RUN);
  const [decideMutation] =
    useMutation<DecideDeliveryAssistantRunMutation>(DECIDE_ASSISTANT_RUN);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({
    source: state.scope,
    error: '',
    notice: '',
  });
  if (message.source !== state.scope)
    setMessage({ source: state.scope, error: '', notice: '' });
  const available = state.permission.ready && state.data !== null;
  // oxlint-disable-next-line twenty/no-state-useref -- Late command receipts cannot publish private results or status into another source or authority scope.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [state.scope, available]);
  const refresh = async () => {
    const results = await Promise.allSettled([
      state.query.client.refetchQueries({
        include: 'active',
        onQueryUpdated: (query) =>
          [
            'DeliveryAssistantContext',
            'DeliveryAssistantCatalog',
            'DeliveryAssistant',
            'DeliveryAssistantConfiguration',
            'DeliveryAssistantRuns',
            'DeliveryAssistantRun',
            'DeliveryAssistantTaskChoices',
          ].includes(query.queryName ?? '')
            ? query.refetch()
            : false,
      }),
      onChanged(),
    ]);
    return results.every((result) => result.status === 'fulfilled');
  };
  const execute = async <TResult extends AssistantIdentity>(
    operation: () => Promise<TResult | null | undefined>,
    matches: (result: TResult) => boolean,
    notice: string,
    changesSource = true,
  ): Promise<TResult | null> => {
    if (!available || busy) return null;
    const started = epoch.current;
    setBusy(true);
    setMessage({ source: state.scope, error: '', notice: '' });
    try {
      const result = await operation();
      if (
        started !== epoch.current ||
        result == null ||
        !state.permission.matches(result) ||
        !matches(result)
      )
        return null;
      if (changesSource) {
        const refreshed = await refresh();
        if (started === epoch.current)
          setMessage({
            source: state.scope,
            error: '',
            notice: refreshed
              ? notice
              : t`The change was recorded. Refresh the current assistant source before another action.`,
          });
      }
      return result;
    } catch {
      if (started === epoch.current)
        setMessage({
          source: state.scope,
          notice: '',
          error: t`The assistant request was not confirmed. Your inputs are kept; check its exact saved source before trying again.`,
        });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    refresh,
    error: message.source === state.scope ? message.error : '',
    notice: message.source === state.scope ? message.notice : '',
    save: (input: SaveDeliveryAssistantInput) =>
      state.canConfigure
        ? execute(
            async () =>
              (await saveMutation({ variables: { input } })).data
                ?.saveDeliveryAssistant,
            (result) =>
              result.saved === (input.createId ?? input.id) &&
              (input.createId != null
                ? result.version === 1
                : result.version > (input.version ?? 0)),
            t`Assistant save confirmed. Review its current saved configuration; existing runs keep their recorded settings.`,
          )
        : Promise.resolve(null),
    preview: (input: PreviewDeliveryAssistantInput) =>
      execute(
        async () =>
          (await previewMutation({ variables: { input } })).data
            ?.previewDeliveryAssistant,
        (result) =>
          result.taskId === input.taskId && result.agentId === input.agentId,
        '',
        false,
      ),
    start: (input: StartDeliveryAssistantInput) =>
      execute(
        async () =>
          (await startMutation({ variables: { input } })).data
            ?.startDeliveryAssistant,
        (result) =>
          result.taskId === input.taskId && result.agentId === input.agentId,
        t`The run request was recorded. Review its current status; this is not delivery approval.`,
      ),
    cancel: (runId: string, taskId: string, agentId: string) =>
      execute(
        async () =>
          (await cancelMutation({ variables: { input: { runId } } })).data
            ?.cancelDeliveryAssistantRun,
        (result) =>
          result.runId === runId &&
          result.taskId === taskId &&
          result.agentId === agentId,
        t`Cancellation was recorded. A running provider request may still incur charges; no refund is implied.`,
      ),
    decide: (
      input: DecideDeliveryAssistantInput,
      taskId: string,
      agentId: string,
    ) =>
      execute(
        async () =>
          (await decideMutation({ variables: { input } })).data
            ?.decideDeliveryAssistantRun,
        (result) =>
          result.runId === input.runId &&
          result.taskId === taskId &&
          result.agentId === agentId,
        t`The human decision was recorded. Final submission and independent delivery approval remain separate.`,
      ),
  };
};

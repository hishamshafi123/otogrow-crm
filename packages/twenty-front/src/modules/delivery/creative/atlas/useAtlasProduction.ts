import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import {
  type DeliveryAtlasProductionQuery,
  type ConfigureDeliveryAtlasProductionAccessMutation,
  type QuoteDeliveryAtlasGenerationMutation,
  type StartDeliveryAtlasGenerationMutation,
  type DeliveryAtlasRunQuery,
  type DeliveryAtlasQuoteInput,
  type DeliveryAtlasStartInput,
  type DeliveryAtlasProductionAccessInput,
} from '~/generated-metadata/graphql';
import {
  GET_ATLAS_PRODUCTION,
  CONFIGURE_ATLAS_PRODUCTION,
  QUOTE_ATLAS_GENERATION,
  START_ATLAS_GENERATION,
  GET_ATLAS_RUN,
} from '@/delivery/creative/atlas/delivery-atlas.graphql';
import {
  type AtlasQuote,
  type AtlasRun,
} from '@/delivery/creative/atlas/atlas.types';
import { useAtlasAccess } from '@/delivery/creative/atlas/useAtlasAccess';
import { useAtlasRead } from '@/delivery/creative/atlas/useAtlasRead';
export const useAtlasProduction = ({
  taskId,
  taskRevision,
  onChanged,
}: {
  taskId: string;
  taskRevision: number;
  onChanged: () => Promise<unknown>;
}) => {
  const { t } = useLingui();
  const access = useAtlasAccess();
  const { permission } = access;
  const source = `${access.source}:${taskId}:${taskRevision}`;
  const query = useQuery<DeliveryAtlasProductionQuery>(GET_ATLAS_PRODUCTION, {
    variables: { input: { taskId }, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !permission.ready,
  });
  const reading = useAtlasRead({
    value: query.data?.deliveryAtlasProduction,
    source,
    enabled: permission.ready,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (data) =>
      permission.matches(data) &&
      data.taskId === taskId &&
      data.taskRevision >= taskRevision,
  });
  const [configure] =
    useMutation<ConfigureDeliveryAtlasProductionAccessMutation>(
      CONFIGURE_ATLAS_PRODUCTION,
    );
  const [quoteMutation] = useMutation<QuoteDeliveryAtlasGenerationMutation>(
    QUOTE_ATLAS_GENERATION,
  );
  const [startMutation] = useMutation<StartDeliveryAtlasGenerationMutation>(
    START_ATLAS_GENERATION,
  );
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState({ source, notice: '', error: '' });
  if (messages.source !== source)
    setMessages({ source, notice: '', error: '' });
  // oxlint-disable-next-line twenty/no-state-useref -- Late request responses cannot publish into a different task or authorization scope.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [source, permission.ready]);
  const refresh = async () => {
    const results = await Promise.allSettled([
      query.refetch(),
      onChanged(),
      query.client.refetchQueries({
        include: 'active',
        onQueryUpdated: (observable) =>
          observable.queryName === 'DeliveryAtlasRuns'
            ? observable.refetch()
            : false,
      }),
    ]);
    return results.every((result) => result.status === 'fulfilled');
  };
  const configureAccess = async (input: DeliveryAtlasProductionAccessInput) => {
    const opened = reading.data;
    if (
      !opened ||
      !access.administrator ||
      !opened.canManageAccess ||
      busy ||
      input.taskId !== taskId ||
      input.taskRevision !== opened.taskRevision
    )
      return false;
    const started = epoch.current;
    setBusy(true);
    setMessages({ source, notice: '', error: '' });
    try {
      const result = (await configure({ variables: { input } })).data
        ?.configureDeliveryAtlasProductionAccess;
      if (
        !result ||
        result.workspaceId !== opened.workspaceId ||
        result.memberId !== opened.memberId ||
        result.userWorkspaceId !== opened.userWorkspaceId ||
        result.taskId !== taskId ||
        result.taskRevision <= input.taskRevision
      )
        throw new Error();
      if (started !== epoch.current) return true;
      const refreshed = await refresh();
      if (started === epoch.current)
        setMessages({
          source,
          notice: refreshed
            ? t`Production media access saved.`
            : t`Production media access saved. Refresh to verify current status.`,
          error: '',
        });
      return true;
    } catch {
      if (started === epoch.current)
        setMessages({
          source,
          notice: '',
          error: t`Production access was not confirmed. Your choices are kept; refresh before trying again.`,
        });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const quote = async (
    input: DeliveryAtlasQuoteInput,
  ): Promise<AtlasQuote | null> => {
    const opened = reading.data;
    if (
      !opened ||
      busy ||
      input.taskId !== taskId ||
      input.taskRevision !== opened.taskRevision
    )
      return null;
    const started = epoch.current;
    setBusy(true);
    setMessages({ source, notice: '', error: '' });
    try {
      const result = (await quoteMutation({ variables: { input } })).data
        ?.quoteDeliveryAtlasGeneration;
      if (started !== epoch.current) return null;
      if (
        !result ||
        !permission.matches(result) ||
        result.taskId !== taskId ||
        result.requestId !== input.requestId ||
        result.profileId !== input.profileId
      )
        throw new Error();
      return result;
    } catch {
      if (started === epoch.current)
        setMessages({
          source,
          notice: '',
          error: t`The price review was not confirmed. Your model and inputs are kept; retry the prepared price review or check current media setup.`,
        });
      return null;
    } finally {
      setBusy(false);
    }
  };
  const start = async (
    input: DeliveryAtlasStartInput,
  ): Promise<AtlasRun | null> => {
    const opened = reading.data;
    if (
      !opened ||
      busy ||
      input.taskId !== taskId ||
      opened.blockedReasons.length > 0
    )
      return null;
    const started = epoch.current;
    setBusy(true);
    setMessages({ source, notice: '', error: '' });
    try {
      const result = (await startMutation({ variables: { input } })).data
        ?.startDeliveryAtlasGeneration;
      if (
        !result ||
        result.workspaceId !== opened.workspaceId ||
        result.memberId !== opened.memberId ||
        result.userWorkspaceId !== opened.userWorkspaceId ||
        result.taskId !== taskId ||
        result.id !== input.runId ||
        result.requestId !== input.requestId
      )
        throw new Error();
      if (started === epoch.current) {
        setMessages({
          source,
          notice: t`The request was recorded. Review its saved run status; output and actual charge may still be pending.`,
          error: '',
        });
        void refresh();
      }
      return result;
    } catch {
      if (started === epoch.current)
        setMessages({
          source,
          notice: '',
          error: t`The start response was not confirmed. Check this saved request before doing anything else; do not prepare a replacement submission blindly.`,
        });
      return null;
    } finally {
      setBusy(false);
    }
  };
  const check = async (
    runId: string,
    requestId: string,
  ): Promise<AtlasRun | null> => {
    if (!permission.ready || busy) return null;
    const started = epoch.current;
    setBusy(true);
    try {
      const result = (
        await query.client.query<DeliveryAtlasRunQuery>({
          query: GET_ATLAS_RUN,
          variables: { input: { taskId, runId }, identity: source },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryAtlasRun;
      if (
        started !== epoch.current ||
        !result ||
        !permission.matches(result) ||
        result.taskId !== taskId ||
        result.id !== runId ||
        result.requestId !== requestId
      )
        return null;
      return result;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  };
  return {
    ...access,
    ...reading,
    query,
    busy,
    refresh,
    configureAccess,
    quote,
    start,
    check,
    notice: messages.source === source ? messages.notice : '',
    error: messages.source === source ? messages.error : '',
  };
};

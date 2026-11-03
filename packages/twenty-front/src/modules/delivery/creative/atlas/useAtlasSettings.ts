import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import {
  type DeliveryAtlasSettingsQuery,
  type SaveDeliveryAtlasSettingsMutation,
  type VerifyDeliveryAtlasConnectionMutation,
  type RemoveDeliveryAtlasConnectionMutation,
  type DeliveryAtlasSettingsInput,
} from '~/generated-metadata/graphql';
import { type AtlasSettings } from '@/delivery/creative/atlas/atlas.types';
import {
  GET_ATLAS_SETTINGS,
  SAVE_ATLAS_SETTINGS,
  VERIFY_ATLAS_CONNECTION,
  REMOVE_ATLAS_CONNECTION,
} from '@/delivery/creative/atlas/delivery-atlas.graphql';
import { useAtlasAccess } from '@/delivery/creative/atlas/useAtlasAccess';
import { useAtlasRead } from '@/delivery/creative/atlas/useAtlasRead';
export const useAtlasSettings = () => {
  const { t } = useLingui();
  const access = useAtlasAccess();
  const { permission, administrator, source } = access;
  const query = useQuery<DeliveryAtlasSettingsQuery>(GET_ATLAS_SETTINGS, {
    variables: { identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !administrator,
  });
  const reading = useAtlasRead({
    value: query.data?.deliveryAtlasSettings,
    source,
    enabled: administrator,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: permission.matches,
  });
  const [saveMutation] =
    useMutation<SaveDeliveryAtlasSettingsMutation>(SAVE_ATLAS_SETTINGS);
  const [verifyMutation] = useMutation<VerifyDeliveryAtlasConnectionMutation>(
    VERIFY_ATLAS_CONNECTION,
  );
  const [removeMutation] = useMutation<RemoveDeliveryAtlasConnectionMutation>(
    REMOVE_ATLAS_CONNECTION,
  );
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState({ source, notice: '', error: '' });
  if (messages.source !== source)
    setMessages({ source, notice: '', error: '' });
  // oxlint-disable-next-line twenty/no-state-useref -- A late settings response cannot publish another identity's private configuration.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [source, administrator]);
  const write = async (
    operation: () => Promise<AtlasSettings | null | undefined>,
    revision: number,
    notice: string,
  ) => {
    const opened = reading.data;
    if (!administrator || !opened || busy || opened.revision !== revision)
      return false;
    const started = epoch.current;
    setBusy(true);
    setMessages({ source, notice: '', error: '' });
    try {
      const result = await operation();
      if (
        !result ||
        result.workspaceId !== opened.workspaceId ||
        result.memberId !== opened.memberId ||
        result.userWorkspaceId !== opened.userWorkspaceId ||
        result.revision < revision
      )
        throw new Error();
      if (started !== epoch.current) return true;
      setMessages({ source, notice, error: '' });
      try {
        await query.refetch();
      } catch {
        if (started === epoch.current)
          setMessages({
            source,
            notice: t`The change was saved. Refresh media settings before relying on current configuration.`,
            error: '',
          });
      }
      return true;
    } catch {
      if (started === epoch.current)
        setMessages({
          source,
          notice: '',
          error: t`The change was not confirmed. Your inputs are kept. Refresh the current configuration before trying again.`,
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
    busy,
    error: messages.source === source ? messages.error : '',
    notice: messages.source === source ? messages.notice : '',
    save: (input: DeliveryAtlasSettingsInput) =>
      write(
        async () =>
          (await saveMutation({ variables: { input } })).data
            ?.saveDeliveryAtlasSettings,
        input.revision,
        t`Media configuration saved. Existing drafts and provider jobs keep their recorded model.`,
      ),
    verify: () =>
      reading.data
        ? write(
            async () =>
              (
                await verifyMutation({
                  variables: { input: { revision: reading.data!.revision } },
                })
              ).data?.verifyDeliveryAtlasConnection,
            reading.data.revision,
            t`Connection check finished. Review the reported status; this was not a generation test.`,
          )
        : Promise.resolve(false),
    remove: () =>
      reading.data
        ? write(
            async () =>
              (
                await removeMutation({
                  variables: { input: { revision: reading.data!.revision } },
                })
              ).data?.removeDeliveryAtlasConnection,
            reading.data.revision,
            t`The saved connection was removed and new Atlas generation is paused. Provider charges may continue for already submitted requests.`,
          )
        : Promise.resolve(false),
  };
};

import { useApolloClient } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useLayoutEffect, useRef, useState } from 'react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  GET_FATHOM_SETTINGS,
  SAVE_FATHOM_SETTINGS,
  FIND_FATHOM_MEETINGS,
  PREVIEW_FATHOM_TRANSCRIPT,
} from '@/delivery/knowledge/fathom/fathom.graphql';
import {
  type FathomContext,
  type FathomImportTarget,
  type FathomPreview,
} from '@/delivery/knowledge/fathom/fathom.types';
import {
  type DeliveryFathomSettingsQuery,
  type SaveDeliveryFathomSettingsMutation,
  type FindDeliveryFathomMeetingsMutation,
  type PreviewDeliveryFathomTranscriptMutation,
  type DeliveryFathomSettingsInput,
  type DeliveryFathomMeetingsInput,
  type DeliveryFathomPreviewInput,
} from '~/generated-metadata/graphql';

export const useFathomImport = ({
  context,
  projectId,
  sourceId,
  sourceIdentity,
  transcript,
  enabled,
  onAuthorityLost,
}: {
  context: FathomContext;
  projectId: string;
  sourceId: string;
  sourceIdentity: string;
  transcript: string;
  enabled: boolean;
  onAuthorityLost: () => void;
}) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const [settings, setSettings] = useState<
    DeliveryFathomSettingsQuery['deliveryFathomSettings'] | null
  >(null);
  const [meetings, setMeetings] = useState<
    FindDeliveryFathomMeetingsMutation['findDeliveryFathomMeetings'] | null
  >(null);
  const [preview, setPreview] = useState<{
    value: FathomPreview;
    target: FathomImportTarget;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(true);
  const [settingsUnknown, setSettingsUnknown] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Provider results must never cross an actor/source lifetime or overlap an explicit request.
  const operation = useRef({ epoch: 0, busy: false });
  const scope = JSON.stringify([context, projectId, sourceId, sourceIdentity]);
  useLayoutEffect(() => {
    const boundary = operation.current;
    boundary.epoch += 1;
    return () => {
      boundary.epoch += 1;
    };
  }, [scope, enabled]);
  const matches = (
    value: FathomContext | Omit<FathomContext, 'projectRevision'>,
  ) =>
    value.workspaceId === context.workspaceId &&
    value.memberId === context.memberId &&
    value.userWorkspaceId === context.userWorkspaceId &&
    fastDeepEqual(value.actor, context.actor) &&
    value.actor.isAdmin;
  const run = async <TResult>(
    request: () => Promise<TResult>,
    apply: (result: TResult) => void,
  ) => {
    if (!enabled || operation.current.busy) return false;
    const epoch = operation.current.epoch;
    operation.current.busy = true;
    setBusy(true);
    setError('');
    try {
      const result = await request();
      if (epoch !== operation.current.epoch) return false;
      apply(result);
      setVerified(true);
      return true;
    } catch (cause) {
      if (epoch !== operation.current.epoch) return false;
      if (isOtogrowAccessDenied(cause)) {
        operation.current.epoch += 1;
        setPreview(null);
        setMeetings(null);
        setSettings(null);
        setVerified(false);
        onAuthorityLost();
      } else {
        setVerified(false);
        setError(
          cause instanceof Error
            ? cause.message
            : t`Fathom could not be checked. Your meeting draft is retained.`,
        );
      }
      return false;
    } finally {
      operation.current.busy = false;
      setBusy(false);
    }
  };
  const refreshSettings = () =>
    run(
      async () =>
        (
          await client.query<DeliveryFathomSettingsQuery>({
            query: GET_FATHOM_SETTINGS,
            fetchPolicy: 'no-cache',
          })
        ).data?.deliveryFathomSettings,
      (value) => {
        if (!value || !matches(value))
          throw new Error(t`The Fathom connection could not be verified.`);
        if (settings !== null && settings.revision !== value.revision) {
          setMeetings(null);
          setPreview(null);
        }
        setSettings(value);
        setSettingsUnknown(false);
      },
    );
  const saveSettings = async (input: DeliveryFathomSettingsInput) => {
    if (!enabled || operation.current.busy || settingsUnknown || !verified)
      return false;
    setSettingsUnknown(true);
    return run(
      async () =>
        (
          await client.mutate<SaveDeliveryFathomSettingsMutation>({
            mutation: SAVE_FATHOM_SETTINGS,
            variables: { input },
            fetchPolicy: 'no-cache',
          })
        ).data?.saveDeliveryFathomSettings,
      (value) => {
        if (!value || !matches(value) || value.revision !== input.revision + 1)
          throw new Error(
            t`The connection save could not be confirmed. Refresh its status before changing it again.`,
          );
        setSettings(value);
        setSettingsUnknown(false);
        setMeetings(null);
        setPreview(null);
      },
    );
  };
  const find = (input: DeliveryFathomMeetingsInput) =>
    run(
      async () =>
        (
          await client.mutate<FindDeliveryFathomMeetingsMutation>({
            mutation: FIND_FATHOM_MEETINGS,
            variables: { input },
            fetchPolicy: 'no-cache',
          })
        ).data?.findDeliveryFathomMeetings,
      (value) => {
        if (
          !value ||
          !matches(value) ||
          value.projectId !== projectId ||
          value.sourceId !== sourceId ||
          value.connectionRevision !== settings?.revision
        )
          throw new Error(
            t`The meeting source changed. Refresh the connection and search again.`,
          );
        setMeetings(value);
        setPreview(null);
      },
    );
  const fetchPreview = (input: DeliveryFathomPreviewInput) => {
    const target = { sourceIdentity, transcript };
    return run(
      async () =>
        (
          await client.mutate<PreviewDeliveryFathomTranscriptMutation>({
            mutation: PREVIEW_FATHOM_TRANSCRIPT,
            variables: { input },
            fetchPolicy: 'no-cache',
          })
        ).data?.previewDeliveryFathomTranscript,
      (value) => {
        if (
          !value ||
          !matches(value) ||
          value.projectId !== projectId ||
          value.sourceId !== sourceId ||
          value.meeting.recordingId !== input.recordingId ||
          value.connectionRevision !== settings?.revision
        )
          throw new Error(
            t`The transcript source changed. Refresh the connection and fetch it again.`,
          );
        setPreview({ value, target });
      },
    );
  };
  return {
    settings,
    meetings,
    preview,
    busy,
    error,
    verified,
    settingsUnknown,
    refreshSettings,
    saveSettings,
    find,
    fetchPreview,
    clearPreview: () => setPreview(null),
  };
};

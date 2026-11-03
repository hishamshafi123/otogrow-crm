import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useVideoQaAccess } from '@/delivery/creative/video-qa/useVideoQaAccess';
import {
  type VideoQaCommand,
  type VideoQaPreview,
  type VideoQaReceipt,
} from '@/delivery/creative/video-qa/video-qa.types';
import {
  GET_VIDEO_QA_PREVIEW,
  GET_VIDEO_QA_RECEIPT,
  START_VIDEO_QA,
  CANCEL_VIDEO_QA,
} from '@/delivery/creative/video-qa/delivery-video-qa.graphql';
import {
  type DeliveryVideoQaPreviewInput,
  type DeliveryVideoQaPreviewQuery,
  type DeliveryVideoQaReceiptQuery,
  type StartDeliveryVideoQaMutation,
  type CancelDeliveryVideoQaMutation,
} from '~/generated-metadata/graphql';
export const videoQaNotFound = (error: unknown) =>
  CombinedGraphQLErrors.is(error) &&
  error.errors.some((item) => item.extensions?.code === 'NOT_FOUND');
export type VideoQaCommandResult =
  | { kind: 'FOUND'; receipt: VideoQaReceipt }
  | { kind: 'UNKNOWN' }
  | { kind: 'REJECTED'; message: string };
export const useVideoQaCommands = ({
  access,
  taskId,
  enabled,
  onDenied,
}: {
  access: ReturnType<typeof useVideoQaAccess>;
  taskId: string;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const client = useApolloClient();
  const [start] = useMutation<StartDeliveryVideoQaMutation>(START_VIDEO_QA);
  const [cancel] = useMutation<CancelDeliveryVideoQaMutation>(CANCEL_VIDEO_QA);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn clicks must not run a second paid command or prepare a competing source.
  const pending = useRef(false);
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${taskId}`,
    enabled,
  );
  const beginCurrent = () => {
    const request = begin(),
      currentSource = access.captureSource();
    return () => request() && currentSource();
  };
  const failure = (caught: unknown, current: () => boolean) => {
    if (!current()) return;
    if (isOtogrowAccessDenied(caught)) onDenied();
    else setError(caught instanceof Error ? caught.message : '');
  };
  const preview = async (
    input: DeliveryVideoQaPreviewInput,
  ): Promise<VideoQaPreview | null> => {
    if (!enabled || pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError('');
    const current = beginCurrent();
    try {
      const value = (
        await client.query<DeliveryVideoQaPreviewQuery>({
          query: GET_VIDEO_QA_PREVIEW,
          variables: { input },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryVideoQaPreview;
      if (
        !current() ||
        !value ||
        !access.matches(value) ||
        value.taskId !== taskId ||
        value.taskRevision !== input.revision ||
        value.asset.id !== input.assetId ||
        value.modelId !== input.modelId ||
        value.manualTranscript !== (input.manualTranscript ?? null) ||
        !fastDeepEqual(
          value.references.map((asset) => asset.id).sort(),
          [...input.referenceAssetIds].sort(),
        )
      )
        return null;
      return value;
    } catch (caught) {
      failure(caught, current);
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const matchesReceipt = (
    receipt: VideoQaReceipt,
    requestId: string,
    action: string,
  ) =>
    access.matches(receipt) &&
    receipt.taskId === taskId &&
    receipt.requestId === requestId &&
    receipt.action === action;
  const execute = async (
    command: VideoQaCommand,
  ): Promise<VideoQaCommandResult> => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    setBusy(true);
    setError('');
    const current = beginCurrent();
    try {
      const value =
        command.kind === 'START'
          ? (await start({ variables: { input: command.input } })).data
              ?.startDeliveryVideoQa
          : (await cancel({ variables: { input: command.input } })).data
              ?.cancelDeliveryVideoQa;
      if (
        !current() ||
        !value ||
        !matchesReceipt(
          value,
          command.input.requestId,
          command.kind === 'START' ? 'STARTED' : 'CANCELLED',
        ) ||
        (command.kind === 'CANCEL' && value.runId !== command.input.runId)
      )
        return { kind: 'UNKNOWN' };
      return { kind: 'FOUND', receipt: value };
    } catch (caught) {
      failure(caught, current);
      if (current() && CombinedGraphQLErrors.is(caught)) {
        const rejected = caught.errors.find((item) =>
          ['BAD_USER_INPUT', 'CONFLICT'].includes(
            String(item.extensions?.code),
          ),
        );
        if (rejected) return { kind: 'REJECTED', message: rejected.message };
      }
      return { kind: 'UNKNOWN' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const check = async (
    requestId: string,
    kind: VideoQaCommand['kind'],
    runId?: string,
  ): Promise<
    | { kind: 'FOUND'; receipt: VideoQaReceipt }
    | { kind: 'NOT_FOUND' | 'UNAVAILABLE' }
  > => {
    if (!enabled || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    setError('');
    const current = beginCurrent();
    try {
      const value = (
        await client.query<DeliveryVideoQaReceiptQuery>({
          query: GET_VIDEO_QA_RECEIPT,
          variables: { input: { taskId, requestId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryVideoQaReceipt;
      return current() &&
        value &&
        matchesReceipt(
          value,
          requestId,
          kind === 'START' ? 'STARTED' : 'CANCELLED',
        ) &&
        (!runId || value.runId === runId)
        ? { kind: 'FOUND', receipt: value }
        : { kind: 'UNAVAILABLE' };
    } catch (caught) {
      failure(caught, current);
      return {
        kind:
          current() && videoQaNotFound(caught) ? 'NOT_FOUND' : 'UNAVAILABLE',
      };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { preview, execute, check, busy, error };
};

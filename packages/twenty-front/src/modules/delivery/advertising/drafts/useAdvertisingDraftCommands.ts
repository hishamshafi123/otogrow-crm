import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isAdvertisingSourceUnavailable } from '@/delivery/advertising/workbench/isAdvertisingSourceUnavailable';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import {
  advertisingDraftGoal,
  sameAdvertisingDraftGoal,
} from '@/delivery/advertising/drafts/advertising-draft-goal';
import {
  type AdvertisingDraftPreview,
  type AdvertisingDraftReceipt,
} from '@/delivery/advertising/drafts/advertising-draft-types';
import {
  GET_ADVERTISING_DRAFT_PREVIEW,
  GET_ADVERTISING_DRAFT_REQUEST,
  START_ADVERTISING_DRAFT,
  CANCEL_ADVERTISING_DRAFT,
} from '@/delivery/advertising/drafts/delivery-advertising-drafts.graphql';
import {
  type DeliveryAdvertisingDraftPreviewInput,
  type DeliveryAdvertisingDraftPreviewQuery,
  type DeliveryAdvertisingDraftRequestQuery,
  type StartDeliveryAdvertisingDraftInput,
  type StartDeliveryAdvertisingDraftMutation,
  type CancelDeliveryAdvertisingDraftInput,
  type CancelDeliveryAdvertisingDraftMutation,
} from '~/generated-metadata/graphql';

export type AdvertisingDraftCommand =
  | { kind: 'STARTED'; input: StartDeliveryAdvertisingDraftInput }
  | { kind: 'CANCELLED'; input: CancelDeliveryAdvertisingDraftInput };
export type AdvertisingDraftCheck =
  | { kind: 'FOUND'; receipt: AdvertisingDraftReceipt }
  | { kind: 'NOT_FOUND' }
  | { kind: 'UNAVAILABLE' };

export const useAdvertisingDraftCommands = ({
  state,
  selection,
  scope,
  enabled,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  scope: string;
  enabled: boolean;
  onAuthorityLost: () => void;
}) => {
  const client = useApolloClient();
  const [start] = useMutation<StartDeliveryAdvertisingDraftMutation>(
    START_ADVERTISING_DRAFT,
  );
  const [cancel] = useMutation<CancelDeliveryAdvertisingDraftMutation>(
    CANCEL_ADVERTISING_DRAFT,
  );
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- A same-event second click must not launch another preview or paid command attempt.
  const pending = useRef(false);
  const startRequest = useFinanceExportRequestGuard(
    `${state.source}:${scope}`,
    enabled,
  );
  const matches = (
    value: Pick<
      DeliveryAdvertisingDraftRequestQuery['deliveryAdvertisingDraftRequest'],
      'workspaceId' | 'memberId' | 'userWorkspaceId' | 'actor'
    >,
  ) =>
    state.permission.matches(value) &&
    fastDeepEqual(value.actor, state.data?.actor);
  const preview = async (
    input: DeliveryAdvertisingDraftPreviewInput,
  ): Promise<AdvertisingDraftPreview | null> => {
    if (!enabled || pending.current) return null;
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const result = (
        await client.query<DeliveryAdvertisingDraftPreviewQuery>({
          query: GET_ADVERTISING_DRAFT_PREVIEW,
          variables: {
            input: {
              ...input,
              goal: advertisingDraftGoal(input.goal),
              instructions: input.instructions.trim(),
            },
          },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryAdvertisingDraftPreview;
      if (
        !current() ||
        !result ||
        !matches(result) ||
        result.agent.id !== input.agentId ||
        result.context.source.kind !== selection.kind ||
        result.context.source.id !== selection.id ||
        result.sourceFingerprint !== input.sourceFingerprint ||
        result.context.source.fingerprint !== input.sourceFingerprint ||
        result.context.instructions !== input.instructions.trim() ||
        result.context.knowledge.fingerprint !== result.knowledgeFingerprint ||
        !sameAdvertisingDraftGoal(result.context.goal, input.goal)
      )
        return null;
      return result;
    } catch (error) {
      if (current() && isAdvertisingSourceUnavailable(error)) onAuthorityLost();
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const execute = async (
    command: AdvertisingDraftCommand,
  ): Promise<AdvertisingDraftReceipt | null> => {
    if (!enabled || pending.current) return null;
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const result =
        command.kind === 'STARTED'
          ? (await start({ variables: { input: command.input } })).data
              ?.startDeliveryAdvertisingDraft
          : (await cancel({ variables: { input: command.input } })).data
              ?.cancelDeliveryAdvertisingDraft;
      if (!current() || !result || !matches(result)) return null;
      const receipt = result.receipt;
      if (
        !receipt ||
        receipt.action !== command.kind ||
        receipt.requestId !== command.input.requestId ||
        receipt.runId !== command.input.id ||
        receipt.actorId !== state.data?.memberId ||
        receipt.userWorkspaceId !== state.data?.userWorkspaceId ||
        (command.kind === 'STARTED' &&
          receipt.bodyFingerprint !== command.input.bodyFingerprint)
      )
        return null;
      if (
        command.kind === 'CANCELLED' &&
        (receipt.revision !== command.input.revision + 1 ||
          receipt.status !== 'CANCELLED')
      )
        return null;
      return receipt;
    } catch (error) {
      if (current() && isAdvertisingSourceUnavailable(error)) onAuthorityLost();
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const check = async (
    requestId: string,
    runId: string,
    action: AdvertisingDraftCommand['kind'],
    bodyFingerprint?: string,
    owned = false,
  ): Promise<AdvertisingDraftCheck> => {
    if (!enabled || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const result = (
        await client.query<DeliveryAdvertisingDraftRequestQuery>({
          query: GET_ADVERTISING_DRAFT_REQUEST,
          variables: { input: { requestId, action } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryAdvertisingDraftRequest;
      if (!current() || !result || !matches(result))
        return { kind: 'UNAVAILABLE' };
      if (result.receipt === null) return { kind: 'NOT_FOUND' };
      const receipt = result.receipt;
      if (
        !receipt ||
        receipt.action !== action ||
        receipt.requestId !== requestId ||
        receipt.runId !== runId ||
        ((owned || bodyFingerprint !== undefined) &&
          (receipt.actorId !== state.data?.memberId ||
            receipt.userWorkspaceId !== state.data?.userWorkspaceId)) ||
        (bodyFingerprint !== undefined &&
          receipt.bodyFingerprint !== bodyFingerprint)
      )
        return { kind: 'UNAVAILABLE' };
      return { kind: 'FOUND', receipt };
    } catch (error) {
      if (current() && isAdvertisingSourceUnavailable(error)) onAuthorityLost();
      return { kind: 'UNAVAILABLE' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { preview, execute, check, busy };
};

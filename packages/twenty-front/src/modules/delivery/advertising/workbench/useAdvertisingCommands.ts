import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isAdvertisingSourceUnavailable } from '@/delivery/advertising/workbench/isAdvertisingSourceUnavailable';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import {
  ASSIGN_ADVERTISING_REVIEW,
  GET_ADVERTISING_RECEIPT,
  OBSERVE_ADVERTISING_ACTION,
  SAVE_ADVERTISING_REVIEW,
} from '@/delivery/advertising/workbench/delivery-advertising.graphql';
import {
  type AssignDeliveryAdvertisingReviewInput,
  type AssignDeliveryAdvertisingReviewMutation,
  type SaveDeliveryAdvertisingReviewInput,
  type SaveDeliveryAdvertisingReviewMutation,
  type ObserveDeliveryAdvertisingActionInput,
  type ObserveDeliveryAdvertisingActionMutation,
  type DeliveryAdvertisingReceiptQuery,
} from '~/generated-metadata/graphql';

export type AdvertisingCommand =
  | { kind: 'review'; input: SaveDeliveryAdvertisingReviewInput }
  | {
      kind: 'assign';
      input: AssignDeliveryAdvertisingReviewInput;
      actionIds: string[];
    }
  | { kind: 'observe'; input: ObserveDeliveryAdvertisingActionInput };
export type AdvertisingReceipt = NonNullable<
  DeliveryAdvertisingReceiptQuery['deliveryAdvertisingReceipt']['receipt']
>;
export type AdvertisingReceiptCheck =
  | { kind: 'FOUND'; receipt: AdvertisingReceipt }
  | { kind: 'NOT_FOUND' }
  | { kind: 'UNAVAILABLE' };
const COMMAND_ACTIONS = {
  review: 'SAVED',
  assign: 'ASSIGNED',
  observe: 'OBSERVED',
} as const;

export const useAdvertisingCommands = ({
  state,
  scope,
  available,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  scope: string;
  available: boolean;
  onAuthorityLost: () => void;
}) => {
  const client = useApolloClient();
  const [save] = useMutation<SaveDeliveryAdvertisingReviewMutation>(
    SAVE_ADVERTISING_REVIEW,
  );
  const [assign] = useMutation<AssignDeliveryAdvertisingReviewMutation>(
    ASSIGN_ADVERTISING_REVIEW,
  );
  const [observe] = useMutation<ObserveDeliveryAdvertisingActionMutation>(
    OBSERVE_ADVERTISING_ACTION,
  );
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Two clicks in the same event turn must not submit independent command attempts.
  const pending = useRef(false);
  const startRequest = useFinanceExportRequestGuard(
    `${state.source}:${scope}`,
    available,
  );
  const matches = (
    value: Pick<
      DeliveryAdvertisingReceiptQuery['deliveryAdvertisingReceipt'],
      'workspaceId' | 'memberId' | 'userWorkspaceId' | 'actor'
    >,
  ) =>
    state.permission.matches(value) &&
    fastDeepEqual(value.actor, state.data?.actor);
  const execute = async (
    command: AdvertisingCommand,
  ): Promise<AdvertisingReceipt | null> => {
    if (!available || pending.current) return null;
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const result =
        command.kind === 'review'
          ? (await save({ variables: { input: command.input } })).data
              ?.saveDeliveryAdvertisingReview
          : command.kind === 'assign'
            ? (await assign({ variables: { input: command.input } })).data
                ?.assignDeliveryAdvertisingReview
            : (await observe({ variables: { input: command.input } })).data
                ?.observeDeliveryAdvertisingAction;
      if (!current() || !result || !matches(result)) return null;
      const receipt = result.receipt;
      const reviewId =
        command.kind === 'observe' ? command.input.reviewId : command.input.id;
      if (
        receipt.requestId !== command.input.requestId ||
        receipt.reviewId !== reviewId ||
        receipt.actorId !== state.data?.memberId ||
        receipt.action !== COMMAND_ACTIONS[command.kind]
      )
        return null;
      if (
        command.kind === 'observe' &&
        receipt.observationId !== command.input.id
      )
        return null;
      if (
        command.kind === 'assign' &&
        (receipt.state !== 'ASSIGNED' ||
          !fastDeepEqual(
            receipt.actionTasks.map(({ actionId }) => actionId).sort(),
            [...command.actionIds].sort(),
          ))
      )
        return null;
      if (command.kind === 'review' && receipt.state !== 'DRAFT') return null;
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
    reviewId: string,
    kind: AdvertisingCommand['kind'],
  ): Promise<AdvertisingReceiptCheck> => {
    if (!available || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const result = (
        await client.query<DeliveryAdvertisingReceiptQuery>({
          query: GET_ADVERTISING_RECEIPT,
          variables: { input: { requestId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryAdvertisingReceipt;
      if (!current() || !result || !matches(result))
        return { kind: 'UNAVAILABLE' };
      if (result.receipt === null) return { kind: 'NOT_FOUND' };
      const receipt = result.receipt;
      if (
        !receipt ||
        receipt.requestId !== requestId ||
        receipt.reviewId !== reviewId ||
        receipt.action !== COMMAND_ACTIONS[kind]
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
  return { execute, check, busy };
};

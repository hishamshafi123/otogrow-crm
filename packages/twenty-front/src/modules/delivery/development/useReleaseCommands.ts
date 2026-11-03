import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useReleaseAccess } from '@/delivery/development/useReleaseAccess';
import {
  type ReleaseCommand,
  type ReleaseReceipt,
} from '@/delivery/development/release.types';
import {
  GET_RELEASE_RECEIPT,
  SAVE_RELEASE,
  DECIDE_RELEASE,
} from '@/delivery/development/delivery-release.graphql';
import {
  type DeliveryReleaseReceiptQuery,
  type SaveDeliveryReleaseMutation,
  type DecideDeliveryReleaseMutation,
} from '~/generated-metadata/graphql';

export const useReleaseCommands = ({
  access,
  scope,
  enabled,
  onDenied,
}: {
  access: ReturnType<typeof useReleaseAccess>;
  scope: string;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const client = useApolloClient();
  const [save] = useMutation<SaveDeliveryReleaseMutation>(SAVE_RELEASE);
  const [decide] = useMutation<DecideDeliveryReleaseMutation>(DECIDE_RELEASE);
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Two same-turn clicks must not dispatch another unresolved command.
  const pending = useRef(false);
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${scope}`,
    enabled,
  );
  const matches = (
    receipt: ReleaseReceipt,
    requestId: string,
    releaseId: string,
    action: string,
  ) =>
    receipt.requestId === requestId &&
    receipt.releaseId === releaseId &&
    receipt.action === action &&
    receipt.workspaceId === access.permission.access?.workspaceId &&
    receipt.actorId === access.permission.access?.memberId &&
    receipt.userWorkspaceId === access.permission.access?.userWorkspaceId &&
    /^[a-f0-9]{64}$/.test(receipt.inputHash) &&
    receipt.revision > 0 &&
    receipt.version > 0;
  const execute = async (
    command: ReleaseCommand,
  ): Promise<
    | { kind: 'FOUND'; receipt: ReleaseReceipt }
    | { kind: 'REJECTED' | 'CONFLICT'; message: string }
    | { kind: 'UNKNOWN' }
  > => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    setBusy(true);
    const current = begin();
    try {
      const result =
        command.kind === 'SAVE'
          ? (await save({ variables: { input: command.input } })).data
              ?.saveDeliveryRelease
          : (await decide({ variables: { input: command.input } })).data
              ?.decideDeliveryRelease;
      const action = command.kind === 'SAVE' ? 'SAVE' : command.input.action;
      if (
        !current() ||
        !result ||
        !matches(result, command.input.requestId, command.input.id, action) ||
        result.inputHash !== command.hash ||
        result.revision !== command.input.revision + 1
      )
        return { kind: 'UNKNOWN' };
      return { kind: 'FOUND', receipt: result };
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) onDenied();
      if (current() && CombinedGraphQLErrors.is(error)) {
        const rejection = error.errors.find((item) =>
          ['BAD_USER_INPUT', 'CONFLICT'].includes(
            String(item.extensions?.code),
          ),
        );
        if (rejection)
          return {
            kind:
              rejection.extensions?.code === 'CONFLICT'
                ? 'CONFLICT'
                : 'REJECTED',
            message: rejection.message,
          };
      }
      return { kind: 'UNKNOWN' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const check = async (
    requestId: string,
    releaseId: string,
    action: string,
    command: ReleaseCommand | null,
  ): Promise<
    | { kind: 'FOUND'; receipt: ReleaseReceipt }
    | { kind: 'NOT_FOUND' | 'UNAVAILABLE' }
  > => {
    if (!enabled || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    const current = begin();
    try {
      const result = (
        await client.query<DeliveryReleaseReceiptQuery>({
          query: GET_RELEASE_RECEIPT,
          variables: { input: { requestId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryReleaseReceipt;
      if (!current() || !result || !access.matches(result))
        return { kind: 'UNAVAILABLE' };
      if (!result.receipt) return { kind: 'NOT_FOUND' };
      if (
        !matches(result.receipt, requestId, releaseId, action) ||
        (command && result.receipt.inputHash !== command.hash)
      )
        return { kind: 'UNAVAILABLE' };
      return { kind: 'FOUND', receipt: result.receipt };
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) onDenied();
      return { kind: 'UNAVAILABLE' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { execute, check, busy };
};

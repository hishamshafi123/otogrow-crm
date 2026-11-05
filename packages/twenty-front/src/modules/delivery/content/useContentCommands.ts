import { useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  type ContentCommand,
  type ContentReceipt,
} from '@/delivery/content/content.types';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import {
  GET_CONTENT_RECEIPT,
  SAVE_CONTENT_ACCOUNT,
  SAVE_CONTENT_PLAN,
  SAVE_CONTENT,
  DECIDE_CONTENT,
} from '@/delivery/content/delivery-content.graphql';
import { type DeliveryContentReceiptQuery } from '~/generated-metadata/graphql';

export const contentAction = (command: ContentCommand) =>
  command.kind === 'ACCOUNT'
    ? 'SAVE_ACCOUNT'
    : command.kind === 'PLAN'
      ? 'SAVE_PLAN'
      : command.kind === 'VARIANT'
        ? 'SAVE'
        : command.input.action;
export const contentTargetKind = (mode: string) =>
  mode.includes('account')
    ? 'ACCOUNT'
    : mode.includes('plan')
      ? 'PLAN'
      : 'VARIANT';

export const useContentCommands = ({
  access,
  scope,
  enabled,
  onDenied,
}: {
  access: ReturnType<typeof useContentAccess>;
  scope: string;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const client = useApolloClient();
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn clicks must not dispatch a second unresolved action.
  const pending = useRef(false);
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${scope}`,
    enabled,
  );
  const matches = (
    receipt: ContentReceipt,
    targetId: string,
    targetKind: string,
    requestId: string,
    action: string,
    hash?: string,
  ) =>
    receipt.workspaceId === access.permission.access?.workspaceId &&
    receipt.actorId === access.permission.access?.memberId &&
    receipt.userWorkspaceId === access.permission.access?.userWorkspaceId &&
    receipt.targetId === targetId &&
    receipt.targetKind === targetKind &&
    receipt.requestId === requestId &&
    receipt.action === action &&
    /^[a-f0-9]{64}$/.test(receipt.inputHash) &&
    (!hash || receipt.inputHash === hash);
  const execute = async (
    command: ContentCommand,
  ): Promise<
    | { kind: 'FOUND'; receipt: ContentReceipt }
    | { kind: 'REJECTED' | 'CONFLICT'; message: string }
    | { kind: 'UNKNOWN' }
  > => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    setBusy(true);
    const current = begin();
    try {
      const result = (
        await client.mutate<{
          saveDeliveryContentAccount?: ContentReceipt;
          saveDeliveryContentPlan?: ContentReceipt;
          saveDeliveryContent?: ContentReceipt;
          decideDeliveryContent?: ContentReceipt;
        }>({
          mutation:
            command.kind === 'ACCOUNT'
              ? SAVE_CONTENT_ACCOUNT
              : command.kind === 'PLAN'
                ? SAVE_CONTENT_PLAN
                : command.kind === 'VARIANT'
                  ? SAVE_CONTENT
                  : DECIDE_CONTENT,
          variables: { input: command.input },
        })
      ).data;
      const receipt =
        command.kind === 'ACCOUNT'
          ? result?.saveDeliveryContentAccount
          : command.kind === 'PLAN'
            ? result?.saveDeliveryContentPlan
            : command.kind === 'VARIANT'
              ? result?.saveDeliveryContent
              : result?.decideDeliveryContent;
      if (
        !current() ||
        !receipt ||
        !matches(
          receipt,
          command.input.id,
          command.kind === 'DECISION' ? 'VARIANT' : command.kind,
          command.input.requestId,
          contentAction(command),
          command.hash,
        ) ||
        receipt.revision !== command.input.revision + 1
      )
        return { kind: 'UNKNOWN' };
      return { kind: 'FOUND', receipt };
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
    targetId: string,
    mode: string,
    command: ContentCommand | null,
  ): Promise<
    | { kind: 'FOUND'; receipt: ContentReceipt }
    | { kind: 'NOT_FOUND' | 'UNAVAILABLE' }
  > => {
    if (!enabled || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    const current = begin();
    try {
      const result = (
        await client.query<DeliveryContentReceiptQuery>({
          query: GET_CONTENT_RECEIPT,
          variables: { input: { requestId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryContentReceipt;
      if (!current() || !result || !access.matches(result))
        return { kind: 'UNAVAILABLE' };
      if (!result.receipt) return { kind: 'NOT_FOUND' };
      const action = mode.includes('account')
        ? 'SAVE_ACCOUNT'
        : mode.includes('plan')
          ? 'SAVE_PLAN'
          : ['variant', 'edit-variant'].includes(mode)
            ? 'SAVE'
            : mode;
      return matches(
        result.receipt,
        targetId,
        contentTargetKind(mode),
        requestId,
        action,
        command?.hash,
      )
        ? { kind: 'FOUND', receipt: result.receipt }
        : { kind: 'UNAVAILABLE' };
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) onDenied();
      return { kind: 'UNAVAILABLE' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, execute, check };
};

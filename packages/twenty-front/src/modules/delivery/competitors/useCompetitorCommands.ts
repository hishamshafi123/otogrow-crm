import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useCompetitorAccess } from '@/delivery/competitors/useCompetitorAccess';
import {
  type CompetitorCommand,
  type CompetitorIdentity,
  type CompetitorReceipt,
} from '@/delivery/competitors/competitor.types';
import {
  GET_COMPETITOR_RECEIPT,
  SAVE_COMPETITOR_SOURCE,
  CHANGE_COMPETITOR_SOURCE,
} from '@/delivery/competitors/delivery-competitors.graphql';

type CompetitorCommandResult =
  | { kind: 'FOUND'; receipt: CompetitorReceipt }
  | { kind: 'REJECTED' | 'CONFLICT'; message: string }
  | { kind: 'UNKNOWN' };
type CompetitorReceiptResult =
  | { kind: 'FOUND'; receipt: CompetitorReceipt }
  | { kind: 'NOT_FOUND' | 'UNAVAILABLE' };
export const useCompetitorCommands = ({
  access,
  scope,
  enabled,
  onDenied,
}: {
  access: ReturnType<typeof useCompetitorAccess>;
  scope: string;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const client = useApolloClient();
  const [save] = useMutation<{
    saveDeliveryCompetitorSource: CompetitorReceipt;
  }>(SAVE_COMPETITOR_SOURCE);
  const [change] = useMutation<{
    changeDeliveryCompetitorSourceState: CompetitorReceipt;
  }>(CHANGE_COMPETITOR_SOURCE);
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn clicks must not dispatch another unresolved command.
  const pending = useRef(false);
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${scope}`,
    enabled,
  );
  const matches = (
    receipt: CompetitorReceipt,
    requestId: string,
    sourceId: string,
    action: string,
  ) =>
    receipt.requestId === requestId &&
    receipt.sourceId === sourceId &&
    receipt.action === action &&
    receipt.workspaceId === access.permission.access?.workspaceId &&
    receipt.actorId === access.permission.access?.memberId &&
    receipt.userWorkspaceId === access.permission.access?.userWorkspaceId &&
    /^[a-f0-9]{64}$/.test(receipt.inputHash) &&
    receipt.revision > 0 &&
    receipt.version > 0;
  const execute = async (
    command: CompetitorCommand,
  ): Promise<CompetitorCommandResult> => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    setBusy(true);
    const current = begin();
    try {
      const receipt =
        command.kind === 'SAVE'
          ? (await save({ variables: { input: command.input } })).data
              ?.saveDeliveryCompetitorSource
          : (await change({ variables: { input: command.input } })).data
              ?.changeDeliveryCompetitorSourceState;
      const action = command.kind === 'SAVE' ? 'SAVE' : command.input.action;
      if (
        !current() ||
        !receipt ||
        !matches(receipt, command.input.requestId, command.input.id, action) ||
        receipt.inputHash !== command.hash ||
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
    sourceId: string,
    projectId: string,
    action: string,
    command: CompetitorCommand | null,
  ): Promise<CompetitorReceiptResult> => {
    if (!enabled || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    const current = begin();
    try {
      const result = (
        await client.query<{
          deliveryCompetitorSourceReceipt: CompetitorIdentity & {
            receipt: CompetitorReceipt | null;
          };
        }>({
          query: GET_COMPETITOR_RECEIPT,
          variables: { input: { requestId, sourceId, projectId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryCompetitorSourceReceipt;
      if (!current() || !result || !access.matches(result))
        return { kind: 'UNAVAILABLE' };
      if (!result.receipt) return { kind: 'NOT_FOUND' };
      if (
        !matches(result.receipt, requestId, sourceId, action) ||
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

import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useSeoAccess } from '@/delivery/seo-results/useSeoAccess';
import {
  type SeoCommand,
  type SeoReceipt,
} from '@/delivery/seo-results/seo-results.types';
import {
  GET_SEO_RECEIPT,
  SAVE_SEO_REPORT,
  DECIDE_SEO_REPORT,
} from '@/delivery/seo-results/delivery-seo-results.graphql';
import {
  type DeliverySeoReceiptQuery,
  type SaveDeliverySeoReportMutation,
  type DecideDeliverySeoReportMutation,
} from '~/generated-metadata/graphql';

export const seoNotFound = (error: unknown) =>
  CombinedGraphQLErrors.is(error) &&
  error.errors.some((item) => item.extensions?.code === 'NOT_FOUND');
export const useSeoCommands = ({
  access,
  scope,
  enabled,
  onDenied,
}: {
  access: ReturnType<typeof useSeoAccess>;
  scope: string;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const client = useApolloClient();
  const [save] = useMutation<SaveDeliverySeoReportMutation>(SAVE_SEO_REPORT);
  const [decide] =
    useMutation<DecideDeliverySeoReportMutation>(DECIDE_SEO_REPORT);
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn clicks must not submit a second command while the first is unresolved.
  const pending = useRef(false);
  const begin = useFinanceExportRequestGuard(
    `${access.source}:${scope}`,
    enabled,
  );
  const matches = (receipt: SeoReceipt, requestId: string, reportId: string) =>
    receipt.requestId === requestId &&
    receipt.reportId === reportId &&
    receipt.workspaceId === access.permission.access?.workspaceId &&
    receipt.actorId === access.permission.access?.memberId &&
    receipt.userWorkspaceId === access.permission.access?.userWorkspaceId;
  const execute = async (
    command: SeoCommand,
  ): Promise<
    | { kind: 'FOUND'; receipt: SeoReceipt }
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
              ?.saveDeliverySeoReport
          : (await decide({ variables: { input: command.input } })).data
              ?.decideDeliverySeoReport;
      if (
        !current() ||
        !result ||
        !matches(result, command.input.requestId, command.input.id) ||
        result.action !==
          (command.kind === 'SAVE' ? 'SAVE' : command.input.action) ||
        result.revision !== command.input.revision + 1
      )
        return { kind: 'UNKNOWN' };
      return { kind: 'FOUND', receipt: result };
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) onDenied();
      if (current() && CombinedGraphQLErrors.is(error)) {
        const rejected = error.errors.find((failure) =>
          ['BAD_USER_INPUT', 'CONFLICT'].includes(
            String(failure.extensions?.code),
          ),
        );
        if (rejected)
          return {
            kind:
              rejected.extensions?.code === 'CONFLICT'
                ? 'CONFLICT'
                : 'REJECTED',
            message: rejected.message,
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
    reportId: string,
  ): Promise<
    | { kind: 'FOUND'; receipt: SeoReceipt }
    | { kind: 'NOT_FOUND' | 'UNAVAILABLE' }
  > => {
    if (!enabled || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    const current = begin();
    try {
      const result = (
        await client.query<DeliverySeoReceiptQuery>({
          query: GET_SEO_RECEIPT,
          variables: { input: { requestId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliverySeoReceipt;
      return current() && result && matches(result, requestId, reportId)
        ? { kind: 'FOUND', receipt: result }
        : { kind: 'UNAVAILABLE' };
    } catch (error) {
      if (!current()) return { kind: 'UNAVAILABLE' };
      if (isOtogrowAccessDenied(error)) onDenied();
      return { kind: seoNotFound(error) ? 'NOT_FOUND' : 'UNAVAILABLE' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { execute, check, busy };
};

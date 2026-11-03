import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  matchesActivityIdentity,
  type useActivityContext,
} from '@/otogrow-activity/useActivityContext';
import {
  GET_ACTIVITY_ANALYSIS_PREVIEW,
  GET_ACTIVITY_ANALYSIS_REQUEST,
  START_ACTIVITY_ANALYSIS,
  CANCEL_ACTIVITY_ANALYSIS,
} from '@/otogrow-activity/analysis/activity-analysis.graphql';
import {
  type ActivityAnalysisCommand,
  type ActivityAnalysisReceipt,
  type ActivityAnalysisPreview,
} from '@/otogrow-activity/analysis/activity-analysis.types';
import {
  type OtogrowActivityAnalysisPreviewInput,
  type OtogrowActivityAnalysisPreviewQuery,
  type OtogrowActivityAnalysisRequestQuery,
  type StartOtogrowActivityAnalysisMutation,
  type CancelOtogrowActivityAnalysisMutation,
} from '~/generated-metadata/graphql';

type ActivityAnalysisCheck =
  | { kind: 'FOUND'; receipt: ActivityAnalysisReceipt }
  | { kind: 'NOT_FOUND' }
  | { kind: 'UNAVAILABLE' };
export const useActivityAnalysisCommands = ({
  state,
  scope,
  enabled,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useActivityContext>;
  scope: string;
  enabled: boolean;
  onAuthorityLost: () => void;
}) => {
  const client = useApolloClient();
  const [start] = useMutation<StartOtogrowActivityAnalysisMutation>(
    START_ACTIVITY_ANALYSIS,
  );
  const [cancel] = useMutation<CancelOtogrowActivityAnalysisMutation>(
    CANCEL_ACTIVITY_ANALYSIS,
  );
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-event clicks must not start separate paid command attempts.
  const pending = useRef(false);
  const startRequest = useFinanceExportRequestGuard(
    `${state.source}:${scope}`,
    enabled,
  );
  const preview = async (
    input: OtogrowActivityAnalysisPreviewInput,
  ): Promise<ActivityAnalysisPreview | null> => {
    if (!enabled || pending.current) return null;
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const value = (
        await client.query<OtogrowActivityAnalysisPreviewQuery>({
          query: GET_ACTIVITY_ANALYSIS_PREVIEW,
          variables: { input },
          fetchPolicy: 'no-cache',
        })
      ).data?.otogrowActivityAnalysisPreview;
      if (
        !current() ||
        !value ||
        !matchesActivityIdentity(state, value) ||
        value.agent.id !== input.agentId ||
        value.context.question !== input.question.trim() ||
        Boolean(value.context.currentWork) !==
          (input.includeCurrentWork === true) ||
        !Object.entries(input.filters).every(
          ([key, expected]) =>
            value.context.filters[key as keyof typeof input.filters] ===
            (expected ?? null),
        )
      )
        return null;
      return value;
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) onAuthorityLost();
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const execute = async (
    command: ActivityAnalysisCommand,
  ): Promise<ActivityAnalysisReceipt | null> => {
    if (!enabled || pending.current) return null;
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const result =
        command.kind === 'STARTED'
          ? (await start({ variables: { input: command.input } })).data
              ?.startOtogrowActivityAnalysis
          : (await cancel({ variables: { input: command.input } })).data
              ?.cancelOtogrowActivityAnalysis;
      if (!current() || !result || !matchesActivityIdentity(state, result))
        return null;
      const receipt = result.receipt;
      if (
        !receipt ||
        receipt.requestId !== command.input.requestId ||
        receipt.runId !== command.input.id ||
        receipt.action !== command.kind ||
        receipt.actorId !== state.data?.memberId ||
        receipt.userWorkspaceId !== state.data?.userWorkspaceId ||
        (command.kind === 'STARTED' &&
          receipt.bodyFingerprint !== command.input.bodyFingerprint) ||
        (command.kind === 'CANCELLED' &&
          (receipt.revision !== command.input.revision + 1 ||
            receipt.status !== 'CANCELLED'))
      )
        return null;
      return receipt;
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) onAuthorityLost();
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const check = async (
    requestId: string,
    runId: string,
    action: ActivityAnalysisCommand['kind'],
    bodyFingerprint?: string,
    owned = false,
  ): Promise<ActivityAnalysisCheck> => {
    if (!enabled || pending.current) return { kind: 'UNAVAILABLE' };
    pending.current = true;
    setBusy(true);
    const current = startRequest();
    try {
      const value = (
        await client.query<OtogrowActivityAnalysisRequestQuery>({
          query: GET_ACTIVITY_ANALYSIS_REQUEST,
          variables: { input: { requestId, action } },
          fetchPolicy: 'no-cache',
        })
      ).data?.otogrowActivityAnalysisRequest;
      if (!current() || !value || !matchesActivityIdentity(state, value))
        return { kind: 'UNAVAILABLE' };
      if (value.receipt === null) return { kind: 'NOT_FOUND' };
      const receipt = value.receipt;
      if (
        !receipt ||
        receipt.requestId !== requestId ||
        receipt.runId !== runId ||
        receipt.action !== action ||
        ((owned || bodyFingerprint !== undefined) &&
          (receipt.actorId !== state.data?.memberId ||
            receipt.userWorkspaceId !== state.data?.userWorkspaceId)) ||
        (bodyFingerprint !== undefined &&
          receipt.bodyFingerprint !== bodyFingerprint)
      )
        return { kind: 'UNAVAILABLE' };
      return { kind: 'FOUND', receipt };
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) onAuthorityLost();
      return { kind: 'UNAVAILABLE' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { preview, execute, check, busy };
};

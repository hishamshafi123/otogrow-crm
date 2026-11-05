import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import {
  type AssignDeliveryReviewMutation,
  type DeliveryReviewAssignmentInput,
  type DeliveryTaskReviewQuery,
} from '~/generated-metadata/graphql';
import {
  GET_TASK_REVIEW,
  ASSIGN_REVIEW,
} from '@/delivery/reviews/delivery-reviews.graphql';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { isDeliveryTaskUnavailable } from '@/delivery/tasks/isDeliveryTaskUnavailable';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
export const useTaskReview = ({
  taskId,
  taskRevision,
  enabled = true,
  onChanged,
  onUnavailable,
}: {
  taskId: string;
  taskRevision: number;
  enabled?: boolean;
  onChanged?: () => Promise<unknown>;
  onUnavailable?: () => void;
}) => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const source = `${permission.scope}:${taskId}`;
  const [boundary, setBoundary] = useState({ source, denied: false });
  const query = useQuery<DeliveryTaskReviewQuery>(GET_TASK_REVIEW, {
    variables: { input: { taskId }, identity: permission.scope, taskRevision },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !enabled || !permission.ready,
  });
  const [ownResult, setOwnResult] = useState<TaskReviewSnapshot | null>(null);
  const knownAccessLoss =
    permission.denied || isDeliveryTaskUnavailable(query.error);
  const unavailable =
    knownAccessLoss || (boundary.source === source && boundary.denied);
  const candidate = query.data?.deliveryTaskReview;
  const current =
    candidate &&
    ownResult &&
    permission.matches(ownResult) &&
    ownResult.taskId === taskId &&
    ownResult.taskRevision === candidate.taskRevision &&
    ownResult.pending?.submissionVersion ===
      candidate.pending?.submissionVersion &&
    (ownResult.assignment?.revision ?? 0) >
      (candidate.assignment?.revision ?? 0)
      ? ownResult
      : candidate;
  const trusted =
    enabled &&
    permission.ready &&
    !unavailable &&
    !query.error &&
    permission.matches(current) &&
    current?.taskId === taskId &&
    current.taskRevision >= taskRevision;
  const currentReviewCapability = hasOtogrowCapability(
    permission.access?.capabilities ?? [],
    'delivery.review',
  );
  const withCurrentAuthority = (snapshot: TaskReviewSnapshot | null) =>
    snapshot
      ? {
          ...snapshot,
          canManageAssignment:
            permission.matches(snapshot) &&
            snapshot.canManageAssignment &&
            permission.manager,
          canReviewSubmission:
            permission.matches(snapshot) &&
            snapshot.canReviewSubmission &&
            currentReviewCapability,
          canApprove:
            permission.matches(snapshot) &&
            snapshot.canApprove &&
            currentReviewCapability,
          pending: snapshot.pending
            ? {
                ...snapshot.pending,
                canReviewSubmission:
                  permission.matches(snapshot) &&
                  snapshot.pending.canReviewSubmission &&
                  currentReviewCapability,
              }
            : null,
        }
      : null;
  const fresh =
    trusted && !query.loading ? withCurrentAuthority(current) : null;
  const [evidence, setEvidence] = useState<{
    source: string;
    snapshot: TaskReviewSnapshot;
  } | null>(null);
  const lastVerified = evidence?.source === source ? evidence.snapshot : null;
  const [retainReading, setRetainReading] = useState(false);
  if (fresh && !fastDeepEqual(fresh, lastVerified))
    setEvidence({ source, snapshot: fresh });
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  if (fresh && !retainReading) setRetainReading(true);
  else if (retainReading && (!trusted || (query.loading && !refreshing)))
    setRetainReading(false);
  const data = withCurrentAuthority(
    fresh ?? (trusted && refreshing && retainReading ? lastVerified : null),
  );
  const available = Boolean(data);
  const [busy, setBusy] = useState(false);
  const messageSnapshot =
    data ?? (lastVerified?.taskId === taskId ? lastVerified : null);
  const messageSource = `${permission.scope}:${taskId}:${messageSnapshot?.pending?.submissionVersion ?? messageSnapshot?.assignment?.submissionVersion ?? ''}`;
  const [messages, setMessages] = useState<{
    source: string;
    error: string;
    notice: string;
  }>({ source: messageSource, error: '', notice: '' });
  if (messages.source !== messageSource)
    setMessages({ source: messageSource, error: '', notice: '' });
  const setError = (text: string) =>
    setMessages((currentMessages) =>
      currentMessages.source === messageSource
        ? { ...currentMessages, error: text }
        : currentMessages,
    );
  const setNotice = (text: string) =>
    setMessages((currentMessages) =>
      currentMessages.source === messageSource
        ? { ...currentMessages, notice: text }
        : currentMessages,
    );
  const error = messages.source === messageSource ? messages.error : '';
  const notice = messages.source === messageSource ? messages.notice : '';
  const [mutate] = useMutation<AssignDeliveryReviewMutation>(ASSIGN_REVIEW);
  // oxlint-disable-next-line twenty/no-state-useref -- A late assignment response cannot restore authority after scope changes.
  const epoch = useRef(0);
  const invalidate = useCallback(() => {
    epoch.current += 1;
    setBoundary((currentBoundary) =>
      currentBoundary.source === source && currentBoundary.denied
        ? currentBoundary
        : { source, denied: true },
    );
    setEvidence(null);
    setOwnResult(null);
    cancelPendingNavigation();
    onUnavailable?.();
  }, [source, cancelPendingNavigation, onUnavailable]);
  useLayoutEffect(() => {
    if (knownAccessLoss) invalidate();
  }, [knownAccessLoss, invalidate]);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [permission.scope, available, permission.manager, taskId, enabled]);
  const refresh = async () => {
    const started = epoch.current;
    try {
      const result = await query.refetch();
      if (
        started !== epoch.current ||
        !permission.matches(result.data?.deliveryTaskReview) ||
        result.data?.deliveryTaskReview.taskId !== taskId ||
        result.data.deliveryTaskReview.taskRevision < taskRevision
      )
        throw new Error();
      setBoundary({ source, denied: false });
      return true;
    } catch (failure) {
      if (started !== epoch.current) return false;
      if (isDeliveryTaskUnavailable(failure)) {
        invalidate();
        return false;
      }
      setError(
        t`Current review access could not refresh. Previous evidence is hidden and your draft is kept.`,
      );
      return false;
    }
  };
  const save = async (input: DeliveryReviewAssignmentInput) => {
    if (!data?.canManageAssignment || !permission.manager || busy) return false;
    const started = epoch.current;
    setBusy(true);
    setError('');
    try {
      const result = (await mutate({ variables: { input } })).data
        ?.assignDeliveryReview;
      if (
        started !== epoch.current ||
        !result ||
        !permission.matches(result.taskReview) ||
        result.taskReview.taskId !== taskId
      )
        return false;
      setOwnResult(result.taskReview);
      setNotice(
        result.replayed
          ? t`The earlier assignment request was processed. Review the current submission owner and history.`
          : t`Submission review assignment saved. The primary delivery manager is unchanged.`,
      );
      void refresh();
      void onChanged?.().catch(() => undefined);
      return true;
    } catch (failure) {
      if (started === epoch.current && isDeliveryTaskUnavailable(failure)) {
        invalidate();
        return false;
      }
      if (started === epoch.current)
        setError(
          failure instanceof Error
            ? failure.message
            : t`The assignment was not confirmed. Your request is kept.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    source,
    data,
    retained: unavailable ? null : withCurrentAuthority(fresh ?? lastVerified),
    unavailable,
    invalidate,
    available,
    refreshing,
    loading: query.loading,
    readError: query.error,
    permission,
    busy,
    error,
    notice,
    refresh,
    save,
  };
};
export type TaskReviewController = ReturnType<typeof useTaskReview>;

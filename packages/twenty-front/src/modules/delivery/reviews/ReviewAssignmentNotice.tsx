import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type SeeDeliveryReviewAssignmentMutation,
  type AcknowledgeDeliveryReviewAssignmentMutation,
} from '~/generated-metadata/graphql';
import {
  SEE_REVIEW_ASSIGNMENT,
  ACKNOWLEDGE_REVIEW_ASSIGNMENT,
} from '@/delivery/reviews/delivery-reviews.graphql';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useVisibleChatMessages } from '@/delivery/chat/useVisibleChatMessages';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
type ReviewAssignmentNoticeProps = {
  snapshot: TaskReviewSnapshot;
  onRefresh: () => Promise<boolean>;
};
export const ReviewAssignmentNotice = ({
  snapshot,
  onRefresh,
}: ReviewAssignmentNoticeProps) => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const container = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recordSeen] = useMutation<SeeDeliveryReviewAssignmentMutation>(
    SEE_REVIEW_ASSIGNMENT,
  );
  const [acknowledge] =
    useMutation<AcknowledgeDeliveryReviewAssignmentMutation>(
      ACKNOWLEDGE_REVIEW_ASSIGNMENT,
    );
  const notice = snapshot.assignmentNotice;
  const pending = snapshot.pending;
  const authorized = Boolean(
    permission.matches(snapshot) &&
    hasOtogrowCapability(
      permission.access?.capabilities ?? [],
      'delivery.review',
    ) &&
    notice &&
    pending &&
    snapshot.state === 'IN_REVIEW' &&
    notice.submissionVersion === pending.submissionVersion &&
    pending.assignmentRevision === (snapshot.assignment?.revision ?? 0) &&
    pending.effectiveReviewerId === snapshot.memberId &&
    notice.recipientId === snapshot.memberId &&
    pending.canReviewSubmission &&
    snapshot.canReviewSubmission,
  );
  const sourceKey = `${permission.scope}:${snapshot.taskId}:${snapshot.taskRevision}:${pending?.submissionVersion}:${pending?.assignmentRevision}:${notice?.id}`;
  // oxlint-disable-next-line twenty/no-state-useref -- Late receipts cannot publish after an assignment or access changes.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [sourceKey, authorized]);
  const markSeen = useCallback(async () => {
    if (!authorized || !notice || !pending?.submissionVersion) return false;
    const started = epoch.current;
    try {
      const result = (
        await recordSeen({
          variables: {
            input: {
              taskId: snapshot.taskId,
              taskRevision: snapshot.taskRevision,
              submissionVersion: pending.submissionVersion,
              assignmentRevision: pending.assignmentRevision,
              noticeId: notice.id,
            },
          },
        })
      ).data?.seeDeliveryReviewAssignment;
      if (
        started !== epoch.current ||
        !permission.matches(result) ||
        result?.taskId !== snapshot.taskId ||
        result.taskRevision !== snapshot.taskRevision ||
        result.pending?.submissionVersion !== pending.submissionVersion ||
        result.pending.assignmentRevision !== pending.assignmentRevision ||
        result.pending.effectiveReviewerId !== snapshot.memberId ||
        !result.canReviewSubmission ||
        result.assignmentNotice?.id !== notice.id ||
        !result.assignmentNotice.seenAt
      )
        return false;
      setSeen(true);
      setError('');
      void onRefresh();
      return true;
    } catch {
      if (started === epoch.current)
        setError(
          t`Your read receipt was not confirmed. You can retry or acknowledge this assignment.`,
        );
      return false;
    }
  }, [
    authorized,
    notice,
    pending,
    snapshot.taskId,
    snapshot.taskRevision,
    snapshot.memberId,
    permission,
    recordSeen,
    onRefresh,
    t,
  ]);
  const unread =
    authorized &&
    !seen &&
    !acknowledged &&
    !notice?.seenAt &&
    !notice?.acknowledgedAt;
  useVisibleChatMessages(container, sourceKey, unread && !error, markSeen);
  if (!authorized || !notice) return null;
  return (
    <div ref={container}>
      <section
        aria-label={t`Your assigned submission review`}
        data-unread-message={notice.id}
      >
        <strong>
          <Trans>You are assigned to review this submission.</Trans>
        </strong>
        <p>
          <Trans>
            Review the exact work below, then approve or request changes.
            Production and client-delivery ownership stay separate.
          </Trans>
        </p>
        <p role="status">
          {acknowledged || notice.acknowledgedAt
            ? t`Assignment acknowledged`
            : seen || notice.seenAt
              ? t`Assignment seen`
              : t`Unread review assignment`}
        </p>
        {error && <p role="alert">{error}</p>}
        {unread && error && (
          <StyledDeliveryButton disabled={busy} onClick={() => void markSeen()}>
            <Trans>Retry assignment read receipt</Trans>
          </StyledDeliveryButton>
        )}
        {!acknowledged && !notice.acknowledgedAt && (
          <StyledDeliveryButton
            disabled={busy}
            onClick={async () => {
              if (!authorized || busy || !pending?.submissionVersion) return;
              const started = epoch.current;
              setBusy(true);
              setError('');
              try {
                const result = (
                  await acknowledge({
                    variables: {
                      input: {
                        taskId: snapshot.taskId,
                        taskRevision: snapshot.taskRevision,
                        submissionVersion: pending.submissionVersion,
                        assignmentRevision: pending.assignmentRevision,
                        noticeId: notice.id,
                      },
                    },
                  })
                ).data?.acknowledgeDeliveryReviewAssignment;
                if (started !== epoch.current) return;
                if (
                  !result ||
                  !permission.matches(result) ||
                  result.taskId !== snapshot.taskId ||
                  result.taskRevision !== snapshot.taskRevision ||
                  result.submissionVersion !== pending.submissionVersion ||
                  result.assignmentRevision !== pending.assignmentRevision ||
                  result.noticeId !== notice.id ||
                  !Number.isFinite(Date.parse(result.acknowledgedAt))
                )
                  throw new Error();
                setAcknowledged(true);
                void onRefresh();
              } catch {
                if (started === epoch.current)
                  setError(
                    t`Acknowledgement was not confirmed. Your review work is unchanged; try again.`,
                  );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trans>Acknowledge review assignment</Trans>
          </StyledDeliveryButton>
        )}
      </section>
    </div>
  );
};

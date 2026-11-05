import { useLayoutEffect, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type TaskReviewController } from '@/delivery/reviews/useTaskReview';
import { ReviewAssignmentForm } from '@/delivery/reviews/ReviewAssignmentForm';
import { ReviewAssignmentHistory } from '@/delivery/reviews/ReviewAssignmentHistory';
import { ReviewAssignmentNotice } from '@/delivery/reviews/ReviewAssignmentNotice';
import { useReviewLabels } from '@/delivery/reviews/useReviewLabels';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { StyledAssignmentBoundary } from '@/delivery/reviews/reviewStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
type DeliveryTaskReviewProps = {
  controller: TaskReviewController;
  submissionVersion?: number;
};
export const DeliveryTaskReview = ({
  controller,
  submissionVersion,
}: DeliveryTaskReviewProps) => (
  <TaskReviewWorkspace
    key={controller.source}
    controller={controller}
    submissionVersion={submissionVersion}
  />
);
type TaskReviewWorkspaceProps = DeliveryTaskReviewProps;
const TaskReviewWorkspace = ({
  controller,
  submissionVersion,
}: TaskReviewWorkspaceProps) => {
  const { t } = useLingui();
  const labels = useReviewLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);
  const { data, retained } = controller;
  // oxlint-disable-next-line twenty/no-state-useref -- Recover only focus lost when private review controls leave the document.
  const focusState = useRef({ visible: false, pending: false });
  // oxlint-disable-next-line twenty/no-state-useref -- The recovery control survives removal of the private assignment form.
  const recoveryButton = useRef<HTMLButtonElement | null>(null);
  const visible = Boolean(data);
  useLayoutEffect(() => {
    if (controller.unavailable) setEditing(false);
    if (visible) focusState.current.pending = false;
    else if (focusState.current.visible) focusState.current.pending = true;
    focusState.current.visible = visible;
    if (!focusState.current.pending || controller.loading) return;
    focusState.current.pending = false;
    if (
      document.activeElement === document.body ||
      document.activeElement === document.documentElement
    )
      recoveryButton.current?.focus();
  }, [visible, controller.loading, controller.unavailable]);
  return (
    <StyledDeliveryCard aria-label={t`Submission review responsibility`}>
      <StyledDeliveryStack>
        {controller.error && <p role="alert">{controller.error}</p>}
        {controller.notice && <p role="status">{controller.notice}</p>}
        {!data && (
          <p role={controller.readError ? 'alert' : 'status'}>
            {controller.unavailable ? (
              <Trans>
                Submission review access is unavailable. Private preparation was
                cleared. Check access before reopening saved work.
              </Trans>
            ) : (
              <Trans>
                Current submission reviewer access could not be verified. Saved
                evidence is hidden; your draft is kept.
              </Trans>
            )}{' '}
            <StyledDeliveryButton
              ref={recoveryButton}
              disabled={controller.loading}
              onClick={() =>
                void (controller.permission.ready
                  ? controller.refresh()
                  : controller.permission.refetch().catch(() => undefined))
              }
            >
              <Trans>Retry submission review access</Trans>
            </StyledDeliveryButton>
          </p>
        )}
        {data && (
          <>
            {data.assignmentNotice &&
              submissionVersion === data.pending?.submissionVersion && (
                <ReviewAssignmentNotice
                  key={`${controller.permission.scope}:${data.taskId}:${data.pending?.submissionVersion}:${data.pending?.assignmentRevision}:${data.assignmentNotice.id}`}
                  snapshot={data}
                  onRefresh={controller.refresh}
                  onUnavailable={controller.invalidate}
                />
              )}
            {data.pending ? (
              <>
                <h3>{t`Submission ${data.pending.submissionVersion ?? '—'} review owner`}</h3>
                <p>
                  <strong>{data.pending.effectiveReviewerName}</strong> ·{' '}
                  {labels.mode(data.pending.assignmentMode)} ·{' '}
                  {labels.reviewer(data.pending.reviewerState)}
                </p>
                <small>{t`Primary manager for client delivery: ${data.pending.primaryReviewerName}`}</small>
                <p>{labels.age(data.pending)}</p>
                {data.pending.warnings.map((warning) => (
                  <p role="status" key={warning}>
                    {labels.warning(warning)}
                  </p>
                ))}
                {data.pending.assignmentMode === 'BACKUP' &&
                  data.pending.reviewerState !== 'ACTIVE' && (
                    <p role="status">
                      <Trans>
                        This explicit backup is unavailable. A manager must
                        change the assignment; review does not silently return
                        to the primary manager.
                      </Trans>
                    </p>
                  )}
              </>
            ) : (
              <p>
                <Trans>No current submission is awaiting review.</Trans>
              </p>
            )}
            {data.canManageAssignment && data.pending && (
              <StyledDeliveryButton
                disabled={controller.busy}
                onClick={() =>
                  requestAction(() => {
                    setEditing(true);
                    setVersion((current) => current + 1);
                  })
                }
              >
                <Trans>Choose or change submission reviewer</Trans>
              </StyledDeliveryButton>
            )}
          </>
        )}
        {editing && retained && (
          <StyledAssignmentBoundary
            hidden={!data}
            disabled={!data || controller.busy}
          >
            <ReviewAssignmentForm
              key={version}
              snapshot={retained}
              readOnly={!data?.canManageAssignment || controller.busy}
              onSave={async (input) => {
                const saved = await controller.save(input);
                if (saved) setEditing(false);
                return saved;
              }}
              onCancel={() => requestAction(() => setEditing(false))}
              onReload={() =>
                requestAction(() => {
                  setEditing(false);
                  void controller.refresh();
                })
              }
            />
          </StyledAssignmentBoundary>
        )}
        {data && submissionVersion != null && (
          <ReviewAssignmentHistory
            key={`${data.taskId}:${submissionVersion}:${data.assignment?.revision ?? 0}`}
            taskId={data.taskId}
            submissionVersion={submissionVersion}
            enabled
            onUnavailable={controller.invalidate}
          />
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};

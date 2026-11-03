import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type TaskReviewController } from '@/delivery/reviews/useTaskReview';
import {
  parseReviewBatch,
  reviewItemDestination,
  reviewQueueDestination,
  reviewBatchValue,
} from '@/delivery/reviews/review-navigation';
import { StyledDeliveryCard } from '@/delivery/deliveryStyles';
type ReviewBatchProgressProps = {
  controller: TaskReviewController;
  taskId: string;
  latestSubmissionVersion?: number;
};
export const ReviewBatchProgress = ({
  controller,
  taskId,
  latestSubmissionVersion,
}: ReviewBatchProgressProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const batch = parseReviewBatch(params);
  if (!params.has('reviewBatch')) return null;
  const rawIndex = params.get('reviewBatchIndex') ?? '0';
  const index = /^\d+$/.test(rawIndex) ? Number(rawIndex) : -1;
  const item = batch?.[index];
  const data = controller.data;
  const exact =
    item?.taskId === taskId &&
    params.get('creativeSubmission') === String(item?.submissionVersion);
  const pending =
    data?.state === 'IN_REVIEW' &&
    data.pending?.submissionVersion === item?.submissionVersion;
  const changed = Boolean(
    data &&
    latestSubmissionVersion != null &&
    latestSubmissionVersion !== item?.submissionVersion,
  );
  const next = batch?.[index + 1];
  return (
    <StyledDeliveryCard aria-label={t`Selected review progress`}>
      {!batch || !item ? (
        <p role="alert">
          <Trans>
            The selected review sequence is invalid. Return to the queue and
            choose exact submissions again.
          </Trans>
        </p>
      ) : (
        <>
          <strong>{t`Selected review ${index + 1} of ${batch.length}`}</strong>
          <p>
            <Trans>
              Each submission needs its own evidence, required checks and
              explicit decision. New queue items are not added to this
              selection.
            </Trans>
          </p>
          {!exact ? (
            <Link
              to={reviewItemDestination(params, item, {
                reviewBatch: reviewBatchValue(batch),
                reviewBatchIndex: index,
              })}
            >
              <Trans>Resume this selected submission</Trans>
            </Link>
          ) : !data ? (
            <p role="status">
              <Trans>
                Verify the current item before continuing. A failed save or
                unavailable source is not a completed review.
              </Trans>
            </p>
          ) : pending ? (
            <p role="status">
              <Trans>
                This exact submission still needs an individual review decision.
              </Trans>
            </p>
          ) : data.state === 'IN_REVIEW' && !changed ? (
            <p role="status">
              <Trans>
                The current submission identity could not be established.
                Refresh the source before continuing.
              </Trans>
            </p>
          ) : (
            <>
              <p>
                {changed
                  ? t`This selected submission changed. No decision on the newer version is implied.`
                  : t`This selected submission no longer awaits a review decision. Its recorded result remains in task history.`}
              </p>
              {next ? (
                <Link
                  to={reviewItemDestination(params, next, {
                    reviewBatch: reviewBatchValue(batch),
                    reviewBatchIndex: index + 1,
                  })}
                >
                  {changed
                    ? t`Continue without deciding the changed item`
                    : t`Next selected review`}
                </Link>
              ) : (
                <p>
                  <Trans>
                    This is the last selected item. Return to the queue to
                    choose any new work.
                  </Trans>
                </p>
              )}
            </>
          )}
        </>
      )}
      <Link
        to={reviewQueueDestination(params, {
          reviewBatch: null,
          reviewBatchIndex: null,
        })}
      >
        <Trans>Leave selected review sequence</Trans>
      </Link>
    </StyledDeliveryCard>
  );
};

import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryReviewAssignmentHistoryQuery } from '~/generated-metadata/graphql';
import { GET_REVIEW_ASSIGNMENT_HISTORY } from '@/delivery/reviews/delivery-reviews.graphql';
import { reviewQueueDestination } from '@/delivery/reviews/review-navigation';
import { useReviewLabels } from '@/delivery/reviews/useReviewLabels';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';
import { StyledReviewQueueItem } from '@/delivery/reviews/reviewStyles';
type ReviewAssignmentHistoryProps = {
  taskId: string;
  submissionVersion: number;
  enabled: boolean;
};
export const ReviewAssignmentHistory = ({
  taskId,
  submissionVersion,
  enabled,
}: ReviewAssignmentHistoryProps) => {
  const { t } = useLingui();
  const labels = useReviewLabels();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const beforeId = params.get('reviewAssignmentBefore');
  const valid = !beforeId || isValidUuid(beforeId);
  const query = useQuery<DeliveryReviewAssignmentHistoryQuery>(
    GET_REVIEW_ASSIGNMENT_HISTORY,
    {
      variables: {
        input: { taskId, submissionVersion, beforeId },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      skip: !enabled || !permission.ready || !valid,
    },
  );
  const candidate = query.data?.deliveryReviewAssignmentHistory;
  const data =
    enabled &&
    valid &&
    !query.loading &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.taskId === taskId &&
    candidate.submissionVersion === submissionVersion
      ? candidate
      : null;
  return (
    <details>
      <summary>
        <Trans>Submission reviewer history</Trans> ·{' '}
        {t`Submission ${submissionVersion}`}
      </summary>
      {(!valid || query.error) && (
        <p role="alert">
          <Trans>
            Reviewer history could not be verified. Retry or return to the
            latest events.
          </Trans>
        </p>
      )}
      {!data && valid && !query.error && (
        <p role="status">
          <Trans>Checking reviewer history…</Trans>
        </p>
      )}
      <StyledDeliveryButton
        disabled={!enabled || query.loading || !valid}
        onClick={() => void query.refetch().catch(() => undefined)}
      >
        <Trans>Retry reviewer history</Trans>
      </StyledDeliveryButton>
      {beforeId && (
        <Link
          to={reviewQueueDestination(params, { reviewAssignmentBefore: null })}
        >
          <Trans>Latest reviewer events</Trans>
        </Link>
      )}
      {data && (
        <>
          {!data.events.length && (
            <p>
              <Trans>
                No reviewer change has been recorded for this submission.
                Earlier decisions and source ownership remain unchanged.
              </Trans>
            </p>
          )}
          {data.events.map((event) => (
            <StyledReviewQueueItem key={event.id}>
              <strong>
                {labels.mode(event.mode)} ·{' '}
                {event.mode === 'PRIMARY'
                  ? event.primaryReviewerName
                  : (event.reviewerName ?? t`Recorded reviewer unavailable`)}
              </strong>
              <p>
                <Trans>Previously</Trans>: {labels.mode(event.previousMode)} ·{' '}
                {event.previousReviewerName ?? t`Recorded reviewer unavailable`}
              </p>
              <p>{event.reason}</p>
              <small>
                {event.actorName} ·{' '}
                {new Date(event.createdAt).toLocaleString(undefined, {
                  timeZone: 'UTC',
                })}{' '}
                UTC · {t`Version ${event.revision}`}
              </small>
            </StyledReviewQueueItem>
          ))}
          {data.nextBeforeId && (
            <Link
              to={reviewQueueDestination(params, {
                reviewAssignmentBefore: data.nextBeforeId,
              })}
            >
              <Trans>Older reviewer events</Trans>
            </Link>
          )}
        </>
      )}
    </details>
  );
};

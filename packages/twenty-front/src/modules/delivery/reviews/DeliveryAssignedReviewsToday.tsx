import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryReviewQueueQuery } from '~/generated-metadata/graphql';
import { GET_REVIEW_QUEUE } from '@/delivery/reviews/delivery-reviews.graphql';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { reviewQueueDestination } from '@/delivery/reviews/review-navigation';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryAssignedReviewsToday = () => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const authorized =
    permission.ready &&
    hasOtogrowCapability(
      permission.access?.capabilities ?? [],
      'delivery.review',
    );
  const query = useQuery<DeliveryReviewQueueQuery>(GET_REVIEW_QUEUE, {
    variables: { input: { mine: true, limit: 1 }, identity: permission.scope },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !authorized,
  });
  const candidate = query.data?.deliveryReviewQueue;
  const data =
    authorized &&
    !query.loading &&
    !query.error &&
    permission.matches(candidate) &&
    candidate?.canReviewAssigned
      ? candidate
      : null;
  if (!authorized) return null;
  return (
    <StyledDeliveryCard aria-label={t`Reviews assigned to you`}>
      <StyledDeliveryStack>
        <small>
          <Trans>Reviews assigned to you</Trans>
        </small>
        {data ? (
          <>
            <h1>{data.totalCount}</h1>
            <Link
              to={reviewQueueDestination(params, {
                ...deliveryTaskSelection(null),
                view: 'reviews',
                reviewsMine: '1',
                reviewProject: null,
                reviewReviewer: null,
                reviewsAfter: null,
                reviewsSelected: null,
                reviewBatch: null,
                reviewBatchIndex: null,
              })}
            >
              <Trans>Open your assigned reviews</Trans>
            </Link>
            <small>
              <Trans>
                Submission review responsibility; separate from your production
                assignments.
              </Trans>
            </small>
          </>
        ) : (
          <>
            <p role={query.error ? 'alert' : 'status'}>
              <Trans>Your assigned review count could not be verified.</Trans>
            </p>
            <StyledDeliveryButton
              disabled={query.loading}
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Refresh assigned reviews</Trans>
            </StyledDeliveryButton>
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};

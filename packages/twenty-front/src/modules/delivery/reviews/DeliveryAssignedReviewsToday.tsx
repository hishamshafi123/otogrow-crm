import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useId } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type DeliveryReviewQueueQuery } from '~/generated-metadata/graphql';
import { GET_REVIEW_QUEUE } from '@/delivery/reviews/delivery-reviews.graphql';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { reviewQueueDestination } from '@/delivery/reviews/review-navigation';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

const StyledAssignedReview = styled.section`
  border-left: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-left: 24px;

  a {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    min-height: 44px;
    font-size: 13px;
    text-underline-offset: 3px;
  }

  strong {
    font-size: 24px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  p {
    font-size: 13px;
  }

  details[open] > summary {
    margin-bottom: 8px;
  }

  summary {
    line-height: 19.5px;
    min-height: 19.5px;
  }

  @media (max-width: 700px) {
    border-left: 0;
    border-top: 1px solid ${themeCssVariables.border.color.light};
    grid-column: 1 / -1;
    padding-left: 0;
    padding-top: 12px;

    strong {
      font-size: 18px;
    }
  }

  [data-empty='true'] > & {
    border-left: 0;
    border-top: 0;
    padding-left: 0;
    padding-top: 0;

    strong {
      font-size: 18px;
    }
  }
`;

export const DeliveryAssignedReviewsToday = () => {
  const { t } = useLingui();
  const countId = useId();
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
    <StyledAssignedReview aria-label={t`Reviews assigned to you`}>
      {data ? (
        <>
          <Link
            aria-label={t`Reviews assigned to you`}
            aria-describedby={countId}
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
            <span>
              <Trans>Reviews assigned to you</Trans>
            </span>
            <strong id={countId}>{data.totalCount}</strong>
          </Link>
          <details>
            <summary>
              <Trans>About review assignments</Trans>
            </summary>
            <p>
              <Trans>
                Submission review responsibility; separate from your production
                assignments.
              </Trans>
            </p>
          </details>
        </>
      ) : (
        <>
          <small>
            <Trans>Reviews assigned to you</Trans>
          </small>
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
    </StyledAssignedReview>
  );
};

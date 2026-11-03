import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryCreativeFeedbackHistoryQuery } from '~/generated-metadata/graphql';
import { GET_CREATIVE_FEEDBACK_HISTORY } from '@/delivery/creative/review/delivery-creative-review.graphql';
import {
  creativeReviewDestination,
  creativeTargetChanges,
} from '@/delivery/creative/review/creative-review-navigation';
import { CreativeReviewTargetDetails } from '@/delivery/creative/review/CreativeReviewTargetDetails';
import { useCreativeReviewLabels } from '@/delivery/creative/review/useCreativeReviewLabels';
import { StyledFeedback } from '@/delivery/creative/review/creativeReviewStyles';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

type CreativeFeedbackHistoryProps = {
  taskId: string;
  feedbackId: string;
  enabled: boolean;
};
export const CreativeFeedbackHistory = ({
  taskId,
  feedbackId,
  enabled,
}: CreativeFeedbackHistoryProps) => {
  const { t } = useLingui();
  const labels = useCreativeReviewLabels();
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const beforeId = params.get('creativeFeedbackBefore');
  const valid = !beforeId || isValidUuid(beforeId);
  const query = useQuery<DeliveryCreativeFeedbackHistoryQuery>(
    GET_CREATIVE_FEEDBACK_HISTORY,
    {
      variables: {
        input: { taskId, feedbackId, beforeId },
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      skip: !enabled || !permission.ready || !valid,
    },
  );
  const candidate = query.data?.deliveryCreativeFeedbackHistory;
  const data =
    enabled &&
    !query.loading &&
    !query.error &&
    valid &&
    permission.matches(candidate) &&
    candidate?.taskId === taskId &&
    candidate.feedbackId === feedbackId
      ? candidate
      : null;
  return (
    <section aria-label={t`Feedback history`}>
      <h3>
        <Trans>Feedback history</Trans>
      </h3>
      {(!valid || query.error) && (
        <p role="alert">
          <Trans>
            Feedback history is unavailable. Retry or return to the latest
            events.
          </Trans>
        </p>
      )}
      {!data && valid && !query.error && (
        <p role="status">
          <Trans>Checking feedback history…</Trans>
        </p>
      )}
      <StyledDeliveryButton
        disabled={!enabled || query.loading || !valid}
        onClick={() => void query.refetch().catch(() => undefined)}
      >
        <Trans>Retry feedback history</Trans>
      </StyledDeliveryButton>
      {beforeId && (
        <Link
          to={creativeReviewDestination(params, {
            creativeFeedbackBefore: null,
          })}
        >
          <Trans>Latest feedback events</Trans>
        </Link>
      )}
      {data && (
        <>
          {!data.events.length && (
            <p>
              <Trans>No feedback events in this selection.</Trans>
            </p>
          )}
          {data.events.map((event) => (
            <StyledFeedback key={event.id}>
              <strong>
                {labels.action(event.action)} ·{' '}
                {labels.state(event.afterStatus)}
              </strong>
              <p>
                {event.actorName} ·{' '}
                {new Date(event.createdAt).toLocaleString(undefined, {
                  timeZone: 'UTC',
                })}{' '}
                UTC
              </p>
              <p>{event.body}</p>
              {event.correction && (
                <>
                  <CreativeReviewTargetDetails
                    target={event.correction}
                    recorded
                  />
                  <Link
                    to={creativeReviewDestination(
                      params,
                      creativeTargetChanges(event.correction),
                    )}
                  >
                    <Trans>Open recorded correction evidence</Trans>
                  </Link>
                </>
              )}
            </StyledFeedback>
          ))}
          {data.nextBeforeId && (
            <Link
              to={creativeReviewDestination(params, {
                creativeFeedbackBefore: data.nextBeforeId,
              })}
            >
              <Trans>Older feedback events</Trans>
            </Link>
          )}
        </>
      )}
    </section>
  );
};

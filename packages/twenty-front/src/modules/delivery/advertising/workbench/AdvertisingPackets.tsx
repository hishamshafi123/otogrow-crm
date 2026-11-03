import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { useAdvertisingReview } from '@/delivery/advertising/workbench/useAdvertisingReview';
import { GET_ADVERTISING_REVIEWS } from '@/delivery/advertising/workbench/delivery-advertising.graphql';
import {
  advertisingDestination,
  advertisingCloseCommand,
} from '@/delivery/advertising/workbench/advertising-navigation';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { AdvertisingGoalSummary } from '@/delivery/advertising/workbench/AdvertisingGoalSummary';
import { AdvertisingActionOrigin } from '@/delivery/advertising/drafts/AdvertisingActionOrigin';
import {
  StyledAdvertisingFacts,
  StyledAdvertisingItem,
  StyledAdvertisingText,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryAdvertisingReviewsQuery } from '~/generated-metadata/graphql';

type AdvertisingPacketsProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  sourceScope: string;
  available: boolean;
  defaultReviewId: string | null;
  onEdit?: (review: AdvertisingReview) => void;
  onAssign?: (review: AdvertisingReview) => void;
  onObserve?: (review: AdvertisingReview, actionId: string) => void;
};
export const AdvertisingPackets = ({
  state,
  selection,
  sourceScope,
  available,
  defaultReviewId,
  onEdit,
  onAssign,
  onObserve,
}: AdvertisingPacketsProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const [params] = useSearchParams();
  const input = {
    sourceKind: selection.kind,
    sourceId: selection.id,
    after: params.get('adReviewsAfter'),
    limit: 25,
  };
  const source = `${sourceScope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAdvertisingReviewsQuery>(
    GET_ADVERTISING_REVIEWS,
    {
      variables: { input, identity: source },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      notifyOnNetworkStatusChange: true,
      skip: !available,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingReviews,
    source,
    enabled: available,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      fastDeepEqual(value.actor, state.data?.actor),
  });
  const reviewId = params.get('adReview') ?? defaultReviewId;
  return (
    <StyledDeliveryStack>
      {reviewId && (
        <AdvertisingPacket
          key={`${state.source}:${reviewId}`}
          state={state}
          selection={selection}
          sourceScope={sourceScope}
          reviewId={reviewId}
          available={available}
          onEdit={onEdit}
          onAssign={onAssign}
          onObserve={onObserve}
        />
      )}
      <details open={reviewId === null}>
        <summary>
          <Trans>Review history for this report</Trans>
        </summary>
        <StyledDeliveryStack>
          {reading.data ? (
            <>
              <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} recommendation reviews.`}</p>
              {reading.data.items.map((item) => (
                <StyledAdvertisingItem key={item.id}>
                  <Link
                    to={advertisingDestination(params, {
                      ...advertisingCloseCommand,
                      adReview: item.id,
                      adAction: null,
                    })}
                  >
                    {labels.planState(item.state, item.actionCount)} ·{' '}
                    {labels.goal(item.goalKind)}
                  </Link>
                  {item.actionCount > 0 && (
                    <p>{t`${item.actionCount} recommendations`}</p>
                  )}
                </StyledAdvertisingItem>
              ))}
              {reading.data.totalCount === 0 && (
                <p>
                  <Trans>
                    No recommendations have been prepared for this report yet.
                  </Trans>
                </p>
              )}
              {reading.data.nextCursor && (
                <Link
                  to={advertisingDestination(params, {
                    adReviewsAfter: reading.data.nextCursor,
                  })}
                >
                  <Trans>More review history</Trans>
                </Link>
              )}
            </>
          ) : (
            <p role={query.error ? 'alert' : 'status'}>
              {query.error
                ? t`Review history could not be verified.`
                : t`Loading recommendation reviews…`}
            </p>
          )}
          {(input.after || query.error) && (
            <Link to={advertisingDestination(params, { adReviewsAfter: null })}>
              <Trans>First review page</Trans>
            </Link>
          )}
        </StyledDeliveryStack>
      </details>
    </StyledDeliveryStack>
  );
};

type AdvertisingPacketProps = Omit<
  AdvertisingPacketsProps,
  'defaultReviewId'
> & { reviewId: string };
const AdvertisingPacket = ({
  state,
  selection,
  sourceScope,
  reviewId,
  available,
  onEdit,
  onAssign,
  onObserve,
}: AdvertisingPacketProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const labels = useAdvertisingLabels();
  const reading = useAdvertisingReview({
    state,
    selection,
    reviewId,
    sourceScope,
    available,
  });
  const review = reading.detail?.review;
  if (!reading.detail || !review)
    return (
      <StyledDeliveryStack>
        <p
          role={
            reading.denied || reading.query.error || reading.detailQuery.error
              ? 'alert'
              : 'status'
          }
        >
          {reading.data?.review === null
            ? t`This recommendation review is unavailable.`
            : reading.denied || reading.query.error || reading.detailQuery.error
              ? t`This recommendation review could not be verified.`
              : t`Loading the selected recommendation review…`}
        </p>
        <StyledDeliveryButton
          type="button"
          onClick={() => {
            void reading.query.refetch().catch(() => undefined);
            void reading.detailQuery.refetch().catch(() => undefined);
          }}
        >
          <Trans>Retry recommendation review</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    );
  return (
    <section aria-label={t`Reviewed recommendations`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>{labels.planState(review.state, review.actions.length)}</h3>
          <StyledDeliveryButton
            type="button"
            onClick={() => {
              void reading.query.refetch().catch(() => undefined);
              void reading.detailQuery.refetch().catch(() => undefined);
            }}
          >
            <Trans>Refresh recommendations</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {reading.changed && (
          <p role="alert">
            <Trans>
              A newer saved review is available. Refresh before editing or
              assigning this plan.
            </Trans>
          </p>
        )}
        <AdvertisingGoalSummary goal={review.goal} />
        <StyledAdvertisingText>
          {review.actions.length === 0 ? review.noChangeReason : review.note}
        </StyledAdvertisingText>
        {review.state === 'DRAFT' && (
          <StyledDeliveryRow>
            {onEdit && (
              <StyledDeliveryButton
                type="button"
                disabled={!reading.data?.canEdit || reading.changed}
                onClick={() => onEdit(review)}
              >
                <Trans>Edit recommendations</Trans>
              </StyledDeliveryButton>
            )}
            {onAssign && (
              <StyledDeliveryButton
                type="button"
                data-primary="true"
                disabled={!reading.data?.canAssign || reading.changed}
                onClick={() => onAssign(review)}
              >
                {review.actions.length === 0
                  ? t`Review no-change decision`
                  : t`Review assignment`}
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        )}
        {reading.data?.blockingReasons.map((reason) => (
          <p key={reason}>{labels.reason(reason)}</p>
        ))}
        {review.actions.map((action) => {
          const currentTask = reading.data?.tasks.find(
            (task) => task.actionId === action.id,
          );
          const taskChanged =
            currentTask?.revision != null &&
            action.task?.revision !== currentTask.revision;
          const canObserve =
            state.permission.manager ||
            (action.task != null &&
              state.data !== null &&
              (action.task.ownerId === state.data.memberId ||
                action.task.reviewerId === state.data.memberId));
          return (
            <StyledAdvertisingItem
              key={action.id}
              data-advertising-action-id={action.id}
            >
              <h3>{action.title}</h3>
              <AdvertisingActionOrigin
                origin={action.origin}
                canOpen={state.permission.manager}
              />
              <StyledAdvertisingFacts>
                <dt>
                  <Trans>Owner</Trans>
                </dt>
                <dd>{action.ownerName}</dd>
                <dt>
                  <Trans>Independent reviewer</Trans>
                </dt>
                <dd>{action.reviewerName}</dd>
                <dt>
                  <Trans>Due date</Trans>
                </dt>
                <dd>{action.dueDate}</dd>
              </StyledAdvertisingFacts>
              <StyledAdvertisingText>{action.rationale}</StyledAdvertisingText>
              <StyledAdvertisingText>
                {action.expectedResult}
              </StyledAdvertisingText>
              <details>
                <summary>
                  <Trans>Reviewed evidence and references</Trans>
                </summary>
                <StyledAdvertisingText>{action.evidence}</StyledAdvertisingText>
              </details>
              {action.adoptTaskId && (
                <p>
                  <Trans>
                    Linked to existing work; its original progress and
                    instructions are preserved.
                  </Trans>
                </p>
              )}
              {action.taskId && (
                <StyledDeliveryStack>
                  <p>
                    {labels.taskState(
                      currentTask?.state ?? action.task?.state ?? '',
                    )}
                  </p>
                  {action.task && (
                    <p>
                      {action.task.title} ·{' '}
                      {action.task.ownerName ?? t`Current owner unavailable`} ·{' '}
                      {action.task.reviewerName ??
                        t`Current reviewer unavailable`}
                    </p>
                  )}
                  {taskChanged && (
                    <p>
                      <Trans>
                        The task changed since its evidence was opened. Open the
                        task for its current submission and review.
                      </Trans>
                    </p>
                  )}
                  {!taskChanged &&
                    action.task?.evidence.map((evidence) => (
                      <a
                        key={`${evidence.url}:${evidence.label}`}
                        href={evidence.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {evidence.label || t`Open submitted evidence`}
                      </a>
                    ))}
                  <StyledDeliveryRow>
                    <Link
                      to={`/delivery?view=${state.permission.manager ? 'planner' : 'mine'}&task=${action.taskId}`}
                    >
                      <Trans>Open task, evidence and review</Trans>
                    </Link>
                    {action.assistantId && (
                      <Link
                        to={`/delivery?view=agents&task=${action.taskId}&assistant=${action.assistantId}`}
                      >
                        <Trans>Open assistant support</Trans>
                      </Link>
                    )}
                    <Link
                      to={advertisingDestination(params, {
                        ...advertisingCloseCommand,
                        adReview: review.id,
                        adAction: action.id,
                      })}
                    >
                      <Trans>View observations</Trans>
                    </Link>
                    {onObserve && (
                      <StyledDeliveryButton
                        type="button"
                        disabled={taskChanged || !canObserve}
                        onClick={() => onObserve(review, action.id)}
                      >
                        <Trans>Record later result</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledDeliveryRow>
                </StyledDeliveryStack>
              )}
            </StyledAdvertisingItem>
          );
        })}
      </StyledDeliveryStack>
    </section>
  );
};

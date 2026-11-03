import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryTask,
  type DeliveryTaskContext,
} from '@/delivery/delivery.types';
import { type TaskReviewSnapshot } from '@/delivery/reviews/review.types';

const StyledSteps = styled.ol`
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  list-style: none;
  margin: 12px 0;
  padding: 0;
  li {
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 8px;
    padding: 10px;
    &[aria-current='step'] {
      border-color: ${themeCssVariables.font.color.primary};
      font-weight: 600;
    }
    small {
      display: block;
      margin-top: 4px;
    }
  }
`;
type DeliveryTaskJourneyProps = {
  task: DeliveryTask;
  workspace: Pick<DeliveryTaskContext, 'actor' | 'members'>;
  onOpenPanel: (panel: 'task' | 'creative' | 'operations') => void;
  review?: TaskReviewSnapshot | null;
};
export const DeliveryTaskJourney = ({
  task,
  workspace,
  onOpenPanel,
  review,
}: DeliveryTaskJourneyProps) => {
  const { t } = useLingui();
  const { details, delivery } = task;
  const latest = details.submissions.at(-1);
  const approved = details.state === 'APPROVED';
  const fulfilled = approved && delivery?.status === 'FULFILLED';
  const awaitingFulfilment = approved && delivery?.status === 'WAITING';
  const briefNeedsApproval =
    ['PLANNED', 'IN_PROGRESS'].includes(details.state) &&
    Boolean(details.creative) &&
    details.creative?.approvedBriefVersion !== details.creative?.briefVersion;
  const currentStage =
    fulfilled || awaitingFulfilment
      ? 4
      : approved
        ? 3
        : details.state === 'IN_REVIEW'
          ? 2
          : details.state === 'PLANNED' || briefNeedsApproval
            ? 0
            : 1;
  const verifiedPending =
    review &&
    review.taskId === task.id &&
    review.taskRevision >= task.revision &&
    review.pending?.submissionVersion === latest?.version
      ? review.pending
      : null;
  const currentReview = review === undefined ? task.review : verifiedPending;
  const hasCurrentReview =
    details.state === 'IN_REVIEW' &&
    (review !== undefined || Boolean(task.review));
  const ownerId = hasCurrentReview
    ? currentReview?.effectiveReviewerId
    : currentStage < 2 && !briefNeedsApproval
      ? task.assigneeId
      : details.reviewerId;
  const owner =
    details.state === 'IN_REVIEW' && review !== undefined
      ? (verifiedPending?.effectiveReviewerName ?? t`Review owner unverified`)
      : (workspace.members.find((member) => member.id === ownerId)?.name ??
        t`Unassigned or former teammate`);
  const canConfirm =
    workspace.actor.isManager && workspace.actor.memberId !== task.assigneeId;
  const canReview = hasCurrentReview
    ? currentReview?.reviewerState === 'ACTIVE' &&
      currentReview.submissionVersion === latest?.version &&
      currentReview.effectiveReviewerId === workspace.actor.memberId &&
      (review === undefined || review?.canReviewSubmission === true) &&
      workspace.actor.memberId !== task.assigneeId
    : canConfirm && workspace.actor.memberId === details.reviewerId;
  const panel =
    currentStage >= 3
      ? 'operations'
      : currentStage < 2 && details.creative
        ? 'creative'
        : 'task';
  const heading = briefNeedsApproval
    ? t`Creative brief needs approval`
    : fulfilled
      ? t`Client work fulfilled`
      : awaitingFulfilment
        ? t`Delivered — awaiting fulfilment`
        : approved
          ? t`Approved — client delivery needed`
          : details.state === 'IN_REVIEW'
            ? t`Waiting for final approval`
            : details.state === 'CHANGES_REQUESTED'
              ? t`Revisions needed`
              : details.state === 'BLOCKED'
                ? t`Production is blocked`
                : details.state === 'PLANNED'
                  ? t`Ready to begin`
                  : t`Production in progress`;
  const next = briefNeedsApproval
    ? t`A manager must approve the current creative brief before production continues.`
    : fulfilled
      ? t`No further delivery action is due for this approved version.`
      : awaitingFulfilment
        ? t`Confirm the client outcome, keep the check open, or return the work for revisions.`
        : approved
          ? t`Send the approved version to the client, then record where and when it was delivered.`
          : details.state === 'IN_REVIEW'
            ? t`The assigned reviewer must approve the submission or request changes.`
            : details.state === 'BLOCKED'
              ? t`Resolve the blocker before continuing production.`
              : details.state === 'CHANGES_REQUESTED'
                ? t`Apply the feedback and submit a new version for independent review.`
                : t`Follow the brief and required evidence, then submit the completed work for review.`;
  const action = briefNeedsApproval
    ? workspace.actor.isManager
      ? t`Review creative brief`
      : t`View creative brief`
    : fulfilled
      ? t`View delivery history`
      : currentStage === 4
        ? canConfirm
          ? t`Check fulfilment`
          : t`View fulfilment`
        : currentStage === 3
          ? canConfirm
            ? t`Record client delivery`
            : t`View delivery details`
          : currentStage === 2
            ? canReview
              ? t`Review submission`
              : t`View submission`
            : panel === 'creative'
              ? t`Open creative production`
              : t`Open task instructions`;
  const steps = [
    t`Brief & assignment`,
    t`Production`,
    t`Final approval`,
    t`Client delivery`,
    t`Fulfilment`,
  ];
  return (
    <StyledDeliveryCard aria-label={t`Deliverable journey`}>
      <StyledDeliveryRow>
        <h3>{heading}</h3>
        {latest && <span>{t`Submission ${latest.version}`}</span>}
      </StyledDeliveryRow>
      <StyledSteps aria-label={t`Delivery stages`}>
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={
              !fulfilled && currentStage === index ? 'step' : undefined
            }
          >
            {label}
            <small>
              {fulfilled || index < currentStage
                ? t`Complete`
                : index === currentStage
                  ? t`Current step`
                  : t`Next`}
            </small>
          </li>
        ))}
      </StyledSteps>
      {!fulfilled && (
        <p>
          <Trans>Next owner:</Trans> <strong>{owner}</strong>
          {currentStage >= 3 && (
            <span>
              {' '}
              · <Trans>Another authorized manager can handle delivery.</Trans>
            </span>
          )}
        </p>
      )}
      <p>{next}</p>
      {details.blocker && details.state === 'BLOCKED' && (
        <p>
          <Trans>Blocker:</Trans> {details.blocker}
        </p>
      )}
      {delivery?.status === 'REDOING' && (
        <p>
          <Trans>
            The earlier delivery cycle is retained. Revised work needs approval
            and recorded redelivery.
          </Trans>
        </p>
      )}
      {approved &&
        (delivery?.status === 'NEEDS_RECONFIRMATION' || !delivery) && (
          <p role="status">
            <Trans>
              Current delivery evidence is missing or belongs to an earlier
              version. Reconfirm delivery before marking this work fulfilled.
            </Trans>
          </p>
        )}
      {delivery?.nextCheckAt && awaitingFulfilment && (
        <p>
          <Trans>Next fulfilment check:</Trans>{' '}
          {new Date(delivery.nextCheckAt).toLocaleString(undefined, {
            timeZone: delivery.timezone,
            timeZoneName: 'short',
          })}
        </p>
      )}
      <StyledDeliveryButton onClick={() => onOpenPanel(panel)}>
        {action}
      </StyledDeliveryButton>
    </StyledDeliveryCard>
  );
};

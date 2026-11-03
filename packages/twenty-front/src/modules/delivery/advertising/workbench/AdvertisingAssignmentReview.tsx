import { Trans, useLingui } from '@lingui/react/macro';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { AdvertisingGoalSummary } from '@/delivery/advertising/workbench/AdvertisingGoalSummary';
import { AdvertisingActionOrigin } from '@/delivery/advertising/drafts/AdvertisingActionOrigin';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
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

type AdvertisingAssignmentReviewProps = {
  review: AdvertisingReview;
  enabled: boolean;
  busy: boolean;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onAssign: () => void;
  onClose: () => void;
};

export const AdvertisingAssignmentReview = ({
  review,
  enabled,
  busy,
  confirmed,
  onConfirmedChange,
  onAssign,
  onClose,
}: AdvertisingAssignmentReviewProps) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const existingCount = review.actions.filter(
    (action) => action.adoptTaskId != null,
  ).length;
  const newCount = review.actions.length - existingCount;
  const noChanges = review.actions.length === 0;
  const available =
    enabled &&
    !busy &&
    review.state === 'DRAFT' &&
    (!noChanges || review.noChangeReason.trim().length > 0);
  return (
    <section aria-label={t`Review before assigning advertising work`}>
      <StyledDeliveryStack>
        <h2>
          {noChanges
            ? t`Review the proposed no-change decision`
            : t`Review the work before assigning it`}
        </h2>
        <h3>{review.source.title}</h3>
        <p>
          {labels.source(review.source.kind)} · {review.source.channel} ·{' '}
          {review.source.currency}
        </p>
        <p>
          {review.source.fromDate} – {review.source.throughDate} ·{' '}
          {review.source.timezone ?? t`Timezone not recorded`}
        </p>
        <AdvertisingGoalSummary goal={review.goal} />
        {(!noChanges || review.note !== review.noChangeReason) && (
          <>
            <h3>
              <Trans>Manager's review</Trans>
            </h3>
            <StyledAdvertisingText>{review.note}</StyledAdvertisingText>
          </>
        )}
        {noChanges ? (
          <>
            <h3>
              <Trans>Why no changes are needed</Trans>
            </h3>
            <StyledAdvertisingText>
              {review.noChangeReason}
            </StyledAdvertisingText>
            <p>
              <Trans>
                This records the reviewed decision without creating tasks.
              </Trans>
            </p>
          </>
        ) : (
          <p>{t`This review creates ${newCount} new tasks and links ${existingCount} existing tasks.`}</p>
        )}
        {review.legacyHandling.mode !== 'NONE' && (
          <StyledAdvertisingItem>
            <h3>
              <Trans>Existing follow-up decision</Trans>
            </h3>
            <p>
              {review.legacyHandling.mode === 'ADOPT'
                ? t`Link the existing task with its original instructions, owner, reviewer, deadline and progress.`
                : t`Keep the existing follow-up separate from these recommendations.`}
            </p>
            {review.legacyHandling.taskState && (
              <p>
                {t`Existing task state at this review`}:{' '}
                {labels.taskState(review.legacyHandling.taskState)}
              </p>
            )}
            {review.legacyHandling.reason && (
              <StyledAdvertisingText>
                {review.legacyHandling.reason}
              </StyledAdvertisingText>
            )}
          </StyledAdvertisingItem>
        )}
        {review.actions.map((action, index) => (
          <StyledAdvertisingItem key={action.id}>
            <h3>
              {t`Recommendation ${index + 1}`}: {action.title}
            </h3>
            <AdvertisingActionOrigin origin={action.origin} />
            <p>
              {action.adoptTaskId
                ? t`Existing work — preserve its original scope and progress`
                : t`New task`}
            </p>
            <StyledAdvertisingFacts>
              <dt>
                <Trans>Human owner</Trans>
              </dt>
              <dd>{action.ownerName || t`Owner unavailable`}</dd>
              <dt>
                <Trans>Independent reviewer</Trans>
              </dt>
              <dd>{action.reviewerName || t`Reviewer unavailable`}</dd>
              <dt>
                <Trans>Due date</Trans>
              </dt>
              <dd>
                <time dateTime={action.dueDate}>{action.dueDate}</time>
              </dd>
              {action.assistantId && (
                <>
                  <dt>
                    <Trans>Optional assistant</Trans>
                  </dt>
                  <dd>
                    {action.assistantName ?? t`Assistant unavailable`}
                    {action.assistantVersion != null
                      ? ` · ${t`version ${action.assistantVersion}`}`
                      : ''}
                  </dd>
                </>
              )}
              {action.adoptTaskId && action.task && (
                <>
                  <dt>
                    <Trans>Existing task progress</Trans>
                  </dt>
                  <dd>
                    {labels.taskState(action.task.state)} ·{' '}
                    {t`revision ${action.task.revision}`}
                  </dd>
                </>
              )}
            </StyledAdvertisingFacts>
            <h4>
              <Trans>Why this action is needed</Trans>
            </h4>
            <StyledAdvertisingText>{action.rationale}</StyledAdvertisingText>
            <h4>
              <Trans>Expected result and how to check it</Trans>
            </h4>
            <StyledAdvertisingText>
              {action.expectedResult}
            </StyledAdvertisingText>
            <h4>
              <Trans>Evidence and instructions</Trans>
            </h4>
            <StyledAdvertisingText>{action.evidence}</StyledAdvertisingText>
            {action.adoptTaskId && (
              <p>
                <Trans>
                  Any existing approval applies to the original task and
                  submitted work. Linking it does not approve this new
                  recommendation or overwrite the original task.
                </Trans>
              </p>
            )}
            {action.assistantId && (
              <p>
                <Trans>
                  The human owner remains responsible. The assistant is linked
                  as optional support; it will not run or spend credits when you
                  assign this review.
                </Trans>
              </p>
            )}
          </StyledAdvertisingItem>
        ))}
        <p>
          <Trans>
            This records the reviewed decision and its task links. It does not
            change live ads or advertising budgets.
          </Trans>
        </p>
        {!enabled && (
          <p role="status">
            <Trans>
              Current source, responsibilities or assignment authority must be
              verified before this decision can be recorded.
            </Trans>
          </p>
        )}
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={!available}
            onChange={(event) => onConfirmedChange(event.target.checked)}
          />
          {noChanges ? (
            <Trans>
              I reviewed the outcome evidence and the no-change reason.
            </Trans>
          ) : (
            <Trans>I reviewed the outcome, evidence and recipients.</Trans>
          )}
        </label>
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            data-primary="true"
            disabled={!available || !confirmed}
            onClick={() => {
              if (available && confirmed) onAssign();
            }}
          >
            {busy
              ? t`Recording decision…`
              : noChanges
                ? t`Record no-change review`
                : t`Approve review and assign work`}
          </StyledDeliveryButton>
          <StyledDeliveryButton type="button" onClick={onClose}>
            <Trans>Back to reviewed recommendations</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};

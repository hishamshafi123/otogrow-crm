import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import { useReviewLabels } from '@/delivery/reviews/useReviewLabels';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { type ActivityCurrentTask } from '@/otogrow-activity/analysis/activity-analysis.types';

const StyledFactsBody = styled(StyledDeliveryStack)`
  min-width: 0;
  overflow-wrap: anywhere;
`;
const StyledFacts = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  > div {
    display: flex;
    flex-direction: column;
    gap: ${themeCssVariables.spacing[1]};
    min-width: 0;
  }
  dt {
    color: ${themeCssVariables.font.color.secondary};
  }
  dd {
    margin: 0;
    white-space: pre-wrap;
  }
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

type ActivityCurrentTaskFactsProps = { task: ActivityCurrentTask };
export const ActivityCurrentTaskFacts = ({
  task,
}: ActivityCurrentTaskFactsProps) => {
  const { t } = useLingui();
  const taskLabels = useTaskLabels();
  const reviewLabels = useReviewLabels();
  return (
    <StyledFactsBody>
      <strong>{task.title}</strong>
      <p>
        {task.projectName}
        {task.clientName ? ` · ${task.clientName}` : ''}
      </p>
      <StyledFacts>
        <div>
          <dt>
            <Trans>Task state</Trans>
          </dt>
          <dd>{taskLabels.state(task.state)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Owner</Trans>
          </dt>
          <dd>
            {task.ownerId
              ? (task.ownerName ?? t`Owner name unavailable`)
              : t`Not assigned`}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Due date (UTC)</Trans>
          </dt>
          <dd>{task.dueAt ? formatActivityTime(task.dueAt) : t`Not set`}</dd>
        </div>
        <div>
          <dt>
            <Trans>Recorded blocker</Trans>
          </dt>
          <dd>
            {task.blocker ||
              (task.state === 'BLOCKED'
                ? t`The task is blocked; a reason was not recorded.`
                : t`No blocker recorded`)}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Independent review</Trans>
          </dt>
          <dd>{reviewLabels.reviewer(task.reviewerState)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Effective reviewer</Trans>
          </dt>
          <dd>
            {task.effectiveReviewerName ??
              (task.effectiveReviewerId
                ? t`Reviewer name unavailable`
                : t`Not established`)}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Review assignment</Trans>
          </dt>
          <dd>{reviewLabels.mode(task.assignmentMode)}</dd>
        </div>
        <div>
          <dt>
            <Trans>Primary reviewer</Trans>
          </dt>
          <dd>
            {task.primaryReviewerName ??
              (task.primaryReviewerId
                ? t`Reviewer name unavailable`
                : t`Not assigned`)}
          </dd>
        </div>
        <div>
          <dt>
            <Trans>Latest submission</Trans>
          </dt>
          <dd>
            {task.submissionVersion == null
              ? t`No current submission established`
              : t`Version ${task.submissionVersion}`}
            {task.submittedAt
              ? ` · ${formatActivityTime(task.submittedAt)}`
              : ''}
          </dd>
        </div>
      </StyledFacts>
      {task.reviewerState === 'SELF_REVIEW' && (
        <p>
          <strong>
            <Trans>
              The owner cannot approve their own work. This is not an actionable
              independent review assignment.
            </Trans>
          </strong>
        </p>
      )}
      {task.state !== 'IN_REVIEW' && (
        <p>
          <Trans>
            This task is not awaiting review in its captured state. A reviewer
            assignment does not imply a pending approval.
          </Trans>
        </p>
      )}
      {task.reviewerState !== 'ACTIVE' &&
        task.reviewerState !== 'SELF_REVIEW' && (
          <p>
            <Trans>
              An eligible current reviewer has not been established. Do not
              treat this as someone’s active review queue.
            </Trans>
          </p>
        )}
      {task.detailsTruncated && (
        <p>
          <Trans>
            Some task details were shortened. Open the source before relying on
            omitted text.
          </Trans>
        </p>
      )}
      {task.warnings.length > 0 && (
        <ul>
          {task.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </StyledFactsBody>
  );
};

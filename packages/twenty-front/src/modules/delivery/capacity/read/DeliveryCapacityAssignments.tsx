import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type CapacityAssignments } from '@/delivery/capacity/read/capacity-read.types';
import { useCapacityReadLabels } from '@/delivery/capacity/read/useCapacityReadLabels';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { deliveryTaskDestination } from '@/delivery/delivery-task-navigation';
import { useReviewLabels } from '@/delivery/reviews/useReviewLabels';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import {
  StyledCapacityAssignment,
  StyledCapacityFacts,
  StyledCapacityIntroduction,
  StyledCapacityWorkspace,
} from '@/delivery/capacity/read/capacity-read.styles';
import { StyledDeliveryRow } from '@/delivery/deliveryStyles';
type DeliveryCapacityAssignmentsProps = { data: CapacityAssignments };
export const DeliveryCapacityAssignments = ({
  data,
}: DeliveryCapacityAssignmentsProps) => {
  const { t } = useLingui();
  const labels = useCapacityReadLabels();
  const reviewLabels = useReviewLabels();
  const taskLabels = useTaskLabels();
  const [params] = useSearchParams();
  const assignmentLabel = (item: CapacityAssignments['items'][number]) =>
    item.kind === 'REVIEW'
      ? item.state === 'IN_REVIEW'
        ? t`Review`
        : t`Planned review`
      : t`Production`;
  return (
    <StyledCapacityWorkspace aria-label={t`Capacity assignments`}>
      <StyledCapacityIntroduction>
        <h3>
          {data.selectionScope === 'OPEN_PLANNING'
            ? t`Unavailable owners across open planning`
            : data.bucket === 'DAY'
              ? t`Assignments on ${data.date ?? ''}`
              : t`Assignments needing planning`}
        </h3>
        <strong>{t`Assignments in this selection: ${data.totalCount}`}</strong>
        {(data.items.length !== data.totalCount ||
          params.has('capacityAssignmentsAfter')) && (
          <small>{t`Showing ${data.items.length} assignments on this page`}</small>
        )}
        <p>
          {data.selectionScope === 'OPEN_PLANNING'
            ? t`Missing or inactive owners across all open planning, including work outside this seven-day window. These reservations are unresolved, not free capacity.`
            : data.bucket === 'NEEDS_PLANNING'
              ? t`Undated work and work before this range are not included in daily totals. Open each task to schedule it or update its estimate.`
              : t`One task may have a production assignment and a planned review assignment. These are separate reservations, not duplicate tasks.`}
        </p>
      </StyledCapacityIntroduction>
      {data.items.map((item) => (
        <StyledCapacityAssignment
          key={`${item.taskId}:${item.kind}`}
          aria-label={`${item.title} · ${assignmentLabel(item)}`}
        >
          <strong>
            <Link
              to={deliveryTaskDestination(
                params,
                item.taskId,
                'task',
                item.kind === 'REVIEW' &&
                  item.state === 'IN_REVIEW' &&
                  item.submissionVersion != null
                  ? { creativeSubmission: item.submissionVersion }
                  : {},
              )}
            >
              {item.title}
            </Link>
          </strong>
          <StyledCapacityFacts>
            <span>{item.projectName}</span>
            <span>{taskLabels.state(item.state)}</span>
            <span>{assignmentLabel(item)}</span>
          </StyledCapacityFacts>
          <StyledCapacityFacts>
            <span>
              {t`Owner`}: {item.ownerName ?? t`Unavailable owner`}
            </span>
            <span>
              {t`Planned day`}: {item.date ?? t`No date`}
            </span>
          </StyledCapacityFacts>
          <StyledCapacityFacts>
            <span>
              {t`Working estimate`}: {labels.minutes(item.workMinutes)}
            </span>
            <span>
              {t`Revision allowance`}: {labels.minutes(item.revisionMinutes)}
            </span>
            <span>
              {t`Generation waiting`}: {labels.minutes(item.waitMinutes)}
            </span>
          </StyledCapacityFacts>
          {item.unknownEffort && (
            <p role="status">
              <Trans>
                The working estimate is incomplete; the reserved workload may be
                higher.
              </Trans>
            </p>
          )}
          {item.unknownWait && (
            <small>
              <Trans>Some generation waiting is unknown.</Trans>
            </small>
          )}
          {item.kind === 'REVIEW' && item.reviewerState && (
            <p>
              {reviewLabels.reviewer(item.reviewerState)}
              {item.reviewerState !== 'ACTIVE' && (
                <>
                  {' '}
                  ·{' '}
                  <Trans>
                    The review reservation is retained; no primary fallback is
                    assumed.
                  </Trans>
                </>
              )}
            </p>
          )}
          {item.warnings.map((code) => (
            <p key={code} role="status">
              {labels.warning(code)}
            </p>
          ))}
        </StyledCapacityAssignment>
      ))}
      {!data.items.length && (
        <p>
          {data.totalCount === 0
            ? t`No assignments in this selection.`
            : t`No assignments on this page. Return to the first assignment page to continue.`}
        </p>
      )}
      <nav aria-label={t`Capacity assignment pages`}>
        <StyledDeliveryRow>
          {params.has('capacityAssignmentsAfter') && (
            <Link
              to={taskPageDestination(params, {
                capacityAssignmentsAfter: null,
              })}
            >
              <Trans>First assignment page</Trans>
            </Link>
          )}
          {data.nextCursor && (
            <Link
              to={taskPageDestination(params, {
                capacityAssignmentsAfter: data.nextCursor,
              })}
            >
              <Trans>Next assignment page</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </nav>
    </StyledCapacityWorkspace>
  );
};

import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type CapacityAssignments } from '@/delivery/capacity/read/capacity-read.types';
import { useCapacityReadLabels } from '@/delivery/capacity/read/useCapacityReadLabels';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { deliveryTaskDestination } from '@/delivery/delivery-task-navigation';
import { useReviewLabels } from '@/delivery/reviews/useReviewLabels';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
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
    <StyledDeliveryCard aria-label={t`Capacity assignments`}>
      <StyledDeliveryStack>
        <h3>
          {data.selectionScope === 'OPEN_PLANNING'
            ? t`Unavailable owners across open planning`
            : data.bucket === 'DAY'
              ? t`Assignments on ${data.date ?? ''}`
              : t`Assignments needing planning`}
        </h3>
        <strong>{t`Assignments in this selection: ${data.totalCount}`}</strong>
        <small>{t`Showing ${data.items.length} assignments on this page`}</small>
        <p>
          {data.selectionScope === 'OPEN_PLANNING'
            ? t`Missing or inactive owners across all open planning, including work outside this seven-day window. These reservations are unresolved, not free capacity.`
            : data.bucket === 'NEEDS_PLANNING'
              ? t`Undated work and work before this range are not included in daily totals. Open each task to schedule it or update its estimate.`
              : t`One task may have a production assignment and a planned review assignment. These are separate reservations, not duplicate tasks.`}
        </p>
        {data.items.map((item) => (
          <section
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
            <p>
              {item.projectName} · {taskLabels.state(item.state)} ·{' '}
              {assignmentLabel(item)}
            </p>
            <p>
              {t`Owner`}: {item.ownerName ?? t`Unavailable owner`} ·{' '}
              {item.date ?? t`No date`}
            </p>
            <p>
              {t`Working estimate`}: {labels.minutes(item.workMinutes)} ·{' '}
              {t`Revision allowance`}: {labels.minutes(item.revisionMinutes)} ·{' '}
              {t`Generation waiting`}: {labels.minutes(item.waitMinutes)}
            </p>
            {item.unknownEffort && (
              <p role="status">
                <Trans>
                  The working estimate is incomplete; the reserved workload may
                  be higher.
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
          </section>
        ))}
        {!data.items.length && (
          <p>
            <Trans>No assignments on this page.</Trans>
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
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};

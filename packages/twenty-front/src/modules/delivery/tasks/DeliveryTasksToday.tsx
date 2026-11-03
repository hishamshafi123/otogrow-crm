import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type TaskListSnapshot } from '@/delivery/tasks/task.types';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { DeliveryAssignedReviewsToday } from '@/delivery/reviews/DeliveryAssignedReviewsToday';
import {
  StyledDeliveryCard,
  StyledDeliveryGrid,
} from '@/delivery/deliveryStyles';
type DeliveryTasksTodayProps = { snapshot: TaskListSnapshot; manager: boolean };
export const DeliveryTasksToday = ({
  snapshot,
  manager,
}: DeliveryTasksTodayProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const overview = snapshot.overview;
  const destination = (status: string | null, attention: string | null) =>
    taskPageDestination(params, {
      ...deliveryTaskSelection(null),
      view: 'home',
      status,
      attention,
      search: null,
      project: null,
      member: null,
      service: null,
      from: null,
      through: null,
      tasksAfter: null,
    });
  return (
    <>
      <p>
        {manager
          ? t`Across all permitted team assignments`
          : t`Across your production assignments`}
      </p>
      <StyledDeliveryGrid>
        <DeliveryAssignedReviewsToday />
        <StyledDeliveryCard>
          <small>
            <Trans>Due today</Trans>
          </small>
          <h2>{overview.dueTodayCount}</h2>
          <Link to={destination(null, 'today')}>
            <Trans>Show today’s work</Trans>
          </Link>
        </StyledDeliveryCard>
        <StyledDeliveryCard>
          <small>
            <Trans>Approved work</Trans>
          </small>
          <h2>
            {overview.approvedCount} / {overview.totalCount}
          </h2>
          <small>
            <Trans>Internal approval; client fulfilment is separate.</Trans>
          </small>
        </StyledDeliveryCard>
        <StyledDeliveryCard>
          <small>
            <Trans>Production submissions awaiting review</Trans>
          </small>
          <h2>{overview.reviewCount}</h2>
          <Link to={destination('IN_REVIEW', null)}>
            <Trans>Show submitted work</Trans>
          </Link>
        </StyledDeliveryCard>
        <StyledDeliveryCard>
          <small>
            <Trans>Overdue</Trans>
          </small>
          <h2>{overview.overdueCount}</h2>
          <Link to={destination(null, 'overdue')}>
            <Trans>See overdue work</Trans>
          </Link>
        </StyledDeliveryCard>
        <StyledDeliveryCard>
          <small>
            <Trans>Blocked</Trans>
          </small>
          <h2>{overview.blockedCount}</h2>
          <Link to={destination('BLOCKED', null)}>
            <Trans>See blockers</Trans>
          </Link>
        </StyledDeliveryCard>
      </StyledDeliveryGrid>
    </>
  );
};

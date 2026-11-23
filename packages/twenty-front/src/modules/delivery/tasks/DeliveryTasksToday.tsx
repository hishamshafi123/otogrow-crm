import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type TaskListSnapshot } from '@/delivery/tasks/task.types';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { DeliveryAssignedReviewsToday } from '@/delivery/reviews/DeliveryAssignedReviewsToday';

const StyledOverview = styled.section`
  background-color: ${themeCssVariables.background.primary};
  background-image:
    radial-gradient(
      460px circle at 0% 0%,
      ${themeCssVariables.color.transparent.iris2},
      transparent 54%
    ),
    radial-gradient(
      360px circle at 100% 0%,
      ${themeCssVariables.color.transparent.cyan2},
      transparent 52%
    );
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 12px 30px -20px ${themeCssVariables.boxShadow.color};
  min-width: 0;
  padding: 20px 22px;

  &[data-empty='true'] {
    padding: 14px 18px;

    &:not(:has(section)) {
      display: none;
    }
  }

  @media (max-width: 700px) {
    padding: 16px;
  }
`;

const StyledScope = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 16px;
  padding-bottom: 12px;
  text-transform: uppercase;
`;

const StyledMetrics = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  &:has(> section) {
    grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.4fr);
  }

  @media (max-width: 700px) {
    gap: 12px;

    &:has(> section) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  &[data-empty='true'] {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledMetric = styled(Link)`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 44px;
  min-width: 0;
  padding: 14px 16px;
  text-decoration: none;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;

  dl {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
  }

  dt {
    color: ${themeCssVariables.color.iris11};
    font-size: 12.5px;
    font-weight: 500;
  }

  dd {
    color: ${themeCssVariables.font.color.primary};
    font-size: 28px;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    letter-spacing: -0.03em;
    line-height: 1.1;
    margin: 0;
  }

  &:hover {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.iris7};
    box-shadow: 0 8px 20px -14px ${themeCssVariables.color.transparent.iris7};
    transform: translateY(-2px);
  }

  &:hover dt {
    color: ${themeCssVariables.color.iris12};
  }
`;

const StyledProductionSummary = styled.details`
  margin-top: 12px;

  summary {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
  }

  &[open] summary {
    margin-bottom: 12px;
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    margin-bottom: 8px;
  }

  span {
    font-size: 13px;
  }

  strong {
    font-variant-numeric: tabular-nums;
  }
`;

type DeliveryTasksTodayProps = { snapshot: TaskListSnapshot; manager: boolean };
export const DeliveryTasksToday = ({
  snapshot,
  manager,
}: DeliveryTasksTodayProps) => {
  const { t } = useLingui();
  const metricId = useId();
  const [params] = useSearchParams();
  const overview = snapshot.overview;
  const hasAttention =
    overview.dueTodayCount > 0 ||
    overview.overdueCount > 0 ||
    overview.blockedCount > 0;
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
    <StyledOverview
      aria-label={t`Daily work overview`}
      data-empty={!hasAttention}
    >
      {overview.totalCount > 0 && (
        <StyledScope>
          {manager
            ? t`Across all permitted team assignments`
            : t`Across your production assignments`}
        </StyledScope>
      )}
      {!hasAttention && overview.totalCount > 0 && (
        <StyledScope>
          <Trans>No tasks are due today, overdue or blocked.</Trans>
        </StyledScope>
      )}
      <StyledMetrics data-empty={!hasAttention}>
        {hasAttention && (
          <>
            <StyledMetric
              to={destination(null, 'today')}
              aria-label={t`Due today: show today’s work`}
              aria-describedby={`${metricId}-today`}
            >
              <dl>
                <dt>
                  <Trans>Due today</Trans>
                </dt>
                <dd id={`${metricId}-today`}>{overview.dueTodayCount}</dd>
              </dl>
            </StyledMetric>
            <StyledMetric
              to={destination(null, 'overdue')}
              aria-label={t`Overdue: see overdue work`}
              aria-describedby={`${metricId}-overdue`}
            >
              <dl>
                <dt>
                  <Trans>Overdue</Trans>
                </dt>
                <dd id={`${metricId}-overdue`}>{overview.overdueCount}</dd>
              </dl>
            </StyledMetric>
            <StyledMetric
              to={destination('BLOCKED', null)}
              aria-label={t`Blocked: see blockers`}
              aria-describedby={`${metricId}-blocked`}
            >
              <dl>
                <dt>
                  <Trans>Blocked</Trans>
                </dt>
                <dd id={`${metricId}-blocked`}>{overview.blockedCount}</dd>
              </dl>
            </StyledMetric>
          </>
        )}
        <DeliveryAssignedReviewsToday />
      </StyledMetrics>
      {overview.totalCount > 0 && (
        <StyledProductionSummary>
          <summary>
            <Trans>Submission and approval totals</Trans>
          </summary>
          <div>
            <span>
              <Trans>Production submissions awaiting review</Trans>:{' '}
              <strong>{overview.reviewCount}</strong>
            </span>
            <Link to={destination('IN_REVIEW', null)}>
              <Trans>Show submitted work</Trans>
            </Link>
          </div>
          <div>
            <span>
              <Trans>Approved work</Trans>:{' '}
              <strong>
                {overview.approvedCount} / {overview.totalCount}
              </strong>
            </span>
            <small>
              <Trans>Internal approval; client fulfilment is separate.</Trans>
            </small>
          </div>
        </StyledProductionSummary>
      )}
    </StyledOverview>
  );
};

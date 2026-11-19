import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  type TaskListSnapshot,
  type TaskSummary,
} from '@/delivery/tasks/task.types';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import {
  taskPageDestination,
  TASK_STATES,
} from '@/delivery/tasks/task-navigation';
import { deliveryTaskDestination } from '@/delivery/delivery-task-navigation';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryBadge,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
  StyledDeliveryBoard,
} from '@/delivery/deliveryStyles';

const StyledSelectionSummary = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
`;

const StyledCountDetails = styled.details`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 13px;

  small {
    display: block;
  }

  &[open] {
    flex-basis: 100%;
  }
`;

const StyledGroupHeading = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const StyledTaskRows = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
`;

const StyledTaskRow = styled.article`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  min-width: 0;
  padding: 16px 20px;

  &:last-child {
    border-bottom: 0;
  }

  @media (max-width: 700px) {
    padding: 16px;
  }
`;

const StyledTaskContent = styled.div`
  align-items: start;
  display: grid;
  gap: 12px 20px;
  grid-template-columns:
    minmax(0, 2fr) minmax(0, 0.8fr) minmax(0, 1.2fr)
    minmax(0, 1.2fr);

  > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  strong {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
  }

  strong a {
    color: ${themeCssVariables.font.color.primary};
    text-decoration: underline;
    text-decoration-color: ${themeCssVariables.border.color.strong};
    text-underline-offset: 3px;
  }

  strong a:hover {
    color: ${themeCssVariables.color.blue11};
    text-decoration: underline;
  }

  [data-task-owner] {
    font-size: 13px;
  }

  [data-task-status] {
    align-items: flex-start;
  }

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  }

  @media (max-width: 540px) {
    grid-template-columns: minmax(0, 1fr);
  }

  &[data-layout='board'] {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledTaskContext = styled.small`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
`;

const StyledTaskSupporting = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;

  &:empty {
    display: none;
  }

  p,
  summary {
    font-size: 13px;
  }
`;

const StyledChecklist = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  progress {
    accent-color: ${themeCssVariables.color.blue11};
    height: 6px;
    max-width: 100%;
    width: 96px;
  }
`;

type DeliveryTaskSummaryListProps = {
  snapshot: TaskListSnapshot;
  onOpenTask: (task: TaskSummary) => void;
  board?: boolean;
};
export const DeliveryTaskSummaryList = ({
  snapshot,
  onOpenTask,
  board = false,
}: DeliveryTaskSummaryListProps) => {
  const { t } = useLingui();
  const labels = useTaskLabels();
  const [params, setParams] = useSearchParams();
  const { requestAction } = useDeliveryDraftGuard();
  const knownState = (value: string) =>
    TASK_STATES.some((state) => state === value);
  const groupFor = (task: TaskSummary) =>
    board ? (knownState(task.state) ? task.state : 'UNKNOWN') : task.workGroup;
  const groups = board
    ? [
        ...TASK_STATES,
        ...(snapshot.byState.some((count) => !knownState(count.key)) ||
        snapshot.items.some((task) => !knownState(task.state))
          ? ['UNKNOWN']
          : []),
      ]
    : [...new Set(snapshot.items.map((task) => task.workGroup))];
  const groupLabel = board ? labels.state : labels.group;
  const fullCount = (group: string) =>
    board
      ? group === 'UNKNOWN'
        ? snapshot.byState
            .filter((count) => !knownState(count.key))
            .reduce((total, count) => total + count.count, 0)
        : snapshot.byState.find((count) => count.key === group)?.count
      : snapshot.byWorkGroup.find((count) => count.key === group)?.count;
  const Columns = board ? StyledDeliveryBoard : StyledDeliveryStack;
  const Cards = board ? StyledDeliveryStack : StyledTaskRows;
  const TaskContainer = board ? StyledDeliveryCard : StyledTaskRow;
  return (
    <StyledDeliveryStack>
      <StyledSelectionSummary>
        <strong>{t`Tasks in this selection: ${snapshot.totalCount}`}</strong>
        {snapshot.items.length !== snapshot.totalCount && (
          <small>{t`Showing ${snapshot.items.length} tasks on this page`}</small>
        )}
      </StyledSelectionSummary>
      {board && (
        <p role="status">
          <Trans>
            Board columns show only this page’s tasks. Complete filtered state
            totals are labelled separately.
          </Trans>
        </p>
      )}
      <Columns
        style={
          board
            ? {
                gridTemplateColumns: `repeat(${groups.length}, minmax(220px, 1fr))`,
              }
            : undefined
        }
      >
        {groups.map((group) => (
          <section key={group} aria-label={groupLabel(group)}>
            <StyledGroupHeading>
              <h2>{groupLabel(group)}</h2>
              {(groups.length > 1 ||
                snapshot.items.length !== snapshot.totalCount) && (
                <small>
                  <Trans>On this page</Trans>:{' '}
                  {
                    snapshot.items.filter((task) => groupFor(task) === group)
                      .length
                  }{' '}
                  · <Trans>In this selection</Trans>:{' '}
                  {fullCount(group) ?? t`Count unavailable`}
                </small>
              )}
            </StyledGroupHeading>
            <Cards>
              {snapshot.items
                .filter((task) => groupFor(task) === group)
                .map((task) => (
                  <TaskContainer key={task.id} aria-label={task.title}>
                    <StyledTaskContent data-layout={board ? 'board' : 'list'}>
                      <div>
                        <strong>
                          <Link
                            to={deliveryTaskDestination(params, task.id)}
                            onClick={(event) => {
                              if (
                                event.button !== 0 ||
                                event.metaKey ||
                                event.ctrlKey ||
                                event.altKey ||
                                event.shiftKey
                              )
                                return;
                              event.preventDefault();
                              const destination = deliveryTaskDestination(
                                params,
                                task.id,
                              );
                              requestAction(() => {
                                onOpenTask(task);
                                setParams(destination.split('?')[1]);
                              });
                            }}
                          >
                            {task.title}
                          </Link>
                        </strong>
                        <StyledTaskContext>
                          <span>{task.projectName}</span>
                          <span>{task.service}</span>
                        </StyledTaskContext>
                      </div>
                      <div data-task-owner>
                        <small>
                          <Trans>Assignee</Trans>
                        </small>
                        <span>
                          {task.assigneeName ?? t`Assignee unavailable`}
                        </span>
                      </div>
                      <div>
                        {task.scheduledDate && (
                          <small>{t`Scheduled ${task.scheduledDate}`}</small>
                        )}
                        {task.dueAt ? (
                          <small>{t`Due ${new Date(task.dueAt).toLocaleString(undefined, { timeZone: snapshot.timezone, timeZoneName: 'short' })}`}</small>
                        ) : (
                          !task.scheduledDate && (
                            <small>
                              <Trans>Timing not set</Trans>
                            </small>
                          )
                        )}
                        {task.priority === 'HIGH' && (
                          <small>
                            <Trans>High priority</Trans>
                          </small>
                        )}
                      </div>
                      <div data-task-status>
                        <StyledDeliveryBadge data-state={task.state}>
                          {labels.state(task.state)}
                        </StyledDeliveryBadge>
                        <small>{labels.next(task.state)}</small>
                      </div>
                    </StyledTaskContent>
                    <StyledTaskSupporting>
                      {task.checklistDone != null &&
                      task.checklistTotal != null ? (
                        task.checklistTotal > 0 && (
                          <StyledChecklist>
                            <progress
                              aria-label={t`Custom checklist progress for ${task.title}`}
                              value={task.checklistDone}
                              max={task.checklistTotal}
                            />
                            <small>{t`${task.checklistDone}/${task.checklistTotal} custom checklist items`}</small>
                          </StyledChecklist>
                        )
                      ) : (
                        <small>
                          <Trans>Checklist progress unavailable</Trans>
                        </small>
                      )}
                      {task.state === 'BLOCKED' && task.blockerPreview && (
                        <p>
                          {task.blockerPreview}
                          {task.blockerTruncated ? '…' : ''}
                        </p>
                      )}
                      {task.state === 'APPROVED' && (
                        <small>
                          <Trans>
                            Internally approved; client delivery and fulfilment
                            remain separate.
                          </Trans>
                        </small>
                      )}
                      {task.warnings.length > 0 && (
                        <details>
                          <summary>
                            <Trans>Task information needs review</Trans>
                          </summary>
                          {task.warnings.map((code) => (
                            <p key={code}>{labels.warning(code)}</p>
                          ))}
                        </details>
                      )}
                    </StyledTaskSupporting>
                  </TaskContainer>
                ))}
            </Cards>
            {board &&
              !snapshot.items.some((task) => groupFor(task) === group) && (
                <small>
                  <Trans>No tasks from this state on this page.</Trans>
                </small>
              )}
          </section>
        ))}
      </Columns>
      {!snapshot.items.length && (
        <StyledDeliveryCard>
          <h2>
            {snapshot.overview.totalCount === 0
              ? t`No work assigned yet`
              : snapshot.totalCount === 0
                ? t`No matching tasks`
                : t`No tasks on this page`}
          </h2>
          <p>
            {snapshot.overview.totalCount === 0
              ? t`Assigned work will appear here with its owner, due date and next step.`
              : snapshot.totalCount === 0
                ? t`Change or clear your filters to see more work.`
                : t`Return to the first page to see the current tasks.`}
          </p>
        </StyledDeliveryCard>
      )}
      <StyledCountDetails>
        <summary>
          <Trans>Counts across this selection</Trans>
        </summary>
        <small>{t`Calendar ${snapshot.timezone} · Today ${snapshot.businessDate}`}</small>
        <small>
          {t`Checked at`}:{' '}
          {new Date(snapshot.observedAt).toLocaleString(undefined, {
            timeZone: 'UTC',
          })}{' '}
          UTC{' '}
          {snapshot.pageReferenceAt !== snapshot.observedAt && (
            <>
              {' '}
              · {t`Page calendar reference`}:{' '}
              {new Date(snapshot.pageReferenceAt).toLocaleString(undefined, {
                timeZone: 'UTC',
              })}{' '}
              UTC
            </>
          )}
        </small>
        {snapshot.byWorkGroup.map((count) => (
          <p key={count.key}>
            {labels.group(count.key)}: {count.count}
          </p>
        ))}
      </StyledCountDetails>
      <nav aria-label={t`Task pages`}>
        <StyledDeliveryRow>
          {params.has('tasksAfter') && (
            <Link to={taskPageDestination(params, { tasksAfter: null })}>
              <Trans>First tasks page</Trans>
            </Link>
          )}
          {snapshot.nextCursor && (
            <Link
              to={taskPageDestination(params, {
                tasksAfter: snapshot.nextCursor,
              })}
            >
              <Trans>Next tasks page</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </nav>
    </StyledDeliveryStack>
  );
};

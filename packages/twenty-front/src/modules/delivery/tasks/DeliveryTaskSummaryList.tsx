import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
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
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
  StyledDeliveryBoard,
} from '@/delivery/deliveryStyles';
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
  const Cards = board ? StyledDeliveryStack : StyledDeliveryGrid;
  return (
    <StyledDeliveryStack>
      <strong>{t`Tasks in this selection: ${snapshot.totalCount}`}</strong>
      <small>{t`Showing ${snapshot.items.length} tasks on this page`}</small>
      <details>
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
      </details>
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
            <h2>{groupLabel(group)}</h2>
            <small>
              <Trans>On this page</Trans>:{' '}
              {snapshot.items.filter((task) => groupFor(task) === group).length}{' '}
              · <Trans>In this selection</Trans>:{' '}
              {fullCount(group) ?? t`Count unavailable`}
            </small>
            <Cards>
              {snapshot.items
                .filter((task) => groupFor(task) === group)
                .map((task) => (
                  <StyledDeliveryCard key={task.id} aria-label={task.title}>
                    <StyledDeliveryStack>
                      <StyledDeliveryRow>
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
                        <StyledDeliveryBadge data-state={task.state}>
                          {labels.state(task.state)}
                        </StyledDeliveryBadge>
                      </StyledDeliveryRow>
                      <small>
                        {task.projectName} · {task.service} ·{' '}
                        {task.assigneeName ?? t`Assignee unavailable`}
                      </small>
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
                      <small>{labels.next(task.state)}</small>
                      {task.checklistDone != null &&
                      task.checklistTotal != null ? (
                        task.checklistTotal > 0 && (
                          <>
                            <progress
                              aria-label={t`Custom checklist progress for ${task.title}`}
                              value={task.checklistDone}
                              max={task.checklistTotal}
                            />
                            <small>{t`${task.checklistDone}/${task.checklistTotal} custom checklist items`}</small>
                          </>
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
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
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
        <p>
          <Trans>
            No tasks on this page. Adjust your filters or return to the first
            page.
          </Trans>
        </p>
      )}
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

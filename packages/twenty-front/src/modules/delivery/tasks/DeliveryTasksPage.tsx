import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { styled } from '@linaria/react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useNavigationDrawerExpanded } from '@/navigation/hooks/useNavigationDrawerExpanded';
import { NavigationDrawerCollapseButton } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton';
import { useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import { useDeliveryNavigationPreferences } from '@/delivery/navigation/useDeliveryNavigationPreferences';
import { DeliveryNavigationPreferences } from '@/delivery/navigation/DeliveryNavigationPreferences';
import { getDeliveryEntryView } from '@/delivery/navigation/delivery-navigation-preferences';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { DeliveryTaskForm } from '@/delivery/DeliveryTaskForm';
import { DeliveryTaskDetail } from '@/delivery/DeliveryTaskDetail';
import { DeliveryTaskJourney } from '@/delivery/lifecycle/DeliveryTaskJourney';
import { useTaskReview } from '@/delivery/reviews/useTaskReview';
import { DeliveryReviewQueue } from '@/delivery/reviews/DeliveryReviewQueue';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { useDeliveryTasks } from '@/delivery/tasks/useDeliveryTasks';
import {
  taskListInput,
  taskPageDestination,
  getPlannerView,
} from '@/delivery/tasks/task-navigation';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import { DeliveryTaskSummaryList } from '@/delivery/tasks/DeliveryTaskSummaryList';
import { DeliveryTaskFilters } from '@/delivery/tasks/DeliveryTaskFilters';
import { DeliveryTasksToday } from '@/delivery/tasks/DeliveryTasksToday';
import { DeliveryTaskAssignmentRead } from '@/delivery/tasks/DeliveryTaskAssignmentRead';
import { claimTaskApprovalCelebration } from '@/delivery/tasks/task-approval-celebration';
import { DeliveryPlannerCapacity } from '@/delivery/capacity/read/DeliveryPlannerCapacity';
import { capacityCalendarDate } from '@/delivery/capacity/read/capacity-read-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCanvas,
  StyledDeliveryCard,
  StyledDeliveryDrawer,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
const StyledTaskReadBoundary = styled.fieldset`
  border: 0;
  display: contents;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
const StyledPlannerNavigation = styled.nav`
  align-self: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
  a {
    align-items: center;
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 9px;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    display: flex;
    font-weight: 500;
    min-height: 44px;
    padding: 10px 14px;
    text-decoration: none;
  }
  a[aria-current='page'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
    font-weight: 600;
  }
`;
export const DeliveryTasksPage = () => {
  const { t } = useLingui();
  const labels = useTaskLabels();
  const [params, setParams] = useSearchParams();
  const reviewView = params.get('view') === 'reviews';
  const input = reviewView ? null : taskListInput(params);
  const selectedId = params.get('task');
  const plannerView = getPlannerView(params);
  const capacityView =
    params.get('view') === 'planner' && plannerView === 'capacity';
  const state = useDeliveryTasks(input, selectedId, {
    listEnabled: !capacityView && !reviewView,
    reviewView,
  });
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  useLayoutEffect(() => {
    if (state.taskUnavailable || state.sourceUnavailable)
      cancelPendingNavigation();
  }, [state.taskUnavailable, state.sourceUnavailable, cancelPendingNavigation]);
  const context = state.context ?? state.retainedContext;
  const actor = context?.actor ?? {
    memberId: '',
    isManager: false,
    isAdmin: false,
  };
  const groups = useDeliveryNavigation(actor);
  const personalNavigation = useDeliveryNavigationPreferences(actor, groups);
  const view = getDeliveryEntryView(
    params,
    personalNavigation.preferences.startView,
  );
  const page = groups
    .flatMap((group) => group.items)
    .find((item) => item.view === view);
  const mobile = useIsMobile();
  const expanded = useNavigationDrawerExpanded();
  const [creating, setCreating] = useState(false);
  const [createVersion, setCreateVersion] = useState(0);
  const [celebration, setCelebration] = useState<{
    memberId: string;
    taskId: string;
    submissionVersion: number;
    show: boolean;
  } | null>(null);
  const celebrationShown = useCallback(() => setCelebration(null), []);
  const focusRecovery = useCallback(
    (button: HTMLButtonElement | null) => button?.focus(),
    [],
  );
  // oxlint-disable-next-line twenty/no-state-useref -- These refs restore lost focus only after an explicit drawer close.
  const taskPage = useRef<HTMLFieldSetElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- A closed recovery opener may no longer exist, so retain its logical task target.
  const closedTask = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (creating || selectedId !== null || closedTask.current === undefined)
      return;
    const taskId = closedTask.current;
    closedTask.current = undefined;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement
    )
      return;
    const target = taskId
      ? Array.from(
          taskPage.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ??
            [],
        ).find(
          (link) =>
            new URLSearchParams(link.search).get('task') === taskId &&
            !link.closest('[hidden], [inert]'),
        )
      : null;
    const heading = Array.from(
      taskPage.current?.parentElement?.querySelectorAll<HTMLHeadingElement>(
        'h1',
      ) ?? [],
    ).find((element) => !element.closest('[hidden], [inert]'));
    (target ?? heading)?.focus();
  }, [creating, selectedId]);
  if (
    creating &&
    (state.sourceUnavailable ||
      (state.permission.ready && !state.permission.manager))
  )
    setCreating(false);
  const task = state.detail ?? state.retainedDetail;
  const panel = params.get('panel') ?? 'task';
  const update = (changes: Record<string, string | null>) =>
    setParams(taskPageDestination(params, changes).split('?')[1]);
  const taskReview = useTaskReview({
    taskId: task?.id ?? '',
    taskRevision: task?.revision ?? 0,
    enabled: state.detailVerified && !creating,
    onChanged: state.refresh,
    onUnavailable: state.invalidateDetail,
  });
  const close = () =>
    requestAction(() => {
      closedTask.current = selectedId;
      setCreating(false);
      update(deliveryTaskSelection(null));
    });
  const clearFilters = () =>
    requestAction(() =>
      update({
        search: null,
        member: null,
        project: null,
        service: null,
        from: null,
        through: null,
        attention: null,
        status: null,
        tasksAfter: null,
        taskTimezone: input ? params.get('taskTimezone') : null,
      }),
    );
  const retry = () => {
    void state.refresh();
    if (!state.permission.ready)
      void state.permission.refetch().catch(() => undefined);
  };
  const domain =
    panel === 'creative'
      ? {
          view: 'creative',
          label: t`Open creative production`,
          text: t`Continue this task’s brief, assets, shots and production review in Creative studio.`,
        }
      : panel === 'operations'
        ? {
            view: 'operations',
            label: t`Open delivery and reminders`,
            text: t`Continue this task’s messages, client delivery and fulfilment in Delivery & reminders.`,
          }
        : panel === 'agents'
          ? {
              view: 'agents',
              label: t`Open task assistants`,
              text: t`Continue this task’s assistant instructions and run history in AI assistants.`,
            }
          : null;
  const reviewAllowed = hasOtogrowCapability(
    state.permission.access?.capabilities ?? [],
    'delivery.review',
  );
  if (!params.size && personalNavigation.ready)
    return (
      <Navigate
        replace
        to={`/delivery?view=${personalNavigation.preferences.startView}`}
      />
    );
  if (
    state.permission.ready &&
    ((view === 'planner' && !state.permission.manager) ||
      (reviewView && !reviewAllowed))
  )
    return (
      <PageContainer>
        <PageBody>
          <StyledDeliveryCard>
            <h1 tabIndex={-1}>
              <Trans>Workspace unavailable</Trans>
            </h1>
            <p>
              {reviewView ? (
                <Trans>
                  A current delivery review role is required to open Approvals.
                </Trans>
              ) : (
                <Trans>
                  Current management access is required to view team planning.
                </Trans>
              )}
            </p>
            <Link
              to={taskPageDestination(params, {
                ...deliveryTaskSelection(null),
                view: 'home',
                project: null,
                member: null,
                tasksAfter: null,
              })}
            >
              <Trans>Go to Today</Trans>
            </Link>
          </StyledDeliveryCard>
        </PageBody>
      </PageContainer>
    );
  return (
    <PageContainer>
      <PageBody>
        {!state.contextVerified && (
          <StyledDeliveryStack>
            <h1>
              <Trans>Otogrow workspace</Trans>
            </h1>
            <p role={state.contextQuery.error ? 'alert' : 'status'}>
              {state.contextUnavailable
                ? t`Current task access is unavailable. Private drafts were cleared. Check workspace access before reopening your work.`
                : context
                  ? t`Current workspace access could not be verified. Saved information is hidden and your draft is kept.`
                  : state.contextQuery.error || state.permission.error
                    ? t`Current workspace access could not be verified. Retry to load your work.`
                    : t`Checking workspace access…`}
            </p>
            <StyledDeliveryButton
              ref={state.contextUnavailable ? focusRecovery : undefined}
              onClick={retry}
            >
              <Trans>Retry workspace access</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        )}
        {context && (
          <>
            <StyledTaskReadBoundary
              ref={taskPage}
              key={state.permission.scope}
              hidden={!state.contextVerified}
              disabled={!state.contextVerified}
              inert={!state.contextVerified || undefined}
              aria-hidden={!state.contextVerified || undefined}
            >
              <StyledDeliveryCanvas>
                <StyledDeliveryStack>
                  <StyledDeliveryRow>
                    <StyledDeliveryRow>
                      {!expanded && (
                        <NavigationDrawerCollapseButton direction="right" />
                      )}
                      <div>
                        <h1 tabIndex={-1}>{page?.label ?? t`My tasks`}</h1>
                        <p>{page?.description}</p>
                      </div>
                    </StyledDeliveryRow>
                    <StyledDeliveryRow>
                      {state.permission.manager && (
                        <StyledDeliveryButton
                          data-primary="true"
                          onClick={() =>
                            requestAction(() => {
                              if (!context.projects.length) {
                                update({
                                  ...deliveryTaskSelection(null),
                                  view: 'team',
                                });
                                return;
                              }
                              update(deliveryTaskSelection(null));
                              setCreating(true);
                              setCreateVersion((current) => current + 1);
                            })
                          }
                        >
                          {context.projects.length
                            ? t`New task`
                            : t`Set up first project`}
                        </StyledDeliveryButton>
                      )}
                      <StyledDeliveryButton
                        disabled={state.busy}
                        onClick={retry}
                      >
                        <Trans>Refresh page</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryRow>
                  </StyledDeliveryRow>
                  <DeliveryNavigationPreferences
                    key={personalNavigation.scope}
                    personalNavigation={personalNavigation}
                  />
                  {mobile && (
                    <label>
                      <Trans>Go to</Trans>
                      <select
                        aria-label={t`Go to workspace`}
                        value={view}
                        onChange={(event) => {
                          const nextView = event.target.value;
                          requestAction(() =>
                            update({
                              ...deliveryTaskSelection(null),
                              view: nextView,
                              tasksAfter: null,
                            }),
                          );
                        }}
                      >
                        {groups.map((group) => (
                          <optgroup key={group.id} label={group.label}>
                            {group.items.map((item) => (
                              <option key={item.view} value={item.view}>
                                {item.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  )}
                  {state.error && <p role="alert">{state.error}</p>}
                  {state.message && (
                    <p role="status">
                      {state.message}
                      {state.receipt && (
                        <>
                          {' '}
                          <Link
                            to={taskPageDestination(params, {
                              ...deliveryTaskSelection(state.receipt.taskId),
                              view,
                            })}
                          >
                            <Trans>Open saved task</Trans>
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                  {view === 'planner' && (
                    <StyledPlannerNavigation aria-label={t`Planner views`}>
                      <Link
                        aria-current={!capacityView ? 'page' : undefined}
                        to={taskPageDestination(params, {
                          plannerView: 'tasks',
                        })}
                      >
                        <Trans>Tasks</Trans>
                      </Link>
                      <Link
                        aria-current={capacityView ? 'page' : undefined}
                        to={taskPageDestination(params, {
                          plannerView: 'capacity',
                        })}
                      >
                        <Trans>Team workload</Trans>
                      </Link>
                    </StyledPlannerNavigation>
                  )}
                  {reviewView ? (
                    <DeliveryReviewQueue
                      enabled={state.contextVerified && reviewAllowed}
                      readScope={state.readScope}
                    />
                  ) : capacityView ? (
                    <DeliveryPlannerCapacity
                      context={context}
                      enabled={
                        state.contextVerified && state.permission.manager
                      }
                      readScope={state.readScope}
                      businessDate={capacityCalendarDate(
                        context.observedAt,
                        input?.timezone ?? params.get('taskTimezone') ?? 'UTC',
                      )}
                      timezone={
                        input?.timezone ?? params.get('taskTimezone') ?? 'UTC'
                      }
                    />
                  ) : (
                    <>
                      {!input && (
                        <p role="alert">
                          <Trans>
                            These task filters or calendar settings are invalid.
                            Clear the filters or choose a valid calendar.
                          </Trans>
                        </p>
                      )}
                      <DeliveryTaskFilters
                        context={context}
                        snapshot={state.list}
                        onClear={clearFilters}
                        timezone={
                          input?.timezone ?? params.get('taskTimezone') ?? 'UTC'
                        }
                      />
                      {view === 'planner' && (
                        <StyledDeliveryButton
                          aria-pressed={params.get('layout') === 'board'}
                          onClick={() =>
                            requestAction(() =>
                              update({
                                layout:
                                  params.get('layout') === 'board'
                                    ? null
                                    : 'board',
                              }),
                            )
                          }
                        >
                          {params.get('layout') === 'board'
                            ? t`List view`
                            : t`Board view`}
                        </StyledDeliveryButton>
                      )}
                      {view === 'home' && state.list && (
                        <DeliveryTasksToday
                          snapshot={state.list}
                          manager={actor.isManager}
                        />
                      )}
                      {state.list ? (
                        <DeliveryTaskSummaryList
                          snapshot={state.list}
                          board={
                            view === 'planner' &&
                            params.get('layout') === 'board'
                          }
                          onOpenTask={(summary) => {
                            const show = claimTaskApprovalCelebration({
                              memberId: actor.memberId,
                              taskId: summary.id,
                              assigneeId: summary.assigneeId,
                              state: summary.state,
                              submissionVersion:
                                summary.review.submissionVersion,
                            });
                            setCelebration(
                              summary.review.submissionVersion != null
                                ? {
                                    memberId: actor.memberId,
                                    taskId: summary.id,
                                    submissionVersion:
                                      summary.review.submissionVersion,
                                    show,
                                  }
                                : null,
                            );
                          }}
                        />
                      ) : (
                        <StyledDeliveryCard>
                          <p role={state.listQuery.error ? 'alert' : 'status'}>
                            <Trans>
                              Current tasks could not be verified. Your open
                              draft is kept.
                            </Trans>
                          </p>
                          <StyledDeliveryButton
                            disabled={state.listQuery.loading || !input}
                            onClick={() =>
                              void state.listQuery
                                .refetch()
                                .catch(() => undefined)
                            }
                          >
                            <Trans>Retry tasks</Trans>
                          </StyledDeliveryButton>
                          {params.has('tasksAfter') && (
                            <Link
                              to={taskPageDestination(params, {
                                tasksAfter: null,
                              })}
                            >
                              <Trans>First tasks page</Trans>
                            </Link>
                          )}
                        </StyledDeliveryCard>
                      )}
                    </>
                  )}
                  {selectedId && !state.detailVerified && (
                    <StyledDeliveryCard>
                      <p
                        role={
                          state.detailQuery.error || !state.validSelection
                            ? 'alert'
                            : 'status'
                        }
                      >
                        {state.taskUnavailable ? (
                          <Trans>
                            This task is unavailable under your current access.
                            Private drafts were cleared. Check current access
                            before reopening.
                          </Trans>
                        ) : state.detailQuery.loading ? (
                          <Trans>Loading requested task…</Trans>
                        ) : (
                          <Trans>
                            The requested task could not be verified. No other
                            task has been substituted; your draft is kept.
                          </Trans>
                        )}
                      </p>
                      <StyledDeliveryRow>
                        <StyledDeliveryButton
                          ref={
                            state.taskUnavailable ? focusRecovery : undefined
                          }
                          disabled={
                            !state.validSelection || state.detailQuery.loading
                          }
                          onClick={() => void state.retryDetail()}
                        >
                          {state.taskUnavailable ? (
                            <Trans>Check current task access</Trans>
                          ) : (
                            <Trans>Retry requested task</Trans>
                          )}
                        </StyledDeliveryButton>
                        <StyledDeliveryButton onClick={close}>
                          <Trans>Dismiss task link</Trans>
                        </StyledDeliveryButton>
                      </StyledDeliveryRow>
                    </StyledDeliveryCard>
                  )}
                </StyledDeliveryStack>
              </StyledDeliveryCanvas>
            </StyledTaskReadBoundary>
            {(creating || task) && (
              <StyledDeliveryDrawer
                aria-label={
                  creating
                    ? t`Create task`
                    : state.detailVerified
                      ? task?.title
                      : t`Task details`
                }
                ref={(dialog) => {
                  if (dialog && !dialog.open) dialog.showModal();
                }}
                onCancel={(event) => {
                  event.preventDefault();
                  close();
                }}
              >
                <StyledDeliveryCanvas>
                  <StyledDeliveryStack>
                    <StyledDeliveryRow>
                      <h2>{creating ? t`New task` : t`Task details`}</h2>
                      <StyledDeliveryButton onClick={close}>
                        <Trans>Close</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryRow>
                    {!state.contextVerified && (
                      <>
                        <p role="status">
                          <Trans>
                            Current workspace access could not be verified.
                            Saved information is hidden and your draft is kept.
                          </Trans>
                        </p>
                        <StyledDeliveryButton
                          ref={focusRecovery}
                          onClick={retry}
                        >
                          <Trans>Retry workspace access</Trans>
                        </StyledDeliveryButton>
                      </>
                    )}
                    {state.contextVerified && state.error && (
                      <p role="alert">{state.error}</p>
                    )}
                    {creating ? (
                      <>
                        <StyledTaskReadBoundary
                          hidden={
                            !state.contextVerified || !state.permission.manager
                          }
                          disabled={
                            !state.contextVerified ||
                            !state.permission.manager ||
                            state.busy
                          }
                        >
                          <DeliveryTaskForm
                            key={`${createVersion}:${capacityView}`}
                            workspace={context}
                            run={(value) =>
                              state.run(value, `create:${createVersion}`)
                            }
                            submitDisabled={
                              state.unknownCreate === `create:${createVersion}`
                            }
                            saveFailureMessage={
                              state.unknownCreate === `create:${createVersion}`
                                ? t`The create request is unconfirmed. Check new work before starting another request; do not submit this draft again.`
                                : undefined
                            }
                            busy={state.busy || !state.permission.manager}
                            onSaved={() => setCreating(false)}
                          />
                        </StyledTaskReadBoundary>
                        {state.contextVerified &&
                          state.unknownCreate === `create:${createVersion}` && (
                            <StyledDeliveryButton
                              onClick={() =>
                                requestAction(() => {
                                  setCreating(false);
                                  update({
                                    ...deliveryTaskSelection(null),
                                    view: 'home',
                                    search: null,
                                    project: null,
                                    member: null,
                                    service: null,
                                    status: null,
                                    from: null,
                                    through: null,
                                    attention: null,
                                    tasksAfter: null,
                                  });
                                  void state.refresh();
                                })
                              }
                            >
                              <Trans>
                                Check new work before another request
                              </Trans>
                            </StyledDeliveryButton>
                          )}
                      </>
                    ) : (
                      task && (
                        <>
                          {!state.detailVerified && (
                            <>
                              <p role="status">
                                <Trans>
                                  Current task access could not be verified.
                                  Saved evidence is hidden and your draft is
                                  kept.
                                </Trans>
                              </p>
                              <StyledDeliveryButton
                                onClick={() => void state.retryDetail()}
                              >
                                <Trans>Retry current task</Trans>
                              </StyledDeliveryButton>
                            </>
                          )}
                          <StyledTaskReadBoundary
                            hidden={!state.detailVerified}
                            disabled={!state.detailVerified || state.busy}
                            inert={!state.detailVerified || undefined}
                            aria-hidden={!state.detailVerified || undefined}
                          >
                            <DeliveryTaskAssignmentRead
                              key={`${task.id}:${task.assigneeId}:${task.details.assignmentAt ?? ''}`}
                              taskId={task.id}
                              assignmentKey={`${task.assigneeId}:${task.details.assignmentAt ?? 'legacy'}`}
                              scope={state.permission.scope}
                              identity={context}
                              enabled={
                                state.detailVerified &&
                                task.assigneeId === context.actor.memberId
                              }
                            />
                            <DeliveryTaskJourney
                              task={task}
                              workspace={context}
                              review={taskReview.data}
                              onOpenPanel={(nextPanel) =>
                                requestAction(() =>
                                  update({
                                    panel:
                                      nextPanel === 'task' ? null : nextPanel,
                                  }),
                                )
                              }
                            />
                            <StyledDeliveryRow>
                              {[
                                {
                                  id: 'task',
                                  label: t`Task and final approval`,
                                },
                                {
                                  id: 'creative',
                                  label: t`Creative production`,
                                },
                                {
                                  id: 'operations',
                                  label: t`Delivery and messages`,
                                },
                                { id: 'agents', label: t`Text assistants` },
                              ].map((item) => (
                                <StyledDeliveryButton
                                  key={item.id}
                                  aria-pressed={panel === item.id}
                                  onClick={() =>
                                    requestAction(() =>
                                      update({
                                        panel:
                                          item.id === 'task' ? null : item.id,
                                      }),
                                    )
                                  }
                                >
                                  {item.label}
                                </StyledDeliveryButton>
                              ))}
                            </StyledDeliveryRow>
                            {domain ? (
                              <StyledDeliveryCard>
                                <p>{domain.text}</p>
                                <Link
                                  to={taskPageDestination(params, {
                                    view: domain.view,
                                    task: task.id,
                                    panel,
                                  })}
                                >
                                  {domain.label}
                                </Link>
                              </StyledDeliveryCard>
                            ) : (
                              <DeliveryTaskDetail
                                key={`${task.id}:${capacityView}`}
                                task={task}
                                workspace={context}
                                run={state.run}
                                reviewController={taskReview}
                                onUnavailable={state.invalidateDetail}
                                busy={state.busy || !state.detailVerified}
                                onChanged={state.refresh}
                                stateLabel={labels.state}
                                celebrateApproval={
                                  celebration?.show === true &&
                                  celebration.memberId === actor.memberId &&
                                  celebration.taskId === task.id &&
                                  celebration.submissionVersion ===
                                    task.details.submissions.at(-1)?.version &&
                                  task.assigneeId === actor.memberId &&
                                  task.details.state === 'APPROVED'
                                }
                                onCelebrationShown={celebrationShown}
                              />
                            )}
                          </StyledTaskReadBoundary>
                        </>
                      )
                    )}
                  </StyledDeliveryStack>
                </StyledDeliveryCanvas>
              </StyledDeliveryDrawer>
            )}
          </>
        )}
      </PageBody>
    </PageContainer>
  );
};

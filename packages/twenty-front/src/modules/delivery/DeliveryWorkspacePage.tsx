import { DeliveryBusiness } from '@/delivery/DeliveryBusiness';
import { DeliveryClients } from '@/delivery/DeliveryClients';
import { DeliveryOperations } from '@/delivery/DeliveryOperations';
import { DeliveryCreative } from '@/delivery/DeliveryCreative';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { DeliveryTaskForm } from '@/delivery/DeliveryTaskForm';
import { DeliveryTaskDetail } from '@/delivery/DeliveryTaskDetail';
import { DeliveryTeam } from '@/delivery/DeliveryTeam';
import { DeliveryAgents } from '@/delivery/DeliveryAgents';
import {
  type DeliveryWorkspace,
  type DeliveryTask,
} from '@/delivery/delivery.types';
import {
  StyledDeliveryBadge,
  StyledDeliveryBoard,
  StyledDeliveryButton,
  StyledDeliveryCanvas,
  StyledDeliveryCard,
  StyledDeliveryDrawer,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
  StyledDeliveryTaskButton,
} from '@/delivery/deliveryStyles';

const GET_DELIVERY_WORKSPACE = gql`
  query DeliveryWorkspace {
    deliveryWorkspace
  }
`;
const CHANGE_DELIVERY_WORKSPACE = gql`
  mutation ChangeDeliveryWorkspace($input: JSON!) {
    changeDeliveryWorkspace(input: $input)
  }
`;
const DELIVERY_STATES = [
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
];

export const DeliveryWorkspacePage = () => {
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'home';
  const query = useQuery<{ deliveryWorkspace: DeliveryWorkspace }>(
    GET_DELIVERY_WORKSPACE,
    { fetchPolicy: 'network-only' },
  );
  const [mutate, mutation] = useMutation<{
    changeDeliveryWorkspace: DeliveryWorkspace;
  }>(CHANGE_DELIVERY_WORKSPACE);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [dateEndFilter, setDateEndFilter] = useState('');
  const [approvalCelebration, setApprovalCelebration] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [board, setBoard] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    params.get('task'),
  );
  const [markSeen] = useMutation(gql`
    mutation SeeDeliveryTask($input: JSON!) {
      changeDeliveryOperations(input: $input)
    }
  `);
  useEffect(() => {
    if (!selectedId) return;
    void markSeen({
      variables: { input: { action: 'seen', taskId: selectedId } },
    }).catch(() =>
      setError(
        t`Could not mark this task as seen. Acknowledge it in Follow-through.`,
      ),
    );
  }, [selectedId, markSeen, t]);
  const [creating, setCreating] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState('task');
  const workspace = query.data?.deliveryWorkspace;
  const stateLabels: Record<string, string> = {
    PLANNED: t`Planned`,
    IN_PROGRESS: t`In progress`,
    BLOCKED: t`Blocked`,
    IN_REVIEW: t`In review`,
    CHANGES_REQUESTED: t`Changes requested`,
    APPROVED: t`Approved`,
    CREATED: t`Created`,
    UPDATED: t`Updated`,
    SUBMITTED: t`Submitted`,
    PROGRESS: t`Progress updated`,
  };
  const stateLabel = (state: string) => stateLabels[state] ?? state;
  const run = async (input: Record<string, unknown>): Promise<boolean> => {
    setError('');
    try {
      const result = await mutate({ variables: { input } });
      if (result.data)
        query.client.writeQuery({
          query: GET_DELIVERY_WORKSPACE,
          data: { deliveryWorkspace: result.data.changeDeliveryWorkspace },
        });
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to save. Please try again.`,
      );
      return false;
    }
  };
  const selectView = (nextView: string, status = '', attention = '') => {
    setParams({ view: nextView });
    setStatusFilter(status);
    setAttentionFilter(attention);
    setSearch('');
    setMemberFilter('');
    setProjectFilter('');
    setServiceFilter('');
    setDateFilter('');
    setDateEndFilter('');
  };
  if (!workspace)
    return (
      <PageContainer>
        <PageBody>
          <StyledDeliveryCanvas>
            <StyledDeliveryStack>
              <h1>
                <Trans>Otogrow workspace</Trans>
              </h1>
              {query.error ? (
                <>
                  <p role="alert">{query.error.message}</p>
                  <StyledDeliveryButton onClick={() => void query.refetch()}>
                    <Trans>Try again</Trans>
                  </StyledDeliveryButton>
                </>
              ) : (
                <p role="status">
                  <Trans>Loading your work…</Trans>
                </p>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCanvas>
        </PageBody>
      </PageContainer>
    );
  const selectedTask = workspace.tasks.find((task) => task.id === selectedId);
  const today = new Date().toLocaleDateString('en-CA');
  const personalTasks = workspace.tasks.filter(
    (task) => task.assigneeId === workspace.actor.memberId,
  );
  const overviewTasks = workspace.actor.isManager
    ? workspace.tasks
    : personalTasks;
  const approvedCount = overviewTasks.filter(
    (task) => task.details.state === 'APPROVED',
  ).length;
  const isDueToday = (task: DeliveryTask) =>
    task.details.state !== 'APPROVED' &&
    (task.details.scheduledDate === today ||
      (task.dueAt !== null &&
        new Date(task.dueAt).toLocaleDateString('en-CA') === today));
  const isOverdue = (task: DeliveryTask) =>
    Boolean(
      task.dueAt &&
      new Date(task.dueAt) < new Date() &&
      task.details.state !== 'APPROVED',
    );
  const overdueCount = overviewTasks.filter(isOverdue).length;
  const reviewCount = overviewTasks.filter(
    (task) => task.details.state === 'IN_REVIEW',
  ).length;
  const filteredTasks = workspace.tasks.filter(
    (task) =>
      (!attentionFilter ||
        (attentionFilter === 'overdue' ? isOverdue(task) : isDueToday(task))) &&
      (view !== 'mine' || task.assigneeId === workspace.actor.memberId) &&
      (view !== 'reviews' || task.details.state === 'IN_REVIEW') &&
      (!memberFilter || task.assigneeId === memberFilter) &&
      (!projectFilter || task.projectId === projectFilter) &&
      (!serviceFilter || task.details.service === serviceFilter) &&
      (!dateFilter ||
        (task.details.scheduledDate !== null &&
          task.details.scheduledDate >= dateFilter &&
          task.details.scheduledDate <= (dateEndFilter || dateFilter))) &&
      (!statusFilter || task.details.state === statusFilter) &&
      task.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const taskCard = (task: DeliveryTask) => {
    const project = workspace.projects.find(
      (candidate) => candidate.id === task.projectId,
    );
    const checklistDone = task.details.checklist.filter(
      (item) => item.done,
    ).length;
    return (
      <StyledDeliveryTaskButton
        key={task.id}
        onClick={() => {
          setSelectedId(task.id);
          setSelectedPanel(view === 'creative' ? 'creative' : 'task');
          const approvalKey = `delivery-approved:${workspace.actor.memberId}:${task.id}:${task.details.submissions.length}`;
          const canCelebrate =
            task.assigneeId === workspace.actor.memberId &&
            task.details.state === 'APPROVED';
          try {
            setApprovalCelebration(
              canCelebrate && !localStorage.getItem(approvalKey),
            );
            if (canCelebrate) localStorage.setItem(approvalKey, 'seen');
          } catch {
            setApprovalCelebration(false);
          }
          setError('');
        }}
      >
        <StyledDeliveryRow>
          <StyledDeliveryBadge data-state={task.details.state}>
            {stateLabel(task.details.state)}
          </StyledDeliveryBadge>
          <small>{task.details.service}</small>
        </StyledDeliveryRow>
        <strong>{task.title}</strong>
        <small>
          {project?.name} ·{' '}
          {
            workspace.members.find((member) => member.id === task.assigneeId)
              ?.name
          }
        </small>
        <small>
          {task.dueAt
            ? `${t`Due`} ${new Date(task.dueAt).toLocaleDateString()}`
            : t`No due date`}
          {task.details.priority === 'HIGH' ? ` · ${t`High priority`}` : ''}
        </small>
        {task.details.checklist.length > 0 && (
          <>
            <progress
              style={{
                width: '100%',
                accentColor: themeCssVariables.color.blue9,
              }}
              aria-label={t`Checklist progress`}
              value={checklistDone}
              max={task.details.checklist.length}
            />
            <small>
              {checklistDone}/{task.details.checklist.length}{' '}
              <Trans>checklist items</Trans>
            </small>
          </>
        )}
      </StyledDeliveryTaskButton>
    );
  };
  return (
    <PageContainer>
      <PageBody>
        <StyledDeliveryCanvas>
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <div>
                <small>
                  <Trans>OTOGROW · DELIVERY</Trans>
                </small>
                <h1>
                  {view === 'clients'
                    ? t`Your clients, clearly connected`
                    : view === 'mine'
                      ? t`Your work, clearly organized`
                      : view === 'reviews'
                        ? t`Ready for your review`
                        : view === 'team'
                          ? t`Your team and projects`
                          : view === 'planner'
                            ? t`Make room for great work`
                            : view === 'creative'
                              ? t`From idea to approved creative`
                              : view === 'operations'
                                ? t`Keep work moving`
                                : view === 'agents'
                                  ? t`Helpful agents, clear human control`
                                  : t`A clear view of what matters`}
                </h1>
                <p>
                  <Trans>
                    Plan the work. Keep the context. Move it forward.
                  </Trans>
                </p>
              </div>
              {workspace.actor.isManager && (
                <StyledDeliveryButton
                  data-primary="true"
                  disabled={!workspace.projects.length}
                  onClick={() => {
                    setCreating(true);
                    setError('');
                  }}
                >
                  <Trans>New task</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
            <StyledDeliveryRow>
              <nav
                aria-label={t`Delivery navigation`}
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
              >
                {[
                  { id: 'home', label: t`Home` },
                  { id: 'mine', label: t`My Work` },
                  { id: 'agents', label: t`Agents` },
                  { id: 'creative', label: t`Creative studio` },
                  { id: 'operations', label: t`Follow-through` },
                  ...(workspace.actor.isManager
                    ? [
                        { id: 'clients', label: t`Clients` },
                        { id: 'planner', label: t`Team Planner` },
                        { id: 'reviews', label: t`Reviews` },
                        { id: 'team', label: t`Team access` },
                      ]
                    : []),
                ].map((item) => (
                  <StyledDeliveryButton
                    key={item.id}
                    aria-current={view === item.id ? 'page' : undefined}
                    onClick={() => selectView(item.id)}
                  >
                    {item.label}
                  </StyledDeliveryButton>
                ))}
                <label>
                  <Trans>Business tools</Trans>
                  <select
                    aria-label={t`Business tools`}
                    value={
                      [
                        'inbox',
                        'ads',
                        'content',
                        'competitors',
                        'development',
                        'finance',
                        'health',
                      ].includes(view)
                        ? view
                        : ''
                    }
                    onChange={(event) => {
                      if (event.target.value) selectView(event.target.value);
                    }}
                  >
                    <option value="">{t`Choose a workspace`}</option>
                    <option value="inbox">{t`Inbox`}</option>
                    <option value="ads">{t`Ads`}</option>
                    <option value="content">{t`Content`}</option>
                    <option value="competitors">{t`Research`}</option>
                    <option value="development">{t`Development`}</option>
                    {workspace.actor.isAdmin && (
                      <>
                        <option value="finance">{t`Finance`}</option>
                        <option value="health">{t`Founder overview`}</option>
                      </>
                    )}
                  </select>
                </label>
              </nav>
              <StyledDeliveryButton
                disabled={query.loading}
                onClick={() => void query.refetch()}
              >
                <Trans>Refresh</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
            {error && !selectedTask && !creating && <p role="alert">{error}</p>}
            {view === 'home' && (
              <>
                <StyledDeliveryGrid>
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <small>
                        <Trans>Due today</Trans>
                      </small>
                      <h1>{overviewTasks.filter(isDueToday).length}</h1>
                      <StyledDeliveryButton
                        onClick={() =>
                          selectView(
                            workspace.actor.isManager ? 'planner' : 'mine',
                            '',
                            'today',
                          )
                        }
                      >
                        <Trans>Open today’s work</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <small>
                        <Trans>Approved work</Trans>
                      </small>
                      <h1>
                        {approvedCount}
                        <small> / {overviewTasks.length}</small>
                      </h1>
                      <progress
                        aria-label={t`Approved deliverables`}
                        value={approvedCount}
                        max={Math.max(overviewTasks.length, 1)}
                      />
                      <small>
                        <Trans>
                          Internal approval · client fulfilment is separate
                        </Trans>
                      </small>
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <small>
                        <Trans>Awaiting review</Trans>
                      </small>
                      <h1>{reviewCount}</h1>
                      <StyledDeliveryButton
                        onClick={() =>
                          selectView(
                            workspace.actor.isManager ? 'reviews' : 'mine',
                            'IN_REVIEW',
                          )
                        }
                      >
                        <Trans>View submissions</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <small>
                        <Trans>Overdue</Trans>
                      </small>
                      <h1>{overdueCount}</h1>
                      <StyledDeliveryButton
                        onClick={() =>
                          selectView(
                            workspace.actor.isManager ? 'planner' : 'mine',
                            '',
                            'overdue',
                          )
                        }
                      >
                        <Trans>See overdue work</Trans>
                      </StyledDeliveryButton>
                      <small>
                        <Trans>Check priorities and unblock your team.</Trans>
                      </small>
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <small>
                        <Trans>Blocked</Trans>
                      </small>
                      <h1>
                        {
                          overviewTasks.filter(
                            (task) => task.details.state === 'BLOCKED',
                          ).length
                        }
                      </h1>
                      <StyledDeliveryButton
                        onClick={() =>
                          selectView(
                            workspace.actor.isManager ? 'planner' : 'mine',
                            'BLOCKED',
                          )
                        }
                      >
                        <Trans>See blockers</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                </StyledDeliveryGrid>
                <StyledDeliveryRow>
                  <h2>
                    <Trans>On your radar</Trans>
                  </h2>
                  <StyledDeliveryButton onClick={() => selectView('mine')}>
                    <Trans>Open My Work</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                <StyledDeliveryGrid>
                  {overviewTasks
                    .filter((task) => task.details.state !== 'APPROVED')
                    .slice(0, 8)
                    .map(taskCard)}
                </StyledDeliveryGrid>
                {!workspace.projects.length && (
                  <StyledDeliveryCard>
                    <StyledDeliveryStack>
                      <h2>
                        <Trans>A fresh start for your delivery team</Trans>
                      </h2>
                      <p>
                        <Trans>
                          Create a project, choose its members, and assign the
                          first piece of work.
                        </Trans>
                      </p>
                      {workspace.actor.isManager ? (
                        <StyledDeliveryButton
                          data-primary="true"
                          onClick={() => selectView('team')}
                        >
                          <Trans>Set up your first project</Trans>
                        </StyledDeliveryButton>
                      ) : (
                        <p>
                          <Trans>Your manager will add you to a project.</Trans>
                        </p>
                      )}
                    </StyledDeliveryStack>
                  </StyledDeliveryCard>
                )}
              </>
            )}
            {view === 'team' && workspace.actor.isManager && (
              <DeliveryTeam
                workspace={workspace}
                run={run}
                busy={mutation.loading}
              />
            )}
            {view === 'clients' && workspace.actor.isManager && (
              <DeliveryClients
                workspace={workspace}
                onChanged={() => query.refetch()}
              />
            )}
            {[
              'inbox',
              'ads',
              'content',
              'competitors',
              'development',
              'finance',
              'health',
            ].includes(view) && (
              <DeliveryBusiness
                key={view}
                view={view}
                workspace={workspace}
                onChanged={() => query.refetch()}
                onOpenTask={(id) => setSelectedId(id)}
              />
            )}
            {view === 'operations' && (
              <DeliveryOperations
                workspace={workspace}
                onChanged={() => query.refetch()}
                onOpenTask={(id) => {
                  setSelectedId(id);
                  setSelectedPanel('operations');
                }}
              />
            )}
            {view === 'agents' && (
              <DeliveryAgents
                workspace={workspace}
                onTaskChanged={() => query.refetch()}
              />
            )}
            {['mine', 'planner', 'reviews', 'creative'].includes(view) && (
              <>
                <StyledDeliveryCard>
                  <StyledDeliveryRow>
                    {attentionFilter && (
                      <StyledDeliveryButton
                        onClick={() => setAttentionFilter('')}
                      >
                        {attentionFilter === 'overdue'
                          ? t`Overdue only · clear`
                          : t`Today only · clear`}
                      </StyledDeliveryButton>
                    )}
                    <label>
                      <Trans>Search</Trans>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t`Find a task`}
                      />
                    </label>
                    <label>
                      <Trans>Project / client</Trans>
                      <select
                        value={projectFilter}
                        onChange={(event) =>
                          setProjectFilter(event.target.value)
                        }
                      >
                        <option value="">{t`All projects`}</option>
                        {workspace.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <Trans>Teammate</Trans>
                      <select
                        value={memberFilter}
                        onChange={(event) =>
                          setMemberFilter(event.target.value)
                        }
                      >
                        <option value="">{t`Everyone`}</option>
                        {workspace.members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <Trans>Service</Trans>
                      <select
                        value={serviceFilter}
                        onChange={(event) =>
                          setServiceFilter(event.target.value)
                        }
                      >
                        <option value="">{t`All services`}</option>
                        {[
                          ...new Set(
                            workspace.tasks.map((task) => task.details.service),
                          ),
                        ]
                          .filter(Boolean)
                          .map((service) => (
                            <option key={service}>{service}</option>
                          ))}
                      </select>
                    </label>
                    <label>
                      <Trans>Scheduled day</Trans>
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(event) => {
                          setDateFilter(event.target.value);
                          setDateEndFilter('');
                        }}
                      />
                    </label>
                    <StyledDeliveryButton
                      onClick={() => {
                        setDateFilter(dateFilter ? '' : today);
                        setDateEndFilter('');
                      }}
                    >
                      {dateFilter ? t`All dates` : t`Today`}
                    </StyledDeliveryButton>
                    <label>
                      <Trans>Through</Trans>
                      <input
                        type="date"
                        min={dateFilter}
                        value={dateEndFilter}
                        onChange={(event) =>
                          setDateEndFilter(event.target.value)
                        }
                      />
                    </label>
                    <StyledDeliveryButton
                      onClick={() => {
                        const end = new Date();
                        end.setDate(end.getDate() + 6);
                        setDateFilter(today);
                        setDateEndFilter(end.toLocaleDateString('en-CA'));
                      }}
                    >{t`Next 7 days`}</StyledDeliveryButton>
                    <label>
                      <Trans>Status</Trans>
                      <select
                        value={statusFilter}
                        onChange={(event) =>
                          setStatusFilter(event.target.value)
                        }
                      >
                        <option value="">{t`All statuses`}</option>
                        {DELIVERY_STATES.map((state) => (
                          <option key={state} value={state}>
                            {stateLabel(state)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <StyledDeliveryButton
                      aria-pressed={board}
                      onClick={() => setBoard(!board)}
                    >
                      {board ? t`List view` : t`Board view`}
                    </StyledDeliveryButton>
                  </StyledDeliveryRow>
                </StyledDeliveryCard>
                {board ? (
                  <StyledDeliveryBoard>
                    {DELIVERY_STATES.map((state) => (
                      <StyledDeliveryStack key={state}>
                        <h3>
                          {stateLabel(state)} ·{' '}
                          {
                            filteredTasks.filter(
                              (task) => task.details.state === state,
                            ).length
                          }
                        </h3>
                        {filteredTasks
                          .filter((task) => task.details.state === state)
                          .map(taskCard)}
                      </StyledDeliveryStack>
                    ))}
                  </StyledDeliveryBoard>
                ) : (
                  <StyledDeliveryGrid>
                    {filteredTasks.map(taskCard)}
                  </StyledDeliveryGrid>
                )}
                {!filteredTasks.length && (
                  <StyledDeliveryCard>
                    <h3>
                      <Trans>No tasks in this view</Trans>
                    </h3>
                    <p>
                      <Trans>
                        Try different filters or ask your manager to assign
                        work.
                      </Trans>
                    </p>
                  </StyledDeliveryCard>
                )}
              </>
            )}
            <small>
              <Trans>
                Your existing client records and sales tools remain available in
                the sidebar.
              </Trans>{' '}
              <Link to="/settings/members">
                <Trans>Manage workspace members</Trans>
              </Link>
            </small>
            {(selectedTask || creating) && (
              <StyledDeliveryDrawer
                aria-label={creating ? t`Create task` : selectedTask?.title}
                ref={(dialog) => {
                  if (dialog && !dialog.open) dialog.showModal();
                }}
                onCancel={() => {
                  setSelectedId(null);
                  setCreating(false);
                }}
              >
                <StyledDeliveryCanvas>
                  <StyledDeliveryStack>
                    <StyledDeliveryRow>
                      <h2>{creating ? t`New task` : t`Task details`}</h2>
                      <StyledDeliveryButton
                        onClick={() => {
                          setSelectedId(null);
                          setCreating(false);
                        }}
                      >
                        <Trans>Close</Trans>
                      </StyledDeliveryButton>
                    </StyledDeliveryRow>
                    {error && <p role="alert">{error}</p>}
                    {creating ? (
                      <DeliveryTaskForm
                        workspace={workspace}
                        run={run}
                        busy={mutation.loading}
                        onSaved={() => setCreating(false)}
                      />
                    ) : (
                      selectedTask && (
                        <>
                          <StyledDeliveryRow>
                            {[
                              { id: 'task', label: t`Task and final approval` },
                              { id: 'creative', label: t`Creative production` },
                              { id: 'agents', label: t`Text assistants` },
                              {
                                id: 'operations',
                                label: t`Delivery and messages`,
                              },
                            ].map((panel) => (
                              <StyledDeliveryButton
                                key={panel.id}
                                aria-pressed={selectedPanel === panel.id}
                                onClick={() => setSelectedPanel(panel.id)}
                              >
                                {panel.label}
                              </StyledDeliveryButton>
                            ))}
                          </StyledDeliveryRow>
                          {selectedPanel === 'task' && (
                            <DeliveryTaskDetail
                              key={selectedTask.id}
                              task={selectedTask}
                              workspace={workspace}
                              run={run}
                              busy={mutation.loading}
                              stateLabel={stateLabel}
                              celebrateApproval={approvalCelebration}
                            />
                          )}
                          {selectedPanel === 'creative' && (
                            <DeliveryCreative
                              task={selectedTask}
                              workspace={workspace}
                              onChanged={() => query.refetch()}
                              onOpenTask={() => setSelectedPanel('task')}
                            />
                          )}
                          {selectedPanel === 'operations' && (
                            <DeliveryOperations
                              task={selectedTask}
                              workspace={workspace}
                              onChanged={() => query.refetch()}
                            />
                          )}
                          {selectedPanel === 'agents' && (
                            <DeliveryAgents
                              key={`agents-${selectedTask.id}`}
                              task={selectedTask}
                              workspace={workspace}
                              onTaskChanged={() => query.refetch()}
                            />
                          )}
                        </>
                      )
                    )}
                  </StyledDeliveryStack>
                </StyledDeliveryCanvas>
              </StyledDeliveryDrawer>
            )}
          </StyledDeliveryStack>
        </StyledDeliveryCanvas>
      </PageBody>
    </PageContainer>
  );
};

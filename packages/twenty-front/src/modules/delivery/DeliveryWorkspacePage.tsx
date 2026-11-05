import { DeliveryCompetitorSourcesPage } from '@/delivery/competitors/DeliveryCompetitorSourcesPage';
import { DeliveryContentPage } from '@/delivery/content/DeliveryContentPage';
import { DeliveryCreativeLearningPage } from '@/delivery/creative/learning/DeliveryCreativeLearningPage';
import { DeliveryInboxPage } from '@/delivery/inbox/workspace/DeliveryInboxPage';
import { DeliveryAdvertisingPage } from '@/delivery/advertising/workbench/DeliveryAdvertisingPage';
import { DeliveryCreativeProductionPage } from '@/delivery/creative/production/DeliveryCreativeProductionPage';
import { DeliverySeoResultsPage } from '@/delivery/seo-results/DeliverySeoResultsPage';
import { DeliveryDevelopmentPage } from '@/delivery/development/DeliveryDevelopmentPage';
import { DeliveryCapacity } from '@/delivery/capacity/DeliveryCapacity';
import { DeliveryTasksPage } from '@/delivery/tasks/DeliveryTasksPage';
import { AtlasMediaPage } from '@/delivery/creative/atlas/AtlasMediaPage';
import { DeliveryClientSetupPage } from '@/delivery/onboarding/DeliveryClientSetupPage';
import { DeliveryAssistantsPage } from '@/delivery/assistants/DeliveryAssistantsPage';
import { DeliveryAssignedReviewsToday } from '@/delivery/reviews/DeliveryAssignedReviewsToday';
import { useTaskReview } from '@/delivery/reviews/useTaskReview';
import {
  DeliveryKnowledge,
  DeliveryKnowledgePage,
} from '@/delivery/knowledge/DeliveryKnowledge';
import { DeliveryTaskJourney } from '@/delivery/lifecycle/DeliveryTaskJourney';
import { DeliveryChat } from '@/delivery/chat/DeliveryChat';
import { DeliveryChatPage } from '@/delivery/operations-pages/DeliveryChatPage';
import { DeliveryCompanyOverviewPage } from '@/delivery/operations-pages/DeliveryCompanyOverviewPage';
import { DeliveryBatches } from '@/delivery/batches/DeliveryBatches';
import { DeliveryWorkflowCatalog } from '@/delivery/workflows/DeliveryWorkflowCatalog';
import { DeliveryMyWorkTask } from '@/delivery/DeliveryMyWorkTask';
import {
  DeliveryDraftGuardProvider,
  useDeliveryDraftGuard,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import { DeliveryBusiness } from '@/delivery/DeliveryBusiness';
import { DeliveryFinance } from '@/delivery/finance/DeliveryFinance';
import { DeliveryFounderExceptions } from '@/delivery/founder/DeliveryFounderExceptions';
import { DeliveryReadiness } from '@/delivery/readiness/DeliveryReadiness';
import { DeliveryMyWorkQueue } from '@/delivery/DeliveryMyWorkQueue';
import { OtogrowActivity } from '@/otogrow-activity/OtogrowActivity';
import { OtogrowActivityPage } from '@/otogrow-activity/OtogrowActivityPage';
import { DeliveryClients } from '@/delivery/DeliveryClients';
import { DeliveryOperations } from '@/delivery/DeliveryOperations';
import { DeliveryCreative } from '@/delivery/DeliveryCreative';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { styled } from '@linaria/react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useDeliveryNavigationPreferences } from '@/delivery/navigation/useDeliveryNavigationPreferences';
import { DeliveryNavigationPreferences } from '@/delivery/navigation/DeliveryNavigationPreferences';
import { getDeliveryEntryView } from '@/delivery/navigation/delivery-navigation-preferences';
import { GET_DELIVERY_WORKSPACE } from '@/delivery/deliveryWorkspaceQuery';
import { useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useNavigationDrawerExpanded } from '@/navigation/hooks/useNavigationDrawerExpanded';
import { NavigationDrawerCollapseButton } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { DeliveryTaskForm } from '@/delivery/DeliveryTaskForm';
import { DeliveryTaskDetail } from '@/delivery/DeliveryTaskDetail';
import { DeliveryTeam } from '@/delivery/DeliveryTeam';
import { DeliveryAgents } from '@/delivery/DeliveryAgents';
import { DeliveryAiWorkspace } from '@/otogrow-ai-budget/DeliveryAiWorkspace';
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
const StyledWorkspaceAccessBoundary = styled.fieldset`
  border: 0;
  display: contents;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;

export const DeliveryWorkspacePage = () => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const view = params.get('view');
  const [legacyBoundary, setLegacyBoundary] = useState({
    denied: false,
    revision: 0,
  });
  const revokeLegacyRead = useCallback(() => {
    setLegacyBoundary((current) =>
      current.denied
        ? current
        : { denied: true, revision: current.revision + 1 },
    );
  }, []);
  const confirmLegacyRead = useCallback(() => {
    setLegacyBoundary((current) =>
      current.denied ? { ...current, denied: false } : current,
    );
  }, []);
  return (
    <DeliveryDraftGuardProvider
      key={`${permission.scope}:${legacyBoundary.revision}`}
    >
      {view === 'ads' &&
      params.get('adView') !== 'legacy' &&
      !params.has('metaReport') &&
      !params.has('businessRecord') ? (
        <DeliveryAdvertisingPage />
      ) : view === 'inbox' &&
        params.get('inboxView') !== 'legacy' &&
        !params.has('businessRecord') ? (
        <DeliveryInboxPage />
      ) : view === 'onboarding' ? (
        <DeliveryClientSetupPage />
      ) : view === 'creative' && params.get('creativeView') === 'learning' ? (
        <DeliveryCreativeLearningPage />
      ) : view === 'creative' && params.get('creativeView') !== 'legacy' ? (
        <DeliveryCreativeProductionPage />
      ) : view === 'development' &&
        params.get('developerView') !== 'legacy' &&
        !params.has('businessRecord') &&
        !params.has('task') ? (
        <DeliveryDevelopmentPage />
      ) : view === 'competitors' &&
        params.get('competitorView') !== 'legacy' &&
        !params.has('businessRecord') &&
        !params.has('task') ? (
        <DeliveryCompetitorSourcesPage />
      ) : view === 'content' &&
        params.get('contentView') !== 'legacy' &&
        !params.has('businessRecord') &&
        !params.has('task') ? (
        <DeliveryContentPage />
      ) : view === 'seo' ? (
        <DeliverySeoResultsPage />
      ) : view === 'knowledge' ? (
        <DeliveryKnowledgePage />
      ) : view === 'chat' && !params.has('task') ? (
        <DeliveryChatPage />
      ) : view === 'health' && !params.has('task') ? (
        <DeliveryCompanyOverviewPage />
      ) : view === 'activity' && !params.has('task') ? (
        <OtogrowActivityPage />
      ) : view === 'agents' && params.get('agentView') === 'media' ? (
        <AtlasMediaPage />
      ) : view === 'agents' && params.get('agentView') !== 'spending' ? (
        <DeliveryAssistantsPage />
      ) : !view || ['home', 'mine', 'planner', 'reviews'].includes(view) ? (
        <DeliveryTasksPage />
      ) : (
        <LegacyDeliveryWorkspacePage
          requiresFreshWorkspace={legacyBoundary.denied}
          onWorkspaceDenied={revokeLegacyRead}
          onWorkspaceVerified={confirmLegacyRead}
        />
      )}
    </DeliveryDraftGuardProvider>
  );
};

type LegacyDeliveryWorkspacePageProps = {
  requiresFreshWorkspace: boolean;
  onWorkspaceDenied: () => void;
  onWorkspaceVerified: () => void;
};
const LegacyDeliveryWorkspacePage = ({
  requiresFreshWorkspace,
  onWorkspaceDenied,
  onWorkspaceVerified,
}: LegacyDeliveryWorkspacePageProps) => {
  const permission = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const explicitView = params.get('view') ?? 'home';
  const query = useQuery<{ deliveryWorkspace: DeliveryWorkspace }>(
    GET_DELIVERY_WORKSPACE,
    { fetchPolicy: 'network-only' },
  );
  const [mutate, mutation] = useMutation<{
    changeDeliveryWorkspace: DeliveryWorkspace;
  }>(CHANGE_DELIVERY_WORKSPACE);
  const [error, setError] = useState('');
  const search = params.get('search') ?? '';
  const memberFilter = params.get('member') ?? '';
  const projectFilter = params.get('project') ?? '';
  const serviceFilter = params.get('service') ?? '';
  const dateFilter = params.get('from') ?? '';
  const dateEndFilter = params.get('through') ?? '';
  const attentionFilter = params.get('attention') ?? '';
  const statusFilter = params.get('status') ?? '';
  const activeFilterCount = [
    search,
    explicitView === 'mine' ? '' : memberFilter,
    projectFilter,
    serviceFilter,
    dateFilter,
    dateEndFilter,
    attentionFilter,
    statusFilter,
  ].filter(Boolean).length;
  const board = params.get('layout') === 'board';
  const selectedId = params.get('task');
  const requestedPanel = params.get('panel') ?? 'task';
  const selectedPanel = ['task', 'creative', 'operations', 'agents'].includes(
    requestedPanel,
  )
    ? requestedPanel
    : 'task';
  const [approvalCelebration, setApprovalCelebration] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isMobile = useIsMobile();
  const isNavigationExpanded = useNavigationDrawerExpanded();
  const updateParams = (
    values: Record<string, string | null>,
    replace = false,
  ) => {
    const nextParams = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => {
      if (value) nextParams.set(key, value);
      else nextParams.delete(key);
    });
    setParams(nextParams, { replace });
  };
  const openTask = (id: string, panel = 'task') => {
    updateParams(deliveryTaskSelection(id, panel));
  };
  const closeTask = () => updateParams(deliveryTaskSelection(null));
  const setSelectedPanel = (panel: string) =>
    updateParams({ panel: panel === 'task' ? null : panel }, true);
  const [markSeen] = useMutation(gql`
    mutation SeeDeliveryTask($input: JSON!) {
      changeDeliveryOperations(input: $input)
    }
  `);
  const candidateWorkspace = query.data?.deliveryWorkspace;
  const canAdminister =
    permission.access?.capabilities.includes('workspace.admin') === true;
  const permittedWorkspace = useMemo(
    () =>
      candidateWorkspace
        ? {
            ...candidateWorkspace,
            actor: {
              ...candidateWorkspace.actor,
              isAdmin: candidateWorkspace.actor.isAdmin && canAdminister,
              isManager:
                candidateWorkspace.actor.isManager && permission.manager,
            },
          }
        : undefined,
    [candidateWorkspace, canAdminister, permission.manager],
  );
  const workspaceVerified = Boolean(
    !query.error &&
    (!requiresFreshWorkspace || !query.loading) &&
    permission.ready &&
    candidateWorkspace &&
    typeof candidateWorkspace.workspaceId === 'string' &&
    typeof candidateWorkspace.memberId === 'string' &&
    typeof candidateWorkspace.userWorkspaceId === 'string' &&
    candidateWorkspace.workspaceId === permission.access?.workspaceId &&
    candidateWorkspace.memberId === permission.access?.memberId &&
    candidateWorkspace.userWorkspaceId === permission.access?.userWorkspaceId &&
    candidateWorkspace.memberId === candidateWorkspace.actor.memberId,
  );
  const workspaceDenied = isOtogrowAccessDenied(query.error);
  useEffect(() => {
    if (workspaceDenied) onWorkspaceDenied();
    else if (workspaceVerified && !query.loading) onWorkspaceVerified();
  }, [
    workspaceDenied,
    workspaceVerified,
    query.loading,
    onWorkspaceDenied,
    onWorkspaceVerified,
  ]);
  const [lastVerifiedWorkspace, setLastVerifiedWorkspace] =
    useState<DeliveryWorkspace>();
  if (workspaceVerified && permittedWorkspace !== lastVerifiedWorkspace)
    setLastVerifiedWorkspace(permittedWorkspace);
  const workspace = workspaceVerified
    ? permittedWorkspace
    : lastVerifiedWorkspace;
  const selectedTask = workspace?.tasks.find((task) => task.id === selectedId);
  const [creating, setCreating] = useState(false);
  if (creating && permission.ready && !permission.manager) setCreating(false);
  const focusRecovery = useCallback(
    (button: HTMLButtonElement | null) => button?.focus(),
    [],
  );
  const navigationGroups = useDeliveryNavigation(
    workspace?.actor ?? { memberId: '', isAdmin: false, isManager: false },
  );
  const personalNavigation = useDeliveryNavigationPreferences(
    workspace?.actor ?? { memberId: '', isAdmin: false, isManager: false },
    navigationGroups,
  );
  const view = getDeliveryEntryView(
    params,
    personalNavigation.preferences.startView,
  );
  const currentPage = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.view === view);
  const canSeeAssignment = Boolean(
    selectedTask &&
    workspace &&
    workspaceVerified &&
    currentPage &&
    !creating &&
    selectedTask.assigneeId === workspace.actor.memberId,
  );
  useEffect(() => {
    if (!selectedId || !canSeeAssignment) return;
    void markSeen({
      variables: {
        input: {
          action: 'seen',
          taskId: selectedId,
          expectedAssignmentKey: `${selectedTask?.assigneeId}:${selectedTask?.details.assignmentAt ?? 'legacy'}`,
        },
      },
    }).catch(() =>
      setError(
        t`Could not mark this assignment as seen. Acknowledge it in Delivery & reminders.`,
      ),
    );
  }, [
    selectedId,
    canSeeAssignment,
    selectedTask?.assigneeId,
    selectedTask?.details.assignmentAt,
    markSeen,
    t,
  ]);
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
  const refreshReviewQueues = () =>
    query.client.refetchQueries({
      include: 'active',
      onQueryUpdated: (observableQuery) =>
        observableQuery.queryName === 'DeliveryReviewQueue'
          ? observableQuery.refetch()
          : false,
    });
  const run = async (input: Record<string, unknown>): Promise<boolean> => {
    if (!workspaceVerified) return false;
    if (
      (input.action === 'create' || input.action === 'project') &&
      !permission.manager
    )
      return false;
    setError('');
    try {
      const result = await mutate({ variables: { input } });
      if (result.data)
        query.client.writeQuery({
          query: GET_DELIVERY_WORKSPACE,
          data: { deliveryWorkspace: result.data.changeDeliveryWorkspace },
        });
      if (result.data && input.action === 'review') {
        try {
          await refreshReviewQueues();
        } catch {
          setError(
            t`The review decision was saved, but approval summaries could not refresh. Refresh approvals before continuing.`,
          );
        }
      }
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
    requestAction(() => {
      setParams({
        view: nextView,
        ...(status ? { status } : {}),
        ...(attention ? { attention } : {}),
      });
      setCreating(false);
      setError('');
    });
  };
  const refreshVisibleWork = async () => {
    setRefreshing(true);
    setError('');
    try {
      await query.client.refetchQueries({
        include: 'active',
        onQueryUpdated: (observableQuery) =>
          observableQuery.queryName?.startsWith('Delivery') ||
          [
            'OtogrowAccess',
            'OtogrowRoleDirectory',
            'OtogrowActivity',
            'OtogrowAiBudgetSnapshot',
            'OtogrowAiSpendHistory',
          ].includes(observableQuery.queryName ?? '')
            ? observableQuery.refetch()
            : false,
      });
    } catch {
      setError(t`Could not refresh this page. Please try again.`);
    } finally {
      setRefreshing(false);
    }
  };
  const taskReview = useTaskReview({
    taskId: selectedTask?.id ?? '',
    taskRevision: selectedTask?.revision ?? 0,
    enabled: Boolean(
      workspaceVerified && selectedTask && currentPage && !creating,
    ),
    onChanged: async () => {
      await Promise.all([query.refetch(), refreshReviewQueues()]);
    },
  });
  if (!workspace)
    return (
      <PageContainer>
        <PageBody>
          <StyledDeliveryCanvas>
            <StyledDeliveryStack>
              <h1>
                <Trans>Otogrow workspace</Trans>
              </h1>
              {query.error ||
              permission.error ||
              (permission.ready && candidateWorkspace && !workspaceVerified) ? (
                <>
                  <p role="alert">
                    <Trans>Your workspace access could not be verified.</Trans>
                  </p>
                  <StyledDeliveryButton
                    onClick={() => {
                      void query.refetch().catch(() => undefined);
                      void permission.refetch().catch(() => undefined);
                    }}
                  >
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
  if (params.size === 0) {
    if (personalNavigation.ready)
      return (
        <Navigate
          replace
          to={`/delivery?view=${personalNavigation.preferences.startView}`}
        />
      );
    return (
      <PageContainer>
        <PageBody>
          <StyledDeliveryCanvas>
            {personalNavigation.accessError ? (
              <>
                <p role="alert">
                  <Trans>Could not verify your workspace access.</Trans>
                </p>
                <StyledDeliveryButton
                  onClick={() => void personalNavigation.retryAccess()}
                >
                  <Trans>Try again</Trans>
                </StyledDeliveryButton>
              </>
            ) : (
              <p role="status">
                <Trans>Loading your workspace preferences…</Trans>
              </p>
            )}
          </StyledDeliveryCanvas>
        </PageBody>
      </PageContainer>
    );
  }
  if (!currentPage)
    return (
      <PageContainer>
        <PageBody>
          <StyledDeliveryCanvas>
            <StyledDeliveryStack>
              <h1>
                <Trans>Workspace unavailable</Trans>
              </h1>
              <p>
                <Trans>
                  This workspace does not exist or is not available for your
                  role.
                </Trans>
              </p>
              <StyledDeliveryButton onClick={() => selectView('home')}>
                <Trans>Go to Today</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </StyledDeliveryCanvas>
        </PageBody>
      </PageContainer>
    );
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
      (view === 'mine' || !memberFilter || task.assigneeId === memberFilter) &&
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
    const onOpen = () => {
      openTask(task.id, view === 'creative' ? 'creative' : 'task');
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
    };
    if (view === 'mine')
      return (
        <DeliveryMyWorkTask
          key={task.id}
          task={task}
          projectName={project?.name ?? ''}
          statusLabel={stateLabel(task.details.state)}
          onOpen={onOpen}
        />
      );
    return (
      <StyledDeliveryTaskButton key={task.id} onClick={onOpen}>
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
              aria-label={t`Custom checklist progress`}
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
  const drawerOpen = Boolean(
    selectedTask || (creating && workspace.actor.isManager),
  );
  return (
    <PageContainer>
      <PageBody>
        {!workspaceVerified && !drawerOpen && (
          <StyledDeliveryStack>
            <p role="status">
              <Trans>
                Your workspace access could not be verified. Saved information
                is hidden and unsaved work is kept while you retry.
              </Trans>
            </p>
            <StyledDeliveryButton
              onClick={() => {
                void query.refetch().catch(() => undefined);
                void permission.refetch().catch(() => undefined);
              }}
            >
              <Trans>Retry workspace access</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        )}
        <StyledWorkspaceAccessBoundary
          key={permission.scope}
          hidden={!workspaceVerified}
          disabled={!workspaceVerified}
          inert={!workspaceVerified || undefined}
          aria-hidden={!workspaceVerified || undefined}
        >
          <StyledDeliveryCanvas>
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <StyledDeliveryRow>
                  {!isNavigationExpanded && (
                    <NavigationDrawerCollapseButton direction="right" />
                  )}
                  <div>
                    <h1>{currentPage.label}</h1>
                    <p>{currentPage.description}</p>
                  </div>
                </StyledDeliveryRow>
                <StyledDeliveryRow>
                  {workspace.actor.isManager &&
                    ['home', 'mine', 'planner', 'reviews', 'creative'].includes(
                      view,
                    ) && (
                      <StyledDeliveryButton
                        data-primary="true"
                        onClick={() => {
                          if (!workspace.projects.length) {
                            selectView('team');
                            return;
                          }
                          setCreating(true);
                          setError('');
                        }}
                      >
                        {workspace.projects.length
                          ? t`New task`
                          : t`Set up first project`}
                      </StyledDeliveryButton>
                    )}
                  <StyledDeliveryButton
                    disabled={refreshing}
                    onClick={() => void refreshVisibleWork()}
                  >
                    {refreshing ? t`Refreshing…` : t`Refresh page`}
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </StyledDeliveryRow>
              <DeliveryNavigationPreferences
                key={personalNavigation.scope}
                personalNavigation={personalNavigation}
              />
              {isMobile && (
                <StyledDeliveryRow>
                  <label>
                    <Trans>Go to</Trans>
                    <select
                      aria-label={t`Go to workspace`}
                      value={view}
                      onChange={(event) => selectView(event.target.value)}
                    >
                      {personalNavigation.pinnedPages.length > 0 && (
                        <optgroup label={t`Pinned`}>
                          {personalNavigation.pinnedPages.map((page) => (
                            <option key={page.view} value={page.view}>
                              {page.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {navigationGroups.map((group) => (
                        <optgroup key={group.id} label={group.label}>
                          {group.items
                            .filter(
                              (item) =>
                                !personalNavigation.pinnedPages.some(
                                  (page) => page.view === item.view,
                                ),
                            )
                            .map((item) => (
                              <option key={item.view} value={item.view}>
                                {item.label}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </StyledDeliveryRow>
              )}
              {error && !selectedTask && !creating && (
                <p role="alert">{error}</p>
              )}
              {selectedId && !selectedTask && (
                <StyledDeliveryCard>
                  <StyledDeliveryStack>
                    <p role="alert">
                      <Trans>
                        This task is no longer available or you do not have
                        access to it.
                      </Trans>
                    </p>
                    <StyledDeliveryButton onClick={closeTask}>
                      <Trans>Dismiss task link</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryStack>
                </StyledDeliveryCard>
              )}
              {view === 'knowledge' && (
                <DeliveryKnowledge workspace={workspace} />
              )}
              {view === 'home' && (
                <>
                  <StyledDeliveryGrid>
                    <DeliveryAssignedReviewsToday />
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
                          <Trans>Production submissions awaiting review</Trans>
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
                      <Trans>Open my tasks</Trans>
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
                          <Trans>Set up your first project</Trans>
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
                            <Trans>
                              Your manager will add you to a project.
                            </Trans>
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
                  onChanged={() => query.refetch()}
                />
              )}
              {view === 'chat' && <DeliveryChat />}
              {view === 'activity' && <OtogrowActivity workspace={workspace} />}
              {view === 'batches' && (
                <DeliveryBatches
                  workspace={workspace}
                  onOpenTask={(id) => openTask(id)}
                />
              )}
              {view === 'workflows' && workspace.actor.isManager && (
                <DeliveryWorkflowCatalog />
              )}
              {view === 'clients' && (
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
              ].includes(view) && (
                <DeliveryBusiness
                  key={view}
                  view={view}
                  workspace={workspace}
                  onChanged={() => query.refetch()}
                  onOpenTask={(id) => openTask(id)}
                />
              )}
              {view === 'health' && workspace.actor.isAdmin && (
                <>
                  <DeliveryFounderExceptions />
                  <details
                    open={
                      params.has('readinessStatus') ||
                      location.hash === '#company-readiness'
                    }
                    id="company-readiness"
                  >
                    <summary>
                      <Trans>Connection readiness</Trans>
                    </summary>
                    <DeliveryReadiness />
                  </details>
                </>
              )}
              {view === 'finance' && (
                <DeliveryFinance
                  workspace={workspace}
                  onChanged={() => query.refetch()}
                  onOpenTask={(id) => openTask(id)}
                />
              )}
              {view === 'operations' && (
                <DeliveryOperations
                  workspace={workspace}
                  onChanged={() => query.refetch()}
                  onOpenTask={(id) => {
                    openTask(id, 'operations');
                  }}
                />
              )}
              {view === 'agents' && (
                <DeliveryAiWorkspace
                  workspace={workspace}
                  onTaskChanged={() => query.refetch()}
                />
              )}
              {['mine', 'planner', 'creative'].includes(view) && (
                <>
                  {view === 'planner' && (
                    <DeliveryCapacity
                      workspace={workspace}
                      onOpenTask={(id) => openTask(id)}
                    />
                  )}
                  <StyledDeliveryCard>
                    <details
                      open={
                        !isMobile && (view !== 'mine' || activeFilterCount > 0)
                      }
                    >
                      <summary>
                        {t`Filters`}
                        {activeFilterCount > 0
                          ? ` · ${t`${activeFilterCount} active`}`
                          : ''}
                      </summary>
                      <StyledDeliveryRow>
                        {attentionFilter && (
                          <StyledDeliveryButton
                            onClick={() => updateParams({ attention: null })}
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
                            onChange={(event) =>
                              updateParams({ search: event.target.value }, true)
                            }
                            placeholder={t`Find a task`}
                          />
                        </label>
                        <label>
                          <Trans>Project / client</Trans>
                          <select
                            value={projectFilter}
                            onChange={(event) =>
                              updateParams(
                                { project: event.target.value },
                                true,
                              )
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
                        {view !== 'mine' && (
                          <label>
                            <Trans>Teammate</Trans>
                            <select
                              value={memberFilter}
                              onChange={(event) =>
                                updateParams(
                                  { member: event.target.value },
                                  true,
                                )
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
                        )}
                        <label>
                          <Trans>Service</Trans>
                          <select
                            value={serviceFilter}
                            onChange={(event) =>
                              updateParams(
                                { service: event.target.value },
                                true,
                              )
                            }
                          >
                            <option value="">{t`All services`}</option>
                            {[
                              ...new Set(
                                workspace.tasks.map(
                                  (task) => task.details.service,
                                ),
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
                              updateParams({
                                from: event.target.value,
                                through: null,
                              });
                            }}
                          />
                        </label>
                        <StyledDeliveryButton
                          onClick={() => {
                            updateParams({
                              from: dateFilter ? null : today,
                              through: null,
                            });
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
                              updateParams(
                                { through: event.target.value },
                                true,
                              )
                            }
                          />
                        </label>
                        <StyledDeliveryButton
                          onClick={() => {
                            const end = new Date();
                            end.setDate(end.getDate() + 6);
                            updateParams({
                              from: today,
                              through: end.toLocaleDateString('en-CA'),
                            });
                          }}
                        >{t`Next 7 days`}</StyledDeliveryButton>
                        <label>
                          <Trans>Status</Trans>
                          <select
                            value={statusFilter}
                            onChange={(event) =>
                              updateParams({ status: event.target.value }, true)
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
                          onClick={() =>
                            updateParams({ layout: board ? null : 'board' })
                          }
                        >
                          {board ? t`List view` : t`Board view`}
                        </StyledDeliveryButton>
                      </StyledDeliveryRow>
                    </details>
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
                  ) : view === 'mine' ? (
                    <DeliveryMyWorkQueue
                      tasks={filteredTasks}
                      renderTask={taskCard}
                      approvedOnly={statusFilter === 'APPROVED'}
                    />
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
                      {activeFilterCount > 0 && (
                        <StyledDeliveryButton
                          onClick={() =>
                            updateParams({
                              search: null,
                              member: null,
                              project: null,
                              service: null,
                              from: null,
                              through: null,
                              attention: null,
                              status: null,
                            })
                          }
                        >
                          <Trans>Clear filters</Trans>
                        </StyledDeliveryButton>
                      )}
                    </StyledDeliveryCard>
                  )}
                </>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCanvas>
        </StyledWorkspaceAccessBoundary>
        {drawerOpen && (
          <StyledDeliveryDrawer
            aria-label={
              creating
                ? t`Create task`
                : workspaceVerified
                  ? selectedTask?.title
                  : t`Task details`
            }
            ref={(dialog) => {
              if (dialog && !dialog.open) dialog.showModal();
            }}
            onCancel={(event) => {
              event.preventDefault();
              requestAction(() => {
                closeTask();
                setCreating(false);
              });
            }}
          >
            <StyledDeliveryCanvas>
              <StyledDeliveryStack>
                <StyledDeliveryRow>
                  <h2>{creating ? t`New task` : t`Task details`}</h2>
                  <StyledDeliveryButton
                    onClick={() =>
                      requestAction(() => {
                        closeTask();
                        setCreating(false);
                      })
                    }
                  >
                    <Trans>Close</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
                {!workspaceVerified && (
                  <>
                    <p role="status">
                      <Trans>
                        Current workspace access could not be verified. Saved
                        information is hidden and your draft is kept.
                      </Trans>
                    </p>
                    <StyledDeliveryButton
                      ref={focusRecovery}
                      onClick={() => {
                        void query.refetch().catch(() => undefined);
                        void permission.refetch().catch(() => undefined);
                      }}
                    >
                      <Trans>Retry workspace access</Trans>
                    </StyledDeliveryButton>
                  </>
                )}
                <StyledWorkspaceAccessBoundary
                  hidden={!workspaceVerified}
                  disabled={!workspaceVerified || mutation.loading}
                  inert={!workspaceVerified || undefined}
                  aria-hidden={!workspaceVerified || undefined}
                >
                  {error && <p role="alert">{error}</p>}
                  {creating && workspace.actor.isManager ? (
                    <DeliveryTaskForm
                      workspace={workspace}
                      run={run}
                      busy={mutation.loading}
                      onSaved={() => setCreating(false)}
                    />
                  ) : (
                    selectedTask && (
                      <>
                        <DeliveryTaskJourney
                          task={selectedTask}
                          workspace={workspace}
                          review={taskReview.data}
                          onOpenPanel={setSelectedPanel}
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
                            reviewController={taskReview}
                            onChanged={() => query.refetch()}
                            workspace={workspace}
                            run={run}
                            busy={mutation.loading}
                            stateLabel={stateLabel}
                            celebrateApproval={approvalCelebration}
                          />
                        )}
                        {selectedPanel === 'creative' && (
                          <DeliveryCreative
                            key={selectedTask.id}
                            task={selectedTask}
                            workspace={workspace}
                            onChanged={() => query.refetch()}
                            onOpenTask={() => setSelectedPanel('task')}
                          />
                        )}
                        {selectedPanel === 'operations' && (
                          <DeliveryOperations
                            key={selectedTask.id}
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
                </StyledWorkspaceAccessBoundary>
              </StyledDeliveryStack>
            </StyledDeliveryCanvas>
          </StyledDeliveryDrawer>
        )}
      </PageBody>
    </PageContainer>
  );
};

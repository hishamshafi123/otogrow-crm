import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type ClientHubItem,
  type ClientHubSnapshot,
} from '@/delivery/client-workspace/client-hub.types';
import {
  clientInitials,
  formatBillingMode,
  formatCurrencyTotals,
  formatDueLabel,
  formatTaskStatus,
} from '@/delivery/client-workspace/client-hub-format';
import { clientWorkspaceDestination } from '@/delivery/client-workspace/client-workspace-navigation';
import {
  StyledClientAvatar,
  StyledClientCard,
  StyledClientCardFooter,
  StyledClientCardHeader,
  StyledClientFilterBar,
  StyledClientFilterPill,
  StyledClientFilterPills,
  StyledClientIdentity,
  StyledClientKpiCard,
  StyledClientKpiGrid,
  StyledClientMetricStrip,
  StyledClientPortfolioGrid,
  StyledClientSubtleButton,
  StyledClientTag,
  StyledClientTagRow,
  StyledClientTitleBlock,
  StyledDueWorkItem,
  StyledDueWorkList,
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PortfolioFilter =
  | 'all'
  | 'attention'
  | 'overdue'
  | 'dueSoon'
  | 'retainer'
  | 'needsSetup';

type ClientOverviewGridProps = {
  hub: ClientHubSnapshot;
  updatingRoster: boolean;
  onOpenPicker: () => void;
  onRemoveClient: (client: ClientHubItem) => void;
};

export const ClientOverviewGrid = ({
  hub,
  updatingRoster,
  onOpenPicker,
  onRemoveClient,
}: ClientOverviewGridProps) => {
  const { t } = useLingui();
  const [filter, setFilter] = useState<PortfolioFilter>('all');
  const [queryText, setQueryText] = useState('');

  const filteredClients = useMemo(() => {
    const normalized = queryText.trim().toLocaleLowerCase();
    return hub.clients.filter((client) => {
      if (filter === 'attention' && !client.needsAttention) return false;
      if (filter === 'overdue' && client.tasksSummary.overdueCount === 0)
        return false;
      if (
        filter === 'dueSoon' &&
        client.tasksSummary.dueSoonCount === 0 &&
        client.tasksSummary.overdueCount === 0
      )
        return false;
      if (filter === 'retainer' && !client.billingModes.includes('RETAINER'))
        return false;
      if (
        filter === 'needsSetup' &&
        client.projects.length > 0 &&
        client.servicePlans.length > 0
      )
        return false;
      if (!normalized) return true;
      return (
        client.name.toLocaleLowerCase().includes(normalized) ||
        (client.domainName ?? '').toLocaleLowerCase().includes(normalized) ||
        client.services.some((service) =>
          service.toLocaleLowerCase().includes(normalized),
        )
      );
    });
  }, [filter, hub.clients, queryText]);

  const { summary } = hub;
  const openReceivablesText = formatCurrencyTotals(
    summary.totalOpenReceivablesByCurrency,
  );

  if (!hub.clients.length) {
    return (
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h2>
            <Trans>No clients selected yet</Trans>
          </h2>
          <p>
            <Trans>
              Companies synced from Gmail are kept out of your Clients list by
              default. Pick your actual agency clients from CRM or add a new
              client to track their projects, due work, portals, and billing in
              one place.
            </Trans>
          </p>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              data-primary="true"
              onClick={onOpenPicker}
            >
              <Trans>Select clients from CRM</Trans>
            </StyledDeliveryButton>
            <Link to="/delivery?view=onboarding">
              <Trans>+ Add a new client</Trans>
            </Link>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  }

  return (
    <StyledDeliveryStack>
      <StyledClientKpiGrid aria-label={t`Client portfolio summary`}>
        <StyledClientKpiCard>
          <span>
            <Trans>Active clients</Trans>
          </span>
          <strong>{summary.totalClients}</strong>
          <small>
            {summary.totalActiveProjects === 1
              ? t`1 active project`
              : t`${summary.totalActiveProjects} active projects`}
          </small>
        </StyledClientKpiCard>

        <StyledClientKpiCard
          data-tone={
            summary.clientsNeedingAttention > 0 ? 'warning' : 'success'
          }
        >
          <span>
            <Trans>Needs attention</Trans>
          </span>
          <strong>{summary.clientsNeedingAttention}</strong>
          <small>
            {summary.totalBlockedTasks > 0
              ? t`${summary.totalBlockedTasks} blocked tasks`
              : summary.totalInReviewTasks > 0
                ? t`${summary.totalInReviewTasks} waiting for review`
                : t`All clients running smoothly`}
          </small>
        </StyledClientKpiCard>

        <StyledClientKpiCard
          data-tone={summary.totalOverdueTasks > 0 ? 'danger' : undefined}
        >
          <span>
            <Trans>Due &amp; open work</Trans>
          </span>
          <strong>{summary.totalOpenTasks}</strong>
          <small>
            {summary.totalOverdueTasks > 0
              ? t`${summary.totalOverdueTasks} overdue · ${summary.totalDueSoonTasks} due in 7d`
              : summary.totalDueSoonTasks > 0
                ? t`${summary.totalDueSoonTasks} due in next 7 days`
                : t`No overdue work`}
          </small>
        </StyledClientKpiCard>

        <StyledClientKpiCard>
          <span>
            {summary.canReadFinance ? (
              <Trans>Open receivables &amp; onboarding</Trans>
            ) : (
              <Trans>Onboarding &amp; reviews</Trans>
            )}
          </span>
          <strong>
            {summary.canReadFinance && openReceivablesText
              ? openReceivablesText
              : summary.totalPendingOnboarding}
          </strong>
          <small>
            {summary.canReadFinance
              ? summary.totalPendingOnboarding > 0
                ? t`${summary.totalPendingOnboarding} pending onboarding responses`
                : openReceivablesText
                  ? t`Unpaid client receivables`
                  : t`No unpaid receivables`
              : summary.totalPendingOnboarding > 0
                ? t`Pending client onboarding forms`
                : t`No pending onboarding forms`}
          </small>
        </StyledClientKpiCard>
      </StyledClientKpiGrid>

      <StyledClientFilterBar>
        <StyledClientFilterPills role="group" aria-label={t`Filter clients`}>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            {t`All (${hub.clients.length})`}
          </StyledClientFilterPill>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'attention'}
            onClick={() => setFilter('attention')}
          >
            {t`Needs attention (${summary.clientsNeedingAttention})`}
          </StyledClientFilterPill>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'overdue'}
            onClick={() => setFilter('overdue')}
          >
            <Trans>Overdue work</Trans>
          </StyledClientFilterPill>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'dueSoon'}
            onClick={() => setFilter('dueSoon')}
          >
            <Trans>Due soon</Trans>
          </StyledClientFilterPill>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'retainer'}
            onClick={() => setFilter('retainer')}
          >
            <Trans>Retainers</Trans>
          </StyledClientFilterPill>
          <StyledClientFilterPill
            type="button"
            data-active={filter === 'needsSetup'}
            onClick={() => setFilter('needsSetup')}
          >
            <Trans>Setup needed</Trans>
          </StyledClientFilterPill>
        </StyledClientFilterPills>

        <input
          aria-label={t`Filter visible clients`}
          value={queryText}
          maxLength={120}
          onChange={(event) => setQueryText(event.target.value)}
          placeholder={t`Filter by name, domain, or service…`}
          style={{ minWidth: '220px' }}
        />
      </StyledClientFilterBar>

      {!filteredClients.length ? (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <p>
              <Trans>No clients match this filter.</Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() => {
                setFilter('all');
                setQueryText('');
              }}
            >
              <Trans>Reset filters</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      ) : (
        <StyledClientPortfolioGrid aria-label={t`Client cards`}>
          {filteredClients.map((client) => {
            const hasOverdue = client.tasksSummary.overdueCount > 0;
            const setupIncomplete =
              client.projects.length === 0 || client.servicePlans.length === 0;
            const statusTone = hasOverdue
              ? 'danger'
              : client.needsAttention
                ? 'warning'
                : setupIncomplete
                  ? 'cyan'
                  : 'success';
            const statusText = hasOverdue
              ? t`${client.tasksSummary.overdueCount} overdue`
              : client.needsAttention
                ? t`Needs attention`
                : setupIncomplete
                  ? t`Setup needed`
                  : t`On track`;
            const clientReceivableText = client.finance
              ? formatCurrencyTotals(client.finance.openReceivablesByCurrency)
              : '';
            const primaryEngagementId = client.servicePlans[0]?.id;

            return (
              <StyledClientCard
                key={client.id}
                data-overdue={hasOverdue}
                data-attention={client.needsAttention}
              >
                <StyledClientCardHeader>
                  <StyledClientIdentity>
                    <StyledClientAvatar
                      data-tone={
                        hasOverdue
                          ? 'danger'
                          : client.needsAttention
                            ? 'warning'
                            : undefined
                      }
                    >
                      {clientInitials(client.name)}
                    </StyledClientAvatar>
                    <StyledClientTitleBlock>
                      <h3>
                        <Link
                          to={clientWorkspaceDestination({
                            companyId: client.id,
                            section: 'overview',
                          })}
                        >
                          {client.name}
                        </Link>
                      </h3>
                      <small>
                        {client.domainName ??
                          (client.projects.length === 1
                            ? t`1 project`
                            : t`${client.projects.length} projects`)}
                      </small>
                    </StyledClientTitleBlock>
                  </StyledClientIdentity>
                  <StyledClientTag data-tone={statusTone}>
                    {statusText}
                  </StyledClientTag>
                </StyledClientCardHeader>

                {(client.services.length > 0 ||
                  client.billingModes.length > 0) && (
                  <StyledClientTagRow>
                    {client.billingModes.map((mode) => (
                      <StyledClientTag key={mode} data-tone="iris">
                        {formatBillingMode(mode)}
                      </StyledClientTag>
                    ))}
                    {client.services.slice(0, 4).map((service) => (
                      <StyledClientTag key={service}>{service}</StyledClientTag>
                    ))}
                    {client.services.length > 4 && (
                      <StyledClientTag>
                        +{client.services.length - 4}
                      </StyledClientTag>
                    )}
                  </StyledClientTagRow>
                )}

                <StyledClientMetricStrip>
                  <div>
                    <span>
                      <Trans>Open work</Trans>
                    </span>
                    <strong>{client.tasksSummary.openCount}</strong>
                  </div>
                  <div>
                    <span>
                      <Trans>Projects</Trans>
                    </span>
                    <strong>{client.projects.length}</strong>
                  </div>
                  <div>
                    <span>
                      <Trans>Portal links</Trans>
                    </span>
                    <strong>{client.portal.activeLinksCount}</strong>
                  </div>
                </StyledClientMetricStrip>

                {(client.tasksSummary.blockedCount > 0 ||
                  client.tasksSummary.inReviewCount > 0 ||
                  client.portal.pendingSubmissionsCount > 0 ||
                  Boolean(clientReceivableText)) && (
                  <StyledClientTagRow>
                    {client.tasksSummary.blockedCount > 0 && (
                      <StyledClientTag data-tone="danger">
                        {t`${client.tasksSummary.blockedCount} blocked`}
                      </StyledClientTag>
                    )}
                    {client.tasksSummary.inReviewCount > 0 && (
                      <StyledClientTag data-tone="warning">
                        {t`${client.tasksSummary.inReviewCount} in review`}
                      </StyledClientTag>
                    )}
                    {client.portal.pendingSubmissionsCount > 0 && (
                      <StyledClientTag data-tone="cyan">
                        {t`${client.portal.pendingSubmissionsCount} onboarding pending`}
                      </StyledClientTag>
                    )}
                    {clientReceivableText && (
                      <StyledClientTag
                        data-tone={
                          (client.finance?.overdueReceivablesCount ?? 0) > 0
                            ? 'danger'
                            : 'iris'
                        }
                      >
                        {t`Receivable: ${clientReceivableText}`}
                      </StyledClientTag>
                    )}
                  </StyledClientTagRow>
                )}

                {client.dueTasks.length > 0 ? (
                  <StyledDueWorkList>
                    {client.dueTasks.slice(0, 3).map((task) => (
                      <StyledDueWorkItem
                        key={task.id}
                        data-overdue={task.isOverdue}
                        data-due-soon={task.isDueSoon}
                      >
                        <Link
                          to={`/delivery?view=planner&plannerView=tasks&project=${task.projectId}&task=${task.id}&clientCompany=${client.id}&clientProject=${task.projectId}`}
                          title={`${task.title} (${formatTaskStatus(task.status)})`}
                        >
                          {task.title}
                        </Link>
                        <small>
                          {task.isOverdue
                            ? t`Overdue · ${formatDueLabel(task.dueAt)}`
                            : formatDueLabel(task.dueAt)}
                        </small>
                      </StyledDueWorkItem>
                    ))}
                  </StyledDueWorkList>
                ) : (
                  <small>
                    {client.projects.length > 0 ? (
                      <Trans>No open due tasks right now.</Trans>
                    ) : (
                      <Trans>
                        No project set up yet — add a project or service plan to
                        begin delivery.
                      </Trans>
                    )}
                  </small>
                )}

                <StyledClientCardFooter>
                  <StyledDeliveryRow>
                    <Link
                      to={clientWorkspaceDestination({
                        companyId: client.id,
                        section: 'overview',
                      })}
                    >
                      <Trans>Open workspace</Trans>
                    </Link>
                    <Link
                      to={clientWorkspaceDestination({
                        companyId: client.id,
                        section: 'services',
                      })}
                    >
                      <Trans>Services</Trans>
                    </Link>
                    <Link
                      to={
                        primaryEngagementId
                          ? `/delivery?view=clients&clientView=agreements&clientEngagement=${primaryEngagementId}`
                          : clientWorkspaceDestination({
                              companyId: client.id,
                              section: 'portal',
                            })
                      }
                    >
                      <Trans>Portal</Trans>
                    </Link>
                  </StyledDeliveryRow>
                  <StyledClientSubtleButton
                    type="button"
                    disabled={updatingRoster}
                    onClick={() => onRemoveClient(client)}
                    title={t`Remove from your Clients list (keeps CRM company intact)`}
                  >
                    <Trans>Remove</Trans>
                  </StyledClientSubtleButton>
                </StyledClientCardFooter>
              </StyledClientCard>
            );
          })}
        </StyledClientPortfolioGrid>
      )}
    </StyledDeliveryStack>
  );
};

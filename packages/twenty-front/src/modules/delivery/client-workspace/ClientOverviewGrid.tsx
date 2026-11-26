import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type ClientHubDueTask,
  type ClientHubItem,
  type ClientHubSnapshot,
} from '@/delivery/client-workspace/client-hub.types';
import {
  clientInitials,
  formatCurrencyTotals,
  formatDueLabel,
  formatFeeCadenceShort,
  formatMoneyMinor,
  formatTaskStatus,
  formatYearMonthLabel,
} from '@/delivery/client-workspace/client-hub-format';
import { clientWorkspaceDestination } from '@/delivery/client-workspace/client-workspace-navigation';
import {
  StyledCleanupBanner,
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
  StyledEmptyStateCard,
  StyledMrrMetricRow,
  StyledMrrProgressFill,
  StyledMrrProgressTrack,
  StyledMrrSummaryCard,
  StyledMrrSummaryTop,
  StyledNextDeliverable,
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';

type PortfolioFilter =
  | 'all'
  | 'attention'
  | 'overdue'
  | 'dueSoon'
  | 'needsSetup';

type ClientOverviewGridProps = {
  hub: ClientHubSnapshot;
  updatingRoster: boolean;
  onOpenPicker: () => void;
  onRemoveClients: (
    clients: Pick<ClientHubItem, 'id' | 'name'>[],
  ) => Promise<boolean>;
};

export const ClientOverviewGrid = ({
  hub,
  updatingRoster,
  onOpenPicker,
  onRemoveClients,
}: ClientOverviewGridProps) => {
  const { t } = useLingui();
  const [filter, setFilter] = useState<PortfolioFilter>('all');
  const [queryText, setQueryText] = useState('');
  const [cleanupMode, setCleanupMode] = useState(false);
  const [selectedForRemoval, setSelectedForRemoval] = useState<string[]>([]);

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

  const selectedSet = useMemo(
    () => new Set(selectedForRemoval),
    [selectedForRemoval],
  );

  const toggleCleanupSelection = (clientId: string) => {
    setSelectedForRemoval((previous) =>
      previous.includes(clientId)
        ? previous.filter((id) => id !== clientId)
        : [...previous, clientId],
    );
  };

  const exitCleanupMode = () => {
    setCleanupMode(false);
    setSelectedForRemoval([]);
  };

  const handleBulkRemove = async () => {
    const targets = hub.clients
      .filter((client) => selectedSet.has(client.id))
      .map((client) => ({ id: client.id, name: client.name }));
    if (!targets.length) return;
    const ok = await onRemoveClients(targets);
    if (ok) {
      exitCleanupMode();
    }
  };

  if (!hub.clients.length) {
    return (
      <StyledEmptyStateCard>
        <h2>
          <Trans>Your Clients list is clean and empty</Trans>
        </h2>
        <p>
          <Trans>
            Only businesses you explicitly add appear here — Gmail-synced and
            CRM companies are never pulled in automatically. Pick your active
            agency clients from CRM or onboard a new client to track tasks,
            deliverables, and billing.
          </Trans>
        </p>
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            data-primary="true"
            onClick={onOpenPicker}
          >
            <Trans>Add clients from CRM</Trans>
          </StyledDeliveryButton>
          <Link to="/delivery?view=onboarding">
            <Trans>+ Add new client</Trans>
          </Link>
        </StyledDeliveryRow>
      </StyledEmptyStateCard>
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
            <Trans>Open &amp; overdue work</Trans>
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

        {summary.canReadFinance &&
          summary.projectedMrr &&
          summary.projectedMrr.mrrClientCount > 0 && (
            <StyledClientKpiCard
              data-tone={
                summary.projectedMrr.collectionPercent >= 100
                  ? 'success'
                  : undefined
              }
            >
              <span>
                {t`Projected MRR (${formatYearMonthLabel(summary.projectedMrr.month)})`}
              </span>
              <strong>
                {formatFinanceAmountMicros(
                  summary.projectedMrr.projectedMrrAedMicros,
                  summary.projectedMrr.baseCurrency,
                )}
              </strong>
              <small>
                {t`${summary.projectedMrr.collectionPercent}% collected · ${formatFinanceAmountMicros(summary.projectedMrr.remainingAedMicros, summary.projectedMrr.baseCurrency)} remaining`}
              </small>
            </StyledClientKpiCard>
          )}

        {summary.canReadFinance && openReceivablesText && (
          <StyledClientKpiCard>
            <span>
              <Trans>Open invoices</Trans>
            </span>
            <strong>{openReceivablesText}</strong>
            <small>
              <Trans>Unpaid client receivables</Trans>
            </small>
          </StyledClientKpiCard>
        )}
      </StyledClientKpiGrid>

      {summary.canReadFinance &&
        summary.projectedMrr &&
        (summary.projectedMrr.mrrClientCount > 0 ||
          summary.projectedMrr.oneTime.clientCount > 0) && (
          <StyledMrrSummaryCard
            aria-label={t`Current month projected MRR summary`}
          >
            <StyledMrrSummaryTop>
              <div>
                <h3>
                  {t`Projected MRR · ${formatYearMonthLabel(summary.projectedMrr.month)}`}
                </h3>
                <small>
                  {summary.projectedMrr.mrrClientCount > 0
                    ? t`${summary.projectedMrr.mrrClientCount} recurring clients (${summary.projectedMrr.paidClientCount} paid · ${summary.projectedMrr.partialClientCount} partial · ${summary.projectedMrr.unpaidClientCount} unpaid)`
                    : t`No recurring retainers yet — one-time engagements tracked below`}
                </small>
              </div>
              <Link to="/delivery?view=finance">
                <Trans>Finance overview →</Trans>
              </Link>
            </StyledMrrSummaryTop>

            {summary.projectedMrr.mrrClientCount > 0 && (
              <>
                <StyledMrrMetricRow>
                  <div>
                    <span>
                      <Trans>Projected MRR</Trans>
                    </span>
                    <strong>
                      {formatFinanceAmountMicros(
                        summary.projectedMrr.projectedMrrAedMicros,
                        summary.projectedMrr.baseCurrency,
                      )}
                    </strong>
                    <small>
                      {summary.projectedMrr.byCurrency
                        .map(
                          (item) =>
                            `${formatMoneyMinor(item.projectedMrrMinor, item.currency)}/mo`,
                        )
                        .join(' · ')}
                    </small>
                  </div>
                  <div>
                    <span>
                      <Trans>Collected this month</Trans>
                    </span>
                    <strong>
                      {formatFinanceAmountMicros(
                        summary.projectedMrr.collectedTowardMrrAedMicros,
                        summary.projectedMrr.baseCurrency,
                      )}
                    </strong>
                    <small>
                      {t`${summary.projectedMrr.collectionPercent}% of projected MRR`}
                    </small>
                  </div>
                  <div>
                    <span>
                      <Trans>Remaining to collect</Trans>
                    </span>
                    <strong>
                      {formatFinanceAmountMicros(
                        summary.projectedMrr.remainingAedMicros,
                        summary.projectedMrr.baseCurrency,
                      )}
                    </strong>
                    <small>
                      {summary.projectedMrr.unpaidClientCount +
                        summary.projectedMrr.partialClientCount ===
                      0
                        ? t`All retainers collected`
                        : t`${summary.projectedMrr.unpaidClientCount + summary.projectedMrr.partialClientCount} clients with balance due`}
                    </small>
                  </div>
                  {summary.projectedMrr.oneTime.clientCount > 0 && (
                    <div>
                      <span>
                        <Trans>One-time fees (excl. MRR)</Trans>
                      </span>
                      <strong>
                        {formatFinanceAmountMicros(
                          summary.projectedMrr.oneTime.totalAedMicros,
                          summary.projectedMrr.baseCurrency,
                        )}
                      </strong>
                      <small>
                        {summary.projectedMrr.oneTime.byCurrency
                          .map((item) =>
                            formatMoneyMinor(item.amountMinor, item.currency),
                          )
                          .join(' · ')}
                      </small>
                    </div>
                  )}
                </StyledMrrMetricRow>

                <StyledMrrProgressTrack
                  role="progressbar"
                  aria-label={t`Monthly MRR collection progress`}
                  aria-valuenow={summary.projectedMrr.collectionPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <StyledMrrProgressFill
                    data-tone={
                      summary.projectedMrr.collectionPercent >= 100
                        ? undefined
                        : summary.projectedMrr.collectionPercent > 0
                          ? 'warning'
                          : 'iris'
                    }
                    style={{
                      width: `${summary.projectedMrr.collectionPercent}%`,
                    }}
                  />
                </StyledMrrProgressTrack>
              </>
            )}

            {summary.projectedMrr.mrrClientCount === 0 &&
              summary.projectedMrr.oneTime.clientCount > 0 && (
                <StyledClientTagRow>
                  <StyledClientTag>
                    {t`One-time engagements (excluded from MRR): ${formatFinanceAmountMicros(summary.projectedMrr.oneTime.totalAedMicros, summary.projectedMrr.baseCurrency)} (${summary.projectedMrr.oneTime.byCurrency.map((item) => formatMoneyMinor(item.amountMinor, item.currency)).join(' · ')})`}
                  </StyledClientTag>
                </StyledClientTagRow>
              )}
          </StyledMrrSummaryCard>
        )}

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
            <Trans>Overdue</Trans>
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
            data-active={filter === 'needsSetup'}
            onClick={() => setFilter('needsSetup')}
          >
            <Trans>Setup needed</Trans>
          </StyledClientFilterPill>
        </StyledClientFilterPills>

        <StyledDeliveryRow>
          <input
            aria-label={t`Search clients`}
            value={queryText}
            maxLength={120}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder={t`Search clients by name or service…`}
            style={{ minWidth: '220px' }}
          />
          <StyledClientFilterPill
            type="button"
            data-danger={cleanupMode}
            onClick={() => {
              if (cleanupMode) exitCleanupMode();
              else setCleanupMode(true);
            }}
          >
            {cleanupMode ? t`Exit cleanup` : t`Clean up list`}
          </StyledClientFilterPill>
        </StyledDeliveryRow>
      </StyledClientFilterBar>

      {cleanupMode && (
        <StyledCleanupBanner role="region" aria-label={t`Bulk client cleanup`}>
          <p>
            {selectedForRemoval.length > 0
              ? t`${selectedForRemoval.length} selected for removal. CRM company records are never deleted.`
              : t`Click any non-client business below to mark it for removal from your Clients list.`}
          </p>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={updatingRoster}
              onClick={() =>
                setSelectedForRemoval(filteredClients.map((item) => item.id))
              }
            >
              <Trans>Select all visible</Trans>
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              data-primary="true"
              disabled={updatingRoster || selectedForRemoval.length === 0}
              onClick={() => void handleBulkRemove()}
            >
              {selectedForRemoval.length === 1
                ? t`Remove 1 non-client`
                : t`Remove ${selectedForRemoval.length} non-clients`}
            </StyledDeliveryButton>
            <StyledDeliveryButton
              type="button"
              disabled={updatingRoster}
              onClick={exitCleanupMode}
            >
              <Trans>Done</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </StyledCleanupBanner>
      )}

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
            const nextTask: ClientHubDueTask | null =
              client.dueTasks.length > 0 ? client.dueTasks[0] : null;
            const remainingDueCount = Math.max(0, client.dueTasks.length - 1);
            const isMarkedForRemoval = selectedSet.has(client.id);
            const feeText = client.finance?.fee
              ? `${formatMoneyMinor(
                  client.finance.fee.amount,
                  client.finance.fee.currency,
                )}${formatFeeCadenceShort(client.finance.fee.cadence)}`
              : null;

            return (
              <StyledClientCard
                key={client.id}
                data-overdue={hasOverdue}
                data-attention={client.needsAttention}
                data-cleanup-mode={cleanupMode}
                data-cleanup-selected={cleanupMode && isMarkedForRemoval}
                onClick={
                  cleanupMode
                    ? () => toggleCleanupSelection(client.id)
                    : undefined
                }
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
                        {cleanupMode ? (
                          client.name
                        ) : (
                          <Link
                            to={clientWorkspaceDestination({
                              companyId: client.id,
                              section: 'overview',
                            })}
                          >
                            {client.name}
                          </Link>
                        )}
                      </h3>
                      <small>
                        {client.domainName ??
                          (client.projects.length === 1
                            ? t`1 project`
                            : t`${client.projects.length} projects`)}
                      </small>
                    </StyledClientTitleBlock>
                  </StyledClientIdentity>

                  {cleanupMode ? (
                    <input
                      type="checkbox"
                      aria-label={t`Select ${client.name} for removal`}
                      checked={isMarkedForRemoval}
                      onChange={() => toggleCleanupSelection(client.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <StyledClientTag data-tone={statusTone}>
                      {statusText}
                    </StyledClientTag>
                  )}
                </StyledClientCardHeader>

                <StyledClientMetricStrip>
                  <div>
                    <span>
                      <Trans>Open tasks</Trans>
                    </span>
                    <strong>{client.tasksSummary.openCount}</strong>
                  </div>
                  <div data-danger={hasOverdue}>
                    <span>
                      <Trans>Overdue</Trans>
                    </span>
                    <strong>{client.tasksSummary.overdueCount}</strong>
                  </div>
                  <div>
                    <span>
                      {feeText ? (
                        <Trans>Agreed fee</Trans>
                      ) : (
                        <Trans>Projects</Trans>
                      )}
                    </span>
                    <strong>{feeText ?? client.projects.length}</strong>
                  </div>
                </StyledClientMetricStrip>

                {nextTask !== null ? (
                  <StyledNextDeliverable
                    data-overdue={nextTask.isOverdue}
                    data-due-soon={nextTask.isDueSoon}
                  >
                    <div className="deliverable-kicker">
                      <span>
                        {nextTask.isOverdue ? (
                          <Trans>Overdue deliverable</Trans>
                        ) : (
                          <Trans>Next deliverable</Trans>
                        )}
                      </span>
                      <span>{formatDueLabel(nextTask.dueAt)}</span>
                    </div>
                    <Link
                      to={`/delivery?view=planner&plannerView=tasks&project=${nextTask.projectId}&task=${nextTask.id}&clientCompany=${client.id}&clientProject=${nextTask.projectId}`}
                      title={`${nextTask.title} (${formatTaskStatus(nextTask.status)})`}
                      onClick={(event) => {
                        if (cleanupMode) event.preventDefault();
                      }}
                    >
                      {nextTask.title}
                    </Link>
                    <small>
                      {nextTask.projectName}
                      {nextTask.assigneeName
                        ? ` · ${nextTask.assigneeName}`
                        : ''}
                      {remainingDueCount > 0
                        ? ` · +${remainingDueCount} ${t`more due`}`
                        : ''}
                    </small>
                  </StyledNextDeliverable>
                ) : (
                  <StyledNextDeliverable data-empty="true">
                    {client.projects.length > 0 ? (
                      <Trans>No open due tasks right now.</Trans>
                    ) : (
                      <Trans>No project yet — open client to add one.</Trans>
                    )}
                  </StyledNextDeliverable>
                )}

                {(client.services.length > 0 ||
                  client.tasksSummary.blockedCount > 0 ||
                  client.portal.pendingSubmissionsCount > 0 ||
                  (client.finance?.overdueReceivablesCount ?? 0) > 0 ||
                  Boolean(client.finance?.currentMonthMrr)) && (
                  <StyledClientTagRow>
                    {client.services.slice(0, 3).map((service) => (
                      <StyledClientTag key={service}>{service}</StyledClientTag>
                    ))}
                    {client.services.length > 3 && (
                      <StyledClientTag>
                        +{client.services.length - 3}
                      </StyledClientTag>
                    )}
                    {client.tasksSummary.blockedCount > 0 && (
                      <StyledClientTag data-tone="danger">
                        {t`${client.tasksSummary.blockedCount} blocked`}
                      </StyledClientTag>
                    )}
                    {client.portal.pendingSubmissionsCount > 0 && (
                      <StyledClientTag data-tone="cyan">
                        {t`${client.portal.pendingSubmissionsCount} onboarding pending`}
                      </StyledClientTag>
                    )}
                    {(client.finance?.overdueReceivablesCount ?? 0) > 0 && (
                      <StyledClientTag data-tone="danger">
                        {t`Overdue invoice`}
                      </StyledClientTag>
                    )}
                    {client.finance?.currentMonthMrr &&
                      (client.finance.currentMonthMrr.status === 'ONE_TIME' ? (
                        <StyledClientTag>
                          <Trans>One-time fee</Trans>
                        </StyledClientTag>
                      ) : (
                        <StyledClientTag
                          data-tone={
                            client.finance.currentMonthMrr.status === 'PAID'
                              ? 'success'
                              : client.finance.currentMonthMrr.status ===
                                  'PARTIAL'
                                ? 'warning'
                                : 'iris'
                          }
                        >
                          {client.finance.currentMonthMrr.status === 'PAID'
                            ? t`MRR paid`
                            : client.finance.currentMonthMrr.status ===
                                'PARTIAL'
                              ? t`MRR ${client.finance.currentMonthMrr.collectionPercent}% paid`
                              : t`MRR unpaid`}
                        </StyledClientTag>
                      ))}
                  </StyledClientTagRow>
                )}

                {!cleanupMode && (
                  <StyledClientCardFooter>
                    <Link
                      to={clientWorkspaceDestination({
                        companyId: client.id,
                        section: 'overview',
                      })}
                    >
                      <Trans>Open client →</Trans>
                    </Link>
                    <StyledClientSubtleButton
                      type="button"
                      disabled={updatingRoster}
                      onClick={() =>
                        void onRemoveClients([
                          { id: client.id, name: client.name },
                        ])
                      }
                      title={t`Remove from your Clients list (keeps CRM company intact)`}
                    >
                      <Trans>Not a client</Trans>
                    </StyledClientSubtleButton>
                  </StyledClientCardFooter>
                )}
              </StyledClientCard>
            );
          })}
        </StyledClientPortfolioGrid>
      )}
    </StyledDeliveryStack>
  );
};

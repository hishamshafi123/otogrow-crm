import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ClientHubItem } from '@/delivery/client-workspace/client-hub.types';
import {
  formatBillingMode,
  formatCurrencyTotals,
  formatDueLabel,
  formatTaskStatus,
} from '@/delivery/client-workspace/client-hub-format';
import { clientWorkspaceDestination } from '@/delivery/client-workspace/client-workspace-navigation';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import {
  StyledClientKpiCard,
  StyledClientKpiGrid,
  StyledClientTag,
  StyledClientTagRow,
  StyledDueWorkItem,
  StyledDueWorkList,
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ClientSelectedOverviewProps = {
  companyId: string;
  hubClient: ClientHubItem | null;
};

export const ClientSelectedOverview = ({
  companyId,
  hubClient,
}: ClientSelectedOverviewProps) => {
  const { t } = useLingui();

  if (!hubClient) {
    return (
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h3>
            <Trans>Client summary</Trans>
          </h3>
          <p>
            <Trans>
              Use the tabs above to update this client’s profile, manage
              contacts, configure services, and open their projects or portal.
            </Trans>
          </p>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  }

  const openReceivablesText = hubClient.finance
    ? formatCurrencyTotals(hubClient.finance.openReceivablesByCurrency)
    : '';
  const collectedText = hubClient.finance
    ? formatCurrencyTotals(hubClient.finance.collectedByCurrency)
    : '';

  const signals: {
    key: string;
    tone: 'danger' | 'warning' | 'cyan';
    text: string;
  }[] = [];
  if (hubClient.tasksSummary.overdueCount > 0) {
    signals.push({
      key: 'overdue',
      tone: 'danger',
      text: t`${hubClient.tasksSummary.overdueCount} overdue tasks need immediate attention.`,
    });
  }
  if (hubClient.tasksSummary.blockedCount > 0) {
    signals.push({
      key: 'blocked',
      tone: 'danger',
      text: t`${hubClient.tasksSummary.blockedCount} tasks are currently blocked.`,
    });
  }
  if (hubClient.tasksSummary.changesRequestedCount > 0) {
    signals.push({
      key: 'changes',
      tone: 'warning',
      text: t`${hubClient.tasksSummary.changesRequestedCount} tasks have changes requested.`,
    });
  }
  if (hubClient.tasksSummary.inReviewCount > 0) {
    signals.push({
      key: 'review',
      tone: 'warning',
      text: t`${hubClient.tasksSummary.inReviewCount} tasks are waiting in review.`,
    });
  }
  if (hubClient.portal.pendingSubmissionsCount > 0) {
    signals.push({
      key: 'onboarding',
      tone: 'cyan',
      text: t`${hubClient.portal.pendingSubmissionsCount} client onboarding responses are awaiting review.`,
    });
  }
  if ((hubClient.finance?.overdueReceivablesCount ?? 0) > 0) {
    signals.push({
      key: 'receivables',
      tone: 'danger',
      text: t`${hubClient.finance?.overdueReceivablesCount} client receivables are past due.`,
    });
  }
  if (hubClient.projects.length === 0) {
    signals.push({
      key: 'no-project',
      tone: 'cyan',
      text: t`No delivery project exists yet for this client.`,
    });
  } else if (hubClient.servicePlans.length === 0) {
    signals.push({
      key: 'no-plan',
      tone: 'cyan',
      text: t`No service plan is configured yet for this client’s projects.`,
    });
  }

  return (
    <StyledDeliveryStack>
      <StyledClientKpiGrid aria-label={t`Selected client metrics`}>
        <StyledClientKpiCard
          data-tone={
            hubClient.tasksSummary.overdueCount > 0 ? 'danger' : undefined
          }
        >
          <span>
            <Trans>Open work</Trans>
          </span>
          <strong>{hubClient.tasksSummary.openCount}</strong>
          <small>
            {hubClient.tasksSummary.overdueCount > 0
              ? t`${hubClient.tasksSummary.overdueCount} overdue · ${hubClient.tasksSummary.dueSoonCount} due soon`
              : t`${hubClient.tasksSummary.completedCount} completed`}
          </small>
        </StyledClientKpiCard>

        <StyledClientKpiCard>
          <span>
            <Trans>Projects &amp; plans</Trans>
          </span>
          <strong>{hubClient.projects.length}</strong>
          <small>
            {hubClient.servicePlans.length === 1
              ? t`1 service plan`
              : t`${hubClient.servicePlans.length} service plans`}
          </small>
        </StyledClientKpiCard>

        <StyledClientKpiCard>
          <span>
            <Trans>Client portal</Trans>
          </span>
          <strong>{hubClient.portal.activeLinksCount}</strong>
          <small>
            {hubClient.portal.pendingClientReviewsCount > 0
              ? t`${hubClient.portal.pendingClientReviewsCount} shared items awaiting approval`
              : t`Active portal links`}
          </small>
        </StyledClientKpiCard>

        {hubClient.finance && (
          <StyledClientKpiCard
            data-tone={
              hubClient.finance.overdueReceivablesCount > 0
                ? 'danger'
                : undefined
            }
          >
            <span>
              <Trans>Receivables &amp; collected</Trans>
            </span>
            <strong>{openReceivablesText || collectedText || '—'}</strong>
            <small>
              {openReceivablesText
                ? collectedText
                  ? t`Open · Collected ${collectedText}`
                  : t`Open client receivables`
                : collectedText
                  ? t`Total collected`
                  : t`No finance entries linked yet`}
            </small>
          </StyledClientKpiCard>
        )}
      </StyledClientKpiGrid>

      {(hubClient.services.length > 0 || hubClient.billingModes.length > 0) && (
        <StyledClientTagRow>
          {hubClient.billingModes.map((mode) => (
            <StyledClientTag key={mode} data-tone="iris">
              {formatBillingMode(mode)}
            </StyledClientTag>
          ))}
          {hubClient.services.map((service) => (
            <StyledClientTag key={service}>{service}</StyledClientTag>
          ))}
        </StyledClientTagRow>
      )}

      {signals.length > 0 && (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <h3>
              <Trans>Important signals</Trans>
            </h3>
            <StyledClientTagRow>
              {signals.map((signal) => (
                <StyledClientTag key={signal.key} data-tone={signal.tone}>
                  {signal.text}
                </StyledClientTag>
              ))}
            </StyledClientTagRow>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}

      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h3>
              <Trans>Due work &amp; upcoming tasks</Trans>
            </h3>
            {hubClient.projects.length > 0 && (
              <Link
                to={`/delivery?view=planner&plannerView=tasks&project=${hubClient.projects[0].id}&clientCompany=${companyId}&clientProject=${hubClient.projects[0].id}`}
              >
                <Trans>Open all tasks →</Trans>
              </Link>
            )}
          </StyledDeliveryRow>

          {hubClient.dueTasks.length > 0 ? (
            <StyledDueWorkList>
              {hubClient.dueTasks.map((task) => (
                <StyledDueWorkItem
                  key={task.id}
                  data-overdue={task.isOverdue}
                  data-due-soon={task.isDueSoon}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      to={`/delivery?view=planner&plannerView=tasks&project=${task.projectId}&task=${task.id}&clientCompany=${companyId}&clientProject=${task.projectId}`}
                    >
                      {task.title}
                    </Link>
                    <div>
                      <small>
                        {task.projectName} · {formatTaskStatus(task.status)}
                        {task.assigneeName ? ` · ${task.assigneeName}` : ''}
                      </small>
                    </div>
                  </div>
                  <StyledClientTag
                    data-tone={
                      task.isOverdue
                        ? 'danger'
                        : task.isDueSoon
                          ? 'warning'
                          : undefined
                    }
                  >
                    {task.isOverdue
                      ? t`Overdue · ${formatDueLabel(task.dueAt)}`
                      : formatDueLabel(task.dueAt)}
                  </StyledClientTag>
                </StyledDueWorkItem>
              ))}
            </StyledDueWorkList>
          ) : (
            <p>
              <Trans>No open tasks scheduled for this client right now.</Trans>
            </p>
          )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>

      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h3>
            <Trans>Quick client actions</Trans>
          </h3>
          <StyledDeliveryRow>
            <ClientSetupLink companyId={companyId}>
              <Trans>Add project or service</Trans>
            </ClientSetupLink>
            <Link
              to={clientWorkspaceDestination({
                companyId,
                section: 'contacts',
              })}
            >
              <Trans>Manage contacts</Trans>
            </Link>
            <Link
              to={clientWorkspaceDestination({
                companyId,
                section: 'portal',
              })}
            >
              <Trans>Portal &amp; commitments</Trans>
            </Link>
            {hubClient.finance && (
              <Link to="/delivery?view=finance">
                <Trans>Record client payment or receivable</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    </StyledDeliveryStack>
  );
};

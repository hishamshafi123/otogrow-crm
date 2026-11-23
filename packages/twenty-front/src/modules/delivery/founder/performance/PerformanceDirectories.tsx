import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { type DeliveryFounderPerformanceQuery } from '~/generated-metadata/graphql';
import {
  formatFinanceAmountMicros,
  formatFinanceRecordedMargin,
} from '@/delivery/finance/finance-money';
import {
  formatPerformanceMonth,
  formatPerformanceRate,
} from '@/delivery/founder/performance/performance-format';
import { classifyClientHealth } from '@/delivery/founder/performance/admin-dashboard-metrics';
import {
  StyledFilterTab,
  StyledFilterTabs,
  StyledStatusPill,
} from '@/delivery/founder/performance/adminDashboardStyles';
import {
  StyledPerformanceList,
  StyledPerformanceMuted,
  StyledPerformanceRecord,
  StyledPerformanceRecordMetrics,
} from '@/delivery/founder/performance/performanceStyles';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PerformanceSnapshot =
  DeliveryFounderPerformanceQuery['deliveryFounderPerformance'];
type PerformanceClient = PerformanceSnapshot['clients'][number];
type PerformanceEmployee = PerformanceSnapshot['employees'][number];

const unavailable = (value: string | null) => value ?? '—';

export const PerformanceClients = ({
  clients,
  total,
  month,
  timezone,
  canReadFinance,
}: {
  clients: PerformanceClient[];
  total: number;
  month: string;
  timezone: string;
  canReadFinance: boolean;
}) => {
  const { t } = useLingui();
  const [filter, setFilter] = useState<'all' | 'attention' | 'finance'>('all');
  const attentionClients = clients.filter(
    (client) => classifyClientHealth(client) === 'attention',
  );
  const financeClients = clients.filter((client) => client.finance.length > 0);
  const visibleClients =
    filter === 'attention'
      ? attentionClients
      : filter === 'finance'
        ? financeClients
        : clients;

  return (
    <StyledDeliveryCard aria-label={t`Client performance`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <div>
            <h2>
              <Trans>Clients</Trans>
            </h2>
            <StyledPerformanceMuted>
              {total === 1 ? t`1 client project` : t`${total} client projects`}
            </StyledPerformanceMuted>
          </div>
          {clients.length > 0 && (
            <StyledFilterTabs role="group" aria-label={t`Filter client health`}>
              <StyledFilterTab
                type="button"
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                {t`All (${clients.length})`}
              </StyledFilterTab>
              <StyledFilterTab
                type="button"
                aria-pressed={filter === 'attention'}
                onClick={() => setFilter('attention')}
              >
                {t`Needs attention (${attentionClients.length})`}
              </StyledFilterTab>
              {canReadFinance && (
                <StyledFilterTab
                  type="button"
                  aria-pressed={filter === 'finance'}
                  onClick={() => setFilter('finance')}
                >
                  {t`With finance (${financeClients.length})`}
                </StyledFilterTab>
              )}
            </StyledFilterTabs>
          )}
        </StyledDeliveryRow>
        <p>
          <Trans>
            Recorded contribution by client project. Company and unassigned
            costs remain separate.
          </Trans>
        </p>
        {!clients.length ? (
          <p>
            <Trans>
              No client projects are available. Set up a client and project
              before measuring client performance.
            </Trans>
          </p>
        ) : !visibleClients.length ? (
          <p>
            <Trans>
              No client projects match this filter on the current page.
            </Trans>
          </p>
        ) : (
          <StyledPerformanceList>
            {visibleClients.map((client) => {
              const health = classifyClientHealth(client);
              const workDestination = `/delivery?view=planner&plannerView=tasks&project=${client.projectId}&taskTimezone=${encodeURIComponent(timezone)}`;
              const clientDestination = client.companyId
                ? `/delivery?view=clients&clientCompany=${client.companyId}&clientProject=${client.projectId}`
                : workDestination;
              return (
                <article key={client.projectId} aria-label={client.projectName}>
                  <StyledPerformanceRecord>
                    <StyledDeliveryStack>
                      <div>
                        <StyledDeliveryRow>
                          <h3>{client.projectName}</h3>
                          <StyledStatusPill
                            data-tone={
                              health === 'attention'
                                ? 'warning'
                                : health === 'watch'
                                  ? 'accent'
                                  : 'positive'
                            }
                          >
                            {health === 'attention'
                              ? t`Needs attention`
                              : health === 'watch'
                                ? t`Open receivables`
                                : t`Steady`}
                          </StyledStatusPill>
                        </StyledDeliveryRow>
                        <small>
                          {client.teamCount === 1
                            ? t`1 active team member`
                            : t`${client.teamCount} active team members`}
                        </small>
                      </div>
                      <StyledDeliveryRow>
                        <Link to={clientDestination}>
                          {client.companyId
                            ? t`Open client`
                            : t`Open client work`}
                        </Link>
                        <Link to={workDestination}>
                          <Trans>Review work</Trans>
                        </Link>
                      </StyledDeliveryRow>
                      <p>
                        {t`${client.operations.openTaskCount} open`} ·{' '}
                        {t`${client.operations.overdueTaskCount} overdue`} ·{' '}
                        {t`${client.operations.approvedTaskCount} approved this month`}
                      </p>
                    </StyledDeliveryStack>
                    <StyledDeliveryStack>
                      {canReadFinance && !client.finance.length && (
                        <p>
                          <Trans>
                            No posted monthly finance or current cash balance is
                            recorded for this client.
                          </Trans>
                        </p>
                      )}
                      {client.finance.map((finance) => (
                        <section
                          key={finance.currency}
                          aria-label={t`${client.projectName} ${finance.currency}`}
                        >
                          <StyledDeliveryStack>
                            <StyledDeliveryRow>
                              <strong>{finance.currency}</strong>
                              <Link
                                to={`/delivery?view=finance&financeView=monthly&financeMonth=${month}&financeCurrency=${finance.currency}`}
                              >
                                <Trans>Financial sources</Trans>
                              </Link>
                            </StyledDeliveryRow>
                            <StyledPerformanceRecordMetrics>
                              {[
                                [
                                  t`Revenue`,
                                  formatFinanceAmountMicros(
                                    finance.revenueMicros,
                                    finance.currency,
                                  ),
                                ],
                                [
                                  t`Contribution`,
                                  formatFinanceAmountMicros(
                                    finance.resultMicros,
                                    finance.currency,
                                  ),
                                ],
                                [
                                  t`Margin`,
                                  formatFinanceRecordedMargin(
                                    finance.revenueMicros,
                                    finance.resultMicros,
                                  ) ?? t`Unavailable`,
                                ],
                                [
                                  t`Cash collected`,
                                  formatFinanceAmountMicros(
                                    finance.cashCollectedMicros,
                                    finance.currency,
                                  ),
                                ],
                                [
                                  t`Receivables`,
                                  formatFinanceAmountMicros(
                                    finance.receivablesMicros,
                                    finance.currency,
                                  ),
                                ],
                                [
                                  t`Salary allocation`,
                                  formatFinanceAmountMicros(
                                    finance.salaryCostMicros,
                                    finance.currency,
                                  ),
                                ],
                              ].map(([label, value]) => (
                                <div key={label}>
                                  <dt>{label}</dt>
                                  <dd>{value}</dd>
                                </div>
                              ))}
                            </StyledPerformanceRecordMetrics>
                            <small>
                              <Trans>Previous month</Trans>:{' '}
                              {formatFinanceAmountMicros(
                                finance.previousRevenueMicros,
                                finance.currency,
                              )}{' '}
                              <Trans>revenue</Trans> ·{' '}
                              {formatFinanceAmountMicros(
                                finance.previousResultMicros,
                                finance.currency,
                              )}{' '}
                              <Trans>contribution</Trans>
                            </small>
                          </StyledDeliveryStack>
                        </section>
                      ))}
                      <details>
                        <summary>
                          <Trans>Delivery quality and revision evidence</Trans>
                        </summary>
                        <p>
                          <Trans>On-time approval</Trans>:{' '}
                          {unavailable(
                            formatPerformanceRate(
                              client.operations.onTimeApprovedTaskCount,
                              client.operations.dueTaskCount,
                            ),
                          )}{' '}
                          · <Trans>First-pass approval</Trans>:{' '}
                          {unavailable(
                            formatPerformanceRate(
                              client.operations.firstPassApprovedTaskCount,
                              client.operations.reviewedTaskCount,
                            ),
                          )}
                        </p>
                        <p>
                          {t`${client.operations.revisionCount} revision rounds in ${formatPerformanceMonth(month)}`}{' '}
                          ·{' '}
                          {t`${client.operations.internalRevisionCount} internal-defect classifications`}
                        </p>
                      </details>
                    </StyledDeliveryStack>
                  </StyledPerformanceRecord>
                </article>
              );
            })}
          </StyledPerformanceList>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};

export const PerformanceEmployees = ({
  employees,
  total,
  month,
  timezone,
  canReadFinance,
}: {
  employees: PerformanceEmployee[];
  total: number;
  month: string;
  timezone: string;
  canReadFinance: boolean;
}) => {
  const { t } = useLingui();
  return (
    <StyledDeliveryCard aria-label={t`Employee performance`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            <Trans>Employees</Trans>
          </h2>
          <StyledPerformanceMuted>
            {total === 1
              ? t`1 active team member`
              : t`${total} active team members`}
          </StyledPerformanceMuted>
        </StyledDeliveryRow>
        <p>
          <Trans>
            Factual workload and selected-month evidence on current assignments,
            not a cross-role productivity ranking. Reassignment moves a task’s
            historical approval and revision evidence to the current assignee.
          </Trans>
        </p>
        {!employees.length ? (
          <p>
            <Trans>No active team members are available.</Trans>
          </p>
        ) : (
          <StyledPerformanceList>
            {employees.map((employee) => (
              <article key={employee.memberId} aria-label={employee.name}>
                <StyledPerformanceRecord>
                  <StyledDeliveryStack>
                    <div>
                      <h3>{employee.name}</h3>
                      <small>
                        {employee.roleLabel || t`Team member`} ·{' '}
                        {employee.clientCount === 1
                          ? t`1 client project`
                          : t`${employee.clientCount} client projects`}
                      </small>
                    </div>
                    <div>
                      <Link
                        to={`/delivery?view=planner&plannerView=tasks&member=${employee.memberId}&taskTimezone=${encodeURIComponent(timezone)}`}
                      >
                        <Trans>Open assigned work</Trans>
                      </Link>
                    </div>
                    {canReadFinance && (
                      <p>
                        {employee.salaryCosts.length
                          ? t`Posted salary allocation: ${employee.salaryCosts
                              .map((amount) =>
                                formatFinanceAmountMicros(
                                  amount.amountMicros,
                                  amount.currency,
                                ),
                              )
                              .join(' · ')}`
                          : t`No posted salary allocation for this month`}
                      </p>
                    )}
                  </StyledDeliveryStack>
                  <StyledDeliveryStack>
                    <StyledPerformanceRecordMetrics>
                      {[
                        [
                          t`Open work`,
                          String(employee.operations.openTaskCount),
                        ],
                        [
                          t`Overdue`,
                          String(employee.operations.overdueTaskCount),
                        ],
                        [
                          t`Waiting review`,
                          String(employee.operations.waitingReviewCount),
                        ],
                        [
                          t`Approved this month`,
                          String(employee.operations.approvedTaskCount),
                        ],
                        [
                          t`On-time approval`,
                          formatPerformanceRate(
                            employee.operations.onTimeApprovedTaskCount,
                            employee.operations.dueTaskCount,
                          ) ?? t`Not measured`,
                        ],
                        [
                          t`First-pass approval`,
                          formatPerformanceRate(
                            employee.operations.firstPassApprovedTaskCount,
                            employee.operations.reviewedTaskCount,
                          ) ?? t`Not measured`,
                        ],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </StyledPerformanceRecordMetrics>
                    <p>
                      {t`${employee.operations.blockedTaskCount} blocked`} ·{' '}
                      {t`${employee.operations.revisionCount} revisions on current assignments in ${formatPerformanceMonth(month)}`}{' '}
                      ·{' '}
                      {t`${employee.operations.internalRevisionCount} internal-defect classifications`}
                    </p>
                  </StyledDeliveryStack>
                </StyledPerformanceRecord>
              </article>
            ))}
          </StyledPerformanceList>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};

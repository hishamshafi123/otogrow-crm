import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  type DeliveryFounderInboxSla,
  type DeliveryFounderRenewalAlert,
  type DeliveryFounderSalesFunnel,
} from '@/delivery/founder/performance/delivery-founder-executive-insights.graphql';
import {
  StyledAdminTwoColumn,
  StyledCompactList,
  StyledCompactListItem,
  StyledProgressFill,
  StyledProgressTrack,
  StyledStatusPill,
} from '@/delivery/founder/performance/adminDashboardStyles';
import { StyledPerformanceRecordMetrics } from '@/delivery/founder/performance/performanceStyles';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type AdminPipelineAndRenewalDeckProps = {
  salesFunnel: DeliveryFounderSalesFunnel;
  renewals: DeliveryFounderRenewalAlert[];
  inboxSla: DeliveryFounderInboxSla;
};

export const AdminPipelineAndRenewalDeck = ({
  salesFunnel,
  renewals,
  inboxSla,
}: AdminPipelineAndRenewalDeckProps) => {
  const { t } = useLingui();
  const maxStageDeals = Math.max(
    1,
    ...salesFunnel.stages.map((stage) => stage.dealCount),
  );
  const inboxAlertCount =
    inboxSla.failedRepliesCount + inboxSla.pendingRepliesCount;

  return (
    <StyledAdminTwoColumn
      aria-label={t`Sales pipeline, renewals and inbox SLA`}
    >
      <StyledDeliveryCard aria-label={t`CRM sales funnel and expiring quotes`}>
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <div>
              <h2>
                <Trans>Sales pipeline & quotes</Trans>
              </h2>
              <small>
                <Trans>
                  Open deals by stage and quotes expiring within 7 days. Deal
                  values remain separate by currency.
                </Trans>
              </small>
            </div>
            <StyledDeliveryRow>
              <StyledStatusPill
                data-tone={
                  salesFunnel.expiringQuotesCount > 0 ? 'warning' : 'accent'
                }
              >
                {salesFunnel.restricted
                  ? t`CRM access required`
                  : salesFunnel.expiringQuotesCount > 0
                    ? t`${salesFunnel.expiringQuotesCount} quotes expiring`
                    : t`${salesFunnel.totalOpenDeals} open deals`}
              </StyledStatusPill>
              <Link to="/objects/opportunities">
                <Trans>Opportunities</Trans>
              </Link>
            </StyledDeliveryRow>
          </StyledDeliveryRow>

          {salesFunnel.restricted ? (
            <p>
              <Trans>
                CRM opportunity and quote read access is required to summarize
                pipeline stages and expiring quotes.
              </Trans>
            </p>
          ) : (
            <>
              <StyledPerformanceRecordMetrics>
                <div>
                  <dt>
                    <Trans>Open pipeline deals</Trans>
                  </dt>
                  <dd>{String(salesFunnel.totalOpenDeals)}</dd>
                </div>
                <div>
                  <dt>
                    <Trans>Won customer deals</Trans>
                  </dt>
                  <dd>{String(salesFunnel.wonDealsCount)}</dd>
                </div>
                <div>
                  <dt>
                    <Trans>Quotes expiring (7d)</Trans>
                  </dt>
                  <dd>{String(salesFunnel.expiringQuotesCount)}</dd>
                </div>
              </StyledPerformanceRecordMetrics>

              {salesFunnel.openValuesByCurrency.length > 0 && (
                <StyledCompactList aria-label={t`Open pipeline by currency`}>
                  {salesFunnel.openValuesByCurrency.map((entry) => (
                    <StyledCompactListItem key={entry.currency}>
                      <span>
                        {t`${entry.currency} open pipeline (${entry.dealCount} deals)`}
                      </span>
                      <strong>
                        {formatFinanceAmountMicros(
                          entry.amountMicros,
                          entry.currency,
                        )}
                      </strong>
                    </StyledCompactListItem>
                  ))}
                </StyledCompactList>
              )}

              {salesFunnel.stages.length > 0 && (
                <StyledCompactList aria-label={t`Deals by stage`}>
                  {salesFunnel.stages.map((stage) => {
                    const width = Math.max(
                      8,
                      Math.round((stage.dealCount / maxStageDeals) * 100),
                    );
                    return (
                      <StyledCompactListItem key={stage.stage}>
                        <div style={{ flex: '1 1 180px' }}>
                          <StyledDeliveryRow>
                            <strong>{stage.stage}</strong>
                            <small>{t`${stage.dealCount} deals`}</small>
                          </StyledDeliveryRow>
                          <StyledProgressTrack>
                            <StyledProgressFill
                              style={{ width: `${width}%` }}
                            />
                          </StyledProgressTrack>
                        </div>
                      </StyledCompactListItem>
                    );
                  })}
                </StyledCompactList>
              )}

              {salesFunnel.expiringQuotes.length > 0 && (
                <StyledDeliveryStack>
                  <StyledDeliveryRow>
                    <h3>
                      <Trans>Quotes expiring soon</Trans>
                    </h3>
                    <Link to="/objects/quotes">
                      <Trans>All quotes</Trans>
                    </Link>
                  </StyledDeliveryRow>
                  <StyledCompactList>
                    {salesFunnel.expiringQuotes.map((quote) => (
                      <StyledCompactListItem
                        key={quote.id}
                        data-tone={
                          quote.daysRemaining <= 0 ? 'danger' : 'warning'
                        }
                      >
                        <div>
                          <strong>{quote.quoteNumber}</strong>
                          <div>
                            <small>
                              {quote.status} · {quote.validUntil} (
                              {quote.daysRemaining < 0
                                ? t`${Math.abs(quote.daysRemaining)}d overdue`
                                : quote.daysRemaining === 0
                                  ? t`Expires today`
                                  : t`In ${quote.daysRemaining}d`}
                              )
                            </small>
                          </div>
                        </div>
                        <strong>
                          {quote.currency && quote.totalAmountMicros
                            ? formatFinanceAmountMicros(
                                quote.totalAmountMicros,
                                quote.currency,
                              )
                            : quote.status}
                        </strong>
                      </StyledCompactListItem>
                    ))}
                  </StyledCompactList>
                </StyledDeliveryStack>
              )}
            </>
          )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>

      <StyledDeliveryCard
        aria-label={t`Retainer renewals and client inbox SLA`}
      >
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <div>
              <h2>
                <Trans>Renewal radar & inbox SLA</Trans>
              </h2>
              <small>
                <Trans>
                  Retainer periods ending within 30 days and pending or failed
                  client inbox replies.
                </Trans>
              </small>
            </div>
            <StyledDeliveryRow>
              <StyledStatusPill
                data-tone={
                  inboxSla.failedRepliesCount > 0
                    ? 'danger'
                    : renewals.length > 0 || inboxAlertCount > 0
                      ? 'warning'
                      : 'positive'
                }
              >
                {renewals.length > 0
                  ? t`${renewals.length} renewing soon`
                  : t`Renewals clear`}
              </StyledStatusPill>
              <Link to="/delivery?view=inbox">
                <Trans>Open inbox</Trans>
              </Link>
            </StyledDeliveryRow>
          </StyledDeliveryRow>

          <StyledPerformanceRecordMetrics>
            <div>
              <dt>
                <Trans>Connected inbox threads</Trans>
              </dt>
              <dd>{String(inboxSla.connectedThreadsCount)}</dd>
            </div>
            <div>
              <dt>
                <Trans>Pending replies</Trans>
              </dt>
              <dd>{String(inboxSla.pendingRepliesCount)}</dd>
            </div>
            <div>
              <dt>
                <Trans>Failed / uncertain replies</Trans>
              </dt>
              <dd>{String(inboxSla.failedRepliesCount)}</dd>
            </div>
            <div>
              <dt>
                <Trans>Oldest pending reply</Trans>
              </dt>
              <dd>
                {inboxSla.oldestPendingHours !== null
                  ? t`${inboxSla.oldestPendingHours}h`
                  : t`None`}
              </dd>
            </div>
          </StyledPerformanceRecordMetrics>

          {renewals.length > 0 ? (
            <StyledDeliveryStack>
              <h3>
                <Trans>Upcoming retainer renewals (30 days)</Trans>
              </h3>
              <StyledCompactList aria-label={t`Upcoming renewals`}>
                {renewals.map((item) => (
                  <StyledCompactListItem
                    key={item.periodId}
                    data-tone={item.daysRemaining <= 7 ? 'danger' : 'warning'}
                  >
                    <div>
                      <strong>{item.projectName}</strong>
                      <div>
                        <small>
                          {item.label} · {item.endDateExclusive} (
                          {item.daysRemaining < 0
                            ? t`Ended ${Math.abs(item.daysRemaining)}d ago`
                            : item.daysRemaining === 0
                              ? t`Ends today`
                              : t`${item.daysRemaining}d left`}
                          )
                        </small>
                      </div>
                    </div>
                    <Link
                      to={`/delivery?view=clients${item.companyId ? `&clientCompany=${item.companyId}` : ''}&clientProject=${item.projectId}`}
                    >
                      <Trans>Review plan</Trans>
                    </Link>
                  </StyledCompactListItem>
                ))}
              </StyledCompactList>
            </StyledDeliveryStack>
          ) : (
            <p>
              <Trans>
                No active commitment periods are scheduled to end within the
                next 30 days.
              </Trans>
            </p>
          )}

          {inboxSla.items.length > 0 && (
            <StyledDeliveryStack>
              <h3>
                <Trans>Inbox replies needing attention</Trans>
              </h3>
              <StyledCompactList aria-label={t`Inbox SLA alerts`}>
                {inboxSla.items.map((item) => (
                  <StyledCompactListItem
                    key={item.replyId}
                    data-tone={
                      ['FAILED', 'UNCERTAIN'].includes(item.status)
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    <div>
                      <strong>{item.projectName}</strong>
                      <div>
                        <small>
                          {item.status} · {t`${item.ageHours}h old`}
                          {item.problem ? ` · ${item.problem}` : ''}
                        </small>
                      </div>
                    </div>
                    <Link to="/delivery?view=inbox">
                      <Trans>Inspect reply</Trans>
                    </Link>
                  </StyledCompactListItem>
                ))}
              </StyledCompactList>
            </StyledDeliveryStack>
          )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    </StyledAdminTwoColumn>
  );
};

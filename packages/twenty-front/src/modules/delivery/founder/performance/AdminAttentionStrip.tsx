import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFounderExceptionsQuery,
  type DeliveryReadinessQuery,
} from '~/generated-metadata/graphql';
import { founderActionDestination } from '@/delivery/founder/founder-action-destination';
import { useFounderLabels } from '@/delivery/founder/useFounderLabels';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { useReadinessLabels } from '@/delivery/readiness/useReadinessLabels';
import {
  StyledCompactList,
  StyledCompactListItem,
  StyledQuickLinks,
  StyledStatusPill,
  StyledAdminPanel,
  StyledAdminSectionHeader,
} from '@/delivery/founder/performance/adminDashboardStyles';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ExceptionsSnapshot =
  DeliveryFounderExceptionsQuery['deliveryFounderExceptions'];
type ReadinessItem =
  DeliveryReadinessQuery['deliveryReadiness']['items'][number];

type AdminAttentionStripProps = {
  exceptions: ExceptionsSnapshot | null;
  degradedConnections: ReadinessItem[];
  attentionHref: string;
  month: string;
  currency?: string;
};

export const AdminAttentionStrip = ({
  exceptions,
  degradedConnections,
  attentionHref,
  month,
  currency,
}: AdminAttentionStripProps) => {
  const { t } = useLingui();
  const founderLabels = useFounderLabels();
  const financeLabels = useFinanceLabels();
  const readinessLabels = useReadinessLabels();

  const topItems = exceptions?.items.slice(0, 5) ?? [];
  const totalExceptions = exceptions?.totalCount ?? 0;
  const totalOpen = totalExceptions + degradedConnections.length;

  const domainLink = (domain: string) => {
    const params = new URLSearchParams({
      view: 'health',
      founderPanel: 'attention',
      founderMonth: month,
    });
    if (domain !== 'ALL') params.set('founderDomain', domain);
    if (currency) params.set('founderCurrency', currency);
    return `/delivery?${params}`;
  };

  return (
    <StyledAdminPanel aria-label={t`Needs attention now`}>
      <StyledDeliveryStack>
        <StyledAdminSectionHeader>
          <div>
            <h2>
              <Trans>Needs attention now</Trans>
            </h2>
            <small>
              <Trans>
                Highest-priority exceptions and degraded connections across the
                workspace.
              </Trans>
            </small>
          </div>
          <StyledDeliveryRow>
            <StyledStatusPill
              data-tone={totalOpen > 0 ? 'warning' : 'positive'}
            >
              {totalOpen > 0 ? t`${totalOpen} active` : t`All clear`}
            </StyledStatusPill>
            <Link to={attentionHref}>
              {totalExceptions > 0
                ? t`View all (${totalExceptions})`
                : t`Open attention queue`}
            </Link>
          </StyledDeliveryRow>
        </StyledAdminSectionHeader>

        {exceptions && exceptions.counts.length > 0 && (
          <StyledQuickLinks aria-label={t`Exception areas`}>
            {exceptions.counts
              .filter((entry) => entry.count > 0)
              .map((entry) => (
                <Link key={entry.domain} to={domainLink(entry.domain)}>
                  <span>
                    {founderLabels.domains[entry.domain] ?? entry.domain}
                  </span>
                  <strong>{entry.count}</strong>
                </Link>
              ))}
          </StyledQuickLinks>
        )}

        {degradedConnections.length > 0 && (
          <StyledCompactList aria-label={t`Degraded connections`}>
            {degradedConnections.slice(0, 3).map((item) => (
              <StyledCompactListItem key={item.id} data-tone="danger">
                <div>
                  <strong>
                    {readinessLabels.capabilities[item.capability] ??
                      item.capability}
                    {item.accountName ? ` · ${item.accountName}` : ''}
                  </strong>
                  <div>
                    <small>
                      {readinessLabels.statuses[item.status] ?? item.status}
                    </small>
                  </div>
                </div>
                <Link to={`/delivery?view=${item.destination}`}>
                  {readinessLabels.destinations[item.destination] ??
                    t`Inspect connection`}
                </Link>
              </StyledCompactListItem>
            ))}
          </StyledCompactList>
        )}

        {topItems.length > 0 ? (
          <StyledCompactList aria-label={t`Top priority exceptions`}>
            {topItems.map((item) => {
              const destination = founderActionDestination(
                item.nextAction,
                financeLabels.currencies,
              );
              const urgent =
                item.reasonCode === 'FORECAST_NEGATIVE_CLOSING' ||
                item.reasonCode === 'TASK_BLOCKED' ||
                item.reasonCode === 'TASK_DELIVERY_OVERDUE' ||
                item.domain === 'MANUAL_RISKS';
              return (
                <StyledCompactListItem
                  key={item.key}
                  data-tone={urgent ? 'warning' : undefined}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <div>
                      <small>
                        {founderLabels.domains[item.domain] ?? item.domain} ·{' '}
                        {founderLabels.reason(item.reasonCode)}
                        {isDefined(item.projectName)
                          ? ` · ${item.projectName}`
                          : ''}
                        {item.ownerName ? ` · ${item.ownerName}` : ''}
                      </small>
                    </div>
                  </div>
                  {destination ? (
                    <Link to={destination}>
                      {founderLabels.action(item.nextAction.code)}
                    </Link>
                  ) : (
                    <Link to={attentionHref}>
                      <Trans>Inspect</Trans>
                    </Link>
                  )}
                </StyledCompactListItem>
              );
            })}
          </StyledCompactList>
        ) : (
          degradedConnections.length === 0 && (
            <p>
              <Trans>
                No urgent company exceptions are open for the current filters.
              </Trans>
            </p>
          )
        )}
      </StyledDeliveryStack>
    </StyledAdminPanel>
  );
};

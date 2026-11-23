import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import {
  type DeliveryHandoffsQuery,
  type MetaLeadFormsQuery,
} from '~/generated-metadata/graphql';
import {
  summarizeMetaLeadIntake,
  summarizePendingHandoffs,
} from '@/delivery/founder/performance/admin-dashboard-metrics';
import {
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';
import {
  StyledCompactList,
  StyledCompactListItem,
  StyledStatusPill,
  StyledAdminPanel,
  StyledAdminSectionHeader,
} from '@/delivery/founder/performance/adminDashboardStyles';
import { StyledPerformanceRecordMetrics } from '@/delivery/founder/performance/performanceStyles';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type MetaLeadData = Pick<
  MetaLeadFormsQuery,
  'metaLeadForms' | 'metaLeadFormActivity'
>;
type HandoffsData = DeliveryHandoffsQuery['deliveryHandoffs'];

type AdminGrowthHandoffCardProps = {
  metaLeads: MetaLeadData | null;
  handoffs: HandoffsData | null;
};

export const AdminGrowthHandoffCard = ({
  metaLeads,
  handoffs,
}: AdminGrowthHandoffCardProps) => {
  const { t } = useLingui();
  const leadSummary = metaLeads
    ? summarizeMetaLeadIntake(
        metaLeads.metaLeadForms,
        metaLeads.metaLeadFormActivity,
      )
    : null;
  const handoffSummary = handoffs
    ? summarizePendingHandoffs(handoffs.opportunities, handoffs.handoffs)
    : null;

  if (!leadSummary && !handoffSummary) return null;

  const hasAlerts =
    (leadSummary?.unreadLeads ?? 0) > 0 ||
    (leadSummary?.erroredForms.length ?? 0) > 0 ||
    (handoffSummary?.pendingCount ?? 0) > 0;

  return (
    <StyledAdminPanel
      aria-label={t`Sales intake and client handoffs`}
      data-accent={hasAlerts ? undefined : 'cyan'}
      data-tone={hasAlerts ? 'warning' : undefined}
      onPointerLeave={handleCardSpotlightLeave}
      onPointerMove={handleCardSpotlightMove}
    >
      <StyledDeliveryStack>
        <StyledAdminSectionHeader>
          <div>
            <h2>
              <Trans>Sales intake & handoffs</Trans>
            </h2>
            <small>
              <Trans>
                Meta lead forms waiting follow-up and won deals awaiting
                delivery setup.
              </Trans>
            </small>
          </div>
          <StyledDeliveryRow>
            <StyledStatusPill data-tone={hasAlerts ? 'warning' : 'positive'}>
              {hasAlerts ? t`Follow-up needed` : t`Caught up`}
            </StyledStatusPill>
            <Link to="/delivery?view=clients">
              <Trans>Open clients</Trans>
            </Link>
          </StyledDeliveryRow>
        </StyledAdminSectionHeader>

        <StyledPerformanceRecordMetrics>
          <div>
            <dt>
              <Trans>Unread Meta leads</Trans>
            </dt>
            <dd>{leadSummary ? String(leadSummary.unreadLeads) : '—'}</dd>
          </div>
          <div>
            <dt>
              <Trans>Active lead forms</Trans>
            </dt>
            <dd>
              {leadSummary
                ? `${leadSummary.activeFormCount}/${leadSummary.totalFormCount}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>
              <Trans>Won awaiting handoff</Trans>
            </dt>
            <dd>
              {handoffSummary ? String(handoffSummary.pendingCount) : '—'}
            </dd>
          </div>
        </StyledPerformanceRecordMetrics>

        {leadSummary && leadSummary.erroredForms.length > 0 && (
          <StyledCompactList aria-label={t`Lead form sync issues`}>
            {leadSummary.erroredForms.slice(0, 2).map((form) => (
              <StyledCompactListItem key={form.id} data-tone="danger">
                <div>
                  <strong>{form.name}</strong>
                  <div>
                    <small>{form.lastError}</small>
                  </div>
                </div>
                <Link to="/settings/meta-ads">
                  <Trans>Fix Meta sync</Trans>
                </Link>
              </StyledCompactListItem>
            ))}
          </StyledCompactList>
        )}

        {handoffSummary && handoffSummary.pendingItems.length > 0 ? (
          <StyledDeliveryStack>
            <h3>
              <Trans>Won deals awaiting delivery handoff</Trans>
            </h3>
            <StyledCompactList>
              {handoffSummary.pendingItems.map((deal) => (
                <StyledCompactListItem key={deal.id} data-tone="warning">
                  <div>
                    <strong>{deal.name}</strong>
                    <div>
                      <small>
                        {deal.quotes.length > 0
                          ? t`${deal.quotes.length} accepted quote(s) ready`
                          : t`Accepted quote or company setup needed`}
                      </small>
                    </div>
                  </div>
                  <Link to="/delivery?view=clients">
                    <Trans>Set up client</Trans>
                  </Link>
                </StyledCompactListItem>
              ))}
            </StyledCompactList>
          </StyledDeliveryStack>
        ) : (
          handoffSummary && (
            <p>
              <Trans>
                All recent won deals with accepted quotes have been handed off
                to delivery.
              </Trans>
            </p>
          )
        )}
      </StyledDeliveryStack>
    </StyledAdminPanel>
  );
};

import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import {
  type DeliveryCapacitySummaryQuery,
  type DeliveryFounderPerformanceQuery,
  type DeliveryReadinessQuery,
  type OtogrowAiBudgetSnapshotQuery,
} from '~/generated-metadata/graphql';
import { formatAiAmount } from '@/otogrow-ai-budget/formatAiAmount';
import {
  summarizeAiBudget,
  summarizeCapacity,
} from '@/delivery/founder/performance/admin-dashboard-metrics';
import {
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';
import {
  StyledAdminThreeColumn,
  StyledCompactList,
  StyledCompactListItem,
  StyledProgressFill,
  StyledProgressTrack,
  StyledStatusPill,
  StyledAdminPanel,
  StyledAdminSectionHeader,
} from '@/delivery/founder/performance/adminDashboardStyles';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type CapacitySnapshot = DeliveryCapacitySummaryQuery['deliveryCapacitySummary'];
type AiBudgetSnapshot = OtogrowAiBudgetSnapshotQuery['otogrowAiBudgetSnapshot'];
type ReadinessSnapshot = DeliveryReadinessQuery['deliveryReadiness'];
type PerformanceOperations =
  DeliveryFounderPerformanceQuery['deliveryFounderPerformance']['operations'];

type AdminOperationsDeckProps = {
  operations: PerformanceOperations;
  capacity: CapacitySnapshot | null;
  aiBudget: AiBudgetSnapshot | null;
  readiness: ReadinessSnapshot | null;
};

export const AdminOperationsDeck = ({
  operations,
  capacity,
  aiBudget,
  readiness,
}: AdminOperationsDeckProps) => {
  const { t } = useLingui();
  const capacitySummary = capacity ? summarizeCapacity(capacity.members) : null;
  const aiSummary = aiBudget ? summarizeAiBudget(aiBudget) : null;

  const readinessItems = readiness?.items ?? [];
  const connectedCount = readinessItems.filter((item) =>
    ['CONNECTED', 'AVAILABLE'].includes(item.status),
  ).length;
  const attentionConnections = readinessItems.filter((item) =>
    ['NEEDS_ATTENTION', 'PAUSED'].includes(item.status),
  );
  const setupConnections = readinessItems.filter(
    (item) => item.status === 'NEEDS_SETUP',
  );

  const defectShare =
    operations.revisionCount > 0
      ? Math.round(
          (operations.internalRevisionCount / operations.revisionCount) * 100,
        )
      : null;

  return (
    <StyledAdminThreeColumn
      aria-label={t`Operations, AI spend and system health`}
    >
      <StyledAdminPanel
        aria-label={t`Team capacity and review load`}
        data-accent={
          (capacitySummary?.overloadedMembers ?? 0) === 0 ? 'violet' : undefined
        }
        data-tone={
          (capacitySummary?.overloadedMembers ?? 0) > 0 ? 'warning' : undefined
        }
        onPointerLeave={handleCardSpotlightLeave}
        onPointerMove={handleCardSpotlightMove}
      >
        <StyledDeliveryStack>
          <StyledAdminSectionHeader>
            <h3>
              <Trans>Team capacity (7 days)</Trans>
            </h3>
            <Link to="/delivery?view=planner&plannerView=capacity">
              <Trans>Open capacity</Trans>
            </Link>
          </StyledAdminSectionHeader>

          {capacitySummary ? (
            <>
              <StyledDeliveryRow>
                <StyledStatusPill
                  data-tone={
                    capacitySummary.overloadedMembers > 0
                      ? 'warning'
                      : 'positive'
                  }
                >
                  {capacitySummary.overloadedMembers > 0
                    ? t`${capacitySummary.overloadedMembers} overloaded`
                    : t`Balanced load`}
                </StyledStatusPill>
                <small>
                  {t`${capacitySummary.totalNeedsPlanning} needing plan · ${operations.waitingReviewCount} in review`}
                </small>
              </StyledDeliveryRow>

              {capacitySummary.topOverloaded.length > 0 ? (
                <StyledCompactList>
                  {capacitySummary.topOverloaded.map((member) => (
                    <StyledCompactListItem
                      key={member.memberId}
                      data-tone="warning"
                    >
                      <span>{member.name}</span>
                      <strong>
                        {t`+${member.overloadHours}h (${member.overloadDays}d)`}
                      </strong>
                    </StyledCompactListItem>
                  ))}
                </StyledCompactList>
              ) : (
                <p>
                  <Trans>
                    No team members exceed planned daily capacity in the next 7
                    days.
                  </Trans>
                </p>
              )}
            </>
          ) : (
            <p>
              {t`${operations.waitingReviewCount} submissions waiting review · ${operations.revisionCount} revisions this month`}
            </p>
          )}

          <small>
            {defectShare !== null
              ? t`Internal defect share: ${defectShare}% (${operations.internalRevisionCount}/${operations.revisionCount} revisions)`
              : t`No revision rounds recorded in the selected month.`}
          </small>
        </StyledDeliveryStack>
      </StyledAdminPanel>

      <StyledAdminPanel
        aria-label={t`AI spend and caps`}
        data-accent="cyan"
        data-tone={
          aiSummary &&
          (aiSummary.unresolvedCount > 0 ||
            (aiSummary.utilizationPercent ?? 0) >= 85)
            ? 'warning'
            : undefined
        }
        onPointerLeave={handleCardSpotlightLeave}
        onPointerMove={handleCardSpotlightMove}
      >
        <StyledDeliveryStack>
          <StyledAdminSectionHeader>
            <h3>
              <Trans>AI spend & caps (USD)</Trans>
            </h3>
            <Link to="/delivery?view=agents&agentView=spending">
              <Trans>Manage AI budget</Trans>
            </Link>
          </StyledAdminSectionHeader>

          {aiSummary ? (
            <>
              <StyledDeliveryRow>
                <strong>
                  {formatAiAmount(aiSummary.chargedUsd)}
                  {aiSummary.workspaceCapUsd
                    ? ` / ${formatAiAmount(aiSummary.workspaceCapUsd)}`
                    : ''}
                </strong>
                <StyledStatusPill
                  data-tone={
                    aiSummary.unresolvedCount > 0 ||
                    (aiSummary.utilizationPercent ?? 0) >= 85
                      ? 'warning'
                      : 'positive'
                  }
                >
                  {aiSummary.utilizationPercent !== null
                    ? t`${aiSummary.utilizationPercent}% used`
                    : aiSummary.configured
                      ? t`${aiSummary.activeBudgetCount} caps active`
                      : t`No cap set`}
                </StyledStatusPill>
              </StyledDeliveryRow>

              {aiSummary.utilizationPercent !== null && (
                <StyledProgressTrack aria-label={t`Workspace AI cap usage`}>
                  <StyledProgressFill
                    data-tone={
                      aiSummary.utilizationPercent >= 90
                        ? 'danger'
                        : aiSummary.utilizationPercent >= 75
                          ? 'warning'
                          : 'positive'
                    }
                    style={{ width: `${aiSummary.utilizationPercent}%` }}
                  />
                </StyledProgressTrack>
              )}

              <small>
                {t`Held in flight: ${formatAiAmount(aiSummary.heldUsd)}`}
                {aiSummary.workspaceRemainingUsd
                  ? ` · ${t`Remaining: ${formatAiAmount(aiSummary.workspaceRemainingUsd)}`}`
                  : ''}
              </small>
              {aiSummary.unresolvedCount > 0 && (
                <p role="status">
                  {t`${aiSummary.unresolvedCount} AI spend items need reconciliation.`}
                </p>
              )}
            </>
          ) : (
            <p>
              <Trans>
                Open AI budget settings to inspect assistant spend caps and
                reconciliation items.
              </Trans>
            </p>
          )}
        </StyledDeliveryStack>
      </StyledAdminPanel>

      <StyledAdminPanel
        aria-label={t`System and connection readiness`}
        data-tone={
          attentionConnections.length > 0
            ? 'danger'
            : readiness
              ? 'positive'
              : undefined
        }
        onPointerLeave={handleCardSpotlightLeave}
        onPointerMove={handleCardSpotlightMove}
      >
        <StyledDeliveryStack>
          <StyledAdminSectionHeader>
            <h3>
              <Trans>Connections & readiness</Trans>
            </h3>
            <Link to="#company-readiness">
              <Trans>Inspect all</Trans>
            </Link>
          </StyledAdminSectionHeader>

          {readiness ? (
            <>
              <StyledDeliveryRow>
                <StyledStatusPill
                  data-tone={
                    attentionConnections.length > 0 ? 'danger' : 'positive'
                  }
                >
                  {attentionConnections.length > 0
                    ? t`${attentionConnections.length} need attention`
                    : t`${connectedCount}/${readinessItems.length} ready`}
                </StyledStatusPill>
                {setupConnections.length > 0 && (
                  <small>{t`${setupConnections.length} setup pending`}</small>
                )}
              </StyledDeliveryRow>
              <p>
                {attentionConnections.length > 0
                  ? t`Review paused or errored integrations before relying on scheduled imports.`
                  : t`Saved workspace configuration shows no errored or paused connections.`}
              </p>
              <small>
                <Link to="/delivery?view=activity">
                  <Trans>Audit team activity</Trans>
                </Link>
              </small>
            </>
          ) : (
            <p>
              <Trans>
                Check saved integration status and audit logs below.
              </Trans>
            </p>
          )}
        </StyledDeliveryStack>
      </StyledAdminPanel>
    </StyledAdminThreeColumn>
  );
};

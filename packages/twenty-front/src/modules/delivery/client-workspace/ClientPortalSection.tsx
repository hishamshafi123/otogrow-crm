import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ClientHubItem } from '@/delivery/client-workspace/client-hub.types';
import { formatBillingMode } from '@/delivery/client-workspace/client-hub-format';
import { ClientSetupLink } from '@/delivery/onboarding/ClientSetupLink';
import { ClientPortalAccessCard } from '@/delivery/deliverables/ClientPortalAccessCard';
import {
  StyledClientProject,
  StyledClientTag,
  StyledClientTagRow,
} from '@/delivery/client-workspace/client-workspace.styles';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ClientPortalSectionProps = {
  companyId: string;
  hubClient: ClientHubItem | null;
};

export const ClientPortalSection = ({
  companyId,
  hubClient,
}: ClientPortalSectionProps) => {
  const { t } = useLingui();
  const plans = hubClient?.servicePlans ?? [];

  return (
    <StyledDeliveryStack>
      <ClientPortalAccessCard
        companyId={companyId}
        companyName={hubClient?.name}
      />

      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h3>
            <Trans>Client portals, onboarding &amp; commitments</Trans>
          </h3>
          <p>
            <Trans>
              Share secure client portal links, review onboarding responses,
              track client approvals on deliverables, and manage monthly
              delivery commitments.
            </Trans>
          </p>
          <StyledDeliveryRow>
            <Link to={`/delivery?view=deliverables&companyId=${companyId}`}>
              <Trans>Open client deliverables</Trans>
            </Link>
            <Link to="/delivery?view=clients&clientView=agreements">
              <Trans>Open all client portals &amp; links</Trans>
            </Link>
            <Link to="/delivery?view=clients&clientView=commitments">
              <Trans>Open delivery commitments</Trans>
            </Link>
            <ClientSetupLink companyId={companyId}>
              <Trans>Add service plan &amp; portal</Trans>
            </ClientSetupLink>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      </StyledDeliveryCard>

      {plans.length > 0 ? (
        plans.map((plan) => (
          <StyledClientProject key={plan.id}>
            <StyledDeliveryRow>
              <h3>{plan.name}</h3>
              <StyledClientTag data-tone="iris">
                {formatBillingMode(plan.billing)}
              </StyledClientTag>
            </StyledDeliveryRow>
            <StyledClientTagRow>
              {plan.services.map((service) => (
                <StyledClientTag key={service}>{service}</StyledClientTag>
              ))}
              <StyledClientTag
                data-tone={
                  plan.activePortalLinksCount > 0 ? 'success' : undefined
                }
              >
                {plan.activePortalLinksCount === 1
                  ? t`1 active portal link`
                  : t`${plan.activePortalLinksCount} active portal links`}
              </StyledClientTag>
              {plan.pendingSubmissionsCount > 0 && (
                <StyledClientTag data-tone="cyan">
                  {t`${plan.pendingSubmissionsCount} pending onboarding responses`}
                </StyledClientTag>
              )}
              {plan.openSharesCount > 0 && (
                <StyledClientTag data-tone="warning">
                  {t`${plan.openSharesCount} shared items awaiting review`}
                </StyledClientTag>
              )}
            </StyledClientTagRow>
            {plan.contact && (
              <small>
                {t`Primary client contact`}: {plan.contact}
              </small>
            )}
            <StyledDeliveryRow>
              <Link
                to={`/delivery?view=clients&clientView=agreements&clientEngagement=${plan.id}`}
              >
                <Trans>Manage portal links &amp; onboarding →</Trans>
              </Link>
              <Link to="/delivery?view=clients&clientView=commitments">
                <Trans>View commitments</Trans>
              </Link>
            </StyledDeliveryRow>
          </StyledClientProject>
        ))
      ) : (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <p>
              <Trans>
                No service plans or client portals are set up for this client
                yet. Add a service plan to create onboarding forms, portal
                links, and deliverable approvals.
              </Trans>
            </p>
            <ClientSetupLink companyId={companyId}>
              <Trans>Set up first service plan &amp; portal</Trans>
            </ClientSetupLink>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      )}
    </StyledDeliveryStack>
  );
};

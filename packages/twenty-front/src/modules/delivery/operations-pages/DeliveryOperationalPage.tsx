import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useNavigate } from 'react-router-dom';
import { styled } from '@linaria/react';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import { useDeliveryNavigationPreferences } from '@/delivery/navigation/useDeliveryNavigationPreferences';
import { DeliveryNavigationPreferences } from '@/delivery/navigation/DeliveryNavigationPreferences';
import {
  isOperationalPageQuery,
  type DeliveryOperationalView,
} from '@/delivery/operations-pages/operational-page-queries';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useNavigationDrawerExpanded } from '@/navigation/hooks/useNavigationDrawerExpanded';
import { NavigationDrawerCollapseButton } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import {
  StyledDeliveryButton,
  StyledDeliveryCanvas,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const StyledOperationalBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;

type DeliveryOperationalPageProps = {
  view: DeliveryOperationalView;
  children: ReactNode;
};

export const DeliveryOperationalPage = ({
  view,
  children,
}: DeliveryOperationalPageProps) => {
  const permission = useWorkflowAccess();
  return (
    <PageContainer>
      <PageBody>
        <StyledDeliveryCanvas>
          <OperationalWorkspace
            key={`${permission.scope}:${view}`}
            view={view}
            permission={permission}
          >
            {children}
          </OperationalWorkspace>
        </StyledDeliveryCanvas>
      </PageBody>
    </PageContainer>
  );
};

const OperationalWorkspace = ({
  view,
  permission,
  children,
}: DeliveryOperationalPageProps & {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const navigate = useNavigate();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const actor = {
    memberId: permission.access?.memberId ?? '',
    isAdmin: permission.ready && permission.canManageRoles,
    isManager: permission.manager,
  };
  const navigationGroups = useDeliveryNavigation(actor);
  const personalNavigation = useDeliveryNavigationPreferences(
    actor,
    navigationGroups,
  );
  const mobile = useIsMobile();
  const expanded = useNavigationDrawerExpanded();
  const requiresAdministrator = view === 'health' || view === 'activity';
  const authorized =
    permission.ready && (!requiresAdministrator || permission.canManageRoles);
  const confirmedLoss = permission.denied || (permission.ready && !authorized);
  const [mounted, setMounted] = useState(authorized);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  if (authorized && !mounted) setMounted(true);
  useLayoutEffect(() => {
    if (confirmedLoss && mounted) {
      cancelPendingNavigation();
      setMounted(false);
    }
  }, [confirmedLoss, mounted, cancelPendingNavigation]);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshFailed(false);
    const results = await Promise.allSettled([
      permission.refetch(),
      ...(authorized
        ? [
            client.refetchQueries({
              include: 'active',
              onQueryUpdated: (query) =>
                isOperationalPageQuery(view, query.queryName)
                  ? query.refetch()
                  : false,
            }),
          ]
        : []),
    ]);
    setRefreshFailed(results.some((result) => result.status === 'rejected'));
    setRefreshing(false);
  };
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <StyledDeliveryRow>
          {!expanded && <NavigationDrawerCollapseButton direction="right" />}
          <div>
            <h1>
              {view === 'chat'
                ? t`Team chat`
                : view === 'inbox'
                  ? t`Client inbox`
                  : view === 'creative'
                    ? t`Creative studio`
                    : view === 'development'
                      ? t`Development releases`
                      : view === 'competitors'
                        ? t`Competitor sources`
                        : view === 'seo'
                          ? t`SEO results`
                          : view === 'activity'
                            ? t`Team activity`
                            : t`Company overview`}
            </h1>
            <p>
              {view === 'chat'
                ? t`Message teammates and follow up on unread messages.`
                : view === 'inbox'
                  ? t`Read selected client conversations and review each reply before sending.`
                  : view === 'creative'
                    ? t`Plan and produce one exact task at a time.`
                    : view === 'development'
                      ? t`Plan reviewed releases, record deployment and track client handover.`
                      : view === 'competitors'
                        ? t`Register research sources, assign owners and preserve configuration history. Collection is OFF.`
                        : view === 'seo'
                          ? t`Separate completed SEO work from measured client results.`
                          : view === 'activity'
                            ? t`Inspect recorded work and ask evidence-based questions.`
                            : t`Business exceptions and connection readiness.`}
            </p>
          </div>
        </StyledDeliveryRow>
        <StyledDeliveryButton
          type="button"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? t`Refreshing…` : t`Refresh page`}
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {authorized && (
        <DeliveryNavigationPreferences
          key={personalNavigation.scope}
          personalNavigation={personalNavigation}
        />
      )}
      {authorized && mobile && (
        <label>
          <Trans>Go to</Trans>
          <select
            aria-label={t`Go to workspace`}
            value={view}
            onChange={(event) => {
              const destination = `/delivery?view=${event.currentTarget.value}`;
              requestAction(() => navigate(destination));
            }}
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
                    (page) =>
                      !personalNavigation.pinnedPages.some(
                        (pinned) => pinned.view === page.view,
                      ),
                  )
                  .map((page) => (
                    <option key={page.view} value={page.view}>
                      {page.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {refreshFailed && (
        <p role="alert">
          <Trans>
            The latest information could not be fully checked. Try refreshing
            again.
          </Trans>
        </p>
      )}
      {!authorized && (
        <StyledDeliveryStack>
          <p role={confirmedLoss || permission.error ? 'alert' : 'status'}>
            {confirmedLoss
              ? requiresAdministrator
                ? t`Current administrator access is required for this page. Private preparation is no longer available.`
                : t`Current team access was denied. Private records and unsent preparation are no longer available.`
              : permission.error
                ? t`Current access could not be checked. Information is hidden and unsaved work is kept while you retry.`
                : t`Checking your current workspace access…`}
          </p>
          <StyledDeliveryRow>
            <StyledDeliveryButton
              type="button"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <Trans>Check access again</Trans>
            </StyledDeliveryButton>
            <Link to="/delivery?view=home">
              <Trans>Go to Today</Trans>
            </Link>
          </StyledDeliveryRow>
        </StyledDeliveryStack>
      )}
      <StyledOperationalBoundary
        hidden={!authorized}
        disabled={!authorized}
        inert={!authorized || undefined}
        aria-hidden={!authorized || undefined}
      >
        {mounted && children}
      </StyledOperationalBoundary>
    </StyledDeliveryStack>
  );
};

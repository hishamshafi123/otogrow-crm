import { useLayoutEffect } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { DeliveryPageHeader } from '@/delivery/DeliveryPageHeader';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { NavigationDrawerCollapseButton } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerCollapseButton';
import { useNavigationDrawerExpanded } from '@/navigation/hooks/useNavigationDrawerExpanded';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { AdvertisingReports } from '@/delivery/advertising/workbench/AdvertisingReports';
import { AdvertisingSourcePanel } from '@/delivery/advertising/workbench/AdvertisingSourcePanel';
import {
  advertisingDestination,
  readAdvertisingNavigation,
} from '@/delivery/advertising/workbench/advertising-navigation';
import {
  StyledAdvertisingBoundary,
  StyledAdvertisingNavigation,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCanvas,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryAdvertisingPage = () => {
  const permission = useWorkflowAccess();
  return (
    <PageContainer>
      <PageBody>
        <StyledDeliveryCanvas>
          <AdvertisingWorkspace key={permission.scope} />
        </StyledDeliveryCanvas>
      </PageBody>
    </PageContainer>
  );
};
const AdvertisingWorkspace = () => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useApolloClient();
  const parsed = readAdvertisingNavigation(params);
  const state = useAdvertisingContext(parsed.success);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const groups = useDeliveryNavigation(
    state.data?.actor ?? { memberId: '', isAdmin: false, isManager: false },
  );
  const mobile = useIsMobile();
  const expanded = useNavigationDrawerExpanded();
  useLayoutEffect(() => {
    if (state.denied) cancelPendingNavigation();
  }, [state.denied, cancelPendingNavigation]);
  const refresh = async () => {
    await state.permission.refetch().catch(() => undefined);
    const result = await state.query.refetch().catch(() => null);
    if (
      !result?.data ||
      !state.permission.matches(result.data.deliveryAdvertisingContext)
    )
      return;
    await client
      .refetchQueries({
        include: 'active',
        onQueryUpdated: (query) =>
          (query.queryName?.startsWith('DeliveryAdvertising') &&
            query.queryName !== 'DeliveryAdvertisingContext') ||
          query.queryName === 'DeliveryAssistantCatalog'
            ? query.refetch()
            : false,
      })
      .catch(() => undefined);
  };
  return (
    <StyledDeliveryStack>
      <DeliveryPageHeader
        title={t`Advertising`}
        description={t`Review evidence, agree recommendations and follow the work through to observed results.`}
        navigation={
          !expanded && <NavigationDrawerCollapseButton direction="right" />
        }
        actions={
          <StyledDeliveryButton
            data-variant="quiet"
            type="button"
            onClick={() => void refresh()}
          >
            <Trans>Refresh page</Trans>
          </StyledDeliveryButton>
        }
      />
      {mobile && (
        <label>
          <Trans>Go to</Trans>
          <select
            aria-label={t`Go to workspace`}
            value="ads"
            onChange={(event) => {
              const destination = `/delivery?view=${event.target.value}`;
              requestAction(() => navigate(destination));
            }}
          >
            {groups.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.view} value={item.view}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      <StyledAdvertisingNavigation aria-label={t`Advertising tools`}>
        <Link
          to={advertisingDestination(params, { adView: null })}
          aria-current="page"
        >
          <Trans>Reports and reviewed work</Trans>
        </Link>
        <Link to={advertisingDestination(params, { adView: 'legacy' })}>
          <Trans>Connections, manual reports and budgets</Trans>
        </Link>
      </StyledAdvertisingNavigation>
      {!parsed.success && (
        <>
          <p role="alert">
            <Trans>
              This advertising link has invalid report or review selections.
              Clear the selections before continuing.
            </Trans>
          </p>
          <Link to="/delivery?view=ads">
            <Trans>Clear advertising selections</Trans>
          </Link>
        </>
      )}
      {parsed.success && state.data === null && (
        <>
          <p
            role={
              state.denied || state.query.error || state.permission.error
                ? 'alert'
                : 'status'
            }
          >
            {state.denied
              ? t`Your current advertising access was denied. Private drafts are no longer available.`
              : state.query.error || state.permission.error
                ? t`Advertising access could not be verified. Any open draft is hidden and kept while you retry.`
                : t`Loading your advertising workspace…`}
          </p>
          <StyledDeliveryButton type="button" onClick={() => void refresh()}>
            <Trans>Retry advertising access</Trans>
          </StyledDeliveryButton>
        </>
      )}
      <StyledAdvertisingBoundary
        hidden={!parsed.success || state.data === null || state.denied}
        disabled={!parsed.success || state.data === null || state.denied}
        inert={state.data === null || state.denied || undefined}
      >
        {parsed.success && !state.denied && (
          <StyledDeliveryStack>
            {parsed.data.sourceId && parsed.data.sourceKind && (
              <AdvertisingSourcePanel
                key={`${parsed.data.sourceKind}:${parsed.data.sourceId}`}
                state={state}
                selection={{
                  kind: parsed.data.sourceKind,
                  id: parsed.data.sourceId,
                }}
              />
            )}
            <AdvertisingReports state={state} />
          </StyledDeliveryStack>
        )}
      </StyledAdvertisingBoundary>
    </StyledDeliveryStack>
  );
};

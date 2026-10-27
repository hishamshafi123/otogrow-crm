import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import {
  IconBrandMeta,
  IconLayoutDashboard,
  IconBriefcase,
} from 'twenty-ui/icon';
import { t } from '@lingui/core/macro';
import { NavigationDrawerOpenedSection } from '@/navigation-menu-item/display/sections/components/NavigationDrawerOpenedSection';
import { NavigationDrawerWorkspaceSectionSkeletonLoader } from '@/object-metadata/components/NavigationDrawerWorkspaceSectionSkeletonLoader';
import { DeliveryNavigation } from '@/delivery/DeliveryNavigation';
import { NavigationDrawerAnimatedCollapseWrapper } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper';
import { useLocation } from 'react-router-dom';

import { styled } from '@linaria/react';
import { lazy, Suspense } from 'react';

import { themeCssVariables } from 'twenty-ui/theme-constants';

const FavoritesSectionDispatcher = lazy(() =>
  import('@/navigation-menu-item/display/sections/favorites/components/FavoritesSectionDispatcher').then(
    (module) => ({
      default: module.FavoritesSectionDispatcher,
    }),
  ),
);

const WorkspaceSectionDispatcher = lazy(() =>
  import('@/navigation-menu-item/display/sections/workspace/components/WorkspaceSectionDispatcher').then(
    (module) => ({
      default: module.WorkspaceSectionDispatcher,
    }),
  ),
);

const StyledScrollableItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledCrmSection = styled.details`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding-top: ${themeCssVariables.spacing[2]};
  summary {
    align-items: center;
    border-radius: ${themeCssVariables.border.radius.md};
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    display: flex;
    font-size: ${themeCssVariables.font.size.md};
    gap: ${themeCssVariables.spacing[2]};
    min-height: 32px;
    padding: ${themeCssVariables.spacing[1]};
  }
  summary:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
  summary:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue8};
    outline-offset: 2px;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary svg {
    flex-shrink: 0;
  }
`;

export const MainNavigationDrawerScrollableItems = () => {
  const { pathname } = useLocation();
  const isDeliveryWorkspace = pathname === '/delivery';
  const canManageLeadForms = useHasPermissionFlag(
    PermissionFlagType.API_KEYS_AND_WEBHOOKS,
  );
  const crmNavigation = (
    <>
      {canManageLeadForms && (
        <NavigationDrawerItem
          label={t`Meta lead forms`}
          Icon={IconBrandMeta}
          to="/meta-lead-forms"
        />
      )}
      <Suspense fallback={<NavigationDrawerWorkspaceSectionSkeletonLoader />}>
        <FavoritesSectionDispatcher />
        <WorkspaceSectionDispatcher />
      </Suspense>
    </>
  );
  return (
    <StyledScrollableItemsContainer>
      <NavigationDrawerOpenedSection />
      {isDeliveryWorkspace ? (
        <>
          <DeliveryNavigation />
          <StyledCrmSection>
            <summary aria-label={t`Sales & CRM`}>
              <IconBriefcase size={16} />
              <NavigationDrawerAnimatedCollapseWrapper>
                {t`Sales & CRM`}
              </NavigationDrawerAnimatedCollapseWrapper>
            </summary>
            {crmNavigation}
          </StyledCrmSection>
        </>
      ) : (
        <>
          <NavigationDrawerItem
            label={t`Otogrow workspace`}
            Icon={IconLayoutDashboard}
            to="/delivery"
          />
          {crmNavigation}
        </>
      )}
    </StyledScrollableItemsContainer>
  );
};

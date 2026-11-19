import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryNavigation } from '@/delivery/useDeliveryNavigation';
import { useDeliveryNavigationPreferences } from '@/delivery/navigation/useDeliveryNavigationPreferences';
import { getDeliveryEntryView } from '@/delivery/navigation/delivery-navigation-preferences';
import { NavigationDrawerAnimatedCollapseWrapper } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerAnimatedCollapseWrapper';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { NavigationDrawerSection } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerSection';
import { useLingui } from '@lingui/react/macro';
import { useSearchParams } from 'react-router-dom';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { IconChevronDown } from 'twenty-ui/icon';

const StyledNavigation = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-block: 4px;

  .navigation-drawer-item {
    border-radius: 8px;
    height: 38px;
    margin-top: 2px;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }
  .navigation-drawer-item:hover {
    background: ${themeCssVariables.grayScale.gray3};
  }
  .navigation-drawer-item[aria-current='page'] {
    background: ${themeCssVariables.grayScale.gray4};
    color: ${themeCssVariables.font.color.primary};
  }
  .navigation-drawer-item[aria-current='page'] svg {
    color: ${themeCssVariables.color.blue11};
  }
  .navigation-drawer-item:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue11};
    outline-offset: -2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .navigation-drawer-item {
      transition: none;
    }
  }
`;
const StyledSectionLabel = styled.small`
  color: ${themeCssVariables.font.color.secondary};
  display: block;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  padding: 8px 4px 4px;
`;
const StyledGroup = styled.details`
  summary {
    align-items: center;
    border-radius: 8px;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    display: flex;
    font-size: 12px;
    font-weight: 500;
    gap: 8px;
    line-height: 16px;
    min-height: 36px;
    padding: 8px 4px;
    user-select: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }
  summary:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue11};
    outline-offset: -2px;
  }
  summary > svg {
    flex-shrink: 0;
  }
  summary span svg {
    transform: rotate(-90deg);
    transition: transform 120ms ease;
  }
  &[open] summary span svg {
    transform: rotate(0deg);
  }
  @media (prefers-reduced-motion: reduce) {
    summary span svg {
      transition: none;
    }
  }
`;
const StyledGroupLabel = styled.span`
  align-items: center;
  display: flex;
  gap: 8px;
`;

export const DeliveryNavigation = () => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const permission = useWorkflowAccess();
  const actor = {
    memberId: permission.access?.memberId ?? '',
    isAdmin:
      permission.ready &&
      permission.access?.capabilities.includes('workspace.admin') === true,
    isManager: permission.manager,
  };
  const groups = useDeliveryNavigation(actor);
  const personalNavigation = useDeliveryNavigationPreferences(actor, groups);
  const requestedView = getDeliveryEntryView(
    params,
    personalNavigation.preferences.startView,
  );
  const view = requestedView === 'onboarding' ? 'clients' : requestedView;

  return (
    <>
      {personalNavigation.ready &&
        personalNavigation.pinnedPages.length > 0 && (
          <StyledNavigation aria-label={t`Pinned workspace pages`}>
            <NavigationDrawerSection>
              <NavigationDrawerAnimatedCollapseWrapper>
                <StyledSectionLabel>{t`Pinned`}</StyledSectionLabel>
              </NavigationDrawerAnimatedCollapseWrapper>
              {personalNavigation.pinnedPages.map((page) => (
                <NavigationDrawerItem
                  key={page.view}
                  label={page.label}
                  Icon={page.Icon}
                  to={`/delivery?view=${page.view}`}
                  active={page.view === view}
                />
              ))}
            </NavigationDrawerSection>
          </StyledNavigation>
        )}
      <StyledNavigation aria-label={t`Otogrow navigation`}>
        {groups.map((group) => {
          const items = group.items.filter(
            (item) =>
              !personalNavigation.pinnedPages.some(
                (page) => page.view === item.view,
              ),
          );
          if (!items.length) return null;
          const isCurrentGroup = items.some((item) => item.view === view);
          return (
            <NavigationDrawerSection key={group.id}>
              {items.length === 1 ? (
                <NavigationDrawerItem
                  label={items[0].label}
                  Icon={items[0].Icon}
                  to={`/delivery?view=${items[0].view}`}
                  active={isCurrentGroup}
                />
              ) : (
                <StyledGroup open={isCurrentGroup}>
                  <summary title={group.label}>
                    <group.Icon size={16} />
                    <NavigationDrawerAnimatedCollapseWrapper>
                      <StyledGroupLabel>
                        {group.label}
                        <IconChevronDown size={12} />
                      </StyledGroupLabel>
                    </NavigationDrawerAnimatedCollapseWrapper>
                  </summary>
                  {items.map((item) => (
                    <NavigationDrawerItem
                      key={item.view}
                      label={item.label}
                      Icon={item.Icon}
                      to={`/delivery?view=${item.view}`}
                      active={item.view === view}
                    />
                  ))}
                </StyledGroup>
              )}
            </NavigationDrawerSection>
          );
        })}
      </StyledNavigation>
    </>
  );
};

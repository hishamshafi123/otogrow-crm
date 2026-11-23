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
    border: 1px solid transparent;
    border-radius: 9px;
    height: 36px;
    margin-top: 2px;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease,
      color 140ms ease;
  }

  .navigation-drawer-item:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }

  .navigation-drawer-item[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    box-shadow: inset 0 1px 0 ${themeCssVariables.color.transparent.gray3};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }

  .navigation-drawer-item[aria-current='page'] svg {
    color: ${themeCssVariables.color.iris10};
  }

  .navigation-drawer-item:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .navigation-drawer-item {
      transition: none;
    }
  }
`;

const StyledSectionLabel = styled.small`
  color: ${themeCssVariables.font.color.tertiary};
  display: block;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 16px;
  padding: 8px 6px 4px;
  text-transform: uppercase;
`;

const StyledGroup = styled.details`
  summary {
    align-items: center;
    border-radius: 9px;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.tertiary};
    cursor: pointer;
    display: flex;
    font-size: 11.5px;
    font-weight: 600;
    gap: 8px;
    letter-spacing: 0.03em;
    line-height: 16px;
    min-height: 34px;
    padding: 7px 6px;
    transition:
      background-color 140ms ease,
      color 140ms ease;
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
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: -2px;
  }

  summary > svg {
    flex-shrink: 0;
  }

  summary span svg {
    transform: rotate(-90deg);
    transition: transform 140ms ease;
  }

  &[open] summary span svg {
    transform: rotate(0deg);
  }

  @media (prefers-reduced-motion: reduce) {
    summary,
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

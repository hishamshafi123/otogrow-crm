import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledFinanceNavigation = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  a {
    align-items: center;
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    min-height: 44px;
    padding: 8px 12px;
    text-decoration: none;
  }
  a[aria-current='page'] {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.color.blue8};
    font-weight: 600;
  }
`;

export const StyledFinanceDesktopNavigation = styled(StyledFinanceNavigation)`
  @media (max-width: 600px) {
    display: none;
  }
`;

export const StyledFinanceMobileNavigation = styled.label`
  && {
    display: none;
  }
  gap: 8px;
  min-width: 0;
  select {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 6px;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    font: inherit;
    min-height: 44px;
    padding: 8px 12px;
    width: 100%;
  }
  @media (max-width: 600px) {
    && {
      display: grid;
    }
  }
`;

import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledFinanceWorkspace = styled.div`
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const StyledFinanceNavigation = styled.nav`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  a {
    align-items: center;
    border-bottom: 2px solid transparent;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    min-height: 44px;
    padding: 10px 9px;
    text-decoration: none;
    &:hover {
      background: ${themeCssVariables.background.tertiary};
      color: ${themeCssVariables.font.color.primary};
    }
  }
  a[aria-current='page'] {
    border-bottom-color: ${themeCssVariables.color.blue11};
    color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
  }
`;

export const StyledFinanceDesktopNavigation = styled(StyledFinanceNavigation)`
  @container (max-width: 950px) {
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
  @container (max-width: 950px) {
    && {
      display: grid;
    }
  }
`;

export const StyledFinanceCashOverview = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  > div {
    gap: 12px;
  }
  > div > p {
    max-width: 76ch;
  }
`;

export const StyledFinanceIntroduction = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 76ch;
  min-width: 0;
`;

export const StyledFinanceFilterBar = styled.div`
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-width: 0;
  label {
    flex: 1 1 140px;
    max-width: 200px;
    min-width: 0;
  }
  @container (max-width: 460px) {
    label {
      flex-basis: calc(50% - 6px);
      max-width: none;
    }
  }
`;

export const StyledFinanceMetadata = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  min-width: 0;
  span {
    flex: 1 1 220px;
  }
`;

export const StyledFinanceSection = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding-top: 20px;
  article {
    border-top: 1px solid ${themeCssVariables.border.color.light};
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 0;
  }
`;

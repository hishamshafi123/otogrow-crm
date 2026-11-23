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
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2},
    0 4px 14px -8px ${themeCssVariables.boxShadow.color};
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  width: fit-content;

  a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 500;
    min-height: 38px;
    padding: 7px 14px;
    text-decoration: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease;

    &:hover {
      background: ${themeCssVariables.background.secondary};
      color: ${themeCssVariables.font.color.primary};
    }
  }

  a[aria-current='page'] {
    background: linear-gradient(
      135deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet3} 100%
    );
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
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
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 10px;
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
  gap: 12px;
  min-width: 0;
  padding-top: 20px;

  article {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    transition: border-color 150ms ease;
  }

  article:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

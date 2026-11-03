import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAdvertisingBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;

export const StyledAdvertisingItem = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px 0;
  h2,
  h3,
  h4,
  h5,
  h6,
  p {
    margin: 0;
  }
  h4,
  h5,
  h6 {
    font-size: inherit;
    line-height: 1.5;
  }
  p + p {
    margin-top: 4px;
  }
`;

export const StyledAdvertisingFacts = styled.dl`
  display: grid;
  gap: 8px 16px;
  grid-template-columns: minmax(120px, 0.7fr) minmax(0, 1.3fr);
  margin: 0;
  overflow-wrap: anywhere;
  dd {
    margin: 0;
  }
  dt {
    color: ${themeCssVariables.font.color.secondary};
  }
  @media (max-width: 480px) {
    gap: 4px;
    grid-template-columns: minmax(0, 1fr);
    dd + dt {
      margin-top: 8px;
    }
  }
`;

export const StyledAdvertisingText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

export const StyledAdvertisingNavigation = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  a {
    align-items: center;
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 8px;
    color: ${themeCssVariables.font.color.primary};
    display: flex;
    min-height: 44px;
    padding: 0 12px;
    text-decoration: none;
  }
  a[aria-current='page'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
  }
`;

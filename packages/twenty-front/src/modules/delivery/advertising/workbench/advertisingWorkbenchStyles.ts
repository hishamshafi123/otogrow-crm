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
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 14px 16px;
  transition: border-color 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }

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
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
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
    color: ${themeCssVariables.font.color.secondary};
    display: flex;
    font-size: 13px;
    font-weight: 500;
    min-height: 38px;
    padding: 0 14px;
    text-decoration: none;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
  }

  a:hover {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.primary};
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

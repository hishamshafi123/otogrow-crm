import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAssistantBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;

export const StyledAssistantNavigation = styled.nav`
  align-items: center;
  align-self: flex-start;
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

  a {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 9px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
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

export const StyledAssistantItem = styled.article`
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

  h3 {
    margin: 0;
  }

  p {
    margin: 4px 0;
  }
`;

export const StyledAssistantText = styled.pre`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  font: inherit;
  margin: 0;
  overflow-wrap: anywhere;
  padding: 12px 14px;
  white-space: pre-wrap;
`;

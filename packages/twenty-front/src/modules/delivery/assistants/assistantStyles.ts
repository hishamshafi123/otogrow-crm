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
  align-self: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
  a {
    align-items: center;
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 8px;
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    min-height: 44px;
    padding: 0 14px;
    text-decoration: none;
  }
  a[aria-current='page'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
    font-weight: 600;
  }
`;
export const StyledAssistantItem = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 10px 0;
  h3 {
    margin: 0;
  }
  p {
    margin: 4px 0;
  }
`;
export const StyledAssistantText = styled.pre`
  font: inherit;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

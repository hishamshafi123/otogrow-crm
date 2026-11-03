import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAtlasNavigation = styled.nav`
  align-self: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
  a {
    align-items: center;
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 9px;
    box-sizing: border-box;
    color: ${themeCssVariables.font.color.primary};
    display: flex;
    font-weight: 500;
    min-height: 44px;
    padding: 10px 14px;
    text-decoration: none;
  }
  a[aria-current='page'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
    font-weight: 600;
  }
`;
export const StyledAtlasBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const StyledAtlasForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
`;
export const StyledAtlasPrompt = styled.pre`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;
export const StyledAtlasProfile = styled.section`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  p {
    margin: 0;
  }
`;

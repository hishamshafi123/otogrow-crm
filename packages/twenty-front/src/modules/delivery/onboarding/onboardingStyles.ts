import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledSetupBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const StyledSetupSteps = styled.ol`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  list-style-position: inside;
  margin: 0;
  padding: 0;
  li[aria-current='step'] {
    color: ${themeCssVariables.color.blue11};
    font-weight: 600;
  }
`;
export const StyledSetupSummary = styled.dl`
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
  overflow-wrap: anywhere;
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0;
    white-space: pre-wrap;
  }
  @media (min-width: 768px) {
    align-items: start;
    gap: 12px 20px;
    grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
  }
`;

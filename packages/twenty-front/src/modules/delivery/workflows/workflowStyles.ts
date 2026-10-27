import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledWorkflowActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;
export const StyledWorkflowList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  li {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: ${themeCssVariables.spacing[3]} 0;
  }
`;
export const StyledWorkflowFields = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
`;

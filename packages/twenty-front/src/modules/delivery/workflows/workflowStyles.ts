import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledWorkflowActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export const StyledWorkflowList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    padding: 14px 16px;
    transition: border-color 150ms ease;
  }

  li:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

export const StyledWorkflowFields = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
`;

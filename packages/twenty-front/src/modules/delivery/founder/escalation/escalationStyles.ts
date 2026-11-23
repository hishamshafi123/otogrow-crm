import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledEscalationBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  &[hidden] {
    display: none;
  }
`;

export const StyledEscalationFields = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 650px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledEscalationEntry = styled.article`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-left: 3px solid ${themeCssVariables.color.orange8};
  border-radius: 12px;
  overflow-wrap: anywhere;
  padding: 14px 16px;
`;

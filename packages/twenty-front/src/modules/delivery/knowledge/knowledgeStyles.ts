import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledKnowledgeBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const StyledKnowledgeItem = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px 0;
  p {
    margin: 4px 0;
  }
`;
export const StyledKnowledgeText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

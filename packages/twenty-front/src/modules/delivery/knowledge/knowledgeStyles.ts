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

  p {
    margin: 4px 0;
  }
`;

export const StyledKnowledgeText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

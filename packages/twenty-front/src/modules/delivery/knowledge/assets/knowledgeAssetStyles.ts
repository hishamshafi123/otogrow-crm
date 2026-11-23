import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledKnowledgeAttachments = styled.section`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 16px;

  input {
    max-width: 100%;
  }
`;

export const StyledKnowledgeAsset = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 14px 0;

  img {
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 10px;
    display: block;
    max-height: 280px;
    max-width: 100%;
    object-fit: contain;
  }
`;

export const StyledKnowledgeSelectedFile = styled.div`
  border-radius: 8px;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 4px;
  }
`;

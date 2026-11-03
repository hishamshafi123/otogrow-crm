import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
export const StyledVideoQaBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const StyledVideoQaFacts = styled.dl`
  display: grid;
  gap: 10px 20px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  overflow-wrap: anywhere;
  dt {
    color: ${themeCssVariables.font.color.secondary};
  }
  dd {
    margin: 2px 0 0;
  }
  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledVideoQaMedia = styled.div`
  min-width: 0;
  img,
  video {
    display: block;
    max-height: 400px;
    max-width: 100%;
  }
`;
export const StyledVideoQaText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

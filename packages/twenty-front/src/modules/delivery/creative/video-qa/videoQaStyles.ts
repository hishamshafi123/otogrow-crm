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
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  dd {
    margin: 3px 0 0;
  }

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledVideoQaMedia = styled.div`
  min-width: 0;

  img,
  video {
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 12px;
    display: block;
    max-height: 400px;
    max-width: 100%;
  }
`;

export const StyledVideoQaText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

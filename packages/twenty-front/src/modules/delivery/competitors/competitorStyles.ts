import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledCompetitorBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;

  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  &[hidden] {
    display: none;
  }
`;

export const StyledCompetitorItem = styled.li`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: grid;
  gap: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 14px 16px;
  transition: border-color 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

export const StyledCompetitorList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const StyledCompetitorFacts = styled.dl`
  display: grid;
  gap: 12px 24px;
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

export const StyledCompetitorFields = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledCompetitorForm = styled.form`
  display: grid;
  gap: 16px;

  label {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  input,
  select,
  textarea {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }
`;

export const StyledCompetitorText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

export const StyledCompetitorReview = styled.section`
  background: ${themeCssVariables.color.transparent.iris2};
  border: 1px solid ${themeCssVariables.color.transparent.iris5};
  border-left: 3px solid ${themeCssVariables.color.iris9};
  border-radius: 12px;
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 16px 18px;
`;

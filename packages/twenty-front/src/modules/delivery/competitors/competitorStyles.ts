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
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: 6px;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px 0;
`;
export const StyledCompetitorList = styled.ul`
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
    color: ${themeCssVariables.font.color.secondary};
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
  border-left: 3px solid ${themeCssVariables.border.color.medium};
  display: grid;
  gap: 16px;
  min-width: 0;
  padding-left: 16px;
`;

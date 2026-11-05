import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledContentBoundary = styled.fieldset`
  border: 0;
  margin: 0;
  min-width: 0;
  padding: 0;
  &[hidden] {
    display: none;
  }
`;
export const StyledContentItem = styled.article`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 12px 0;
`;
export const StyledContentText = styled.p`
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;
export const StyledContentFacts = styled.dl`
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
export const StyledContentTable = styled.table`
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    overflow-wrap: anywhere;
    padding: 10px 8px;
    text-align: left;
    vertical-align: top;
  }
  @media (max-width: 700px) {
    display: none;
  }
`;
export const StyledContentAgenda = styled.div`
  display: none;
  @media (max-width: 700px) {
    display: block;
  }
`;
export const StyledContentCalendar = styled.div`
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  @media (max-width: 700px) {
    display: none;
  }
`;
export const StyledContentDay = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 8px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 90px;
  overflow-wrap: anywhere;
  padding: 8px;
  text-align: left;
  &[data-has-posts='true'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue9};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue9};
    outline-offset: 2px;
  }
`;

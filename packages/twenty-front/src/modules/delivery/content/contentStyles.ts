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

export const StyledContentTable = styled.table`
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  width: 100%;

  th {
    border-bottom: 1px solid ${themeCssVariables.border.color.medium};
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    overflow-wrap: anywhere;
    padding: 10px 10px;
    text-align: left;
    text-transform: uppercase;
    vertical-align: top;
  }

  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    overflow-wrap: anywhere;
    padding: 12px 10px;
    text-align: left;
    vertical-align: top;
  }

  tbody tr:hover td {
    background: ${themeCssVariables.background.transparent.lighter};
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
  gap: 6px;
  grid-template-columns: repeat(7, minmax(0, 1fr));

  @media (max-width: 700px) {
    display: none;
  }
`;

export const StyledContentDay = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 94px;
  overflow-wrap: anywhere;
  padding: 10px;
  text-align: left;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
    transform: translateY(-1px);
  }

  &[data-has-posts='true'] {
    background: linear-gradient(
      145deg,
      ${themeCssVariables.color.transparent.iris3} 0%,
      ${themeCssVariables.color.transparent.violet2} 100%
    );
    border-color: ${themeCssVariables.color.iris7};
    box-shadow: 0 6px 18px -12px ${themeCssVariables.color.transparent.iris7};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.iris9};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover {
      transform: none;
    }
  }
`;

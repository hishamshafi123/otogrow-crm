import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledPerformanceViewNavigation = styled.nav`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  padding: 0;
  a {
    align-items: center;
    border-bottom: 2px solid transparent;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
    margin-bottom: -1px;
    padding: 9px 14px;
    text-decoration: none;
    transition:
      border-color 120ms ease,
      color 120ms ease;
  }
  a:hover {
    color: ${themeCssVariables.font.color.primary};
  }
  a[aria-current='page'] {
    border-bottom-color: ${themeCssVariables.font.color.primary};
    color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
  }
  @media (pointer: coarse) {
    a {
      min-height: 44px;
    }
  }
`;

export const StyledPerformanceFilters = styled.form`
  align-items: end;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(150px, 210px)) auto;
  padding-top: 14px;
  label {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 2px;
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.font.family};
    font-size: 13px;
    letter-spacing: normal;
    min-height: 36px;
    padding: 6px 10px;
    text-transform: none;
  }
  > button {
    background: ${themeCssVariables.background.primaryInverted};
    border: 1px solid ${themeCssVariables.background.primaryInverted};
    border-radius: 2px;
    color: ${themeCssVariables.font.color.inverted};
    font-size: 12px;
    justify-self: end;
    min-height: 36px;
    padding: 6px 14px;
  }
  > button:hover:not(:disabled) {
    background: ${themeCssVariables.background.primaryInvertedHover};
    border-color: ${themeCssVariables.background.primaryInvertedHover};
    color: ${themeCssVariables.font.color.inverted};
  }
  @media (pointer: coarse) {
    > button {
      box-sizing: border-box;
      min-height: 44px;
    }
  }
  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPerformanceMetrics = styled.dl`
  background: ${themeCssVariables.border.color.light};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 2px;
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  overflow: hidden;
  > div {
    background: ${themeCssVariables.background.primary};
    box-sizing: border-box;
    min-width: 0;
    padding: 14px 16px;
    transition: background-color 120ms ease;
  }
  > div:hover {
    background: ${themeCssVariables.background.secondary};
  }
  dt {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  dd {
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 19px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: -0.025em;
    margin: 6px 0 0;
    overflow-wrap: anywhere;
  }
  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    dd {
      font-size: 17px;
    }
  }
  @media (max-width: 360px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPerformanceList = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  > article {
    border-top: 1px solid ${themeCssVariables.border.color.light};
    min-width: 0;
    overflow-wrap: anywhere;
    padding: 20px 0;
  }
  > article:first-child {
    border-top: 0;
  }
  > article:last-child {
    padding-bottom: 0;
  }
`;

export const StyledPerformanceRecord = styled.div`
  display: grid;
  gap: 14px 24px;
  grid-template-columns: minmax(190px, 1.15fr) minmax(0, 2fr);
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPerformanceRecordMetrics = styled.dl`
  background: ${themeCssVariables.border.color.light};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 2px;
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  overflow: hidden;
  > div {
    background: ${themeCssVariables.background.primary};
    min-width: 0;
    padding: 10px 12px;
  }
  dt {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  dd {
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    margin: 4px 0 0;
    overflow-wrap: anywhere;
  }
  @media (max-width: 480px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

export const StyledPerformanceMuted = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
`;

export const StyledPerformanceFiltersDisclosure = styled.details`
  min-width: 0;
  > summary {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 44px;
  }
  @media (min-width: 701px) {
    > summary {
      display: none;
    }
  }
`;

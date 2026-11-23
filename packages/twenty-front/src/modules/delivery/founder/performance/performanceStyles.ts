import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledPerformanceViewNavigation = styled.nav`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 600;
    gap: 6px;
    padding: 7px 14px;
    text-decoration: none;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }
  a:hover {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.primary};
  }
  a[aria-current='page'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
  }
  @media (pointer: coarse) {
    a {
      min-height: 44px;
    }
  }
`;
export const StyledPerformanceFilters = styled.form`
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(150px, 210px)) auto;
  > button {
    justify-self: end;
  }
  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledPerformanceMetrics = styled.dl`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  > div {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 12px;
    box-sizing: border-box;
    min-width: 0;
    padding: 14px 16px;
  }
  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    font-weight: 500;
  }
  dd {
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    letter-spacing: -0.3px;
    margin: 6px 0 0;
    overflow-wrap: anywhere;
  }
  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    dd {
      font-size: 18px;
    }
  }
  @media (max-width: 360px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledPerformanceList = styled.div`
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
    padding-top: 0;
  }
  > article:last-child {
    padding-bottom: 0;
  }
`;
export const StyledPerformanceRecord = styled.div`
  display: grid;
  gap: 12px 20px;
  grid-template-columns: minmax(180px, 1.2fr) minmax(0, 2fr);
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledPerformanceRecordMetrics = styled.dl`
  display: grid;
  gap: 10px 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
  }
  dd {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    margin: 2px 0 0;
  }
  @media (max-width: 480px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;
export const StyledPerformanceMuted = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: 12px;
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

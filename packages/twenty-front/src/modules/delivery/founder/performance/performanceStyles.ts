import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledPerformanceViewNavigation = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  a {
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 9px;
    color: ${themeCssVariables.font.color.secondary};
    font-weight: 500;
    padding: 8px 12px;
    text-decoration: none;
  }
  a:hover {
    background: ${themeCssVariables.background.primary};
    color: ${themeCssVariables.font.color.primary};
  }
  a[aria-current='page'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
  }
  @media (pointer: coarse) {
    a {
      align-items: center;
      display: inline-flex;
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
  gap: 1px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  > div {
    background: ${themeCssVariables.background.secondary};
    box-sizing: border-box;
    min-width: 0;
    padding: 14px;
  }
  dt {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
  }
  dd {
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    margin: 4px 0 0;
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

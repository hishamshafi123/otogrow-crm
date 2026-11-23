import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAdminHeroBar = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 20px;
  @media (max-width: 700px) {
    padding: 16px;
  }
`;

export const StyledAdminHeroTop = styled.div`
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  justify-content: space-between;
`;

export const StyledAdminControlRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  justify-content: space-between;
`;

export const StyledCurrencyPills = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 11px;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
`;

export const StyledCurrencyPill = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  min-height: 32px;
  padding: 4px 12px;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.primary};
    color: ${themeCssVariables.font.color.primary};
  }
  &[aria-pressed='true'] {
    background: ${themeCssVariables.background.primary};
    border-color: ${themeCssVariables.color.blue6};
    box-shadow: ${themeCssVariables.boxShadow.light};
    color: ${themeCssVariables.color.blue11};
  }
`;

export const StyledQuickLinks = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  a {
    align-items: center;
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 9px;
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    font-size: 13px;
    font-weight: 500;
    gap: 6px;
    min-height: 34px;
    padding: 4px 12px;
    text-decoration: none;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }
  a:hover {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.medium};
  }
`;

export const StyledStatusPill = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  line-height: 1.2;
  padding: 4px 10px;
  white-space: nowrap;
  &[data-tone='positive'] {
    background: ${themeCssVariables.color.green3};
    border-color: ${themeCssVariables.color.green6};
    color: ${themeCssVariables.color.green11};
  }
  &[data-tone='warning'] {
    background: ${themeCssVariables.color.orange3};
    border-color: ${themeCssVariables.color.orange6};
    color: ${themeCssVariables.color.orange11};
  }
  &[data-tone='danger'] {
    background: ${themeCssVariables.color.red3};
    border-color: ${themeCssVariables.color.red6};
    color: ${themeCssVariables.color.red11};
  }
  &[data-tone='accent'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
  }
`;

export const StyledPulseGrid = styled.section`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  @media (max-width: 1020px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 580px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPulseCard = styled.article`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: space-between;
  min-width: 0;
  padding: 16px 18px;
  position: relative;
  &[data-tone='warning'] {
    border-color: ${themeCssVariables.color.orange6};
  }
  &[data-tone='danger'] {
    border-color: ${themeCssVariables.color.red6};
  }
  &[data-tone='positive'] {
    border-color: ${themeCssVariables.color.green6};
  }
`;

export const StyledPulseLabelRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  span {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    font-weight: 500;
  }
`;

export const StyledPulseValue = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: 24px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: -0.4px;
  line-height: 1.2;
  overflow-wrap: anywhere;
`;

export const StyledPulseFoot = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 6px 10px;
  justify-content: space-between;
  a {
    font-weight: 500;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
`;

export const StyledAdminTwoColumn = styled.div`
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  @media (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledAdminThreeColumn = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 680px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledChartFrame = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  svg {
    display: block;
    height: 148px;
    width: 100%;
  }
`;

export const StyledChartAxisLabels = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  gap: 8px;
  justify-content: space-between;
`;

export const StyledCostBarTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  display: flex;
  gap: 2px;
  height: 10px;
  overflow: hidden;
  width: 100%;
`;

export const StyledCostBarSegment = styled.span`
  display: block;
  height: 100%;
  min-width: 4px;
  &[data-segment='salary'] {
    background: ${themeCssVariables.color.blue9};
  }
  &[data-segment='overhead'] {
    background: ${themeCssVariables.color.purple9};
  }
  &[data-segment='ai'] {
    background: ${themeCssVariables.color.orange9};
  }
  &[data-segment='other'] {
    background: ${themeCssVariables.color.gray9};
  }
`;

export const StyledCostLegend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  list-style: none;
  margin: 0;
  padding: 0;
  li {
    align-items: center;
    color: ${themeCssVariables.font.color.secondary};
    display: inline-flex;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    gap: 6px;
  }
  strong {
    color: ${themeCssVariables.font.color.primary};
    font-weight: 600;
  }
`;

export const StyledLegendDot = styled.span`
  border-radius: 999px;
  display: inline-block;
  height: 8px;
  width: 8px;
  &[data-segment='salary'] {
    background: ${themeCssVariables.color.blue9};
  }
  &[data-segment='overhead'] {
    background: ${themeCssVariables.color.purple9};
  }
  &[data-segment='ai'] {
    background: ${themeCssVariables.color.orange9};
  }
  &[data-segment='other'] {
    background: ${themeCssVariables.color.gray9};
  }
  &[data-segment='result'] {
    background: ${themeCssVariables.color.green9};
  }
`;

export const StyledCompactList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const StyledCompactListItem = styled.li`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  justify-content: space-between;
  padding: 10px 12px;
  &[data-tone='danger'] {
    background: ${themeCssVariables.color.red2};
    border-color: ${themeCssVariables.color.red5};
  }
  &[data-tone='warning'] {
    background: ${themeCssVariables.color.orange2};
    border-color: ${themeCssVariables.color.orange5};
  }
`;

export const StyledProgressTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
  width: 100%;
`;

export const StyledProgressFill = styled.div`
  background: ${themeCssVariables.color.blue9};
  border-radius: 999px;
  height: 100%;
  &[data-tone='warning'] {
    background: ${themeCssVariables.color.orange9};
  }
  &[data-tone='danger'] {
    background: ${themeCssVariables.color.red9};
  }
  &[data-tone='positive'] {
    background: ${themeCssVariables.color.green9};
  }
`;

export const StyledFilterTabs = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const StyledFilterTab = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  min-height: 30px;
  padding: 4px 12px;
  &[aria-pressed='true'] {
    background: ${themeCssVariables.color.blue3};
    border-color: ${themeCssVariables.color.blue6};
    color: ${themeCssVariables.color.blue11};
  }
`;

export const StyledDataHealthDrawer = styled.details`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  padding: 14px 18px;
  > summary {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-weight: 600;
    gap: 8px 12px;
    justify-content: space-between;
    list-style: none;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
`;

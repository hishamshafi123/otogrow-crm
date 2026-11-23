import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledAdminPanel = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 2px;
  box-sizing: border-box;
  min-width: 0;
  padding: 20px 22px;
  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.3;
  }
  h3 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.35;
  }
  a {
    color: ${themeCssVariables.font.color.primary};
    font-size: 12px;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: ${themeCssVariables.border.color.strong};
    text-underline-offset: 4px;
    transition:
      color 120ms ease,
      text-decoration-color 120ms ease;
  }
  a:hover {
    color: ${themeCssVariables.font.color.primary};
    text-decoration-color: ${themeCssVariables.font.color.primary};
  }
  @media (max-width: 700px) {
    padding: 16px;
  }
`;

export const StyledAdminSectionHeader = styled.div`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  justify-content: space-between;
  padding-bottom: 14px;
`;

export const StyledAdminEyebrow = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: block;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  line-height: 1.2;
  margin-bottom: 4px;
  text-transform: uppercase;
`;

export const StyledAdminHeroBar = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 2px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 22px 24px 20px;
  h2 {
    color: ${themeCssVariables.font.color.primary};
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.2;
  }
  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 13px;
    margin-top: 4px;
  }
  @media (max-width: 700px) {
    padding: 16px;
  }
`;

export const StyledAdminHeroTop = styled.div`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  justify-content: space-between;
  padding-bottom: 16px;
`;

export const StyledAdminControlRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  justify-content: space-between;
  small {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
  }
`;

export const StyledCurrencyPills = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 2px;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
`;

export const StyledCurrencyPill = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 1px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 500;
  gap: 6px;
  letter-spacing: 0.04em;
  min-height: 28px;
  padding: 4px 11px;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.primary};
    color: ${themeCssVariables.font.color.primary};
  }
  &[aria-pressed='true'] {
    background: ${themeCssVariables.background.primaryInverted};
    border-color: ${themeCssVariables.background.primaryInverted};
    color: ${themeCssVariables.font.color.inverted};
  }
  @media (pointer: coarse) {
    box-sizing: border-box;
    min-height: 44px;
  }
`;

export const StyledQuickLinks = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  a {
    align-items: center;
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: 2px;
    color: ${themeCssVariables.font.color.primary};
    display: inline-flex;
    font-size: 12px;
    font-weight: 500;
    gap: 6px;
    min-height: 32px;
    padding: 4px 11px;
    text-decoration: none;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }
  a:hover {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.border.color.strong};
  }
  strong {
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 600;
  }
  @media (pointer: coarse) {
    a {
      box-sizing: border-box;
      min-height: 44px;
    }
  }
`;

export const StyledAdminExportButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primaryInverted};
  border: 1px solid ${themeCssVariables.background.primaryInverted};
  border-radius: 2px;
  color: ${themeCssVariables.font.color.inverted};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 500;
  gap: 6px;
  letter-spacing: 0.03em;
  min-height: 32px;
  padding: 4px 12px;
  transition: opacity 120ms ease;
  &:hover:not(:disabled) {
    opacity: 0.86;
  }
  @media (pointer: coarse) {
    box-sizing: border-box;
    min-height: 44px;
  }
`;

export const StyledStatusPill = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 2px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 500;
  gap: 6px;
  letter-spacing: 0.01em;
  line-height: 1.2;
  padding: 3px 7px;
  white-space: nowrap;
  &[data-tone='positive'] {
    background: ${themeCssVariables.color.green2};
    border-color: ${themeCssVariables.color.green6};
    color: ${themeCssVariables.color.green11};
  }
  &[data-tone='warning'] {
    background: ${themeCssVariables.color.orange2};
    border-color: ${themeCssVariables.color.orange6};
    color: ${themeCssVariables.color.orange11};
  }
  &[data-tone='danger'] {
    background: ${themeCssVariables.color.red2};
    border-color: ${themeCssVariables.color.red6};
    color: ${themeCssVariables.color.red11};
  }
  &[data-tone='accent'] {
    background: ${themeCssVariables.background.secondary};
    border-color: ${themeCssVariables.border.color.strong};
    color: ${themeCssVariables.font.color.primary};
  }
`;

export const StyledPulseGrid = styled.section`
  background: ${themeCssVariables.border.color.light};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 2px;
  display: grid;
  gap: 1px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  @media (max-width: 1020px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 580px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledPulseCard = styled.article`
  background: ${themeCssVariables.background.primary};
  border-top: 2px solid transparent;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: space-between;
  min-width: 0;
  padding: 18px 20px;
  position: relative;
  transition: background-color 140ms ease;
  &:hover {
    background: ${themeCssVariables.background.secondary};
  }
  &[data-tone='warning'] {
    border-top-color: ${themeCssVariables.color.orange9};
  }
  &[data-tone='danger'] {
    border-top-color: ${themeCssVariables.color.red9};
  }
  &[data-tone='positive'] {
    border-top-color: ${themeCssVariables.color.green9};
  }
`;

export const StyledPulseLabelRow = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  > span:first-child {
    color: ${themeCssVariables.font.color.tertiary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
`;

export const StyledPulseValue = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 26px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.035em;
  line-height: 1.15;
  overflow-wrap: anywhere;
  padding: 2px 0;
`;

export const StyledPulseFoot = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 6px 10px;
  justify-content: space-between;
  padding-top: 10px;
  a {
    color: ${themeCssVariables.font.color.primary};
    font-size: 12px;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: ${themeCssVariables.border.color.strong};
    text-underline-offset: 4px;
  }
  a:hover {
    text-decoration-color: ${themeCssVariables.font.color.primary};
  }
`;

export const StyledAdminTwoColumn = styled.div`
  display: grid;
  gap: 18px;
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
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px 12px;
  svg {
    display: block;
    height: 164px;
    width: 100%;
  }
`;

export const StyledChartAxisLabels = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  gap: 8px 12px;
  justify-content: space-between;
  padding-top: 10px;
`;

export const StyledCostBarTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 0;
  display: flex;
  gap: 2px;
  height: 6px;
  overflow: hidden;
  width: 100%;
`;

export const StyledCostBarSegment = styled.span`
  display: block;
  height: 100%;
  min-width: 4px;
  &[data-segment='salary'] {
    background: ${themeCssVariables.font.color.primary};
  }
  &[data-segment='overhead'] {
    background: ${themeCssVariables.color.gray8};
  }
  &[data-segment='ai'] {
    background: ${themeCssVariables.color.orange9};
  }
  &[data-segment='other'] {
    background: ${themeCssVariables.color.gray5};
  }
`;

export const StyledCostLegend = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
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
    font-family: ${themeCssVariables.code.font.family};
    font-size: 11px;
    font-weight: 500;
  }
`;

export const StyledLegendDot = styled.span`
  border-radius: 1px;
  display: inline-block;
  height: 8px;
  width: 8px;
  &[data-segment='salary'] {
    background: ${themeCssVariables.font.color.primary};
  }
  &[data-segment='overhead'] {
    background: ${themeCssVariables.color.gray8};
  }
  &[data-segment='ai'] {
    background: ${themeCssVariables.color.orange9};
  }
  &[data-segment='other'] {
    background: ${themeCssVariables.color.gray5};
  }
  &[data-segment='result'] {
    background: ${themeCssVariables.color.green9};
  }
  &[data-segment='revenue'] {
    background: ${themeCssVariables.color.blue9};
  }
  &[data-segment='cost'] {
    background: ${themeCssVariables.color.purple9};
  }
`;

export const StyledCompactList = styled.ul`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
`;

export const StyledCompactListItem = styled.li`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border-left: 2px solid transparent;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  justify-content: space-between;
  padding: 11px 14px;
  transition: background-color 120ms ease;
  &:first-child {
    border-top: 0;
  }
  &:hover {
    background: ${themeCssVariables.background.secondary};
  }
  > div,
  > span,
  > a,
  > strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  > strong {
    color: ${themeCssVariables.font.color.primary};
    font-family: ${themeCssVariables.code.font.family};
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  &[data-tone='danger'] {
    border-left-color: ${themeCssVariables.color.red9};
  }
  &[data-tone='warning'] {
    border-left-color: ${themeCssVariables.color.orange9};
  }
`;

export const StyledProgressTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 0;
  height: 4px;
  overflow: hidden;
  width: 100%;
`;

export const StyledProgressFill = styled.div`
  background: ${themeCssVariables.font.color.primary};
  border-radius: 0;
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
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 2px;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
`;

export const StyledFilterTab = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 1px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-family: ${themeCssVariables.code.font.family};
  font-size: 11px;
  font-weight: 500;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px;
  transition:
    background-color 120ms ease,
    color 120ms ease;
  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.primary};
    color: ${themeCssVariables.font.color.primary};
  }
  &[aria-pressed='true'] {
    background: ${themeCssVariables.background.primaryInverted};
    border-color: ${themeCssVariables.background.primaryInverted};
    color: ${themeCssVariables.font.color.inverted};
  }
  @media (pointer: coarse) {
    box-sizing: border-box;
    min-height: 44px;
  }
`;

export const StyledDataHealthDrawer = styled.details`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 2px;
  padding: 14px 18px;
  > summary {
    align-items: center;
    color: ${themeCssVariables.font.color.primary};
    display: flex;
    flex-wrap: wrap;
    font-size: 13px;
    font-weight: 500;
    gap: 8px 12px;
    justify-content: space-between;
    list-style: none;
  }
  > summary::-webkit-details-marker {
    display: none;
  }
`;

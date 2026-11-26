import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledFinanceV2Stack = styled.div`
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
`;

export const StyledFinanceV2HeroGrid = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr));
`;

export const StyledFinanceV2StatCard = styled.article`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  box-shadow: 0 6px 18px -12px ${themeCssVariables.boxShadow.color};
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 16px 18px;

  &[data-highlight='true'] {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.transparent.iris6};
  }

  small {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    font-weight: 500;
  }

  strong {
    color: ${themeCssVariables.font.color.primary};
    font-size: 22px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    margin: 0;
  }
`;

export const StyledFinanceV2SplitGrid = styled.div`
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @container (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const StyledFinanceV2Panel = styled.section`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 14px;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 18px 20px;
`;

export const StyledFinanceV2HeaderRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  justify-content: space-between;
`;

export const StyledFinanceV2StatementRow = styled.div`
  align-items: baseline;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  font-weight: 400;
  gap: 12px;
  justify-content: space-between;
  padding: 7px 0;

  &[data-bold='true'] {
    font-weight: 700;
  }

  span:last-child {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
`;

export const StyledFinanceV2SubTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const StyledFinanceV2SubTabButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 9px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  min-height: 36px;
  padding: 6px 14px;

  &[data-active='true'] {
    background: ${themeCssVariables.color.transparent.iris3};
    border-color: ${themeCssVariables.color.transparent.iris6};
    color: ${themeCssVariables.color.iris11};
    font-weight: 600;
  }
`;

export const StyledFinanceV2FormGrid = styled.div`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
`;

export const StyledFinanceV2TableWrap = styled.div`
  container-type: inline-size;
  max-width: 100%;
  overflow-x: auto;
`;

export const StyledFinanceV2Table = styled.table`
  border-collapse: collapse;
  font-size: 13px;
  width: 100%;

  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    padding: 10px 8px;
    text-align: left;
    vertical-align: top;
  }

  tfoot td {
    background: ${themeCssVariables.background.secondary};
    border-bottom: none;
    border-top: 2px solid ${themeCssVariables.border.color.medium};
    font-weight: 700;
  }

  th {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  td[data-numeric='true'],
  th[data-numeric='true'] {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
`;

export const StyledFinanceV2Pill = styled.span`
  background: ${themeCssVariables.background.secondary};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  white-space: nowrap;

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red3};
    color: ${themeCssVariables.color.red11};
  }

  &[data-tone='success'] {
    background: ${themeCssVariables.color.transparent.green3};
    color: ${themeCssVariables.color.green11};
  }

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.transparent.amber3};
    color: ${themeCssVariables.color.amber11};
  }

  &[data-tone='info'] {
    background: ${themeCssVariables.color.transparent.iris3};
    color: ${themeCssVariables.color.iris11};
  }
`;

export const StyledFinanceV2Notice = styled.p`
  background: ${themeCssVariables.color.transparent.iris2};
  border: 1px solid ${themeCssVariables.color.transparent.iris5};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.primary};
  font-size: 13px;
  margin: 0;
  padding: 10px 14px;

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red2};
    border-color: ${themeCssVariables.color.transparent.red5};
    color: ${themeCssVariables.color.red11};
  }

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.transparent.amber2};
    border-color: ${themeCssVariables.color.transparent.amber5};
    color: ${themeCssVariables.color.amber11};
  }
`;

export const StyledFinanceV2LogoPreview = styled.img`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  height: 52px;
  object-fit: contain;
  padding: 4px;
  width: 52px;
`;

export const StyledFinanceV2InlineEditor = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  left: 0;
  max-width: calc(100cqi - 16px);
  padding: 16px 18px;
  position: sticky;
`;

export const StyledFinanceV2ActionGroup = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const StyledFinanceV2BarTrack = styled.span`
  background: ${themeCssVariables.background.secondary};
  border-radius: 999px;
  display: block;
  height: 8px;
  overflow: hidden;
  width: 100%;
`;

export const StyledFinanceV2BarFill = styled.span`
  background: ${themeCssVariables.color.iris9};
  border-radius: 999px;
  display: block;
  height: 100%;
  transition: width 160ms ease;

  &[data-tone='success'] {
    background: ${themeCssVariables.color.green9};
  }

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.red9};
  }

  &[data-tone='warning'] {
    background: ${themeCssVariables.color.amber9};
  }
`;

export const StyledFinanceV2TrendGrid = styled.div`
  align-items: end;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(min(96px, 100%), 1fr));
  min-height: 140px;
  padding-top: 8px;
`;

export const StyledFinanceV2TrendItem = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  small {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const StyledFinanceV2BreakdownButton = styled.button`
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px 4px;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.secondary};
    border-radius: 8px;
  }
`;

export const StyledFinanceV2BreakdownHeader = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  justify-content: space-between;
  width: 100%;
`;

export const StyledFinanceV2ReadinessGrid = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
`;

export const StyledFinanceV2ReadinessCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
`;

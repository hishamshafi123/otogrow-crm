import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledFinanceV2Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
`;

export const StyledFinanceV2HeroGrid = styled.div`
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
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
  }

  p {
    color: ${themeCssVariables.font.color.secondary};
    font-size: 12px;
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

export const StyledFinanceV2TableWrap = styled.div`
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
  padding: 10px 14px;

  &[data-tone='danger'] {
    background: ${themeCssVariables.color.transparent.red2};
    border-color: ${themeCssVariables.color.transparent.red5};
    color: ${themeCssVariables.color.red11};
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
